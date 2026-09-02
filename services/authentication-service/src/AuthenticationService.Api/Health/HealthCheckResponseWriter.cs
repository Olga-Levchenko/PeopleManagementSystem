using System.Text.Json;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace AuthenticationService.Api.Health;

/// <summary>
/// Renders <see cref="HealthReport"/> as JSON: <c>status</c>, <c>totalDurationMs</c>, and a
/// <c>checks</c> array with one entry per registered health check (name/status/duration/description).
/// Used as the <c>ResponseWriter</c> for <c>MapHealthChecks("/api/v1/health", ...)</c> so the body
/// reflects the real result of each check (e.g. the Keycloak discovery-document ping) rather than a
/// hardcoded 200. Identical to <c>access-control-service</c>'s writer of the same name.
/// </summary>
public static class HealthCheckResponseWriter
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    public static Task WriteResponse(HttpContext context, HealthReport report)
    {
        context.Response.ContentType = "application/json; charset=utf-8";

        var payload = new HealthCheckResponse(
            report.Status.ToString(),
            report.TotalDuration.TotalMilliseconds,
            report.Entries
                .Select(entry => new HealthCheckEntryResponse(
                    entry.Key,
                    entry.Value.Status.ToString(),
                    entry.Value.Duration.TotalMilliseconds,
                    entry.Value.Description))
                .ToArray());

        return context.Response.WriteAsync(JsonSerializer.Serialize(payload, SerializerOptions));
    }

    private sealed record HealthCheckResponse(
        string Status,
        double TotalDurationMs,
        HealthCheckEntryResponse[] Checks);

    private sealed record HealthCheckEntryResponse(
        string Name,
        string Status,
        double DurationMs,
        string? Description);
}
