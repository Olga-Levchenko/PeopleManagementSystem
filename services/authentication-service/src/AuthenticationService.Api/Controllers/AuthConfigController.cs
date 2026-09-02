using AuthenticationService.Api.Configuration;
using Microsoft.AspNetCore.Mvc;

namespace AuthenticationService.Api.Controllers;

/// <summary>
/// Gives downstream services one canonical place to learn this realm's issuer/JWKS location,
/// rather than each service hardcoding Keycloak's internal URL/realm name. Purely derives its
/// response from this service's own validated <see cref="AppConfig"/> -- it never makes a
/// synchronous call to Keycloak's admin/discovery API, so it stays reachable even if Keycloak
/// itself is briefly down (unlike <c>/api/v1/health</c>'s <c>keycloak</c> check, which does ping
/// Keycloak). The story's acceptance criterion -- this matches Keycloak's own discovery document --
/// holds because both are derived from the same realm-export.json-provisioned values, not because
/// this endpoint queries Keycloak directly.
/// </summary>
[ApiController]
[Route("api/v1/auth")]
public sealed class AuthConfigController : ControllerBase
{
    private readonly AppConfig _appConfig;

    public AuthConfigController(AppConfig appConfig)
    {
        _appConfig = appConfig;
    }

    [HttpGet("config")]
    public ActionResult<AuthConfigResponse> GetConfig()
    {
        return Ok(new AuthConfigResponse
        {
            Issuer = _appConfig.Issuer,
            JwksUri = _appConfig.JwksUri,
            Realm = _appConfig.KeycloakRealm,
        });
    }
}

/// <summary>Response body for <c>GET /api/v1/auth/config</c>.</summary>
public sealed record AuthConfigResponse
{
    public required string Issuer { get; init; }

    public required string JwksUri { get; init; }

    public required string Realm { get; init; }
}
