using System.Text.Json;
using AccessControlService.Api.Middleware;
using Microsoft.AspNetCore.Mvc.Testing;

namespace AccessControlService.Api.Tests;

/// <summary>
/// Disables parallelization for all test classes in the "HealthEndpointTests" collection, since they
/// mutate process-wide environment variables (PORT/CORS_ORIGIN/ConnectionStrings__Postgres) that would
/// otherwise race with any other test class reading or setting the same keys concurrently.
/// </summary>
[CollectionDefinition("HealthEndpointTests", DisableParallelization = true)]
public class HealthEndpointTestsCollection
{
}

/// <summary>
/// Exercises the real, composed <c>Program.cs</c> pipeline via <see cref="WebApplicationFactory{Program}"/>
/// -- not just the middleware class in isolation -- so dropping the correlation-id middleware or the
/// health response writer from Program.cs would fail this test.
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
        // triggers Program.Main. A real Postgres is not required: an unreachable connection string
        // still produces a well-formed (Unhealthy) response, which is all these tests assert on.
        Environment.SetEnvironmentVariable("PORT", "5099");
        Environment.SetEnvironmentVariable("CORS_ORIGIN", "http://localhost:4200");
        Environment.SetEnvironmentVariable(
            "ConnectionStrings__Postgres",
            "Host=localhost;Port=5499;Database=access_control_service_test;Username=postgres;Password=postgres;Timeout=1");
        // ProjectAssignmentEventConsumer's connection settings are required, fail-fast AppConfig
        // values, but actually reaching RabbitMQ is never attempted synchronously at startup -- an
        // unreachable broker here just means the hosted consumer logs and retries in the
        // background, the same "boots fine with Postgres down" contract as the Postgres connection
        // string above.
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", "localhost");
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", "5699");
        Environment.SetEnvironmentVariable("RABBITMQ_USER", "guest");
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", "guest");

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
        Environment.SetEnvironmentVariable("ConnectionStrings__Postgres", null);
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", null);
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", null);
        Environment.SetEnvironmentVariable("RABBITMQ_USER", null);
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", null);
    }

    [Fact]
    public async Task Health_WithNoCorrelationHeader_ReturnsGeneratedCorrelationIdAndExpectedBodyShape()
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

        var postgresCheck = checks.EnumerateArray()
            .FirstOrDefault(entry => entry.GetProperty("name").GetString() == "postgres");
        Assert.NotEqual(default, postgresCheck);
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
        // Matches the CORS_ORIGIN value set in the constructor -- proves app.UseCors() and the
        // WithOrigins(appConfig.CorsOrigin) policy are actually wired end-to-end, not just configured.
        // Dropping app.UseCors() entirely, or configuring the wrong origin, would fail this test even
        // though every other test in this class would still pass.
        const string configuredOrigin = "http://localhost:4200";

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/health");
        request.Headers.Add("Origin", configuredOrigin);

        using var response = await _client.SendAsync(request);

        Assert.True(
            response.Headers.TryGetValues("Access-Control-Allow-Origin", out var allowedOrigins),
            "response must include 'Access-Control-Allow-Origin' for a request from the configured CORS origin");
        Assert.Equal(configuredOrigin, Assert.Single(allowedOrigins));
    }

    [Fact]
    public async Task Health_WithCrossOriginRequestFromNonConfiguredOrigin_DoesNotReflectOriginHeader()
    {
        // Guards against a future regression to AllowAnyOrigin() (or an equivalent widening) --
        // ASP.NET Core's CORS middleware, given a policy with a fixed WithOrigins(...) allow-list,
        // simply omits 'Access-Control-Allow-Origin' from the response for a request from a
        // non-matching origin (it does not reject/short-circuit the request itself for a
        // non-preflight GET, and it never echoes back an origin that isn't on the configured
        // allow-list). This test would fail if the policy were ever widened to AllowAnyOrigin(),
        // which reflects any origin back unconditionally.
        const string nonConfiguredOrigin = "http://evil.example.com";

        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/health");
        request.Headers.Add("Origin", nonConfiguredOrigin);

        using var response = await _client.SendAsync(request);

        if (response.Headers.TryGetValues("Access-Control-Allow-Origin", out var allowedOrigins))
        {
            Assert.NotEqual(nonConfiguredOrigin, Assert.Single(allowedOrigins));
        }
    }

    [Fact]
    public async Task Readiness_WithUnavailableDatabase_ReturnsUnreadyWithoutDatabaseDetails()
    {
        using var response = await _client.GetAsync("/api/v1/readiness");
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(System.Net.HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.False(body.RootElement.GetProperty("ready").GetBoolean());
        Assert.DoesNotContain("Host=localhost", body.RootElement.ToString());
        Assert.DoesNotContain("stack", body.RootElement.ToString(), StringComparison.OrdinalIgnoreCase);
    }
}
