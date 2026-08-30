namespace AccessControlService.Domain;

/// <summary>
/// Read-only relationship lookups <see cref="AccessRoleResolver"/> walks to resolve Reporting-line
/// and Project-line qualification. Defined in Domain (the hexagonal port); implemented in
/// Infrastructure against EF Core (<c>EfRelationshipRepository</c>), so Domain itself never depends
/// on EF Core or any other external package. Each Reporting-line method answers exactly one hop of
/// one relation -- the resolver composes them into a transitive walk. The two Project-line methods
/// are deliberately not hop-shaped: project assignment is a single, direct (non-transitive) check
/// per this spec (spec-1-1c) -- the resolver only needs each side's full project-id set to compute
/// an intersection, not a walk.
/// </summary>
public interface IRelationshipRepository
{
    /// <summary>
    /// The direct (one-hop) reports-to manager of <paramref name="personId"/>, or <c>null</c> if
    /// the person has no manager on file, or the id itself isn't a known person -- these two cases
    /// are deliberately indistinguishable at this layer (see this service's CLAUDE.md Gotchas).
    /// </summary>
    Task<Guid?> GetManagerIdAsync(Guid personId, CancellationToken cancellationToken = default);

    /// <summary>
    /// The department <paramref name="personId"/> currently belongs to, or <c>null</c> if the
    /// person has no department on file, or the id isn't a known person.
    /// </summary>
    Task<Guid?> GetDepartmentIdAsync(Guid personId, CancellationToken cancellationToken = default);

    /// <summary>
    /// The id of the person who manages <paramref name="departmentId"/>, or <c>null</c> if that
    /// department has no manager on file, or the id isn't a known department. Deliberately queried
    /// from the Person side (<c>Person.ManagesDepartmentId</c>) rather than a
    /// <c>Department.ManagerId</c> foreign key -- see <c>Department</c>'s doc comment.
    /// </summary>
    Task<Guid?> GetDepartmentManagerIdAsync(Guid departmentId, CancellationToken cancellationToken = default);

    /// <summary>
    /// The direct (one-hop) parent of <paramref name="departmentId"/>, or <c>null</c> if it's a
    /// root department, or the id isn't a known department.
    /// </summary>
    Task<Guid?> GetParentDepartmentIdAsync(Guid departmentId, CancellationToken cancellationToken = default);

    /// <summary>
    /// The ids of every project <paramref name="personId"/> is DM or PM of. Empty (never
    /// <c>null</c>) if the person holds neither role on any project, or the id isn't a known
    /// person.
    /// </summary>
    Task<IReadOnlyCollection<Guid>> GetProjectIdsManagedAsDmOrPmAsync(Guid personId, CancellationToken cancellationToken = default);

    /// <summary>
    /// The ids of every project <paramref name="personId"/> is assigned to, in any role. Empty
    /// (never <c>null</c>) if the person has no project assignment on file, or the id isn't a
    /// known person.
    /// </summary>
    Task<IReadOnlyCollection<Guid>> GetAssignedProjectIdsAsync(Guid personId, CancellationToken cancellationToken = default);
}
