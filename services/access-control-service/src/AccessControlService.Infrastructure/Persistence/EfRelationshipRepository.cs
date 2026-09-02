using AccessControlService.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AccessControlService.Infrastructure.Persistence;

/// <summary>
/// EF Core implementation of <see cref="IRelationshipRepository"/> against this service's own
/// fixture-only reports-to / department-management / project-assignment schema
/// (<see cref="AccessControlDbContext"/>).
/// </summary>
/// <remarks>
/// An id that doesn't match any seeded row (unknown person or department) currently resolves to
/// the same <c>null</c> as a genuinely-known id with no manager/department -- these two cases are
/// indistinguishable in the <em>return value</em>. That's a deliberate, tracked gap (see this
/// service's CLAUDE.md Gotchas and deferred-work.md), not an oversight: it has zero blast radius
/// today since nothing calls this repository with an unsynced id yet, but needs a real decision
/// (throw, log, or another signal) before any real HTTP consumer is wired up. As an interim
/// safeguard (not the real fix), every lookup method below now logs a warning via
/// <see cref="ILogger{TCategoryName}"/> the first time, per call, that it finds no row at all for
/// the given id -- distinguished internally from a known row whose FK column is legitimately
/// <c>null</c>, or (for the two Project-line lookups, which return an empty collection rather than
/// a nullable FK) from a known person with genuinely no project assignments -- so a real data-sync
/// bug is at least visible in logs instead of silently indistinguishable from "correctly no
/// access". The return behavior itself is unchanged.
/// </remarks>
public sealed class EfRelationshipRepository : IRelationshipRepository
{
    private readonly AccessControlDbContext _dbContext;
    private readonly ILogger<EfRelationshipRepository> _logger;

    public EfRelationshipRepository(AccessControlDbContext dbContext, ILogger<EfRelationshipRepository> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<Guid?> GetManagerIdAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        // Selects a wrapper (rather than the ManagerId column directly) so a missing row (SingleOrDefaultAsync
        // returns null for the wrapper) can be told apart from a known row whose ManagerId column is
        // itself legitimately null (the wrapper is non-null, ManagerId inside it is null).
        var row = await _dbContext.People
            .AsNoTracking()
            .Where(p => p.Id == personId)
            .Select(p => new { p.ManagerId })
            .SingleOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            LogUnknownId(nameof(GetManagerIdAsync), "person", personId);
            return null;
        }

