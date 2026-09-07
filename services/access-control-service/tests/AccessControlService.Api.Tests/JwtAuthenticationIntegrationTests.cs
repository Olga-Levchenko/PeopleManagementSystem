using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using AccessControlService.Domain.Identity;
using AccessControlService.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Testcontainers.Keycloak;
using Testcontainers.PostgreSql;

namespace AccessControlService.Api.Tests;

[Collection("HealthEndpointTests")]
public sealed class JwtAuthenticationIntegrationTests : IAsyncLifetime
{
    private const string ISSUER_REALM = "people-management";
    private const string CLIENT_ID = "bff-confidential";
    private const string CLIENT_SECRET = "local-dev-bff-confidential-secret";
    private const string USERNAME = "story1-11.test-user";
    private const string PASSWORD = "Story1-11-TestPassword!";
    private static readonly Guid ADMINISTRATOR_ID = FixtureSeedData.ExecutiveId;

    private readonly KeycloakContainer keycloak = new KeycloakBuilder("quay.io/keycloak/keycloak:26.0")
        .WithRealm(Path.Combine(AppContext.BaseDirectory, "keycloak", "realm-export.json"))
        .Build();
    private readonly PostgreSqlContainer postgres = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("access_control_service_jwt_test")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();
    private WebApplicationFactory<Program> factory = null!;
    private WebApplicationFactory<Program> controlledFactory = null!;
    private WebApplicationFactory<Program> failureFactory = null!;
    private HttpClient client = null!;
    private HttpClient controlledClient = null!;
    private HttpClient failureClient = null!;
    private CountingPrincipalResolver resolver = null!;
    private string issuer = string.Empty;
    private readonly RsaSecurityKey controlledSigningKey =
        new(System.Security.Cryptography.RSA.Create(2048));

