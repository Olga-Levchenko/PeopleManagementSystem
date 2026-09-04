using System.Text.Json;

namespace AccessControlService.Domain.Permissions;

public static class PermissionScopeValidator
{
    private const string DASHBOARD_TYPE = "dashboardType";

    private static readonly IReadOnlySet<string> DashboardTypes =
        new HashSet<string>(StringComparer.Ordinal)
        {
            "unit-manager",
            "delivery-manager",
            "project-manager",
            "people-partner",
        };

    public static string? ValidateAndNormalize(string permissionKey, string? scope)
    {
        if (string.IsNullOrWhiteSpace(permissionKey) || !PermissionCatalogue.Contains(permissionKey))
        {
            throw new ArgumentException("Unknown permission key.", nameof(permissionKey));
        }

        if (!PermissionCatalogue.RequiresScope(permissionKey))
        {
            if (scope is not null)
            {
                throw new ArgumentException("This permission does not accept a scope.", nameof(scope));
            }

            return null;
        }

        if (string.IsNullOrWhiteSpace(scope))
        {
            throw new ArgumentException("This permission requires a scope.", nameof(scope));
        }

        try
        {
            using JsonDocument document = JsonDocument.Parse(scope);
            JsonElement root = document.RootElement;

            if (root.ValueKind != JsonValueKind.Object ||
                root.EnumerateObject().Count() != 1 ||
                !root.TryGetProperty(DASHBOARD_TYPE, out JsonElement dashboardType) ||
                dashboardType.ValueKind != JsonValueKind.String ||
                !DashboardTypes.Contains(dashboardType.GetString()!))
            {
                throw new ArgumentException("Invalid dashboard scope.", nameof(scope));
            }

            return JsonSerializer.Serialize(new Dictionary<string, string>
            {
                [DASHBOARD_TYPE] = dashboardType.GetString()!,
            });
        }
        catch (JsonException exception)
        {
            throw new ArgumentException("Scope must be valid JSON.", nameof(scope), exception);
        }
    }
}
