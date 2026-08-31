namespace AccessControlService.Infrastructure.Persistence;

/// <summary>
/// Fixture-only department record for department-management resolution, until this service
/// consumes a real synced relationship projection from People/Organization (AD-1; tracked as
/// deferred work).
/// </summary>
/// <remarks>
/// Deliberately has no <c>ManagerId</c> foreign key back to <see cref="Person"/>. Department
/// management is modeled from the <see cref="Person"/> side instead (<see cref="Person.ManagesDepartmentId"/>)
/// so the two tables have a foreign-key dependency in one direction only (Person -> Department via
/// <see cref="Person.DepartmentId"/> and <see cref="Person.ManagesDepartmentId"/>), rather than a
/// circular Person -> Department -> Person dependency at the schema level. This is a deliberate
/// design choice, not a missing column -- see
/// <see cref="EfRelationshipRepository.GetDepartmentManagerIdAsync"/> for the query that answers
/// "who manages this department" from the Person side.
/// </remarks>
public sealed class Department
{
    public Guid Id { get; set; }

    /// <summary>Non-identifying label for readability in fixtures/tests only.</summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>Direct (one-hop) parent department, or <c>null</c> if this is a root department.</summary>
    public Guid? ParentDepartmentId { get; set; }
}
