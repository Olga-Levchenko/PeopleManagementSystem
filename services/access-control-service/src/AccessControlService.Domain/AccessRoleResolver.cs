using Microsoft.Extensions.Logging;

namespace AccessControlService.Domain;

/// <summary>
/// Computes Reporting-line, Project-line, and People-Partner-line access-role qualification for a
/// single (viewer, subject) pair, from real reports-to / department-management /
/// project-assignment / people-partner-assignment relationship data via
/// <see cref="IRelationshipRepository"/> -- never from a stored or cached role flag. Resolve per
/// (viewer, subject) pair on every call; never cache a single "current user role" across subjects
/// or requests.
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
    private readonly IFullProfileAccessRepository _fullProfileAccessRepository;
    private readonly ILogger<AccessRoleResolver> _logger;

    public AccessRoleResolver(
        IRelationshipRepository repository,
        IFullProfileAccessRepository fullProfileAccessRepository,
        ILogger<AccessRoleResolver> logger)
    {
        _repository = repository;
        _fullProfileAccessRepository = fullProfileAccessRepository;
        _logger = logger;
    }

    /// <summary>
    /// Resolves whether <paramref name="viewerId"/> qualifies for Reporting-line, Project-line,
    /// People-Partner-line, and/or Full-profile-access toward <paramref name="subjectId"/>.
    /// Reporting-line qualifies via transitive reports-to at any depth, OR department-management of
    /// the subject's department or any ancestor department. Project-line qualifies when the viewer
    /// is DM or PM of a project the subject is assigned to. People-Partner-line qualifies when the
    /// viewer is the subject's assigned people partner, or transitively above that PP in the PP's
    /// own reports-to chain (the "HR line"). Full-profile-access qualifies when the viewer holds a
    /// stored grant and is viewer-only (not viewer-to-subject), so it is resolved and returned even
    /// when <paramref name="viewerId"/> equals <paramref name="subjectId"/>. All other flags are
    /// false for self-view -- a person is never their own manager, DM/PM, or PP.
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
        // Full-profile-access is a viewer-only property -- it qualifies the viewer independently of
        // any relationship to the subject, including the self-view case. Resolved before the
        // self-view guard so that a holder viewing their own profile still gets FullProfileAccessLine=true.
        var fullProfileAccessLine = await _fullProfileAccessRepository.IsHolderAsync(viewerId, cancellationToken);

        if (viewerId == subjectId)
        {
            // A person is never their own manager, DM/PM, or PP; all relationship-derived flags are
            // false for self-view. Full-profile-access is preserved: it is the only flag that is
            // viewer-only, not viewer-to-subject, so the Self constraint does not apply to it.
            return new AccessRole { FullProfileAccessLine = fullProfileAccessLine };
        }

        var reportingLine =
            await IsTransitiveManagerAsync(viewerId, subjectId, cancellationToken)
            || await ManagesSubjectsDepartmentOrAncestorAsync(viewerId, subjectId, cancellationToken);

        var projectLine = await QualifiesViaProjectAssignmentAsync(viewerId, subjectId, cancellationToken);

        var peoplePartnerId = await _repository.GetPeoplePartnerIdAsync(subjectId, cancellationToken);
        var peoplePartnerLine =
            peoplePartnerId is not null
            && (peoplePartnerId == viewerId
                || await IsTransitiveManagerAsync(viewerId, peoplePartnerId.Value, cancellationToken));

        if (!fullProfileAccessLine && !reportingLine && !projectLine && !peoplePartnerLine)
        {
            return AccessRole.None;
        }

        return new AccessRole
        {
            FullProfileAccessLine = fullProfileAccessLine,
            ReportingLine = reportingLine,
            ProjectLine = projectLine,
            PeoplePartnerLine = peoplePartnerLine,
        };
    }

    /// <summary>
    /// Resolves <paramref name="viewerPersonId"/>'s access role toward each id in
    /// <paramref name="subjectPersonIds"/> in a single pass, using five interface calls
    /// (O(5–6) DB round-trips (constant, independent of N): the department-subtree method makes an
    /// extra round-trip to check ManagesDepartmentId before firing the CTE, and project-line uses
    /// two sequential calls). Returns a dictionary keyed by every subject id in the input; subjects
    /// absent from the DB resolve to <see cref="AccessRole.None"/> (fail-closed, same Gotcha as
    /// <see cref="ResolveAsync"/>). If <paramref name="viewerPersonId"/> appears in
    /// <paramref name="subjectPersonIds"/>, that entry resolves to <see cref="AccessRole.None"/>
    /// (no self-elevation). An empty input returns an empty dictionary.
    /// </summary>
    /// <remarks>
    /// This method does NOT call <see cref="ResolveAsync"/> in a loop. It pre-computes the
    /// viewer's full transitive relationship sets in O(4) queries, then evaluates every subject
    /// purely in memory. It is safe to call concurrently with itself only if each call uses a
    /// separate resolver instance — it shares the same scoped
    /// <see cref="IRelationshipRepository"/> as <see cref="ResolveAsync"/> and thus the same
    /// non-thread-safe EF Core DbContext in production.
    /// </remarks>
    public async Task<IReadOnlyDictionary<Guid, AccessRole>> ResolveBatchAsync(
        Guid viewerPersonId,
        IReadOnlyCollection<Guid> subjectPersonIds,
        CancellationToken cancellationToken = default)
    {
        if (subjectPersonIds.Count == 0)
        {
            return new Dictionary<Guid, AccessRole>();
        }

        // Query 1: transitive reportee ids (also used for HR-line PP resolution below).
        var reporteeIds = await _repository.GetTransitiveReporteeIdsAsync(viewerPersonId, cancellationToken);

        // Query 2: department subtree the viewer manages.
        var managedDeptIds = await _repository.GetManagedDepartmentSubtreeIdsAsync(viewerPersonId, cancellationToken);

        // Query 3: subject attributes (DepartmentId, PeoplePartnerId) for every requested subject.
        var subjectAttributes = await _repository.GetSubjectAttributesBatchAsync(subjectPersonIds, cancellationToken);

        // Query 4: subjects on the viewer's managed projects (requires viewer's own project ids).
        var viewerProjectIds = await _repository.GetProjectIdsManagedAsDmOrPmAsync(viewerPersonId, cancellationToken);
        IReadOnlySet<Guid> projectLineSubjectIds;
        if (viewerProjectIds.Count == 0)
        {
            projectLineSubjectIds = new HashSet<Guid>();
        }
        else
        {
            projectLineSubjectIds = await _repository.GetSubjectsOnViewerProjectsAsync(
                viewerProjectIds, subjectPersonIds, cancellationToken);
        }

        // Evaluate every subject in memory -- no additional DB round-trips.
        var results = new Dictionary<Guid, AccessRole>(subjectPersonIds.Count);
        foreach (var subjectId in subjectPersonIds)
        {
            // Self-elevation is always fail-closed: the viewer cannot resolve toward themselves.
            if (subjectId == viewerPersonId)
            {
                results[subjectId] = AccessRole.None;
                continue;
            }

            // Reporting-line: viewer is a transitive reports-to ancestor (Query 1) OR manages a
            // department ancestor of the subject's own department (Query 2 + Query 3).
            var reportingLine = reporteeIds.Contains(subjectId);
            if (!reportingLine && managedDeptIds.Count > 0)
            {
                if (subjectAttributes.TryGetValue(subjectId, out var attrs) && attrs.DepartmentId is not null)
                {
                    reportingLine = managedDeptIds.Contains(attrs.DepartmentId.Value);
                }
            }

            // Project-line: subject is on at least one project the viewer manages as DM or PM
            // (Query 4).
            var projectLine = projectLineSubjectIds.Contains(subjectId);

            // People-Partner-line: viewer is the subject's assigned PP (direct match) OR viewer is
            // transitively above the subject's PP in the PP's own reports-to chain (HR-line = set
            // membership in reporteeIds from Query 1, zero extra round-trips).
            var peoplePartnerLine = false;
            if (subjectAttributes.TryGetValue(subjectId, out var subjectAttr) && subjectAttr.PeoplePartnerId is not null)
            {
                var ppId = subjectAttr.PeoplePartnerId.Value;
                peoplePartnerLine = ppId == viewerPersonId || reporteeIds.Contains(ppId);
            }

            if (!reportingLine && !projectLine && !peoplePartnerLine)
            {
                results[subjectId] = AccessRole.None;
                continue;
            }

            results[subjectId] = new AccessRole
            {
                ReportingLine = reportingLine,
                ProjectLine = projectLine,
                PeoplePartnerLine = peoplePartnerLine,
            };
        }

        return results;
    }

    /// <summary>
    /// Walks <paramref name="startId"/>'s reports-to chain upward, one hop at a time, looking for
    /// the viewer. Stops (returns false) on reaching the top of the chain, revisiting an
    /// already-seen node (cycle guard), or exceeding <see cref="MaxHops"/>. Generalized over its
    /// starting point (not always the subject) so it can walk either the subject's own reports-to
    /// chain (Reporting-line) or the subject's assigned PP's reports-to chain (the "HR line" for
    /// PP-line, per spec-1-6b) -- the walking/cycle-guard logic is identical either way.
    /// </summary>
    private async Task<bool> IsTransitiveManagerAsync(
        Guid viewerId,
        Guid startId,
        CancellationToken cancellationToken)
    {
        var visited = new HashSet<Guid> { startId };
        var currentId = startId;

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

        // Reaching here means the loop ran all MaxHops iterations without returning -- i.e. the walk
        // was truncated by the cycle guard, not because it found a match or ran off the top of the
        // chain (both of which return from inside the loop above). This is deliberately
        // distinguished from the "cycle detected" case above, which is an expected, self-diagnosing
        // outcome -- this one silently denies access with no other signal, so it's worth a warning:
        // it could be a genuinely deep reporting chain exceeding MaxHops, or malformed data forming a
        // cycle longer than MaxHops distinct nodes.
        _logger.LogWarning(
            "Reports-to walk from {StartId} toward viewer {ViewerId} was truncated after " +
            "{MaxHops} hops without finding a match or reaching the top of the chain. This may be a " +
            "genuinely deep reporting chain exceeding the cycle guard, or malformed data -- either way, " +
            "access was not granted via this path and the result may be a false negative.",
            startId,
            viewerId,
            MaxHops);

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

        // currentDepartmentId is still non-null here only if the loop exited because hop reached
        // MaxHops -- reaching a genuine root department sets currentDepartmentId to null instead
        // (the loop's own condition), and a cycle returns early from inside the loop above. So a
        // non-null value at this point means the walk was truncated by the cycle guard without
        // finding a match, which silently denies access with no other signal -- worth a warning for
        // the same reason as IsTransitiveManagerAsync's analogous case above.
        if (currentDepartmentId is not null)
        {
            _logger.LogWarning(
                "Department-ancestor walk for subject {SubjectId} toward viewer {ViewerId} was " +
                "truncated after {MaxHops} hops without finding a match or reaching a root department. " +
                "This may be a genuinely deep department hierarchy exceeding the cycle guard, or " +
                "malformed data -- either way, Reporting-line access was not granted via this path and " +
                "the result may be a false negative.",
                subjectId,
                viewerId,
                MaxHops);
        }

        return false;
    }

    /// <summary>
    /// Resolves whether the viewer qualifies for Project-line access toward the subject: the
    /// viewer is DM or PM of at least one project the subject is also assigned to. A single,
    /// direct check -- deliberately not transitive/hop-based like the two Reporting-line checks
    /// above, per this spec's scope (spec-1-1c): no precedence/narrowing decision and no
    /// reports-to-chain walk above the DM/PM is made here.
    /// </summary>
    private async Task<bool> QualifiesViaProjectAssignmentAsync(
        Guid viewerId,
        Guid subjectId,
        CancellationToken cancellationToken)
    {
        var viewerProjectIds = await _repository.GetProjectIdsManagedAsDmOrPmAsync(viewerId, cancellationToken);
        if (viewerProjectIds.Count == 0)
        {
            return false;
        }

        var subjectProjectIds = await _repository.GetAssignedProjectIdsAsync(subjectId, cancellationToken);
        if (subjectProjectIds.Count == 0)
        {
            return false;
        }

        return viewerProjectIds.Any(subjectProjectIds.Contains);
    }
}
