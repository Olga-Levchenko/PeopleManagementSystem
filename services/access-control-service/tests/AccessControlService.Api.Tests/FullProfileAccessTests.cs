using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AccessControlService.Infrastructure.Persistence;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;

namespace AccessControlService.Api.Tests;

/// <summary>
/// Integration tests for <c>POST /api/v1/full-profile-access/grant</c> and
/// <c>POST /api/v1/full-profile-access/revoke</c>, covering every row in the spec-1-5 I/O &amp;
/// Edge-Case Matrix. Boots the real application via <see cref="WebApplicationFactory{Program}"/>
/// against a real, ephemeral Postgres started via <c>Testcontainers.PostgreSql</c>. Same pattern
/// as <see cref="AccessRoleResolverCompositionTests"/>.
/// </summary>
[Collection("HealthEndpointTests")]
public sealed class FullProfileAccessTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("access_control_service_test")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();

    private string _postgresConnectionString = null!;
    private WebApplicationFactory<Program>? _factory;

    public async Task InitializeAsync()
    {
        await _postgresContainer.StartAsync();
        _postgresConnectionString = _postgresContainer.GetConnectionString();

        // Apply the actual EF Core migration (schema + seed data) to the ephemeral Postgres.
        var migrationOptions = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(_postgresConnectionString)
            .Options;
        await using (var migrationContext = new AccessControlDbContext(migrationOptions))
        {
            await migrationContext.Database.MigrateAsync();
        }

        // Feed the real connection string via process environment so AppConfig.Load (which runs in
        // Program.cs before WebApplicationFactory's own config-override hooks apply) picks it up.
        Environment.SetEnvironmentVariable("PORT", "5098");
        Environment.SetEnvironmentVariable("CORS_ORIGIN", "http://localhost:4200");
        Environment.SetEnvironmentVariable("ConnectionStrings__Postgres", _postgresConnectionString);
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", "localhost");
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", "5699");
        Environment.SetEnvironmentVariable("RABBITMQ_USER", "guest");
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", "guest");
        Environment.SetEnvironmentVariable("OIDC_ALLOWED_ISSUERS", "https://id.example.test/realms/people-management");
        Environment.SetEnvironmentVariable("OIDC_AUDIENCE", "bff-confidential");
    }

    public async Task DisposeAsync()
    {
        if (_factory is not null)
        {
            await _factory.DisposeAsync();
        }

        Environment.SetEnvironmentVariable("PORT", null);
        Environment.SetEnvironmentVariable("CORS_ORIGIN", null);
        Environment.SetEnvironmentVariable("ConnectionStrings__Postgres", null);
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", null);
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", null);
        Environment.SetEnvironmentVariable("RABBITMQ_USER", null);
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", null);
        Environment.SetEnvironmentVariable("OIDC_ALLOWED_ISSUERS", null);
        Environment.SetEnvironmentVariable("OIDC_AUDIENCE", null);

        await _postgresContainer.DisposeAsync();
    }

    // -- Helper for creating a second DbContext to read raw DB state (independent of the DI scope). --
    private AccessControlDbContext CreateReadDbContext() =>
        new(new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(_postgresConnectionString)
            .Options);

    // -- Startup check: zero-holder scenario is tested in FullProfileAccessStartupValidationTests
    //    (unit test using a stub IFullProfileAccessRepository returning count=0) rather than here,
    //    because deleting the bootstrap seed row from a live WebApplicationFactory while it is
    //    starting introduces a race between the migration/seed and the test's own delete. --

    // -- I/O matrix row: "Non-holder attempts grant" --

    [Fact]
    public async Task Grant_AnonymousCaller_Returns401()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();
        using HttpRequestMessage request = new(
            HttpMethod.Post,
            "/api/v1/full-profile-access/grant");
        request.Headers.Add(FullProfileAccessTestAuthentication.ANONYMOUS_HEADER, "true");
        request.Content = JsonContent.Create(new
        {
            actorId = FixtureSeedData.PlatformLeadId,
            subjectId = FixtureSeedData.DirectorId,
        });

        using HttpResponseMessage response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Grant_ActorBodyDifferentFromVerifiedPrincipal_Returns403()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();
        using HttpRequestMessage request = new(
            HttpMethod.Post,
            "/api/v1/full-profile-access/grant");
        request.Headers.Add(
            FullProfileAccessTestAuthentication.SUBJECT_HEADER,
            FixtureSeedData.PlatformLeadId.ToString());
        request.Content = JsonContent.Create(new
        {
            actorId = FixtureSeedData.EngineerId,
            subjectId = FixtureSeedData.DirectorId,
        });

        using HttpResponseMessage response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Grant_NonHolderActor_Returns403()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // EngineerId is not a holder (only PlatformLeadId is seeded).
        var body = new { actorId = FixtureSeedData.EngineerId, subjectId = FixtureSeedData.DirectorId };
        using var response = await SendAsActorAsync(
            client,
            "/api/v1/full-profile-access/grant",
            FixtureSeedData.EngineerId,
            body);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // -- I/O matrix row: "Self-grant" --

    [Fact]
    public async Task Grant_SelfGrant_Returns403()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // PlatformLeadId is a holder, but actorId == subjectId is always rejected.
        var body = new { actorId = FixtureSeedData.PlatformLeadId, subjectId = FixtureSeedData.PlatformLeadId };
        using var response = await SendAsActorAsync(
            client,
            "/api/v1/full-profile-access/grant",
            FixtureSeedData.PlatformLeadId,
            body);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // -- I/O matrix row: "Valid grant" --

    [Fact]
    public async Task Grant_ValidHolderGrantsAnotherPerson_Returns201AndGrantRowPlusJournalEntry()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        var body = new { actorId = FixtureSeedData.PlatformLeadId, subjectId = FixtureSeedData.EngineerId };
        using var response = await SendAsActorAsync(
            client,
            "/api/v1/full-profile-access/grant",
            FixtureSeedData.PlatformLeadId,
            body);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        // Verify the grant row was created.
        await using var readCtx = CreateReadDbContext();
        var grantExists = await readCtx.FullProfileAccessGrants
            .AnyAsync(g => g.HolderId == FixtureSeedData.EngineerId);
        Assert.True(grantExists, "Grant row must exist for the subject after a valid grant.");

        // Verify the journal entry was written atomically.
        var journalEntry = await readCtx.FullProfileAccessJournalEntries
            .Where(e =>
                e.ActorId == FixtureSeedData.PlatformLeadId
                && e.SubjectId == FixtureSeedData.EngineerId
                && e.Action == FullProfileAccessAction.Grant)
            .SingleOrDefaultAsync();
        Assert.NotNull(journalEntry);
    }

    // -- I/O matrix row: "Last-holder revoke" --

    [Fact]
    public async Task Revoke_LastHolder_Returns409()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // Only PlatformLeadId is a holder (the bootstrap seed). Revoking the last holder must 409.
        var body = new { actorId = FixtureSeedData.PlatformLeadId, subjectId = FixtureSeedData.PlatformLeadId };
        using var response = await SendAsActorAsync(
            client,
            "/api/v1/full-profile-access/revoke",
            FixtureSeedData.PlatformLeadId,
            body);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    // -- I/O matrix row: "Valid revoke" --

    [Fact]
    public async Task Revoke_TwoPlusHolders_Returns200AndRowRemovedPlusJournalEntry()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // First grant a second holder so there are 2.
        var grantBody = new { actorId = FixtureSeedData.PlatformLeadId, subjectId = FixtureSeedData.EngineerId };
        using var grantResponse = await SendAsActorAsync(
            client,
            "/api/v1/full-profile-access/grant",
            FixtureSeedData.PlatformLeadId,
            grantBody);
        grantResponse.EnsureSuccessStatusCode();

        // Now revoke the second holder.
        var revokeBody = new { actorId = FixtureSeedData.PlatformLeadId, subjectId = FixtureSeedData.EngineerId };
        using var revokeResponse = await SendAsActorAsync(
            client,
            "/api/v1/full-profile-access/revoke",
            FixtureSeedData.PlatformLeadId,
            revokeBody);

        Assert.Equal(HttpStatusCode.OK, revokeResponse.StatusCode);

        // Grant row removed.
        await using var readCtx = CreateReadDbContext();
        var grantExists = await readCtx.FullProfileAccessGrants
            .AnyAsync(g => g.HolderId == FixtureSeedData.EngineerId);
        Assert.False(grantExists, "Grant row must be removed after a valid revoke.");

        // Journal entry written.
        var journalEntry = await readCtx.FullProfileAccessJournalEntries
            .Where(e =>
                e.ActorId == FixtureSeedData.PlatformLeadId
                && e.SubjectId == FixtureSeedData.EngineerId
                && e.Action == FullProfileAccessAction.Revoke)
            .SingleOrDefaultAsync();
        Assert.NotNull(journalEntry);
    }

    // -- Revoke: subject is not a holder → 404 --

    [Fact]
    public async Task Revoke_SubjectIsNotHolder_Returns404()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // EngineerId is not a holder (only PlatformLeadId is seeded). A revoke where the subject
        // is not a holder must return 404, not 200 or 500.
        var body = new { actorId = FixtureSeedData.PlatformLeadId, subjectId = FixtureSeedData.EngineerId };
        using var response = await SendAsActorAsync(
            client,
            "/api/v1/full-profile-access/revoke",
            FixtureSeedData.PlatformLeadId,
            body);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // -- I/O matrix row: "Resolve - holder" (via GET /api/v1/access-roles/resolve) --

    [Fact]
    public async Task ResolveEndpoint_FullProfileAccessHolder_ReturnsFullProfileAccessLineTrueWithAllSectionsReadWrite()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // PlatformLeadId is the bootstrap holder -- resolving as viewer against any subject should
        // return fullProfileAccessLine: true and fullProfileAccessSectionAccess with all 16 RW.
        using HttpRequestMessage request = new(
            HttpMethod.Get,
            $"/api/v1/access-roles/resolve?viewerPersonId={FixtureSeedData.PlatformLeadId}&subjectPersonId={FixtureSeedData.EngineerId}");
        request.Headers.Add(
            FullProfileAccessTestAuthentication.SUBJECT_HEADER,
            FixtureSeedData.PlatformLeadId.ToString());
        using var response = await client.SendAsync(request);

        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;

        Assert.True(root.GetProperty("fullProfileAccessLine").GetBoolean());

        var fullAccess = root.GetProperty("fullProfileAccessSectionAccess");
        Assert.Equal(JsonValueKind.Object, fullAccess.ValueKind);

        // All 16 sections must be ReadWrite.
        foreach (var sectionName in new[] { "s1","s2","s3","s4","s5","s6","s7","s8","s9","s10","s11","s12","s13","s14","s15","s16" })
        {
            var section = fullAccess.GetProperty(sectionName);
            var level = section.GetProperty("level").GetString();
            Assert.True(
                level == "ReadWrite",
                $"Section {sectionName} must be ReadWrite for a Full-profile-access holder, but was '{level}'");
        }
    }

    // -- I/O matrix row: "Resolve - non-holder" --

    [Fact]
    public async Task ResolveEndpoint_NonHolder_ReturnsFullProfileAccessLineFalseWithNullSectionAccess()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // EngineerId is not a holder.
        using HttpRequestMessage request = new(
            HttpMethod.Get,
            $"/api/v1/access-roles/resolve?viewerPersonId={FixtureSeedData.EngineerId}&subjectPersonId={FixtureSeedData.DirectorId}");
        request.Headers.Add(
            FullProfileAccessTestAuthentication.SUBJECT_HEADER,
            FixtureSeedData.EngineerId.ToString());
        using var response = await client.SendAsync(request);

        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;

        Assert.False(root.GetProperty("fullProfileAccessLine").GetBoolean());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("fullProfileAccessSectionAccess").ValueKind);
    }

    // -- I/O matrix row: "Non-holder attempts revoke" (same 403 as non-holder grant) --

    [Fact]
    public async Task Revoke_NonHolderActor_Returns403()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        var body = new { actorId = FixtureSeedData.EngineerId, subjectId = FixtureSeedData.PlatformLeadId };
        using var response = await SendAsActorAsync(
            client,
            "/api/v1/full-profile-access/revoke",
            FixtureSeedData.EngineerId,
            body);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Revoke_AnonymousCaller_Returns401()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();
        using HttpRequestMessage request = new(
            HttpMethod.Post,
            "/api/v1/full-profile-access/revoke");
        request.Headers.Add(FullProfileAccessTestAuthentication.ANONYMOUS_HEADER, "true");
        request.Content = JsonContent.Create(new
        {
            actorId = FixtureSeedData.PlatformLeadId,
            subjectId = FixtureSeedData.EngineerId,
        });

        using HttpResponseMessage response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Revoke_ActorBodyDifferentFromVerifiedPrincipal_Returns403()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();
        using HttpRequestMessage request = new(
            HttpMethod.Post,
            "/api/v1/full-profile-access/revoke");
        request.Headers.Add(
            FullProfileAccessTestAuthentication.SUBJECT_HEADER,
            FixtureSeedData.PlatformLeadId.ToString());
        request.Content = JsonContent.Create(new
        {
            actorId = FixtureSeedData.EngineerId,
            subjectId = FixtureSeedData.PlatformLeadId,
        });

        using HttpResponseMessage response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private static async Task<HttpResponseMessage> SendAsActorAsync(
        HttpClient client,
        string path,
        Guid actorId,
        object body)
    {
        using HttpRequestMessage request = new(HttpMethod.Post, path);
        request.Headers.Add(
            FullProfileAccessTestAuthentication.SUBJECT_HEADER,
            actorId.ToString());
        request.Content = JsonContent.Create(body);
        return await client.SendAsync(request);
    }

    private sealed class WebApplicationFactory<TEntryPoint>
        : Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactory<TEntryPoint>
        where TEntryPoint : class
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.ConfigureTestServices(FullProfileAccessTestAuthentication.Configure);
        }
    }
}
