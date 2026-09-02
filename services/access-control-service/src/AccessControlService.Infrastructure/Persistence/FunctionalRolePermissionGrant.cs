namespace AccessControlService.Infrastructure.Persistence;

public sealed class FunctionalRolePermissionGrant
{
    public Guid Id { get; set; }
    public Guid FunctionalRoleId { get; set; }
    public Guid PermissionId { get; set; }
    public string? Scope { get; set; }
    public DateTime GrantedAtUtc { get; set; }
}
