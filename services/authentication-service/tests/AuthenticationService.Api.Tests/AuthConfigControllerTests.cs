using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace AuthenticationService.Api.Tests;

/// <summary>
/// Proves <c>GET /api/v1/auth/config</c> resolves <c>{issuer, jwksUri, realm}</c> purely from this
/// service's own <c>AppConfig</c> -- no real Keycloak needed for this test, since the endpoint
/// itself never calls out to Keycloak (see <see cref="Controllers.AuthConfigController"/>'s own
/// remarks). <c>KeycloakIntegrationTests</c> covers the acceptance criterion that these derived
/// values actually match a real Keycloak's discovery document.
/// </summary>
/// <remarks>
/// Joins <c>HealthEndpointTests</c>' disabled-parallelization collection since it mutates the same
/// process-wide environment variables that <c>AppConfig.Load</c> reads before
/// <c>WebApplicationFactory</c>'s own config-override hooks apply.
/// </remarks>
[Collection("HealthEndpointTests")]
public class AuthConfigControllerTests : IDisposable
{
    public AuthConfigControllerTests()
    {
        Environment.SetEnvironmentVariable("PORT", "5096");
        Environment.SetEnvironmentVariable("CORS_ORIGIN", "http://localhost:4200");
        Environment.SetEnvironmentVariable("KEYCLOAK_BASE_URL", "http://127.0.0.1:1");
        Environment.SetEnvironmentVariable("KEYCLOAK_REALM", "people-management");
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("PORT", null);
        Environment.SetEnvironmentVariable("CORS_ORIGIN", null);
        Environment.SetEnvironmentVariable("KEYCLOAK_BASE_URL", null);
        Environment.SetEnvironmentVariable("KEYCLOAK_REALM", null);
    }

    [Fact]
    public async Task GetConfig_ReturnsIssuerJwksUriAndRealm_DerivedFromConfiguredBaseUrlAndRealm()
    {
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/v1/auth/config");
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);
        var root = json.RootElement;

        Assert.Equal("http://127.0.0.1:1/realms/people-management", root.GetProperty("issuer").GetString());
        Assert.Equal(
            "http://127.0.0.1:1/realms/people-management/protocol/openid-connect/certs",
            root.GetProperty("jwksUri").GetString());
        Assert.Equal("people-management", root.GetProperty("realm").GetString());
    }
}
