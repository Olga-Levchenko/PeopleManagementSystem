using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Testcontainers.Keycloak;

namespace AuthenticationService.Api.Tests;

/// <summary>
/// Boots a real, ephemeral Keycloak container (Testcontainers.Keycloak, the official NuGet
/// package -- it resolves, per the spec's own instruction to prefer it over a generic container
/// builder) with this story's own <c>keycloak/realm-export.json</c> mounted via
/// <c>--import-realm</c> -- the same file <c>infra/docker-compose.yml</c>'s <c>keycloak</c> service
/// mounts for local dev, reused as-is. Shared across every <c>[Fact]</c> in
/// <see cref="KeycloakIntegrationTests"/> via xUnit's collection-fixture mechanism (see
/// <c>HealthEndpointTestsCollection</c>) so the slow container start/stop happens once per test
/// run, not once per fact. Requires Docker locally/in CI.
/// </summary>
public sealed class KeycloakFixture : IAsyncLifetime
{
    private static readonly string RealmExportPath =
        Path.Combine(AppContext.BaseDirectory, "keycloak", "realm-export.json");

    public KeycloakContainer Container { get; } = new KeycloakBuilder("quay.io/keycloak/keycloak:26.0")
        .WithRealm(RealmExportPath)
        .Build();

    public string BaseAddress { get; private set; } = string.Empty;

    public async Task InitializeAsync()
    {
        await Container.StartAsync();
        // KeycloakContainer.GetBaseAddress() returns a UriBuilder-rendered value with a trailing
        // slash (e.g. "http://127.0.0.1:55941/"); trimmed here so every "$"{BaseAddress}/realms/..."
        // interpolation below doesn't produce a double slash that would mismatch Keycloak's own
        // discovery document byte-for-byte -- the same reasoning as AppConfig trimming
        // KEYCLOAK_BASE_URL.
        BaseAddress = Container.GetBaseAddress().TrimEnd('/');
    }

    public async Task DisposeAsync()
    {
        await Container.DisposeAsync();
    }
}

/// <summary>
/// End-to-end proof of this story's three acceptance criteria against the real Keycloak container
/// started by <see cref="KeycloakFixture"/>: the realm/client/test user from
/// <c>keycloak/realm-export.json</c> are provisioned with no manual Admin Console step, a
/// direct-grant login against the seeded test user returns a well-formed, non-expired JWT, and
/// <c>GET /api/v1/auth/config</c> matches Keycloak's own discovery document for the configured
/// realm. Also proves the positive half of the health-check I/O matrix row
/// (<see cref="HealthEndpointTests"/> covers the "Keycloak unreachable" half).
/// </summary>
/// <remarks>
/// Joins the same disabled-parallelization "HealthEndpointTests" collection as every other
/// <see cref="WebApplicationFactory{Program}"/>-based test in this project -- this class also
/// mutates the same process-wide <c>PORT</c>/<c>CORS_ORIGIN</c>/<c>KEYCLOAK_BASE_URL</c>/
/// <c>KEYCLOAK_REALM</c> env vars <c>AppConfig.Load</c> reads before
/// <see cref="WebApplicationFactory{Program}"/>'s own config-override hooks apply -- running
/// concurrently with another test class setting the same keys would race.
/// </remarks>
[Collection("HealthEndpointTests")]
public class KeycloakIntegrationTests : IDisposable
{
    private const string Realm = "people-management";
    private const string ClientId = "bff-confidential";
    private const string ClientSecret = "local-dev-bff-confidential-secret";
    private const string TestUsername = "story1-11.test-user";
    private const string TestPassword = "Story1-11-TestPassword!";

    private readonly KeycloakFixture _fixture;
    private readonly HttpClient _httpClient = new();

    public KeycloakIntegrationTests(KeycloakFixture fixture)
    {
        _fixture = fixture;
    }

    public void Dispose()
    {
        _httpClient.Dispose();
        Environment.SetEnvironmentVariable("PORT", null);
        Environment.SetEnvironmentVariable("CORS_ORIGIN", null);
        Environment.SetEnvironmentVariable("KEYCLOAK_BASE_URL", null);
        Environment.SetEnvironmentVariable("KEYCLOAK_REALM", null);
    }

    [Fact]
    public async Task Realm_ImportedFromRealmExportFile_IsReachableWithNoManualAdminConsoleStep()
    {
        using var response = await _httpClient.GetAsync(DiscoveryUrl);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var discovery = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal($"{_fixture.BaseAddress}/realms/{Realm}", discovery.GetProperty("issuer").GetString());
    }

    [Fact]
    public async Task DirectGrantLogin_WithSeededTestUserCredentials_ReturnsWellFormedNonExpiredJwt()
    {
        using var response = await PostTokenRequest(TestPassword);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var token = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Bearer", token.GetProperty("token_type").GetString());

        var accessToken = token.GetProperty("access_token").GetString();
        Assert.NotNull(accessToken);
        var parts = accessToken!.Split('.');
        Assert.Equal(3, parts.Length);
        Assert.NotEmpty(parts[2]);

        var header = DecodeJwtPart(parts[0]);
        Assert.Equal("JWT", header.GetProperty("typ").GetString());

        var payload = DecodeJwtPart(parts[1]);
        Assert.Equal($"{_fixture.BaseAddress}/realms/{Realm}", payload.GetProperty("iss").GetString());
        var exp = payload.GetProperty("exp").GetInt64();
        Assert.True(exp > DateTimeOffset.UtcNow.ToUnixTimeSeconds());
    }

