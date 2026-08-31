namespace AccessControlService.Infrastructure.Persistence;

/// <summary>
/// The role a person holds on a single project assignment row. <see cref="ProjectManager"/> and
/// <see cref="DeliveryManager"/> are the two roles that qualify a person for Project-line access
/// toward everyone else assigned to the same project (spec-1-1c); <see cref="Member"/> is a plain
/// assignment that makes the person a Project-line *subject* candidate but confers no access of
/// its own.
/// </summary>
public enum ProjectAssignmentRole
{
    Member = 0,
    ProjectManager = 1,
    DeliveryManager = 2,
}
