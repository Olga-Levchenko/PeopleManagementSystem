namespace AccessControlService.Domain;

/// <summary>
/// The subset of a subject person's relationship attributes needed for a single batch resolution
/// pass, returned in bulk by <see cref="IRelationshipRepository.GetSubjectAttributesBatchAsync"/>.
/// Kept in Domain (alongside the interface that returns it) because it is part of the port
/// contract, not an EF Core or infrastructure detail.
/// </summary>
/// <param name="DepartmentId">
/// The department this subject currently belongs to, or <c>null</c> if none on file.
/// </param>
/// <param name="PeoplePartnerId">
/// The id of this subject's assigned people partner, or <c>null</c> if none on file.
/// </param>
public sealed record SubjectBatchAttributes(Guid? DepartmentId, Guid? PeoplePartnerId);

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
    /// The id of <paramref name="personId"/>'s assigned people partner, or <c>null</c> if the
    /// person has no PP on file, or the id itself isn't a known person -- these two cases are
    /// deliberately indistinguishable at this layer, same as <see cref="GetManagerIdAsync"/> (see
    /// this service's CLAUDE.md Gotchas).
    /// </summary>
    Task<Guid?> GetPeoplePartnerIdAsync(Guid personId, CancellationToken cancellationToken = default);

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

    // -- O4-90: batch resolution methods. All four are called once per batch request,
    //    independent of the number of subjects (O(4) DB round-trips total). --

    /// <summary>
    /// Returns the set of all person ids who are transitively managed by
    /// <paramref name="viewerPersonId"/> via the reports-to chain, using a Postgres recursive CTE
    /// depth-bounded at 100 hops (same cycle guard as <see cref="AccessRoleResolver"/>'s own hop
    /// limit). Empty (never <c>null</c>) when the viewer is not in the DB or manages no one.
    /// </summary>
    Task<IReadOnlySet<Guid>> GetTransitiveReporteeIdsAsync(Guid viewerPersonId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns the set of all department ids in the subtree rooted at the department the viewer
    /// manages (<c>Person.ManagesDepartmentId</c>), inclusive, using a Postgres recursive CTE
    /// depth-bounded at 100 hops. Returns an empty set immediately when the viewer manages no
    /// department or the viewer is not in the DB.
    /// </summary>
    Task<IReadOnlySet<Guid>> GetManagedDepartmentSubtreeIdsAsync(Guid viewerPersonId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns a dictionary mapping each id in <paramref name="subjectPersonIds"/> that exists in
    /// the DB to its <see cref="SubjectBatchAttributes"/> (DepartmentId, PeoplePartnerId). Ids
    /// absent from the DB are silently omitted (callers treat a missing entry as all-null
    /// attributes, fail-closed). Uses a single LINQ <c>Contains</c>-based query (Npgsql translates
    /// to <c>= ANY(@ids)</c>).
    /// </summary>
    Task<IReadOnlyDictionary<Guid, SubjectBatchAttributes>> GetSubjectAttributesBatchAsync(IReadOnlyCollection<Guid> subjectPersonIds, CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns the set of all person ids among <paramref name="subjectPersonIds"/> who are
    /// assigned to at least one project the viewer is DM or PM of. Uses a LINQ join on the
    /// viewer's managed project id set (returned by <see cref="GetProjectIdsManagedAsDmOrPmAsync"/>)
    /// — callers pre-fetch the viewer's project ids and pass them in directly so this query is a
    /// single <c>Contains</c>-based filter, not an extra viewer-id lookup.
    /// </summary>
    Task<IReadOnlySet<Guid>> GetSubjectsOnViewerProjectsAsync(IReadOnlyCollection<Guid> viewerProjectIds, IReadOnlyCollection<Guid> subjectPersonIds, CancellationToken cancellationToken = default);
}