    [Fact]
    public async Task DirectGrantLogin_WithWrongPassword_IsRejected()
    {
        using var response = await PostTokenRequest("not-the-right-password");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task AuthConfigEndpoint_MatchesKeycloaksRealDiscoveryDocument_ForTheConfiguredRealm()
    {
        using var discoveryResponse = await _httpClient.GetAsync(DiscoveryUrl);
        var discovery = await discoveryResponse.Content.ReadFromJsonAsync<JsonElement>();

        SetProcessEnvironment(port: "5093");
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/v1/auth/config");
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal(discovery.GetProperty("issuer").GetString(), body.GetProperty("issuer").GetString());
        Assert.Equal(discovery.GetProperty("jwks_uri").GetString(), body.GetProperty("jwksUri").GetString());
        Assert.Equal(Realm, body.GetProperty("realm").GetString());
    }

    [Fact]
    public async Task HealthEndpoint_WithKeycloakReachable_ReportsKeycloakIndicatorHealthy()
    {
        SetProcessEnvironment(port: "5092");
        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/v1/health");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal("Healthy", body.GetProperty("status").GetString());
        var keycloakCheck = body.GetProperty("checks").EnumerateArray()
            .First(entry => entry.GetProperty("name").GetString() == "keycloak");
        Assert.Equal("Healthy", keycloakCheck.GetProperty("status").GetString());
    }

    /// <summary>
    /// A likely real misconfiguration (a typo'd KEYCLOAK_REALM) distinct from "Keycloak is down"
    /// (see <see cref="HealthEndpointTests"/>): Keycloak itself is up and reachable, but the
    /// configured realm doesn't exist on it, so its discovery document 404s. The health check must
    /// still report the `keycloak` indicator unhealthy rather than mistaking a reachable-but-wrong
    /// server for a healthy dependency.
    /// </summary>
    [Fact]
    public async Task HealthEndpoint_WithKeycloakReachableButRealmDoesNotExist_ReportsKeycloakIndicatorUnhealthy()
    {
        Environment.SetEnvironmentVariable("PORT", "5094");
        Environment.SetEnvironmentVariable("CORS_ORIGIN", "http://localhost:4200");
        Environment.SetEnvironmentVariable("KEYCLOAK_BASE_URL", _fixture.BaseAddress);
        Environment.SetEnvironmentVariable("KEYCLOAK_REALM", "no-such-realm");

        using var factory = new WebApplicationFactory<Program>();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/v1/health");
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal("Unhealthy", body.GetProperty("status").GetString());
        var keycloakCheck = body.GetProperty("checks").EnumerateArray()
            .First(entry => entry.GetProperty("name").GetString() == "keycloak");
        Assert.Equal("Unhealthy", keycloakCheck.GetProperty("status").GetString());
    }

    private string DiscoveryUrl => $"{_fixture.BaseAddress}/realms/{Realm}/.well-known/openid-configuration";

    private Task<HttpResponseMessage> PostTokenRequest(string password)
    {
        return _httpClient.PostAsync(
            $"{_fixture.BaseAddress}/realms/{Realm}/protocol/openid-connect/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "password",
                ["client_id"] = ClientId,
                ["client_secret"] = ClientSecret,
                ["username"] = TestUsername,
                ["password"] = password,
                ["scope"] = "openid",
            }));
    }

    private void SetProcessEnvironment(string port)
    {
        Environment.SetEnvironmentVariable("PORT", port);
        Environment.SetEnvironmentVariable("CORS_ORIGIN", "http://localhost:4200");
        Environment.SetEnvironmentVariable("KEYCLOAK_BASE_URL", _fixture.BaseAddress);
        Environment.SetEnvironmentVariable("KEYCLOAK_REALM", Realm);
    }

    /// <summary>Decodes a base64url-encoded JWT header/payload segment into a JSON element.</summary>
    private static JsonElement DecodeJwtPart(string part)
    {
        var base64 = part.Replace('-', '+').Replace('_', '/');
        switch (base64.Length % 4)
        {
            case 2:
                base64 += "==";
                break;
            case 3:
                base64 += "=";
                break;
            case 1:
                // Not a valid base64url length under any padding scheme -- only occurs for a
                // malformed/truncated JWT segment, never a real one. Fail loudly and clearly here
                // rather than falling through to a confusing raw FormatException out of
                // Convert.FromBase64String below.
                throw new FormatException(
                    $"'{part}' is not a valid base64url-encoded JWT segment (invalid length).");
        }

        var bytes = Convert.FromBase64String(base64);
        return JsonSerializer.Deserialize<JsonElement>(bytes);
    }
}
