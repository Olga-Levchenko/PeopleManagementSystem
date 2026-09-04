namespace AccessControlService.Domain.Permissions;

public sealed record PermissionGrantValue(
    string PermissionKey,
    string? Scope);

public static class PermissionEvaluator
{
    public static bool IsGranted(
        string permissionKey,
        string? scope,
        IEnumerable<PermissionGrantValue> grants)
    {
        string? normalizedScope = PermissionScopeValidator.ValidateAndNormalize(permissionKey, scope);

        return grants.Any(grant =>
            grant.PermissionKey == permissionKey &&
            grant.Scope == normalizedScope);
    }
}
