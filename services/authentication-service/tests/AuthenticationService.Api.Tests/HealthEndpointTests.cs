using System.Text.Json;
using AuthenticationService.Api.Middleware;
using Microsoft.AspNetCore.Mvc.Testing;

namespace AuthenticationService.Api.Tests;

/// <summary>
/// Disables parallelization for all test classes in the "HealthEndpointTests" collection, since
/// they mutate process-wide environment variables (PORT/CORS_ORIGIN/KEYCLOAK_BASE_URL/
/// KEYCLOAK_REALM) that would otherwise race with any other test class reading or setting the same
/// keys concurrently. Mirrors <c>access-control-service</c>'s own collection of the same name.
/// Also registers <see cref="KeycloakFixture"/> as a collection fixture: xUnit creates it once,
/// lazily, the first time any test class in this collection (only <c>KeycloakIntegrationTests</c>,
/// currently) declares it as a constructor parameter -- so the real Keycloak container starts once
/// per test run, not once per [Fact].
/// </summary>
[CollectionDefinition("HealthEndpointTests", DisableParallelization = true)]
public class HealthEndpointTestsCollection : ICollectionFixture<KeycloakFixture>
{
}

/// <summary>
/// Exercises the real, composed <c>Program.cs</c> pipeline via <see cref="WebApplicationFactory{Program}"/>
/// -- not just the middleware/health-check classes in isolation. Deliberately points
/// KEYCLOAK_BASE_URL at an unreachable host/port (this test never starts a real Keycloak
/// container -- see <c>KeycloakIntegrationTests</c> for that), which is exactly the "Keycloak
/// unreachable" scenario in the spec's I/O matrix: the health check must report the <c>keycloak</c>
/// indicator unhealthy while the service itself still boots and answers.
/// </summary>
[Collection("HealthEndpointTests")]
public class HealthEndpointTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly HttpClient _client;

    public HealthEndpointTests(WebApplicationFactory<Program> factory)
    {
        // AppConfig.Load runs in Program.cs before WebApplication.Build() -- i.e. before
        // WebApplicationFactory's own config-override hooks are applied during the intercepted
        // Build() call -- so the only reliable way to satisfy the fail-fast required-config check
        // for this in-process test host is to set the process environment before the factory
        // triggers Program.Main.
        Environment.SetEnvironmentVariable("PORT", "5098");
        Environment.SetEnvironmentVariable("CORS_ORIGIN", "http://localhost:4200");
        // Deliberately unreachable: port 1 is a reserved low port nothing listens on in CI/local
        // dev, so the "keycloak" health check's HTTP GET fails fast rather than hanging until a
        // long default timeout.
        Environment.SetEnvironmentVariable("KEYCLOAK_BASE_URL", "http://127.0.0.1:1");
        Environment.SetEnvironmentVariable("KEYCLOAK_REALM", "people-management");

        _client = factory.CreateClient();
    }

    /// <summary>
    /// Clears the process-wide env vars set in the constructor so they never leak into another test
    /// class that happens to run afterward in the same process (xUnit process-per-assembly by default).
    /// </summary>
    public void Dispose()
    {
        Environment.SetEnvironmentVariable("PORT", null);
        Environment.SetEnvironmentVariable("CORS_ORIGIN", null);
        Environment.SetEnvironmentVariable("KEYCLOAK_BASE_URL", null);
        Environment.SetEnvironmentVariable("KEYCLOAK_REALM", null);
    }

    [Fact]
    public async Task Health_WithKeycloakUnreachable_StillBootsAndReturnsWellFormedBody()
    {
        using var response = await _client.GetAsync("/api/v1/health");

        Assert.True(response.Headers.TryGetValues(CorrelationIdMiddleware.HeaderName, out var values));
        var correlationId = Assert.Single(values);
        Assert.False(string.IsNullOrWhiteSpace(correlationId));
        Assert.True(Guid.TryParse(correlationId, out _));

        var body = await response.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);
        var root = json.RootElement;

        Assert.True(root.TryGetProperty("status", out _), "response body must include 'status'");
        Assert.True(root.TryGetProperty("totalDurationMs", out _), "response body must include 'totalDurationMs'");
        Assert.True(root.TryGetProperty("checks", out var checks), "response body must include 'checks'");
        Assert.Equal(JsonValueKind.Array, checks.ValueKind);
    }

    [Fact]
    public async Task Health_WithKeycloakUnreachable_ReportsKeycloakIndicatorUnhealthy()
    {
        using var response = await _client.GetAsync("/api/v1/health");

        var body = await response.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);

        var keycloakCheck = json.RootElement.GetProperty("checks")
            .EnumerateArray()
            .FirstOrDefault(entry => entry.GetProperty("name").GetString() == "keycloak");

        Assert.NotEqual(default, keycloakCheck);
        Assert.Equal("Unhealthy", keycloakCheck.GetProperty("status").GetString());
        Assert.Equal("Unhealthy", json.RootElement.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Health_WithSuppliedCorrelationHeader_EchoesItBackUnchanged()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/health");
        request.Headers.Add(CorrelationIdMiddleware.HeaderName, "test-correlation-id");

        using var response = await _client.SendAsync(request);

        Assert.True(response.Headers.TryGetValues(CorrelationIdMiddleware.HeaderName, out var values));
        Assert.Equal("test-correlation-id", Assert.Single(values));
    }

    [Fact]
    public async Task Health_WithBlankCorrelationHeader_GeneratesNewIdInsteadOfEchoingBlank()
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/health");
        request.Headers.Add(CorrelationIdMiddleware.HeaderName, "   ");

        using var response = await _client.SendAsync(request);

        Assert.True(response.Headers.TryGetValues(CorrelationIdMiddleware.HeaderName, out var values));
        var correlationId = Assert.Single(values);
        Assert.True(Guid.TryParse(correlationId, out _));
    }

    [Fact]
    public async Task Health_WithCrossOriginRequestFromConfiguredOrigin_ReflectsAllowedOriginHeader()
    {
        const string configuredOrigin = "http://localhost:4200";

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/health");
        request.Headers.Add("Origin", configuredOrigin);

        using var response = await _client.SendAsync(request);

        Assert.True(
            response.Headers.TryGetValues("Access-Control-Allow-Origin", out var allowedOrigins),
            "response must include 'Access-Control-Allow-Origin' for a request from the configured CORS origin");
        Assert.Equal(configuredOrigin, Assert.Single(allowedOrigins));
    }
}
