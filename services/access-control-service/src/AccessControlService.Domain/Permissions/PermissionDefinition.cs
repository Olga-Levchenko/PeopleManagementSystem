namespace AccessControlService.Domain.Permissions;

public sealed record PermissionDefinition(
    string Key,
    bool RequiresDashboardScope = false);
