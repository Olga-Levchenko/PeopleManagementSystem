namespace AccessControlService.Infrastructure.Persistence;

/// <summary>
/// Fixture-only project-assignment record for Project-line resolution (spec-1-1c), until this
/// service consumes a real synced project-assignment projection from the timetracker integration
/// (deferred to <c>spec-1-1d</c>, RabbitMQ consumer -- see <c>deferred-work.md</c>). Deliberately
/// minimal -- this schema exists to answer <see cref="AccessControlService.Domain.IRelationshipRepository"/>'s
/// two Project-line questions, not to be a second copy of a real project/timetracker model.
/// </summary>
/// <remarks>
/// There is no separate <c>Project</c> table -- <see cref="ProjectId"/> is an opaque grouping id
/// with no row of its own, mirroring how nothing else in this service needs a project label or
/// its own lifecycle yet. A (ProjectId, PersonId) pair is unique -- a person appears at most once
/// per project, in exactly one role -- enforced via a unique index in
/// <c>AccessControlDbContext</c>, the same defensive-constraint style as <c>Person.ManagesDepartmentId</c>.
/// </remarks>
public sealed class ProjectAssignment
{
    public Guid Id { get; set; }

    /// <summary>Opaque project identifier this assignment belongs to. No FK -- see remarks above.</summary>
    public Guid ProjectId { get; set; }

    /// <summary>The assigned person. FK to <see cref="Person"/>.</summary>
    public Guid PersonId { get; set; }

    /// <summary>The role this person holds on this specific project.</summary>
    public ProjectAssignmentRole Role { get; set; }
}
