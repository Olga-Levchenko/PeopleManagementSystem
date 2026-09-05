using AccessControlService.Api.Configuration;
using AccessControlService.Domain.Identity;
using Microsoft.AspNetCore.Http;

namespace AccessControlService.Api.Authorization;

/// <summary>
/// Reads S2S trust headers from the current HTTP request and returns an
/// <see cref="TrustedPermissionCheckAuthorization"/> discriminated union.
/// Returns <see cref="TrustedPermissionCheckAuthorization.Unavailable"/> when
/// <see cref="AppConfig.InternalServiceSecret"/> is not configured so the endpoint
/// degrades to 503 (same as the stub) rather than failing fast at startup.
/// Returns <see cref="TrustedPermissionCheckAuthorization.Unauthorized"/> when the
/// shared secret header is absent, wrong, or the delegated-actor headers are missing.
/// </summary>
public sealed class HeaderBasedTrustedServicePrincipalAuthorizer : ITrustedServicePrincipalAuthorizer
{
    private const string SecretHeader = "X-Internal-Service-Secret";
    private const string IdentityHeader = "X-Internal-Service-Identity";
    private const string ActorIssuerHeader = "X-Delegated-Actor-Issuer";
    private const string ActorSubHeader = "X-Delegated-Actor-Sub";

    private readonly IHttpContextAccessor httpContextAccessor;
    private readonly AppConfig appConfig;

    public HeaderBasedTrustedServicePrincipalAuthorizer(
        IHttpContextAccessor httpContextAccessor,
        AppConfig appConfig)
    {
        this.httpContextAccessor = httpContextAccessor;
        this.appConfig = appConfig;
    }

    public Task<TrustedPermissionCheckAuthorization> AuthorizeAsync(
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(appConfig.InternalServiceSecret))
        {
            return Task.FromResult<TrustedPermissionCheckAuthorization>(
                new TrustedPermissionCheckAuthorization.Unavailable());
        }

        HttpRequest? request = httpContextAccessor.HttpContext?.Request;
        if (request is null)
        {
            return Task.FromResult<TrustedPermissionCheckAuthorization>(
                new TrustedPermissionCheckAuthorization.Unavailable());
        }

        string? providedSecret = request.Headers[SecretHeader].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(providedSecret) ||
            !string.Equals(providedSecret, appConfig.InternalServiceSecret, StringComparison.Ordinal))
        {
            return Task.FromResult<TrustedPermissionCheckAuthorization>(
                new TrustedPermissionCheckAuthorization.Unauthorized());
        }

        string? serviceIdentity = request.Headers[IdentityHeader].FirstOrDefault();
        string? delegatedActorIssuer = request.Headers[ActorIssuerHeader].FirstOrDefault();
        string? delegatedActorSub = request.Headers[ActorSubHeader].FirstOrDefault();

        if (string.IsNullOrWhiteSpace(serviceIdentity) ||
            string.IsNullOrWhiteSpace(delegatedActorIssuer) ||
            string.IsNullOrWhiteSpace(delegatedActorSub))
        {
            return Task.FromResult<TrustedPermissionCheckAuthorization>(
                new TrustedPermissionCheckAuthorization.Unauthorized());
        }

        return Task.FromResult<TrustedPermissionCheckAuthorization>(
            new TrustedPermissionCheckAuthorization.Authorized(
                new TrustedPermissionCheckContext(
                    serviceIdentity,
                    delegatedActorIssuer,
                    delegatedActorSub)));
    }
}
