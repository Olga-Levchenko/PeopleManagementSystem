using AccessControlService.Domain;

namespace AccessControlService.Domain.Tests;

/// <summary>
/// In-memory <see cref="IRelationshipRepository"/> test double. Deliberately hand-written rather
/// than a mocking framework, since the entire point of these tests is to exercise
/// <see cref="AccessRoleResolver"/>'s own walking/cycle-guard logic against simple, explicit
/// relationship maps -- not to verify call sequences.
/// </summary>
/// <remarks>
/// Also enforces a hard call cap (<see cref="MaxCallsBeforeThrow"/>), well above
/// <see cref="AccessRoleResolver"/>'s own internal hop bound, on every lookup method. This turns a
/// regression that removes the resolver's cycle guard into an immediate thrown exception instead
/// of an indefinite hang -- the fake fails fast rather than requiring a wall-clock timeout around
/// the test to catch a runaway walk.
/// </remarks>
public sealed class FakeRelationshipRepository : IRelationshipRepository
{
    private const int MaxCallsBeforeThrow = 1_000;

    private readonly Dictionary<Guid, Guid?> _managerByPerson = new();
    private readonly Dictionary<Guid, Guid?> _peoplePartnerByPerson = new();
    private readonly Dictionary<Guid, Guid?> _departmentByPerson = new();
    private readonly Dictionary<Guid, Guid?> _managerByDepartment = new();
    private readonly Dictionary<Guid, Guid?> _parentByDepartment = new();
    private readonly Dictionary<Guid, HashSet<Guid>> _dmOrPmProjectIdsByPerson = new();
    private readonly Dictionary<Guid, HashSet<Guid>> _assignedProjectIdsByPerson = new();

    /// <summary>
    /// Maps a viewer id to the root department they manage -- used by
    /// <see cref="GetManagedDepartmentSubtreeIdsAsync"/> which needs to know what the viewer
    /// manages directly (without having to invert the <c>_managerByDepartment</c> map, which is
    /// keyed on department, not on the manager person).
    /// </summary>
    private readonly Dictionary<Guid, Guid> _managedDepartmentByViewer = new();

    public int ManagerLookupCount { get; private set; }
    public int PeoplePartnerLookupCount { get; private set; }
    public int DepartmentLookupCount { get; private set; }
    public int DepartmentManagerLookupCount { get; private set; }
    public int ParentDepartmentLookupCount { get; private set; }
    public int DmOrPmProjectLookupCount { get; private set; }
    public int AssignedProjectLookupCount { get; private set; }

    public FakeRelationshipRepository SetManager(Guid personId, Guid? managerId)
    {
        _managerByPerson[personId] = managerId;
        return this;
    }

    public FakeRelationshipRepository SetPeoplePartner(Guid personId, Guid? peoplePartnerId)
    {
        _peoplePartnerByPerson[personId] = peoplePartnerId;
        return this;
    }

    public FakeRelationshipRepository SetDepartment(Guid personId, Guid? departmentId)
    {
        _departmentByPerson[personId] = departmentId;
        return this;
    }

    public FakeRelationshipRepository SetDepartmentManager(Guid departmentId, Guid? managerId)
    {
        _managerByDepartment[departmentId] = managerId;
        return this;
    }

    public FakeRelationshipRepository SetParentDepartment(Guid departmentId, Guid? parentDepartmentId)
    {
        _parentByDepartment[departmentId] = parentDepartmentId;
        return this;
    }

    /// <summary>Marks <paramref name="personId"/> as DM or PM of every project in <paramref name="projectIds"/>.</summary>
    public FakeRelationshipRepository SetProjectsManagedAsDmOrPm(Guid personId, params Guid[] projectIds)
    {
        _dmOrPmProjectIdsByPerson[personId] = new HashSet<Guid>(projectIds);
        return this;
    }

    /// <summary>Marks <paramref name="personId"/> as assigned to every project in <paramref name="projectIds"/>.</summary>
    public FakeRelationshipRepository SetAssignedProjects(Guid personId, params Guid[] projectIds)
    {
        _assignedProjectIdsByPerson[personId] = new HashSet<Guid>(projectIds);
        return this;
    }