        return row.ManagerId;
    }

    public async Task<Guid?> GetPeoplePartnerIdAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        // Same wrapper-select pattern as GetManagerIdAsync above, for the same reason: tells a
        // missing row apart from a known row whose PeoplePartnerId column is legitimately null.
        var row = await _dbContext.People
            .AsNoTracking()
            .Where(p => p.Id == personId)
            .Select(p => new { p.PeoplePartnerId })
            .SingleOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            LogUnknownId(nameof(GetPeoplePartnerIdAsync), "person", personId);
            return null;
        }

        return row.PeoplePartnerId;
    }

    public async Task<Guid?> GetDepartmentIdAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        var row = await _dbContext.People
            .AsNoTracking()
            .Where(p => p.Id == personId)
            .Select(p => new { p.DepartmentId })
            .SingleOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            LogUnknownId(nameof(GetDepartmentIdAsync), "person", personId);
            return null;
        }

        return row.DepartmentId;
    }

    public async Task<Guid?> GetDepartmentManagerIdAsync(Guid departmentId, CancellationToken cancellationToken = default)
    {
        var managerId = await _dbContext.People
            .AsNoTracking()
            .Where(p => p.ManagesDepartmentId == departmentId)
            // The unique index on ManagesDepartmentId should make more than one match
            // unreachable in practice -- ordering here is a defensive, explicit tie-breaker so
            // the intent is clear rather than leaving FirstOrDefaultAsync looking like an
            // unexplained inconsistency next to the other lookups' SingleOrDefaultAsync.
            .OrderBy(p => p.Id)
            .Select(p => (Guid?)p.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (managerId is null)
        {
            // This query is keyed on ManagesDepartmentId, not the department's own primary key, so
            // "no Person manages this department" is naturally indistinguishable here from
            // "departmentId itself is unknown". Check the department's own existence separately,
            // purely to decide whether to log -- a known, genuinely-unmanaged department is not
            // itself evidence of a data-sync bug and should not warn.
            var departmentExists = await _dbContext.Departments
                .AsNoTracking()
                .AnyAsync(d => d.Id == departmentId, cancellationToken);

            if (!departmentExists)
            {
                LogUnknownId(nameof(GetDepartmentManagerIdAsync), "department", departmentId);
            }
        }

        return managerId;
    }

    public async Task<Guid?> GetParentDepartmentIdAsync(Guid departmentId, CancellationToken cancellationToken = default)
    {
        var row = await _dbContext.Departments
            .AsNoTracking()
            .Where(d => d.Id == departmentId)
            .Select(d => new { d.ParentDepartmentId })
            .SingleOrDefaultAsync(cancellationToken);

        if (row is null)
        {
            LogUnknownId(nameof(GetParentDepartmentIdAsync), "department", departmentId);
            return null;
        }

        return row.ParentDepartmentId;
    }

    public async Task<IReadOnlyCollection<Guid>> GetProjectIdsManagedAsDmOrPmAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        var projectIds = await _dbContext.ProjectAssignments
            .AsNoTracking()
            .Where(pa => pa.PersonId == personId
                && (pa.Role == ProjectAssignmentRole.ProjectManager || pa.Role == ProjectAssignmentRole.DeliveryManager))
            .Select(pa => pa.ProjectId)
            .ToListAsync(cancellationToken);

        if (projectIds.Count == 0)
        {
            await LogIfUnknownPersonAsync(nameof(GetProjectIdsManagedAsDmOrPmAsync), personId, cancellationToken);
        }

        return projectIds;
    }

    public async Task<IReadOnlyCollection<Guid>> GetAssignedProjectIdsAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        var projectIds = await _dbContext.ProjectAssignments
            .AsNoTracking()
            .Where(pa => pa.PersonId == personId)
            .Select(pa => pa.ProjectId)
            .ToListAsync(cancellationToken);

        if (projectIds.Count == 0)
        {
            await LogIfUnknownPersonAsync(nameof(GetAssignedProjectIdsAsync), personId, cancellationToken);
        }

        return projectIds;
    }

    /// <summary>
    /// An empty result from either Project-line lookup above is naturally indistinguishable
    /// between "known person, genuinely no project assignments" and "personId itself is unknown" --
    /// same ambiguity the four Reporting-line lookups resolve via <see cref="LogUnknownId"/>. Checks
    /// the person's own existence separately, purely to decide whether to log, so a genuinely
    /// unassigned known person doesn't warn.
    /// </summary>
    private async Task LogIfUnknownPersonAsync(string methodName, Guid personId, CancellationToken cancellationToken)
    {
        var personExists = await _dbContext.People
            .AsNoTracking()
            .AnyAsync(p => p.Id == personId, cancellationToken);

        if (!personExists)
        {
            LogUnknownId(methodName, "person", personId);
        }
    }

    /// <summary>
    /// Logs, at Warning level, that <paramref name="methodName"/> found no <paramref name="idKind"/>
    /// row at all for <paramref name="id"/> -- as opposed to a known row with a legitimately-null FK
    /// column, which never reaches this method. Pure observability: does not change any method's
    /// return value.
    /// </summary>
    private void LogUnknownId(string methodName, string idKind, Guid id)
    {
        _logger.LogWarning(
            "{Method} found no {IdKind} row for id {Id}. This is currently indistinguishable from a " +
            "genuinely-known id with no relationship on file from the caller's point of view (see this " +
            "service's CLAUDE.md Gotchas) -- returning null/empty as before -- but may indicate a " +
            "data-sync gap (an id not yet synced from People/Organization).",
            methodName,
            idKind,
            id);
    }
}
