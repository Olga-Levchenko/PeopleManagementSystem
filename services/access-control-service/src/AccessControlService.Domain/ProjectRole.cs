namespace AccessControlService.Domain;

/// <summary>
/// The project-scoped role a viewer holds toward a subject reached via Project-line, for exactly
/// the two roles that ever qualify a person for Project-line access at all (spec-1-1c):
/// <see cref="ProjectManager"/> and <see cref="DeliveryManager"/>. Domain-owned -- deliberately not
/// a reference to Infrastructure's <c>ProjectAssignmentRole</c> (which also has a <c>Member</c>
/// value that never qualifies for anything and has no place in a Domain-level result type; Domain
/// has zero external dependencies, AD-1). <c>EfRelationshipRepository</c> maps
/// <c>Infrastructure.ProjectAssignmentRole</c> to this enum at the boundary -- see
/// <c>IRelationshipRepository.GetProjectRolesAsync</c>.
/// </summary>
public enum ProjectRole
{
    ProjectManager = 0,
    DeliveryManager = 1,
}
