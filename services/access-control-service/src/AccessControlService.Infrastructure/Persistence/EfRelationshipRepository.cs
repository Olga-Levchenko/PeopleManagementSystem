using AccessControlService.Domain;
using Microsoft.EntityFrameworkCore;

namespace AccessControlService.Infrastructure.Persistence;

/// <summary>
/// EF Core implementation of <see cref="IRelationshipRepository"/> against this service's own
/// fixture-only reports-to / department-management schema (<see cref="AccessControlDbContext"/>).
/// </summary>
/// <remarks>
/// An id that doesn't match any seeded row (unknown person or department) currently resolves to
/// the same <c>null</c> as a genuinely-known id with no manager/department -- these two cases are
/// indistinguishable at this layer. That's a deliberate, tracked gap (see this service's CLAUDE.md
/// Gotchas and deferred-work.md), not an oversight: it has zero blast radius today since nothing
/// calls this repository with an unsynced id yet, but needs a real decision (throw, log, or another
/// signal) before any real HTTP consumer is wired up.
/// </remarks>
public sealed class EfRelationshipRepository : IRelationshipRepository
{
    private readonly AccessControlDbContext _dbContext;

    public EfRelationshipRepository(AccessControlDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<Guid?> GetManagerIdAsync(Guid personId, CancellationToken cancellationToken = default) =>
        await _dbContext.People
            .AsNoTracking()
            .Where(p => p.Id == personId)
            .Select(p => p.ManagerId)
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<Guid?> GetDepartmentIdAsync(Guid personId, CancellationToken cancellationToken = default) =>
        await _dbContext.People
            .AsNoTracking()
            .Where(p => p.Id == personId)
            .Select(p => p.DepartmentId)
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<Guid?> GetDepartmentManagerIdAsync(Guid departmentId, CancellationToken cancellationToken = default) =>
        await _dbContext.People
            .AsNoTracking()
            .Where(p => p.ManagesDepartmentId == departmentId)
            // The unique index on ManagesDepartmentId should make more than one match
            // unreachable in practice -- ordering here is a defensive, explicit tie-breaker so
            // the intent is clear rather than leaving FirstOrDefaultAsync looking like an
            // unexplained inconsistency next to the other lookups' SingleOrDefaultAsync.
            .OrderBy(p => p.Id)
            .Select(p => (Guid?)p.Id)
            .FirstOrDefaultAsync(cancellationToken);

    public async Task<Guid?> GetParentDepartmentIdAsync(Guid departmentId, CancellationToken cancellationToken = default) =>
        await _dbContext.Departments
            .AsNoTracking()
            .Where(d => d.Id == departmentId)
            .Select(d => d.ParentDepartmentId)
            .SingleOrDefaultAsync(cancellationToken);
}
