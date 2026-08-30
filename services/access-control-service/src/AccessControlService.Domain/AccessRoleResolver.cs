namespace AccessControlService.Domain;

/// <summary>
/// Computes Reporting-line access-role qualification for a single (viewer, subject) pair, from
/// real reports-to / department-management relationship data via <see cref="IRelationshipRepository"/>
/// -- never from a stored or cached role flag. Resolve per (viewer, subject) pair on every call;
/// never cache a single "current user role" across subjects or requests.
/// </summary>
public sealed class AccessRoleResolver
{
    /// <summary>
    /// Hard upper bound on hops walked for either relation. Real org depth is nowhere near this;
    /// it exists purely as a cycle guard against malformed relationship data (e.g. a reports-to or
    /// department-parent loop), so a bad data set fails fast with a bounded number of repository
    /// calls instead of looping forever.
    /// </summary>
    private const int MaxHops = 100;

    private readonly IRelationshipRepository _repository;

    public AccessRoleResolver(IRelationshipRepository repository)
    {
        _repository = repository;
    }

    /// <summary>
    /// Resolves whether <paramref name="viewerId"/> qualifies for Reporting-line access toward
    /// <paramref name="subjectId"/>: transitive reports-to at any depth, OR department-management
    /// of the subject's department or any ancestor department. Returns
    /// <see cref="AccessRole.None"/> (i.e. <c>ReportingLine = false</c>) when
    /// <paramref name="viewerId"/> equals <paramref name="subjectId"/> -- a person is never their
    /// own manager; Self is a separate access role the caller must check before consulting this
    /// resolver, not an unreviewed edge case here.
    /// </summary>
    /// <remarks>
    /// Call sequentially, once per (viewer, subject) pair, per resolver instance. This resolver
    /// holds a scoped <see cref="IRelationshipRepository"/> backed in production by a scoped,
    /// non-thread-safe EF Core <c>DbContext</c> -- concurrent calls against the same instance (e.g.
    /// fanning multiple subjects out via <c>Task.WhenAll</c>) are not safe and will throw. A caller
    /// resolving several subjects in one request/batch must await each call in turn.
    /// </remarks>
    public async Task<AccessRole> ResolveAsync(
        Guid viewerId,
        Guid subjectId,
        CancellationToken cancellationToken = default)
    {
        if (viewerId == subjectId)
        {
            return AccessRole.None;
        }

        if (await IsTransitiveManagerAsync(viewerId, subjectId, cancellationToken))
        {
            return new AccessRole { ReportingLine = true };
        }

        if (await ManagesSubjectsDepartmentOrAncestorAsync(viewerId, subjectId, cancellationToken))
        {
            return new AccessRole { ReportingLine = true };
        }

        return AccessRole.None;
    }

    /// <summary>
    /// Walks the subject's reports-to chain upward, one hop at a time, looking for the viewer.
    /// Stops (returns false) on reaching the top of the chain, revisiting an already-seen node
    /// (cycle guard), or exceeding <see cref="MaxHops"/>.
    /// </summary>
    private async Task<bool> IsTransitiveManagerAsync(
        Guid viewerId,
        Guid subjectId,
        CancellationToken cancellationToken)
    {
        var visited = new HashSet<Guid> { subjectId };
        var currentId = subjectId;

        for (var hop = 0; hop < MaxHops; hop++)
        {
            var managerId = await _repository.GetManagerIdAsync(currentId, cancellationToken);
            if (managerId is null)
            {
                return false;
            }

            if (managerId.Value == viewerId)
            {
                return true;
            }

            if (!visited.Add(managerId.Value))
            {
                // Cycle in reports-to data -- stop rather than loop forever.
                return false;
            }

            currentId = managerId.Value;
        }

        return false;
    }

    /// <summary>
    /// Walks the subject's department upward (self, then parent, then parent's parent, ...),
    /// checking at each level whether the viewer manages that department. Stops (returns false) on
    /// reaching a root department with no match, revisiting an already-seen department (cycle
    /// guard), or exceeding <see cref="MaxHops"/>.
    /// </summary>
    private async Task<bool> ManagesSubjectsDepartmentOrAncestorAsync(
        Guid viewerId,
        Guid subjectId,
        CancellationToken cancellationToken)
    {
        var currentDepartmentId = await _repository.GetDepartmentIdAsync(subjectId, cancellationToken);
        var visited = new HashSet<Guid>();

        for (var hop = 0; currentDepartmentId is not null && hop < MaxHops; hop++)
        {
            if (!visited.Add(currentDepartmentId.Value))
            {
                // Cycle in department-parent data -- stop rather than loop forever.
                return false;
            }

            var managerId = await _repository.GetDepartmentManagerIdAsync(currentDepartmentId.Value, cancellationToken);
            if (managerId == viewerId)
            {
                return true;
            }

            currentDepartmentId = await _repository.GetParentDepartmentIdAsync(currentDepartmentId.Value, cancellationToken);
        }

        return false;
    }
}
