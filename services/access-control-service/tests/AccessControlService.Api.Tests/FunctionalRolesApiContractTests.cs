using System.Net;
using System.Security.Claims;
using System.Text;
using AccessControlService.Domain.Identity;
using AccessControlService.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.AspNetCore.TestHost;
using Testcontainers.PostgreSql;

namespace AccessControlService.Api.Tests;

[Collection("HealthEndpointTests")]
public sealed class FunctionalRolesApiContractTests : IAsyncLifetime
{
    private const string TEST_SUB_HEADER = "X-Test-Sub";
    private readonly PostgreSqlContainer postgresContainer = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("access_control_service_api_test")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();

    private WebApplicationFactory<Program> factory = null!;
    private HttpClient client = null!;

    public async Task InitializeAsync()
    {
        await postgresContainer.StartAsync();
        Environment.SetEnvironmentVariable("PORT", "5096");
        Environment.SetEnvironmentVariable("CORS_ORIGIN", "http://localhost:4200");
        Environment.SetEnvironmentVariable(
            "ConnectionStrings__Postgres",
            postgresContainer.GetConnectionString());
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", "localhost");
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", "5699");
        Environment.SetEnvironmentVariable("RABBITMQ_USER", "guest");
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", "guest");

        DbContextOptions<AccessControlDbContext> options = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(postgresContainer.GetConnectionString())
            .Options;
        await using AccessControlDbContext context = new(options);
        await context.Database.MigrateAsync();
        context.PersonFunctionalRoleAssignments.Add(new PersonFunctionalRoleAssignment
        {
            Id = Guid.NewGuid(),
            PersonId = FixtureSeedData.ExecutiveId,
            FunctionalRoleId = FixtureSeedData.HrAdminRoleId,
            IsActive = true,
            AssignedAtUtc = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IPrincipalPersonResolver>();
                services.AddSingleton<IPrincipalPersonResolver, TestPrincipalPersonResolver>();
                services.RemoveAll<ITrustedServicePrincipalAuthorizer>();
                services.AddSingleton<ITrustedServicePrincipalAuthorizer, TestTrustedServicePrincipalAuthorizer>();
                services.AddSingleton<IStartupFilter, TestAuthenticationStartupFilter>();
                services.AddAuthentication(TestAuthenticationHandler.SchemeName)
                    .AddScheme<AuthenticationSchemeOptions, TestAuthenticationHandler>(
                        TestAuthenticationHandler.SchemeName,
                        _ => { });
            });
        });
        client = factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        client.Dispose();
        await factory.DisposeAsync();
        Environment.SetEnvironmentVariable("PORT", null);
        Environment.SetEnvironmentVariable("CORS_ORIGIN", null);
        Environment.SetEnvironmentVariable("ConnectionStrings__Postgres", null);
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", null);
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", null);
        Environment.SetEnvironmentVariable("RABBITMQ_USER", null);
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", null);
        await postgresContainer.DisposeAsync();
    }

    [Fact]
    public async Task Catalogue_WithAdministrator_ReturnsSuccess()
    {
        using HttpResponseMessage response = await SendAsync(
            HttpMethod.Get,
            "/api/v1/permissions/catalogue",
            FixtureSeedData.ExecutiveId);
        using HttpResponseMessage roles = await SendAsync(
            HttpMethod.Get,
            "/api/v1/functional-roles",
            FixtureSeedData.ExecutiveId);
        using HttpResponseMessage role = await SendAsync(
            HttpMethod.Get,
            "/api/v1/functional-roles/hr-admin",
            FixtureSeedData.ExecutiveId);
        using HttpResponseMessage permissions = await SendAsync(
            HttpMethod.Get,
            "/api/v1/functional-roles/hr-admin/permissions",
            FixtureSeedData.ExecutiveId);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, roles.StatusCode);
        Assert.Equal(HttpStatusCode.OK, role.StatusCode);
        Assert.Equal(HttpStatusCode.OK, permissions.StatusCode);
    }

    [Fact]
    public async Task RoleAndPermissionRoutes_ReturnDocumentedNotFoundAndBadRequest()
    {
        int auditCountBefore = await GetAuditCountAsync();
        using HttpResponseMessage missing = await SendAsync(
            HttpMethod.Get,
            "/api/v1/functional-roles/missing-role",
            FixtureSeedData.ExecutiveId);
        using HttpResponseMessage invalidScope = await SendAsync(
            HttpMethod.Put,
            "/api/v1/functional-roles/hr-admin/permissions/view-dashboard",
            FixtureSeedData.ExecutiveId,
            """{"scope":{"dashboardType":"invalid"}}""");

        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, invalidScope.StatusCode);
        Assert.Equal(auditCountBefore, await GetAuditCountAsync());
    }

    [Fact]
    public async Task CreateGrantAndAssignmentRoutes_ProvideSuccessAndIdempotentResults()
    {
        const string roleKey = "api-contract-role";
        int auditCountBefore = await GetAuditCountAsync();
        using HttpResponseMessage roleResponse = await SendAsync(
            HttpMethod.Post,
            "/api/v1/functional-roles",
            FixtureSeedData.ExecutiveId,
            $$"""{"roleKey":"{{roleKey}}","displayName":"API Contract Role"}""",
            "role-create-idempotency");
        using HttpResponseMessage updateResponse = await SendAsync(
            HttpMethod.Patch,
            $"/api/v1/functional-roles/{roleKey}",
            FixtureSeedData.ExecutiveId,
            """{"displayName":"Updated API Contract Role"}""");
        using HttpResponseMessage grantResponse = await SendAsync(
            HttpMethod.Put,
            $"/api/v1/functional-roles/{roleKey}/permissions/create-action-items",
            FixtureSeedData.ExecutiveId,
            """{"scope":null}""",
            "grant-idempotency");
        using HttpResponseMessage grantReplay = await SendAsync(
            HttpMethod.Put,
            $"/api/v1/functional-roles/{roleKey}/permissions/create-action-items",
            FixtureSeedData.ExecutiveId,
            """{"scope":null}""",
            "grant-idempotency");
        using HttpResponseMessage assignmentResponse = await SendAsync(
            HttpMethod.Post,
            $"/api/v1/people/{FixtureSeedData.EngineerId}/functional-roles",
            FixtureSeedData.ExecutiveId,
            $$"""{"roleKey":"{{roleKey}}"}""",
            "assignment-idempotency");
        using HttpResponseMessage assignmentReplay = await SendAsync(
            HttpMethod.Post,
            $"/api/v1/people/{FixtureSeedData.EngineerId}/functional-roles",
            FixtureSeedData.ExecutiveId,
            $$"""{"roleKey":"{{roleKey}}"}""",
            "assignment-idempotency");

        Assert.Equal(HttpStatusCode.Created, roleResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, updateResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, grantResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, grantReplay.StatusCode);
        Assert.Equal(HttpStatusCode.Created, assignmentResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, assignmentReplay.StatusCode);
        Assert.Equal(auditCountBefore + 4, await GetAuditCountAsync());
    }

    [Fact]
    public async Task RevokeAndDeactivateRoutes_ReturnNoContentAndConflict()
    {
        const string roleKey = "api-contract-revoke-role";
        using HttpResponseMessage roleResponse = await SendAsync(
            HttpMethod.Post,
            "/api/v1/functional-roles",
            FixtureSeedData.ExecutiveId,
            $$"""{"roleKey":"{{roleKey}}","displayName":"API Contract Revoke Role"}""");
        Assert.Equal(HttpStatusCode.Created, roleResponse.StatusCode);

        using HttpResponseMessage absentRevoke = await SendAsync(
            HttpMethod.Delete,
            $"/api/v1/functional-roles/{roleKey}/permissions/create-action-items",
            FixtureSeedData.ExecutiveId);
        using HttpResponseMessage grantResponse = await SendAsync(
            HttpMethod.Put,
            $"/api/v1/functional-roles/{roleKey}/permissions/create-action-items",
            FixtureSeedData.ExecutiveId,
            """{"scope":null}""");
        using HttpResponseMessage revoke = await SendAsync(
            HttpMethod.Delete,
            $"/api/v1/functional-roles/{roleKey}/permissions/create-action-items",
            FixtureSeedData.ExecutiveId);
        using HttpResponseMessage assignmentResponse = await SendAsync(
            HttpMethod.Post,
            $"/api/v1/people/{FixtureSeedData.DirectorId}/functional-roles",
            FixtureSeedData.ExecutiveId,
            $$"""{"roleKey":"{{roleKey}}"}""");
        using HttpResponseMessage conflict = await SendAsync(
            HttpMethod.Post,
            $"/api/v1/functional-roles/{roleKey}/deactivate",
            FixtureSeedData.ExecutiveId,
            """{"reason":"active assignment prevents deactivation"}""");
        const string deactivatableRoleKey = "api-contract-deactivatable-role";
        using HttpResponseMessage deactivatableRole = await SendAsync(
            HttpMethod.Post,
            "/api/v1/functional-roles",
            FixtureSeedData.ExecutiveId,
            $$"""{"roleKey":"{{deactivatableRoleKey}}","displayName":"API Contract Deactivatable Role"}""");
        using HttpResponseMessage deactivated = await SendAsync(
            HttpMethod.Post,
            $"/api/v1/functional-roles/{deactivatableRoleKey}/deactivate",
            FixtureSeedData.ExecutiveId,
            """{"reason":"contract test deactivation"}""");

        Assert.Equal(HttpStatusCode.NoContent, absentRevoke.StatusCode);
        Assert.Equal(HttpStatusCode.OK, grantResponse.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, revoke.StatusCode);
        Assert.Equal(HttpStatusCode.Created, assignmentResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        Assert.Equal(HttpStatusCode.Created, deactivatableRole.StatusCode);
        Assert.Equal(HttpStatusCode.OK, deactivated.StatusCode);
    }

    [Fact]
    public async Task PermissionCheck_UsesTrustedServicePrincipalAndReturnsDecision()
    {
        using HttpResponseMessage response = await SendAsync(
            HttpMethod.Post,
            "/api/v1/permissions/check",
            FixtureSeedData.ExecutiveId,
            """{"permissionKey":"manage-functional-roles-and-permissions","scope":null}""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task UnauthenticatedForbiddenAndUnavailableRequests_ReturnSafeStatuses()
    {
        using HttpResponseMessage unauthenticated = await client.GetAsync("/api/v1/functional-roles");
        using HttpResponseMessage forbidden = await SendAsync(
            HttpMethod.Get,
            "/api/v1/functional-roles",
            FixtureSeedData.EngineerId);
        using HttpResponseMessage unavailable = await SendAsync(
            HttpMethod.Get,
            "/api/v1/functional-roles",
            FixtureSeedData.ExecutiveId,
            sub: "unavailable");

        Assert.Equal(HttpStatusCode.Unauthorized, unauthenticated.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, unavailable.StatusCode);
        Assert.DoesNotContain("Host=", await unavailable.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task RevokeAssignmentAndListAssignments_ReturnDocumentedResponses()
    {
        const string roleKey = "api-contract-assignment-revoke-role";
        using HttpResponseMessage roleResponse = await SendAsync(
            HttpMethod.Post,
            "/api/v1/functional-roles",
            FixtureSeedData.ExecutiveId,
            $$"""{"roleKey":"{{roleKey}}","displayName":"API Contract Assignment Revoke Role"}""");
        using HttpResponseMessage assignment = await SendAsync(
            HttpMethod.Post,
            $"/api/v1/people/{FixtureSeedData.DirectorId}/functional-roles",
            FixtureSeedData.ExecutiveId,
            $$"""{"roleKey":"{{roleKey}}"}""");
        using HttpResponseMessage revokeAssignment = await SendAsync(
            HttpMethod.Delete,
            $"/api/v1/people/{FixtureSeedData.DirectorId}/functional-roles/{roleKey}",
            FixtureSeedData.ExecutiveId);
        using HttpResponseMessage list = await SendAsync(
            HttpMethod.Get,
            $"/api/v1/people/{FixtureSeedData.ExecutiveId}/functional-roles",
            FixtureSeedData.ExecutiveId);
        using HttpResponseMessage revoke = await SendAsync(
            HttpMethod.Delete,
            $"/api/v1/people/{FixtureSeedData.ExecutiveId}/functional-roles/hr-admin",
            FixtureSeedData.ExecutiveId);

        Assert.Equal(HttpStatusCode.Created, roleResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Created, assignment.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, revokeAssignment.StatusCode);
        Assert.Equal(HttpStatusCode.OK, list.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, revoke.StatusCode);
    }

    private async Task<int> GetAuditCountAsync()
    {
        using IServiceScope scope = factory.Services.CreateScope();
        AccessControlDbContext context = scope.ServiceProvider
            .GetRequiredService<AccessControlDbContext>();
        return await context.AuthorizationAdministrationAudits.CountAsync();
    }

    private async Task<HttpResponseMessage> SendAsync(
        HttpMethod method,
        string path,
        Guid? personId = null,
        string? json = null,
        string? idempotencyKey = null,
        string? sub = null)
    {
        using HttpRequestMessage request = new(method, path);
        if (personId is not null)
        {
            request.Headers.Add(TEST_SUB_HEADER, sub ?? personId.Value.ToString());
        }

        if (idempotencyKey is not null)
        {
            request.Headers.Add("Idempotency-Key", idempotencyKey);
        }

        if (json is not null)
        {
            request.Content = new StringContent(json, Encoding.UTF8, "application/json");
        }

        return await client.SendAsync(request);
    }

    private sealed class TestAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
    {
        public const string SchemeName = "Test";

        public TestAuthenticationHandler(
            Microsoft.Extensions.Options.IOptionsMonitor<AuthenticationSchemeOptions> options,
            Microsoft.Extensions.Logging.ILoggerFactory logger,
            System.Text.Encodings.Web.UrlEncoder encoder)
            : base(options, logger, encoder)
        {
        }

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue(TEST_SUB_HEADER, out Microsoft.Extensions.Primitives.StringValues values) ||
                string.IsNullOrWhiteSpace(values.FirstOrDefault()))
            {
                return Task.FromResult(AuthenticateResult.NoResult());
            }

            ClaimsIdentity identity = new(
                [new Claim("sub", values.First()!)],
                SchemeName);
            return Task.FromResult(
                AuthenticateResult.Success(new AuthenticationTicket(
                    new ClaimsPrincipal(identity),
                    SchemeName)));
        }
    }

    private sealed class TestAuthenticationStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) =>
            application =>
            {
                application.UseAuthentication();
                next(application);
            };
    }

    private sealed class TestPrincipalPersonResolver : IPrincipalPersonResolver
    {
        public Task<PrincipalPersonResolution> ResolvePersonAsync(
            string principalSub,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<PrincipalPersonResolution>(
                principalSub == "unavailable"
                    ? new PrincipalPersonResolution.Unavailable()
                    : Guid.TryParse(principalSub, out Guid personId)
                        ? new PrincipalPersonResolution.Resolved(personId)
                        : new PrincipalPersonResolution.Ambiguous());
    }

    private sealed class TestTrustedServicePrincipalAuthorizer : ITrustedServicePrincipalAuthorizer
    {
        public Task<TrustedServicePrincipalAuthorization> AuthorizeAsync(
            CancellationToken cancellationToken = default) =>
            Task.FromResult(TrustedServicePrincipalAuthorization.Authorized);
    }
}
