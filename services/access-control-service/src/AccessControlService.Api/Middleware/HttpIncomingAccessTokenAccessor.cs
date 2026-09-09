using AccessControlService.Domain.Identity;

namespace AccessControlService.Api.Middleware;

public sealed class HttpIncomingAccessTokenAccessor(
    IHttpContextAccessor httpContextAccessor)
    : IIncomingAccessTokenAccessor
{
    public string? Current
    {
        get
        {
            string? authorization =
                httpContextAccessor.HttpContext?.Request.Headers.Authorization.FirstOrDefault();
            return authorization is not null &&
                authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
                ? authorization["Bearer ".Length..].Trim()
                : null;
        }
    }
}
