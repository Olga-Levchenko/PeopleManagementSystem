namespace AccessControlService.Infrastructure.Persistence;

/// <summary>
/// Fixture-only person record for reports-to / department-management resolution, until this
/// service consumes a real synced relationship projection from People/Organization (AD-1;
/// tracked as deferred work). Deliberately minimal -- this schema exists to answer
/// <see cref="AccessControlService.Domain.IRelationshipRepository"/>'s questions, not to be a
/// second copy of the People/Organization profile.
/// </summary>
public sealed class Person
{
    public Guid Id { get; set; }

    /// <summary>Non-identifying label for readability in fixtures/tests only -- never real personal data.</summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>Direct (one-hop) reports-to manager, or <c>null</c> if none on file.</summary>
    public Guid? ManagerId { get; set; }

    /// <summary>Assigned people partner, or <c>null</c> if none on file.</summary>
    public Guid? PeoplePartnerId { get; set; }

    /// <summary>Department this person currently belongs to, or <c>null</c> if none on file.</summary>
    public Guid? DepartmentId { get; set; }

    /// <summary>
    /// The department this person manages, if any. Deliberately modeled from this (Person) side
    /// rather than as a <c>Department.ManagerId</c> foreign key -- see <see cref="Department"/>'s
    /// doc comment for why.
    /// </summary>
    public Guid? ManagesDepartmentId { get; set; }
}
