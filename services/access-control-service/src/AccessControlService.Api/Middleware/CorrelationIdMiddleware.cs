using Microsoft.Extensions.Primitives;

namespace AccessControlService.Api.Middleware;

/// <summary>
/// Mirrors the Node services' correlation-id convention: read <c>x-correlation-id</c>, generate a
/// new id if it is absent/blank, echo the resolved id on the response, and log method/url/id.
/// A blank/whitespace-only incoming value is treated as absent (never echoed back blank), and when
/// the header repeats, the first non-empty value is used (never comma-joined). A value containing
/// control characters (e.g. CR/LF, which could split a response header or corrupt a log line) or
/// exceeding <see cref="MaxLength"/> is likewise treated as absent, rather than echoed/logged
/// verbatim.
/// </summary>
public class CorrelationIdMiddleware
{
    public const string HeaderName = "x-correlation-id";

    /// <summary>
    /// Reasonable upper bound on an accepted incoming correlation id. An incoming value longer than
    /// this is treated as absent (a new id is generated) rather than echoed/logged verbatim.
    /// </summary>
    public const int MaxLength = 128;

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
    /// Picks the first non-blank, safe value out of a (possibly repeated, possibly absent) header,
    /// or generates a new id if none of the values are usable. A value is "safe" if it is
    /// non-blank, contains no control characters (which could otherwise cause header-splitting when
    /// echoed back or corrupt a log line when logged), and is no longer than <see cref="MaxLength"/>.
    /// Exposed for unit testing.
    /// </summary>
    public static string ResolveCorrelationId(StringValues values)
    {
        foreach (var value in values)
        {
            if (IsSafeCorrelationId(value))
            {
                return value!;
            }
        }

        return Guid.NewGuid().ToString();
    }

    private static bool IsSafeCorrelationId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        if (value.Length > MaxLength)
        {
            return false;
        }

        foreach (var c in value)
        {
            if (char.IsControl(c))
            {
                return false;
            }
        }

        return true;
    }
}
