namespace AccessControlService.Infrastructure.Persistence;

public sealed class AuthorizationAdministrationAudit
{
    public Guid AuditId { get; set; }
    public string Action { get; set; } = string.Empty;
    public string TargetType { get; set; } = string.Empty;
    public Guid? TargetId { get; set; }
    public Guid? ActorPersonId { get; set; }
    public string? TrustedProvisioningActor { get; set; }
    public string? PermissionKey { get; set; }
    public string? Scope { get; set; }
    public string? Before { get; set; }
    public string? After { get; set; }
    public DateTime OccurredAtUtc { get; set; }
    public string CorrelationId { get; set; } = string.Empty;
    public string? IdempotencyKey { get; set; }
}
