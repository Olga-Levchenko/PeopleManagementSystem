using Microsoft.Extensions.Primitives;

namespace AccessControlService.Api.Middleware;

/// <summary>
/// Mirrors the Node services' correlation-id convention: read <c>x-correlation-id</c>, generate a
/// new id if it is absent/blank, echo the resolved id on the response, and log method/url/id.
/// A blank/whitespace-only incoming value is treated as absent (never echoed back blank), and when
/// the header repeats, the first non-empty value is used (never comma-joined).
/// </summary>
public class CorrelationIdMiddleware
{
    public const string HeaderName = "x-correlation-id";

    private readonly RequestDelegate _next;
    private readonly ILogger<CorrelationIdMiddleware> _logger;

    public CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = ResolveCorrelationId(context.Request.Headers[HeaderName]);

        context.Items[HeaderName] = correlationId;
        context.Response.Headers[HeaderName] = correlationId;

        _logger.LogInformation(
            "{Method} {Path} [{CorrelationId}]",
            context.Request.Method,
            context.Request.Path.Value,
            correlationId);

        await _next(context);
    }

    /// <summary>
    /// Picks the first non-blank value out of a (possibly repeated, possibly absent) header, or
    /// generates a new id if none of the values are usable. Exposed for unit testing.
    /// </summary>
    public static string ResolveCorrelationId(StringValues values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return Guid.NewGuid().ToString();
    }
}
