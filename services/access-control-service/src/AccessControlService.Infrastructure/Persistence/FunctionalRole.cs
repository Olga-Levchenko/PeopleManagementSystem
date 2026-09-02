namespace AccessControlService.Infrastructure.Persistence;

public sealed class FunctionalRole
{
    public Guid Id { get; set; }
    public string RoleKey { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public bool IsSeeded { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime? DeactivatedAtUtc { get; set; }
}