    /// <summary>
    /// Records that <paramref name="viewerId"/> is the manager of <paramref name="departmentId"/>,
    /// enabling <see cref="GetManagedDepartmentSubtreeIdsAsync"/> to compute the subtree from the
    /// viewer's perspective. Combine with <see cref="SetParentDepartment"/> to build a hierarchy
    /// the BFS will traverse downward.
    /// </summary>
    public FakeRelationshipRepository SetViewerManagesDepartment(Guid viewerId, Guid departmentId)
    {
        _managedDepartmentByViewer[viewerId] = departmentId;
        return this;
    }

    public Task<Guid?> GetManagerIdAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        ManagerLookupCount++;
        ThrowIfRunaway(ManagerLookupCount);
        return Task.FromResult(_managerByPerson.GetValueOrDefault(personId));
    }

    public Task<Guid?> GetPeoplePartnerIdAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        PeoplePartnerLookupCount++;
        ThrowIfRunaway(PeoplePartnerLookupCount);
        return Task.FromResult(_peoplePartnerByPerson.GetValueOrDefault(personId));
    }

    public Task<Guid?> GetDepartmentIdAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        DepartmentLookupCount++;
        ThrowIfRunaway(DepartmentLookupCount);
        return Task.FromResult(_departmentByPerson.GetValueOrDefault(personId));
    }

    public Task<Guid?> GetDepartmentManagerIdAsync(Guid departmentId, CancellationToken cancellationToken = default)
    {
        DepartmentManagerLookupCount++;
        ThrowIfRunaway(DepartmentManagerLookupCount);
        return Task.FromResult(_managerByDepartment.GetValueOrDefault(departmentId));
    }

    public Task<Guid?> GetParentDepartmentIdAsync(Guid departmentId, CancellationToken cancellationToken = default)
    {
        ParentDepartmentLookupCount++;
        ThrowIfRunaway(ParentDepartmentLookupCount);
        return Task.FromResult(_parentByDepartment.GetValueOrDefault(departmentId));
    }

    public Task<IReadOnlyCollection<Guid>> GetProjectIdsManagedAsDmOrPmAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        DmOrPmProjectLookupCount++;
        ThrowIfRunaway(DmOrPmProjectLookupCount);
        IReadOnlyCollection<Guid> result = _dmOrPmProjectIdsByPerson.TryGetValue(personId, out var projectIds)
            ? projectIds
            : Array.Empty<Guid>();
        return Task.FromResult(result);
    }

    public Task<IReadOnlyCollection<Guid>> GetAssignedProjectIdsAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        AssignedProjectLookupCount++;
        ThrowIfRunaway(AssignedProjectLookupCount);
        IReadOnlyCollection<Guid> result = _assignedProjectIdsByPerson.TryGetValue(personId, out var projectIds)
            ? projectIds
            : Array.Empty<Guid>();
        return Task.FromResult(result);
    }

    // -- O4-90: batch methods. These implement the same relationships configured via the Set*
    //    methods above -- they are the in-memory equivalents of the 4 Postgres CTE/LINQ queries in
    //    EfRelationshipRepository -- so unit tests can exercise ResolveBatchAsync without a DB.

    /// <summary>
    /// Computes the transitive closure of the reports-to graph from
    /// <paramref name="viewerPersonId"/> using an iterative BFS over the in-memory
    /// <c>_managerByPerson</c> map (same data as <see cref="GetManagerIdAsync"/>). Equivalent
    /// to the Postgres recursive CTE in the real implementation, bounded at the same 100-hop
    /// limit.
    /// </summary>
    public Task<IReadOnlySet<Guid>> GetTransitiveReporteeIdsAsync(Guid viewerPersonId, CancellationToken cancellationToken = default)
    {
        // BFS from viewerPersonId downward: find every person whose manager chain leads to viewer.
        var reportees = new HashSet<Guid>();
        var queue = new Queue<Guid>();

        // Seed: direct reports of the viewer.
        foreach (var (personId, managerId) in _managerByPerson)
        {
            if (managerId == viewerPersonId)
            {
                queue.Enqueue(personId);
            }
        }

        var hopCount = 0;
        while (queue.Count > 0 && hopCount < 100)
        {
            var current = queue.Dequeue();
            if (!reportees.Add(current))
            {
                continue;
            }

            hopCount++;

            // Enqueue direct reports of 'current'.
            foreach (var (personId, managerId) in _managerByPerson)
            {
                if (managerId == current && !reportees.Contains(personId))
                {
                    queue.Enqueue(personId);
                }
            }
        }

        IReadOnlySet<Guid> result = reportees;
        return Task.FromResult(result);
    }

    /// <summary>
    /// Computes the department subtree rooted at the department the viewer manages. Returns an
    /// empty set when the viewer manages no department (no <see cref="SetDepartmentManager"/>
    /// call reversed to find what the viewer manages -- this fake uses a dedicated
    /// <see cref="SetViewerManagesDepartment"/> method for batch tests).
    /// </summary>
    public Task<IReadOnlySet<Guid>> GetManagedDepartmentSubtreeIdsAsync(Guid viewerPersonId, CancellationToken cancellationToken = default)
    {
        if (!_managedDepartmentByViewer.TryGetValue(viewerPersonId, out var rootDeptId))
        {
            IReadOnlySet<Guid> empty = new HashSet<Guid>();
            return Task.FromResult(empty);
        }

        // BFS downward through parent-to-children links (derived from _parentByDepartment, inverted).
        var subtree = new HashSet<Guid>();
        var queue = new Queue<Guid>();
        queue.Enqueue(rootDeptId);

        while (queue.Count > 0)
        {
            var current = queue.Dequeue();
            if (!subtree.Add(current))
            {
                continue;
            }

            foreach (var (deptId, parentId) in _parentByDepartment)
            {
                if (parentId == current && !subtree.Contains(deptId))
                {
                    queue.Enqueue(deptId);
                }
            }
        }

        IReadOnlySet<Guid> result = subtree;
        return Task.FromResult(result);
    }

    public Task<IReadOnlyDictionary<Guid, SubjectBatchAttributes>> GetSubjectAttributesBatchAsync(
        IReadOnlyCollection<Guid> subjectPersonIds,
        CancellationToken cancellationToken = default)
    {
        var dict = new Dictionary<Guid, SubjectBatchAttributes>();
        foreach (var id in subjectPersonIds)
        {
            var dept = _departmentByPerson.GetValueOrDefault(id);
            var pp = _peoplePartnerByPerson.GetValueOrDefault(id);
            // Only include entries where at least one attribute is explicitly configured -- i.e. the
            // person is "known" in the fake. A person with neither dept nor pp is still included if
            // they appear in any of the person maps at all.
            if (_departmentByPerson.ContainsKey(id) || _peoplePartnerByPerson.ContainsKey(id)
                || _managerByPerson.ContainsKey(id) || _dmOrPmProjectIdsByPerson.ContainsKey(id)
                || _assignedProjectIdsByPerson.ContainsKey(id))
            {
                dict[id] = new SubjectBatchAttributes(dept, pp);
            }
        }

        IReadOnlyDictionary<Guid, SubjectBatchAttributes> result = dict;
        return Task.FromResult(result);
    }

    public Task<IReadOnlySet<Guid>> GetSubjectsOnViewerProjectsAsync(
        IReadOnlyCollection<Guid> viewerProjectIds,
        IReadOnlyCollection<Guid> subjectPersonIds,
        CancellationToken cancellationToken = default)
    {
        var viewerProjectSet = new HashSet<Guid>(viewerProjectIds);
        var result = new HashSet<Guid>();

        foreach (var subjectId in subjectPersonIds)
        {
            if (_assignedProjectIdsByPerson.TryGetValue(subjectId, out var assignedProjects)
                && assignedProjects.Any(viewerProjectSet.Contains))
            {
                result.Add(subjectId);
            }
        }

        IReadOnlySet<Guid> readonlyResult = result;
        return Task.FromResult(readonlyResult);
    }

    private static void ThrowIfRunaway(int callCount)
    {
        if (callCount > MaxCallsBeforeThrow)
        {
            throw new InvalidOperationException(
                $"A relationship lookup was called more than {MaxCallsBeforeThrow} times in one " +
                "resolution -- this indicates AccessRoleResolver's cycle guard regressed and is " +
                "walking indefinitely. Failing immediately instead of hanging.");
        }
    }
}
