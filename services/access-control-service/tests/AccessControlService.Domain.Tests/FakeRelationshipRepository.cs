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
    private readonly Dictionary<Guid, Guid?> _departmentByPerson = new();
    private readonly Dictionary<Guid, Guid?> _managerByDepartment = new();
    private readonly Dictionary<Guid, Guid?> _parentByDepartment = new();
    private readonly Dictionary<Guid, HashSet<Guid>> _dmOrPmProjectIdsByPerson = new();
    private readonly Dictionary<Guid, HashSet<Guid>> _assignedProjectIdsByPerson = new();

    public int ManagerLookupCount { get; private set; }
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

    public Task<Guid?> GetManagerIdAsync(Guid personId, CancellationToken cancellationToken = default)
    {
        ManagerLookupCount++;
        ThrowIfRunaway(ManagerLookupCount);
        return Task.FromResult(_managerByPerson.GetValueOrDefault(personId));
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
