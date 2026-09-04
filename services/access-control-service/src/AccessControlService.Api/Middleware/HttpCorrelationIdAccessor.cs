using AccessControlService.Domain.Identity;

namespace AccessControlService.Api.Middleware;

public sealed class HttpCorrelationIdAccessor(
    IHttpContextAccessor httpContextAccessor) : ICorrelationIdAccessor
{
    public string? Current =>
        httpContextAccessor.HttpContext?.Items[CorrelationIdMiddleware.HeaderName] as string;
}
