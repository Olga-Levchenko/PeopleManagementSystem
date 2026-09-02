namespace AccessControlService.Infrastructure.Persistence;

public sealed class Permission
{
    public Guid Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public bool RequiresScope { get; set; }
}