    public async Task InitializeAsync()
    {
        await Task.WhenAll(keycloak.StartAsync(), postgres.StartAsync());

        issuer = $"{keycloak.GetBaseAddress().TrimEnd('/')}/realms/{ISSUER_REALM}";
        SetEnvironment(issuer);
        await SeedDatabaseAsync();

        resolver = new CountingPrincipalResolver();
        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IPrincipalPersonResolver>();
                services.AddSingleton<IPrincipalPersonResolver>(resolver);
            });
        });
        client = factory.CreateClient();

        controlledFactory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IPrincipalPersonResolver>();
                services.AddSingleton<IPrincipalPersonResolver>(resolver);
                services.PostConfigure<JwtBearerOptions>(
                    JwtBearerDefaults.AuthenticationScheme,
                    options =>
                    {
                        OpenIdConnectConfiguration configuration = new()
                        {
                            Issuer = issuer,
                        };
                        configuration.SigningKeys.Add(controlledSigningKey);
                        options.Configuration = configuration;
                        options.ConfigurationManager = null;
                        options.TokenValidationParameters.IssuerSigningKey = controlledSigningKey;
                        options.TokenValidationParameters.ValidIssuer = issuer;
                        options.TokenValidationParameters.ValidAudience = CLIENT_ID;
                        options.TokenValidationParameters.ValidAlgorithms = ["RS256"];
                    });
            });
        });
        controlledClient = controlledFactory.CreateClient();

        failureFactory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IPrincipalPersonResolver>();
                services.AddSingleton<IPrincipalPersonResolver>(resolver);
                services.PostConfigure<JwtBearerOptions>(
                    JwtBearerDefaults.AuthenticationScheme,
                    options =>
                    {
                        options.Configuration = null;
                        options.ConfigurationManager = new ThrowingConfigurationManager();
                    });
            });
        });
        failureClient = failureFactory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        client.Dispose();
        controlledClient.Dispose();
        failureClient.Dispose();
        controlledSigningKey.Rsa?.Dispose();
        await failureFactory.DisposeAsync();
        await controlledFactory.DisposeAsync();
        await factory.DisposeAsync();
        ClearEnvironment();
        await Task.WhenAll(keycloak.DisposeAsync().AsTask(), postgres.DisposeAsync().AsTask());
    }

    [Fact]
    public async Task AdministrationRoute_WithKeycloakSignedToken_IsAccepted()
    {
        resolver.Resolution = new PrincipalPersonResolution.Resolved(ADMINISTRATOR_ID);
        string token = await GetAccessTokenAsync();
        using HttpRequestMessage request = new(
            HttpMethod.Get,
            "/api/v1/permissions/catalogue");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using HttpResponseMessage response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        JwtSecurityToken verifiedToken = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.NotNull(resolver.LastIdentity);
        Assert.Equal(verifiedToken.Issuer, resolver.LastIdentity!.Issuer);
        Assert.Equal(verifiedToken.Subject, resolver.LastIdentity.Subject);
    }

    [Fact]
    public async Task AllAdministrationRoutes_WithKeycloakSignedToken_ReachTheirHandlers()
    {
        resolver.Resolution = new PrincipalPersonResolution.Resolved(ADMINISTRATOR_ID);
        string token = await GetAccessTokenAsync();
        string roleKey = $"jwt-route-{Guid.NewGuid():N}";
        (HttpMethod Method, string Path, string? Body, HttpStatusCode Status)[] routes =
        [
            (HttpMethod.Get, "/api/v1/permissions/catalogue", null, HttpStatusCode.OK),
            (HttpMethod.Get, "/api/v1/functional-roles", null, HttpStatusCode.OK),
            (HttpMethod.Get, "/api/v1/functional-roles/hr-admin", null, HttpStatusCode.OK),
            (HttpMethod.Get, "/api/v1/functional-roles/hr-admin/permissions", null, HttpStatusCode.OK),
            (HttpMethod.Post, "/api/v1/functional-roles",
                $$"""{"roleKey":"{{roleKey}}","displayName":"JWT Route Role"}""", HttpStatusCode.Created),
            (HttpMethod.Patch, $"/api/v1/functional-roles/{roleKey}",
                """{"displayName":"JWT Route Role Updated"}""", HttpStatusCode.OK),
            (HttpMethod.Put, $"/api/v1/functional-roles/{roleKey}/permissions/create-action-items",
                """{"scope":null}""", HttpStatusCode.OK),
            (HttpMethod.Delete, $"/api/v1/functional-roles/{roleKey}/permissions/create-action-items",
                null, HttpStatusCode.NoContent),
            (HttpMethod.Post, $"/api/v1/people/{FixtureSeedData.EngineerId}/functional-roles",
                $$"""{"roleKey":"{{roleKey}}"}""", HttpStatusCode.Created),
            (HttpMethod.Delete, $"/api/v1/people/{FixtureSeedData.EngineerId}/functional-roles/{roleKey}",
                null, HttpStatusCode.NoContent),
            (HttpMethod.Get, $"/api/v1/people/{FixtureSeedData.EngineerId}/functional-roles",
                null, HttpStatusCode.OK),
            (HttpMethod.Post, $"/api/v1/functional-roles/{roleKey}/deactivate",
                """{"reason":"JWT route coverage"}""", HttpStatusCode.OK),
        ];

        int auditCountBefore = await GetAuditCountAsync();
        int callsBefore = resolver.Calls;
        foreach ((HttpMethod method, string path, string? body, HttpStatusCode status) in routes)
        {
            using HttpRequestMessage request = CreateRequest(method, path, token, body);
            using HttpResponseMessage response = await client.SendAsync(request);
            Assert.Equal(status, response.StatusCode);
        }

        Assert.True(await GetAuditCountAsync() > auditCountBefore);
        Assert.Equal(routes.Length, resolver.Calls - callsBefore);
    }

    [Fact]
    public async Task AdministrationRoute_WithoutToken_IsRejectedBeforeHandler()
    {
        int callsBefore = resolver.Calls;
        int auditCountBefore = await GetAuditCountAsync();
        int rolesBefore = await GetRoleCountAsync();
        using HttpResponseMessage response = await client.GetAsync("/api/v1/permissions/catalogue");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(callsBefore, resolver.Calls);
        Assert.Equal(auditCountBefore, await GetAuditCountAsync());
        Assert.Equal(rolesBefore, await GetRoleCountAsync());
    }

    [Fact]
    public async Task AdministrationRoute_WithTamperedToken_IsRejected()
    {
        string token = await GetAccessTokenAsync();
        string[] parts = token.Split('.');
        parts[1] = Convert.ToBase64String(
                JsonSerializer.SerializeToUtf8Bytes(new { iss = "https://forged.invalid" }))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

        int callsBefore = resolver.Calls;
        int auditCountBefore = await GetAuditCountAsync();
        int rolesBefore = await GetRoleCountAsync();
        using HttpRequestMessage request = new(
            HttpMethod.Get,
            "/api/v1/permissions/catalogue");
        request.Headers.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            string.Join('.', parts));

        using HttpResponseMessage response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(callsBefore, resolver.Calls);
        Assert.Equal(auditCountBefore, await GetAuditCountAsync());
        Assert.Equal(rolesBefore, await GetRoleCountAsync());
    }

    [Fact]
    public async Task HealthAndReadiness_AreAnonymous()
    {
        using HttpResponseMessage health = await client.GetAsync("/api/v1/health");
        using HttpResponseMessage readiness = await client.GetAsync("/api/v1/readiness");

        Assert.NotEqual(HttpStatusCode.Unauthorized, health.StatusCode);
        Assert.NotEqual(HttpStatusCode.Unauthorized, readiness.StatusCode);
    }

    [Fact]
    public async Task EndUserToken_CannotAuthorizePermissionCheck()
    {
        string token = await GetAccessTokenAsync();
        using HttpRequestMessage request = CreateRequest(
            HttpMethod.Post,
            "/api/v1/permissions/check",
            token,
            """{"permissionKey":"view-dashboard","scope":null}""");

        using HttpResponseMessage response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ControlledSignedInvalidTokens_AreRejected()
    {
        string validControlledToken = CreateTestToken(
            issuer,
            CLIENT_ID,
            DateTime.UtcNow.AddMinutes(5),
            "subject");
        string[] validTokenParts = validControlledToken.Split('.');
        char[] signatureCharacters = validTokenParts[2].ToCharArray();
        signatureCharacters[1] = signatureCharacters[1] == 'A' ? 'B' : 'A';
        validTokenParts[2] = new string(signatureCharacters);
        string tamperedSignature = string.Join('.', validTokenParts);
        string[] tokens =
        [
            CreateTestToken("https://wrong.example/realms/people-management", CLIENT_ID, DateTime.UtcNow.AddMinutes(5), "subject"),
            CreateTestToken(issuer, "wrong-audience", DateTime.UtcNow.AddMinutes(5), "subject"),
            CreateTestToken(issuer, CLIENT_ID, DateTime.UtcNow.AddMinutes(-10), "subject"),
            CreateTestToken(issuer, CLIENT_ID, DateTime.UtcNow.AddMinutes(5), null),
            CreateTestToken(issuer, CLIENT_ID, DateTime.UtcNow.AddMinutes(5), " "),
            CreateTestToken(issuer, CLIENT_ID, DateTime.UtcNow.AddMinutes(5), "subject", SecurityAlgorithms.RsaSha512),
            tamperedSignature,
            "not-a-jwt",
            CreateTestToken(issuer, CLIENT_ID, null, "subject"),
        ];
        int callsBefore = resolver.Calls;
        int auditsBefore = await GetAuditCountAsync();
        int rolesBefore = await GetRoleCountAsync();

        foreach (string token in tokens)
        {
            using HttpRequestMessage request = CreateRequest(
                HttpMethod.Get,
                "/api/v1/functional-roles",
                token);
            using HttpResponseMessage response = await controlledClient.SendAsync(request);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        Assert.Equal(callsBefore, resolver.Calls);
        Assert.Equal(auditsBefore, await GetAuditCountAsync());
        Assert.Equal(rolesBefore, await GetRoleCountAsync());
    }

    [Fact]
    public async Task ControlledResolverOutcomes_MapToDeterministicResponsesWithoutMutation()
    {
        string token = CreateTestToken(
            issuer,
            CLIENT_ID,
            DateTime.UtcNow.AddMinutes(5),
            "subject");

        resolver.Resolution = new PrincipalPersonResolution.Missing();
        using HttpResponseMessage missing = await SendAdministrationRequestAsync(token);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);

        resolver.Resolution = new PrincipalPersonResolution.Ambiguous();
        using HttpResponseMessage ambiguous = await SendAdministrationRequestAsync(token);
        Assert.Equal(HttpStatusCode.Conflict, ambiguous.StatusCode);

        resolver.Resolution = new PrincipalPersonResolution.Unavailable();
        using HttpResponseMessage unavailable = await SendAdministrationRequestAsync(token);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, unavailable.StatusCode);

        int auditCountBefore = await GetAuditCountAsync();
        int rolesBefore = await GetRoleCountAsync();
        resolver.Resolution = new PrincipalPersonResolution.Resolved(FixtureSeedData.EngineerId);
        using HttpRequestMessage forbiddenRequest = CreateRequest(
            HttpMethod.Get,
            "/api/v1/functional-roles",
            token);
        forbiddenRequest.Headers.Add("X-Principal-Sub", ADMINISTRATOR_ID.ToString());
        using HttpResponseMessage forbidden = await controlledClient.SendAsync(forbiddenRequest);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        Assert.Equal(auditCountBefore, await GetAuditCountAsync());
        Assert.Equal(rolesBefore, await GetRoleCountAsync());
    }

    [Fact]
    public async Task DiscoveryFailure_ReturnsUnauthorizedWithoutResolverOrSideEffects()
    {
        resolver.Resolution = new PrincipalPersonResolution.Resolved(ADMINISTRATOR_ID);
        string token = CreateTestToken(
            issuer,
            CLIENT_ID,
            DateTime.UtcNow.AddMinutes(5),
            "subject");
        int callsBefore = resolver.Calls;
        int auditCountBefore = await GetAuditCountAsync();
        int rolesBefore = await GetRoleCountAsync();

        using HttpResponseMessage response = await failureClient.SendAsync(
            CreateRequest(HttpMethod.Get, "/api/v1/functional-roles", token));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(callsBefore, resolver.Calls);
        Assert.Equal(auditCountBefore, await GetAuditCountAsync());
        Assert.Equal(rolesBefore, await GetRoleCountAsync());
    }

    private Task<HttpResponseMessage> SendAdministrationRequestAsync(string token) =>
        controlledClient.SendAsync(
            CreateRequest(HttpMethod.Get, "/api/v1/functional-roles", token));

    private async Task SeedDatabaseAsync()
    {
        DbContextOptions<AccessControlDbContext> options =
            new DbContextOptionsBuilder<AccessControlDbContext>()
                .UseNpgsql(postgres.GetConnectionString())
                .Options;
        await using AccessControlDbContext context = new(options);
        await context.Database.MigrateAsync();
        context.PersonFunctionalRoleAssignments.Add(new PersonFunctionalRoleAssignment
        {
            Id = Guid.NewGuid(),
            PersonId = ADMINISTRATOR_ID,
            FunctionalRoleId = FixtureSeedData.HrAdminRoleId,
            IsActive = true,
            AssignedAtUtc = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();
    }

    private async Task<string> GetAccessTokenAsync()
    {
        using HttpClient keycloakClient = new();
        string baseAddress = keycloak.GetBaseAddress().TrimEnd('/');
        using HttpResponseMessage response = await keycloakClient.PostAsync(
            $"{baseAddress}/realms/{ISSUER_REALM}/protocol/openid-connect/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "password",
                ["client_id"] = CLIENT_ID,
                ["client_secret"] = CLIENT_SECRET,
                ["username"] = USERNAME,
                ["password"] = PASSWORD,
                ["scope"] = "openid",
            }));
        response.EnsureSuccessStatusCode();
        JsonElement payload = await response.Content.ReadFromJsonAsync<JsonElement>();
        return payload.GetProperty("access_token").GetString()
            ?? throw new InvalidOperationException("Keycloak returned no access token.");
    }

    private static HttpRequestMessage CreateRequest(
        HttpMethod method,
        string path,
        string token,
        string? body = null)
    {
        HttpRequestMessage request = new(method, path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null)
        {
            request.Content = new StringContent(body, System.Text.Encoding.UTF8, "application/json");
        }

        return request;
    }

    private async Task<int> GetAuditCountAsync()
    {
        using IServiceScope scope = factory.Services.CreateScope();
        AccessControlDbContext context = scope.ServiceProvider
            .GetRequiredService<AccessControlDbContext>();
        return await context.AuthorizationAdministrationAudits.CountAsync();
    }

    private async Task<int> GetRoleCountAsync()
    {
        using IServiceScope scope = factory.Services.CreateScope();
        AccessControlDbContext context = scope.ServiceProvider
            .GetRequiredService<AccessControlDbContext>();
        return await context.FunctionalRoles.CountAsync();
    }

    private string CreateTestToken(
        string tokenIssuer,
        string audience,
        DateTime? expiration,
        string? subject,
        string algorithm = SecurityAlgorithms.RsaSha256)
    {
        JwtHeader header = new(new SigningCredentials(controlledSigningKey, algorithm));
        JwtPayload payload = new()
        {
            ["iss"] = tokenIssuer,
            ["aud"] = audience,
            ["iat"] = DateTimeOffset.UtcNow.ToUnixTimeSeconds(),
        };
        if (expiration is not null)
        {
            payload["exp"] = new DateTimeOffset(expiration.Value).ToUnixTimeSeconds();
        }
        if (subject is not null)
        {
            payload["sub"] = subject;
        }

        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(header, payload));
    }

    private void SetEnvironment(string issuer)
    {
        Environment.SetEnvironmentVariable("PORT", "5095");
        Environment.SetEnvironmentVariable("CORS_ORIGIN", "http://localhost:4200");
        Environment.SetEnvironmentVariable("ConnectionStrings__Postgres", postgres.GetConnectionString());
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", "localhost");
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", "5699");
        Environment.SetEnvironmentVariable("RABBITMQ_USER", "guest");
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", "guest");
        Environment.SetEnvironmentVariable("OIDC_ALLOWED_ISSUERS", issuer);
        Environment.SetEnvironmentVariable("OIDC_AUDIENCE", CLIENT_ID);
        Environment.SetEnvironmentVariable("INTERNAL_SERVICE_SECRET", "test-only-internal-secret");
    }

    private static void ClearEnvironment()
    {
        foreach (string key in new[]
        {
            "PORT", "CORS_ORIGIN", "ConnectionStrings__Postgres", "RABBITMQ_HOST",
            "RABBITMQ_PORT", "RABBITMQ_USER", "RABBITMQ_PASSWORD", "OIDC_ALLOWED_ISSUERS",
            "OIDC_AUDIENCE", "INTERNAL_SERVICE_SECRET",
        })
        {
            Environment.SetEnvironmentVariable(key, null);
        }
    }

    private sealed class CountingPrincipalResolver : IPrincipalPersonResolver
    {
        public int Calls { get; private set; }
        public OidcPrincipalIdentity? LastIdentity { get; private set; }
        public PrincipalPersonResolution Resolution { get; set; } =
            new PrincipalPersonResolution.Resolved(ADMINISTRATOR_ID);

        public Task<PrincipalPersonResolution> ResolvePersonAsync(
            OidcPrincipalIdentity identity,
            CancellationToken cancellationToken = default)
        {
            Calls++;
            LastIdentity = identity;
            return Task.FromResult(Resolution);
        }
    }

    private sealed class ThrowingConfigurationManager :
        Microsoft.IdentityModel.Protocols.IConfigurationManager<OpenIdConnectConfiguration>
    {
        public Task<OpenIdConnectConfiguration> GetConfigurationAsync(
            CancellationToken cancel)
        {
            throw new InvalidOperationException("Controlled discovery failure.");
        }

        public void RequestRefresh()
        {
        }
    }
}
