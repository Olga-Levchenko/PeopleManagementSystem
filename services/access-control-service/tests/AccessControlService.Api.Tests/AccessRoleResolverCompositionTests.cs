using System.Net;
using System.Text.Json;
using AccessControlService.Domain;
using AccessControlService.Infrastructure.Messaging;
using AccessControlService.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Testcontainers.PostgreSql;

namespace AccessControlService.Api.Tests;

/// <summary>
/// Proves <c>Program.cs</c>'s own composition-root DI wiring for the Reporting/Project-line
/// resolution stack -- <c>AddDbContext&lt;AccessControlDbContext&gt;</c>,
/// <c>AddScoped&lt;IRelationshipRepository, EfRelationshipRepository&gt;</c>, and
/// <c>AddScoped&lt;AccessRoleResolver&gt;</c> -- actually resolves and works end-to-end. Every
/// existing test either constructs <see cref="AccessRoleResolver"/> against a hand-written fake
/// (<c>AccessRoleResolverTests</c>) or <see cref="EfRelationshipRepository"/> directly against its
/// own <see cref="AccessControlDbContext"/> instance (<c>EfRelationshipRepositoryTests</c>) --
/// neither ever resolves these types from <c>Program.cs</c>'s actual DI container, so a wiring
/// mistake there (e.g. the wrong <c>AppConfig</c> connection-string field passed to
/// <c>UseNpgsql(...)</c>, or <c>IRelationshipRepository</c> accidentally bound to the wrong
/// implementation) would compile cleanly and ship green through every other test in this service.
/// </summary>
/// <remarks>
/// <para>
/// Same approach as <see cref="ProjectAssignmentEventConsumerCompositionTests"/>: boots the real app
/// in-process via <see cref="WebApplicationFactory{Program}"/> so the actual <c>Program.cs</c>
/// composition root runs, against a real, ephemeral, migrated Postgres
/// (<c>Testcontainers.PostgreSql</c>) -- not a hand-constructed <c>DbContext</c>/repository/resolver.
/// RabbitMQ is deliberately left unreachable, same contract as
/// <see cref="HealthEndpointTests"/>/<see cref="RealServerBindingTests"/>: this test only needs the
/// Postgres/resolver wiring to be correct, and the hosted consumer boots fine with a broker down.
/// </para>
/// <para>
/// Joins the same disabled-parallelization collection as the other <c>WebApplicationFactory</c>
/// tests in this project, since all of them mutate the same process-wide environment variables
/// (<c>PORT</c>/<c>CORS_ORIGIN</c>/<c>ConnectionStrings__Postgres</c>/<c>RABBITMQ_*</c>) that
/// <c>AppConfig.Load</c> reads before <c>WebApplicationFactory</c>'s own config-override hooks apply
/// -- running concurrently with another test class setting the same keys would race.
/// </para>
/// </remarks>
[Collection("HealthEndpointTests")]
public sealed class AccessRoleResolverCompositionTests : IAsyncLifetime
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

        // Applies the actual, committed EF Core migration (schema + FixtureSeedData HasData seed)
        // against this real, ephemeral instance, exactly as a real deployment would -- the factory's
        // own in-process host below never calls Database.Migrate() itself (Program.cs deliberately
        // doesn't, see this service's CLAUDE.md Gotchas), so this test applies it up front the same
        // way ProjectAssignmentEventConsumerCompositionTests does.
        var migrationOptions = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(_postgresConnectionString)
            .Options;
        await using (var migrationContext = new AccessControlDbContext(migrationOptions))
        {
            await migrationContext.Database.MigrateAsync();
        }

        // AppConfig.Load runs in Program.cs before WebApplication.Build() -- i.e. before
        // WebApplicationFactory's own config-override hooks apply -- so, same reasoning
        // HealthEndpointTests documents, the process environment is the only reliable way to feed
        // this in-process host a real, reachable Postgres connection string. RabbitMQ is left
        // pointed at an unreachable target: AppConfig's fail-fast validation only requires the
        // RABBITMQ_* values to be present/non-blank, never that the broker is actually reachable at
        // startup (the hosted consumer just logs and retries in the background) -- this test has no
        // need for a real broker.
        Environment.SetEnvironmentVariable("PORT", "5097");
        Environment.SetEnvironmentVariable("CORS_ORIGIN", "http://localhost:4200");
        Environment.SetEnvironmentVariable("ConnectionStrings__Postgres", _postgresConnectionString);
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", "localhost");
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", "5699");
        Environment.SetEnvironmentVariable("RABBITMQ_USER", "guest");
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", "guest");
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

        await _postgresContainer.DisposeAsync();
    }

    [Fact]
    public async Task RealDiComposedResolverAndRepository_ResolveFromContainer_AndWorkAgainstRealMigratedPostgres()
    {
        _factory = new WebApplicationFactory<Program>();

        // CreateClient() triggers the factory to build and start the real host -- the actual
        // Program.cs composition root: AddDbContext<AccessControlDbContext> bound to the real
        // Postgres connection string above, IRelationshipRepository bound to EfRelationshipRepository,
        // AccessRoleResolver resolved on top of both.
        using var client = _factory.CreateClient();

        using var scope = _factory.Services.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IRelationshipRepository>();
        var resolver = scope.ServiceProvider.GetRequiredService<AccessRoleResolver>();

        // Proves the interface is bound to the real EF Core implementation, not left unregistered or
        // accidentally bound to some other type -- GetRequiredService alone would only prove *some*
        // IRelationshipRepository was resolvable.
        Assert.IsType<EfRelationshipRepository>(repository);

        // A real, transitive, fixture-seeded match (Engineer reports directly to PlatformLead, per
        // FixtureSeedData) -- proves the resolver constructed by DI actually reads through the real,
        // DI-wired DbContext connection end-to-end, not just that construction alone succeeds.
        var qualifyingResult = await resolver.ResolveAsync(FixtureSeedData.PlatformLeadId, FixtureSeedData.EngineerId);
        Assert.True(qualifyingResult.ReportingLine);

        // And a real negative, resolved through the same DI-composed instance, proving it isn't
        // hardwired to always return true.
        var nonQualifyingResult = await resolver.ResolveAsync(FixtureSeedData.EngineerId, FixtureSeedData.PlatformLeadId);
        Assert.False(nonQualifyingResult.ReportingLine);
    }

    [Fact]
    public async Task RealDiComposedResolver_ConcurrentResolveAsyncCalls_ThrowsInvalidOperationException()
    {
        // AccessRoleResolver's own doc comment states concurrent calls against the same instance
        // "are not safe and will throw" -- backed by a scoped, non-thread-safe EF Core DbContext.
        // Proves that claim concretely: concurrent ResolveAsync calls launched against the same
        // DI-composed resolver instance throw, rather than silently racing or corrupting results.
        // AccessRoleResolverTests (the fake-repository unit tests) can't demonstrate this --
        // FakeRelationshipRepository completes synchronously and has no real shared, non-thread-safe
        // state, so nothing there would actually interleave.
        //
        // A single pair of calls occasionally fails to overlap against a fast local Postgres
        // round trip (one call's individual EF Core operation can complete before the next call's
        // own first operation begins, especially on a low-latency CI runner) -- widen the race
        // across the Engineer->PlatformLead->Director->Executive reports-to chain (multiple
        // sequential repository round trips per call, not just one) and retry the whole burst a
        // few times as a safety net against pure scheduling luck, rather than asserting on exactly
        // one pair of calls.
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        InvalidOperationException? observed = null;
        for (var attempt = 0; attempt < 5 && observed is null; attempt++)
        {
            using var attemptScope = _factory.Services.CreateScope();
            var attemptResolver = attemptScope.ServiceProvider.GetRequiredService<AccessRoleResolver>();

            var tasks = Enumerable.Range(0, 10)
                .Select(i => i % 2 == 0
                    ? attemptResolver.ResolveAsync(FixtureSeedData.ExecutiveId, FixtureSeedData.EngineerId)
                    : attemptResolver.ResolveAsync(FixtureSeedData.EngineerId, FixtureSeedData.ExecutiveId))
                .ToArray();

            try
            {
                await Task.WhenAll(tasks);
            }
            catch (InvalidOperationException ex)
            {
                observed = ex;
            }
        }

        Assert.NotNull(observed);
    }

    // -- spec-1-2: proves the "no propagation delay, no cache lag" guarantee end-to-end, against
    // this same real, DI-composed resolver/repository stack. No caching layer exists anywhere in
    // AccessRoleResolver/EfRelationshipRepository today (both read live on every call) -- these
    // tests are the assertion that a reviewer can point to, not a new mechanism. Every test below
    // mutates data through a second, independent AccessControlDbContext instance bound to the same
    // Postgres connection string (mirroring EfRelationshipRepositoryTests' own test-local-row
    // pattern) -- never through the DI-scoped context the resolver/repository read through -- and
    // calls ResolveAsync sequentially, before and after, on the SAME resolver instance (never
    // Task.WhenAll, per AccessRoleResolver's own documented sequential-only contract). Test-local
    // people/departments are used throughout (rather than the shared reports-to/department-chain
    // fixture ids) because that fixture's reports-to and department-management hierarchies
    // deliberately coincide (each reports-to ancestor also manages the matching department), which
    // would make a "reports-to only" or "department only" edit inseparable from the other path.

    /// <summary>
    /// Opens a second, independent <see cref="AccessControlDbContext"/> against the same ephemeral
    /// Postgres instance the DI-composed resolver/repository read through -- standing in for
    /// Story 1.3's not-yet-built relationship-change screen, per this spec's Approach.
    /// </summary>
    private AccessControlDbContext CreateWriteDbContext()
    {
        var options = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(_postgresConnectionString)
            .Options;
        return new AccessControlDbContext(options);
    }

    [Fact]
    public async Task ResolveAsync_ReportsToEditRevokesReportingLine_NextCallReflectsChangeImmediately()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        using var scope = _factory.Services.CreateScope();
        var resolver = scope.ServiceProvider.GetRequiredService<AccessRoleResolver>();

        var managerId = Guid.NewGuid();
        var reportId = Guid.NewGuid();
        await using (var write = CreateWriteDbContext())
        {
            write.People.AddRange(
                new Person
                {
                    Id = managerId,
                    Label = "Fixture Person: reports-to-revoke manager (test-local)",
                    ManagerId = null,
                    DepartmentId = null,
                    ManagesDepartmentId = null,
                },
                new Person
                {
                    Id = reportId,
                    Label = "Fixture Person: reports-to-revoke report (test-local)",
                    ManagerId = managerId,
                    DepartmentId = null,
                    ManagesDepartmentId = null,
                });
            await write.SaveChangesAsync();
        }

        var before = await resolver.ResolveAsync(managerId, reportId);
        Assert.True(before.ReportingLine);

        // Platform-owned relationship edit, made directly against AccessControlDbContext --
        // standing in for Story 1.3's not-yet-built screen, per this spec's Approach.
        await using (var write = CreateWriteDbContext())
        {
            var report = await write.People.SingleAsync(p => p.Id == reportId);
            report.ManagerId = null;
            await write.SaveChangesAsync();
        }

        var after = await resolver.ResolveAsync(managerId, reportId);
        Assert.False(after.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_DepartmentManagementEditRevokesReportingLine_NextCallReflectsChangeImmediately()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        using var scope = _factory.Services.CreateScope();
        var resolver = scope.ServiceProvider.GetRequiredService<AccessRoleResolver>();

        var departmentId = Guid.NewGuid();
        var managerId = Guid.NewGuid();
        var subjectId = Guid.NewGuid();
        await using (var write = CreateWriteDbContext())
        {
            write.Departments.Add(new Department
            {
                Id = departmentId,
                Label = "Fixture Dept: department-management-revoke (test-local)",
                ParentDepartmentId = null,
            });
            write.People.AddRange(
                new Person
                {
                    Id = managerId,
                    Label = "Fixture Person: department-management-revoke manager (test-local)",
                    ManagerId = null,
                    DepartmentId = null,
                    ManagesDepartmentId = departmentId,
                },
                new Person
                {
                    Id = subjectId,
                    Label = "Fixture Person: department-management-revoke subject (test-local)",
                    ManagerId = null,
                    DepartmentId = departmentId,
                    ManagesDepartmentId = null,
                });
            await write.SaveChangesAsync();
        }

        // No reports-to link between manager and subject at all -- ReportingLine here can only be
        // qualifying via department management, isolating the path this test is about.
        var before = await resolver.ResolveAsync(managerId, subjectId);
        Assert.True(before.ReportingLine);

        // Platform-owned relationship edit (the subject's department changes so the viewer no
        // longer manages an ancestor of it), made directly against AccessControlDbContext.
        await using (var write = CreateWriteDbContext())
        {
            var subject = await write.People.SingleAsync(p => p.Id == subjectId);
            subject.DepartmentId = null;
            await write.SaveChangesAsync();
        }

        var after = await resolver.ResolveAsync(managerId, subjectId);
        Assert.False(after.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_ReportsToEditGrantsReportingLine_NextCallReflectsChangeImmediately()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        using var scope = _factory.Services.CreateScope();
        var resolver = scope.ServiceProvider.GetRequiredService<AccessRoleResolver>();

        var managerId = Guid.NewGuid();
        var reportId = Guid.NewGuid();
        await using (var write = CreateWriteDbContext())
        {
            write.People.AddRange(
                new Person
                {
                    Id = managerId,
                    Label = "Fixture Person: reports-to-grant manager (test-local)",
                    ManagerId = null,
                    DepartmentId = null,
                    ManagesDepartmentId = null,
                },
                new Person
                {
                    Id = reportId,
                    Label = "Fixture Person: reports-to-grant report (test-local)",
                    ManagerId = null,
                    DepartmentId = null,
                    ManagesDepartmentId = null,
                });
            await write.SaveChangesAsync();
        }

        // Proves the guarantee isn't one-directional (revoke-only): no relationship on file yet.
        var before = await resolver.ResolveAsync(managerId, reportId);
        Assert.False(before.ReportingLine);

        // Platform-owned relationship edit that establishes a qualifying chain, made directly
        // against AccessControlDbContext.
        await using (var write = CreateWriteDbContext())
        {
            var report = await write.People.SingleAsync(p => p.Id == reportId);
            report.ManagerId = managerId;
            await write.SaveChangesAsync();
        }

        var after = await resolver.ResolveAsync(managerId, reportId);
        Assert.True(after.ReportingLine);
    }

    [Fact]
    public async Task ResolveAsync_ProjectAssignmentRevokeEvent_NextCallReflectsProjectLineAbsent()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        using var scope = _factory.Services.CreateScope();
        var resolver = scope.ServiceProvider.GetRequiredService<AccessRoleResolver>();

        var viewerId = Guid.NewGuid();
        var aggregateId = Guid.NewGuid();

        await using (var write = CreateWriteDbContext())
        {
            write.People.Add(new Person
            {
                Id = viewerId,
                Label = "Fixture Person: project-line-revoke viewer (test-local)",
                ManagerId = null,
                DepartmentId = null,
                ManagesDepartmentId = null,
            });
            await write.SaveChangesAsync();
        }

        // Grant, through the real ProjectAssignmentEventProcessor (not a direct row insert), so a
        // watermark actually establishes this aggregate's ownership of
        // (ProjectPhoenixId, viewerId) -- a bare insert would leave the pair without an owning
        // watermark, and the revoke below would then be rejected as a cross-aggregate conflict per
        // ProjectAssignmentEventProcessor's own broadened conflict check, not applied.
        await using (var write = CreateWriteDbContext())
        {
            var processor = new ProjectAssignmentEventProcessor(write, NullLogger<ProjectAssignmentEventProcessor>.Instance);
            var grantOutcome = await processor.ProcessAsync(new ProjectAssignmentChangedEvent
            {
                EventId = Guid.NewGuid(),
                AggregateId = aggregateId,
                AggregateVersion = 1,
                OccurredAtUtc = DateTime.UtcNow,
                SchemaVersion = ProjectAssignmentEventProcessor.SupportedSchemaVersion,
                IsGrant = true,
                ProjectId = FixtureSeedData.ProjectPhoenixId,
                PersonId = viewerId,
                Role = ProjectAssignmentRole.DeliveryManager,
            });
            Assert.Equal(ProjectAssignmentEventOutcome.Applied, grantOutcome);
        }

        // FixtureSeedData.ProjectAssigneeId is already seeded as a Member of Project Phoenix --
        // reused here as the subject so only the viewer's new DM assignment above needs setting up.
        var before = await resolver.ResolveAsync(viewerId, FixtureSeedData.ProjectAssigneeId);
        Assert.True(before.ProjectLine);

        // Project-assignment-ended event, processed through the real consumer path
        // (ProjectAssignmentEventProcessor.ProcessAsync with IsGrant: false) -- not a direct row
        // delete, per this spec's Boundaries.
        await using (var write = CreateWriteDbContext())
        {
            var processor = new ProjectAssignmentEventProcessor(write, NullLogger<ProjectAssignmentEventProcessor>.Instance);
            var revokeOutcome = await processor.ProcessAsync(new ProjectAssignmentChangedEvent
            {
                EventId = Guid.NewGuid(),
                AggregateId = aggregateId,
                AggregateVersion = 2,
                OccurredAtUtc = DateTime.UtcNow,
                SchemaVersion = ProjectAssignmentEventProcessor.SupportedSchemaVersion,
                IsGrant = false,
                ProjectId = FixtureSeedData.ProjectPhoenixId,
                PersonId = viewerId,
                Role = ProjectAssignmentRole.DeliveryManager,
            });
            Assert.Equal(ProjectAssignmentEventOutcome.Applied, revokeOutcome);
        }

        var after = await resolver.ResolveAsync(viewerId, FixtureSeedData.ProjectAssigneeId);
        Assert.False(after.ProjectLine);
    }

    [Fact]
    public async Task ResolveAsync_SameResolverInstanceSequentialCalls_TogglesGrantThenRevokeWithNoMemoization()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        using var scope = _factory.Services.CreateScope();
        var resolver = scope.ServiceProvider.GetRequiredService<AccessRoleResolver>();

        var managerId = Guid.NewGuid();
        var reportId = Guid.NewGuid();
        await using (var write = CreateWriteDbContext())
        {
            write.People.AddRange(
                new Person
                {
                    Id = managerId,
                    Label = "Fixture Person: sequential-toggle manager (test-local)",
                    ManagerId = null,
                    DepartmentId = null,
                    ManagesDepartmentId = null,
                },
                new Person
                {
                    Id = reportId,
                    Label = "Fixture Person: sequential-toggle report (test-local)",
                    ManagerId = null,
                    DepartmentId = null,
                    ManagesDepartmentId = null,
                });
            await write.SaveChangesAsync();
        }

        // Three ResolveAsync calls in sequence, all against the single `resolver` instance above --
        // demonstrates no per-instance memoization exists in either direction, not just that one
        // edit happens to be reflected.
        var firstResult = await resolver.ResolveAsync(managerId, reportId);
        Assert.False(firstResult.ReportingLine);

        await using (var write = CreateWriteDbContext())
        {
            var report = await write.People.SingleAsync(p => p.Id == reportId);
            report.ManagerId = managerId;
            await write.SaveChangesAsync();
        }

        var secondResult = await resolver.ResolveAsync(managerId, reportId);
        Assert.True(secondResult.ReportingLine);

        await using (var write = CreateWriteDbContext())
        {
            var report = await write.People.SingleAsync(p => p.Id == reportId);
            report.ManagerId = null;
            await write.SaveChangesAsync();
        }

        var thirdResult = await resolver.ResolveAsync(managerId, reportId);
        Assert.False(thirdResult.ReportingLine);
    }

    // -- spec-1-9: real end-to-end HTTP tests for GET /api/v1/access-roles/resolve (ADR-003),
    // proving AccessRolesController's actual composition -- AccessRoleResolver then
    // ManagerSectionAccessPolicy -- against this same real, DI-composed, migrated-Postgres stack,
    // not a hand-constructed controller instance. Reuses FixtureSeedData's reports-to/department/
    // project-assignment fixture (see its own doc comment for the shape) rather than test-local
    // rows, since these tests only need existing qualifying/non-qualifying pairs, not a new edit.

    [Fact]
    public async Task ResolveEndpoint_ReportingLineOnly_ReturnsUnnarrowedManagerSectionAccess()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // Director is Engineer's transitive reports-to manager (Engineer -> PlatformLead ->
        // Director), and holds no DM/PM project assignment at all -- Reporting-line-only.
        using var response = await client.GetAsync(
            $"/api/v1/access-roles/resolve?viewerPersonId={FixtureSeedData.DirectorId}&subjectPersonId={FixtureSeedData.EngineerId}");

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);

        Assert.True(root.GetProperty("reportingLine").GetBoolean());
        Assert.False(root.GetProperty("projectLine").GetBoolean());

        var managerSectionAccess = root.GetProperty("managerSectionAccess");
        Assert.Equal(JsonValueKind.Object, managerSectionAccess.ValueKind);
        // All 16 properties, asserted through the real HTTP response -- not just S1/S2/S3/S5/S6 --
        // since AccessRolesController.ToResponse hand-maps each of the 16 ManagerSectionAccess
        // properties individually to its response DTO counterpart; a copy/paste mistake there
        // (e.g. wiring S9's response field to access.S8) would compile clean and pass every other
        // HTTP test in this class, since only the Domain-level ManagerSectionAccessPolicyTests
        // cover all 16 sections and those never touch this controller's own mapping code.
        AssertSection(managerSectionAccess, "s1", "ReadWrite", null);
        AssertSection(managerSectionAccess, "s2", "Read", null);
        AssertSection(managerSectionAccess, "s3", "Read", null);
        AssertSection(managerSectionAccess, "s4", "ReadWrite", null);
        AssertSection(managerSectionAccess, "s5", "Read", null);
        AssertSection(managerSectionAccess, "s6", "ReadWrite", null);
        AssertSection(managerSectionAccess, "s7", "ReadWrite", null);
        AssertSection(managerSectionAccess, "s8", "ReadWrite", null);
        AssertSection(managerSectionAccess, "s9", "ReadWrite", null);
        AssertSection(managerSectionAccess, "s10", "Read", null);
        AssertSection(managerSectionAccess, "s11", "Read", null);
        AssertSection(managerSectionAccess, "s12", "ReadWrite", null);
        AssertSection(managerSectionAccess, "s13", "ReadWrite", null);
        AssertSection(managerSectionAccess, "s14", "ReadWrite", null);
        AssertSection(managerSectionAccess, "s15", "Read", null);
        AssertSection(managerSectionAccess, "s16", "ReadWrite", null);
    }

    [Fact]
    public async Task ResolveEndpoint_ProjectLineOnly_ReturnsNarrowedManagerSectionAccess()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // DeliveryManagerOnlyId is DM on Project Phoenix; ProjectAssigneeId is a plain Member of
        // Project Phoenix; neither has any reports-to/department relation on file --
        // Project-line-only, per FixtureSeedData's own doc comment.
        using var response = await client.GetAsync(
            $"/api/v1/access-roles/resolve?viewerPersonId={FixtureSeedData.DeliveryManagerOnlyId}&subjectPersonId={FixtureSeedData.ProjectAssigneeId}");

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);

        Assert.False(root.GetProperty("reportingLine").GetBoolean());
        Assert.True(root.GetProperty("projectLine").GetBoolean());

        var managerSectionAccess = root.GetProperty("managerSectionAccess");
        Assert.Equal(JsonValueKind.Object, managerSectionAccess.ValueKind);
        AssertSection(managerSectionAccess, "s2", "None", null);
        AssertSection(managerSectionAccess, "s3", "None", null);
        AssertSection(managerSectionAccess, "s5", "Read", "CV and certificates only");
        // Everything else, including S6, is identical to the Reporting line.
        AssertSection(managerSectionAccess, "s1", "ReadWrite", null);
        AssertSection(managerSectionAccess, "s6", "ReadWrite", null);
    }

    [Fact]
    public async Task ResolveEndpoint_BothLinesQualify_ReturnsUnnarrowedManagerSectionAccessNotNarrowed()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // PlatformLead is Engineer's direct reports-to manager AND is DM on Project Orion, which
        // Engineer is assigned to -- qualifies for both lines at once, per FixtureSeedData's own
        // doc comment. Most-permissive-path-wins must yield the unnarrowed result, not the
        // Project-line narrowing.
        using var response = await client.GetAsync(
            $"/api/v1/access-roles/resolve?viewerPersonId={FixtureSeedData.PlatformLeadId}&subjectPersonId={FixtureSeedData.EngineerId}");

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);

        Assert.True(root.GetProperty("reportingLine").GetBoolean());
        Assert.True(root.GetProperty("projectLine").GetBoolean());

        var managerSectionAccess = root.GetProperty("managerSectionAccess");
        AssertSection(managerSectionAccess, "s2", "Read", null);
        AssertSection(managerSectionAccess, "s3", "Read", null);
        AssertSection(managerSectionAccess, "s5", "Read", null);
    }

    [Fact]
    public async Task ResolveEndpoint_NeitherLineQualifies_ReturnsNullManagerSectionAccess()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // Executive has no reports-to/department relation to, and holds no DM/PM project
        // assignment overlapping, UnrelatedProjectDmId -- neither line qualifies.
        using var response = await client.GetAsync(
            $"/api/v1/access-roles/resolve?viewerPersonId={FixtureSeedData.ExecutiveId}&subjectPersonId={FixtureSeedData.UnrelatedProjectDmId}");

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);

        Assert.False(root.GetProperty("reportingLine").GetBoolean());
        Assert.False(root.GetProperty("projectLine").GetBoolean());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("managerSectionAccess").ValueKind);
    }

    // -- spec-1-6b: real end-to-end HTTP tests for PeoplePartnerLine/peoplePartnerSectionAccess,
    // against this same real, DI-composed, migrated-Postgres stack and the same FixtureSeedData
    // HR-line fixture (HrPartnerId reports to HrDirectorId, Engineer.peoplePartnerId = HrPartnerId).

    [Fact]
    public async Task ResolveEndpoint_DirectPp_ReturnsPeoplePartnerLineTrueWithUnnarrowedSectionAccess()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // HrPartnerId is Engineer's directly assigned PP, per FixtureSeedData's own doc comment.
        using var response = await client.GetAsync(
            $"/api/v1/access-roles/resolve?viewerPersonId={FixtureSeedData.HrPartnerId}&subjectPersonId={FixtureSeedData.EngineerId}");

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);

        Assert.False(root.GetProperty("reportingLine").GetBoolean());
        Assert.False(root.GetProperty("projectLine").GetBoolean());
        Assert.True(root.GetProperty("peoplePartnerLine").GetBoolean());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("managerSectionAccess").ValueKind);

        var peoplePartnerSectionAccess = root.GetProperty("peoplePartnerSectionAccess");
        Assert.Equal(JsonValueKind.Object, peoplePartnerSectionAccess.ValueKind);
        // PP is never narrowed like Project line, and matches the unnarrowed Reporting-line view
        // for most sections -- but PP is ReadWrite on S2/S3/S5, where even an unnarrowed
        // Reporting-line viewer is only Read (section-matrix.md's PP column).
        AssertSection(peoplePartnerSectionAccess, "s1", "ReadWrite", null);
        AssertSection(peoplePartnerSectionAccess, "s2", "ReadWrite", null);
        AssertSection(peoplePartnerSectionAccess, "s3", "ReadWrite", null);
        AssertSection(peoplePartnerSectionAccess, "s4", "ReadWrite", null);
        AssertSection(peoplePartnerSectionAccess, "s5", "ReadWrite", null);
        AssertSection(peoplePartnerSectionAccess, "s6", "ReadWrite", null);
        AssertSection(peoplePartnerSectionAccess, "s7", "ReadWrite", null);
        AssertSection(peoplePartnerSectionAccess, "s8", "ReadWrite", null);
        AssertSection(peoplePartnerSectionAccess, "s9", "ReadWrite", null);
        AssertSection(peoplePartnerSectionAccess, "s10", "Read", null);
        AssertSection(peoplePartnerSectionAccess, "s11", "Read", null);
        AssertSection(peoplePartnerSectionAccess, "s12", "ReadWrite", null);
        AssertSection(peoplePartnerSectionAccess, "s13", "ReadWrite", null);
        AssertSection(peoplePartnerSectionAccess, "s14", "ReadWrite", null);
        AssertSection(peoplePartnerSectionAccess, "s15", "Read", null);
        AssertSection(peoplePartnerSectionAccess, "s16", "ReadWrite", null);
    }

    [Fact]
    public async Task ResolveEndpoint_HrLineTransitive_ReturnsPeoplePartnerLineTrue()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // HrDirectorId is HrPartnerId's own reports-to manager -- transitively above Engineer's
        // assigned PP in the PP's own reports-to chain (the "HR line"), per FixtureSeedData.
        using var response = await client.GetAsync(
            $"/api/v1/access-roles/resolve?viewerPersonId={FixtureSeedData.HrDirectorId}&subjectPersonId={FixtureSeedData.EngineerId}");

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);

        Assert.False(root.GetProperty("reportingLine").GetBoolean());
        Assert.True(root.GetProperty("peoplePartnerLine").GetBoolean());
        Assert.Equal(JsonValueKind.Object, root.GetProperty("peoplePartnerSectionAccess").ValueKind);
    }

    [Fact]
    public async Task ResolveEndpoint_ReportingLineViewerIsolatedFromSubjectsPpChain_PeoplePartnerLineFalseNoCrossContamination()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // PlatformLead is Engineer's real Reporting-line manager, per FixtureSeedData, with no
        // relation at all to Engineer's PP (HrPartnerId) or that PP's own manager (HrDirectorId) --
        // proves the two lines don't leak into each other.
        using var response = await client.GetAsync(
            $"/api/v1/access-roles/resolve?viewerPersonId={FixtureSeedData.PlatformLeadId}&subjectPersonId={FixtureSeedData.EngineerId}");

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);

        Assert.True(root.GetProperty("reportingLine").GetBoolean());
        Assert.False(root.GetProperty("peoplePartnerLine").GetBoolean());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("peoplePartnerSectionAccess").ValueKind);
    }

    [Fact]
    public async Task ResolveEndpoint_SubjectHasNoAssignedPp_ReturnsPeoplePartnerLineFalse()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        // DirectorId has no peoplePartnerId on file, per FixtureSeedData.
        using var response = await client.GetAsync(
            $"/api/v1/access-roles/resolve?viewerPersonId={FixtureSeedData.HrPartnerId}&subjectPersonId={FixtureSeedData.DirectorId}");

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);

        Assert.False(root.GetProperty("peoplePartnerLine").GetBoolean());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("peoplePartnerSectionAccess").ValueKind);
    }

    [Fact]
    public async Task ResolveEndpoint_InvalidGuidQueryParam_ReturnsBadRequestValidationProblem()
    {
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        using var response = await client.GetAsync(
            $"/api/v1/access-roles/resolve?viewerPersonId=not-a-guid&subjectPersonId={FixtureSeedData.EngineerId}");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        using var json = JsonDocument.Parse(body);
        // ASP.NET Core's default [ApiController] validation-problem body shape.
        Assert.True(json.RootElement.TryGetProperty("errors", out _), "response body must include 'errors'");
    }

    [Fact]
    public async Task ResolveEndpoint_MissingQueryParam_BindsToGuidEmptyAndReturns200WithNoManagerSectionAccess()
    {
        // Pins the distinction the doc comment on AccessRolesController.Resolve calls out
        // explicitly: an entirely absent Guid query parameter is NOT a 400 -- ASP.NET Core's
        // default model binding for a non-nullable value-type query parameter with no value
        // present binds it to default(Guid) (Guid.Empty) rather than failing validation, so the
        // request resolves normally (200). Guid.Empty never matches a real fixture person, so
        // AccessRoleResolver.ResolveAsync correctly returns AccessRole.None -- both flags false,
        // managerSectionAccess null. Only a value present but not parseable as a Guid (the
        // ResolveEndpoint_InvalidGuidQueryParam_... test above) fails model binding and 400s.
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        using var response = await client.GetAsync(
            $"/api/v1/access-roles/resolve?viewerPersonId={FixtureSeedData.EngineerId}");

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);

        Assert.False(root.GetProperty("reportingLine").GetBoolean());
        Assert.False(root.GetProperty("projectLine").GetBoolean());
        Assert.Equal(JsonValueKind.Null, root.GetProperty("managerSectionAccess").ValueKind);
    }

    // -- O4-90: POST /api/v1/access-roles/resolve-batch composition tests. Boot the same real,
    // DI-composed, migrated-Postgres stack as the GET /resolve tests above, so a DI-wiring bug
    // (e.g. ResolveBatchAsync not routed to the real batch methods) is caught end-to-end.

    [Fact]
    public async Task BatchResolveEndpoint_ReportingLine_ReturnsReportingLineTrueAndManagerSectionAccess()
    {
        // BATCH_REPORTING_LINE: Director is Engineer's transitive manager (2-hop, via PlatformLead).
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        var body = new
        {
            viewerPersonId = FixtureSeedData.DirectorId,
            subjectPersonIds = new[] { FixtureSeedData.EngineerId },
        };
        using var response = await client.PostAsync(
            "/api/v1/access-roles/resolve-batch",
            new StringContent(System.Text.Json.JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json"));

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);
        var results = root.GetProperty("results");
        Assert.Equal(1, results.GetArrayLength());

        var item = results[0];
        Assert.Equal(FixtureSeedData.EngineerId.ToString(), item.GetProperty("subjectPersonId").GetString());
        Assert.True(item.GetProperty("reportingLine").GetBoolean());
        Assert.False(item.GetProperty("projectLine").GetBoolean());
        Assert.Equal(JsonValueKind.Object, item.GetProperty("managerSectionAccess").ValueKind);
        Assert.Equal(JsonValueKind.Null, item.GetProperty("peoplePartnerSectionAccess").ValueKind);
    }

    [Fact]
    public async Task BatchResolveEndpoint_ProjectLineOnly_ReturnsProjectLineTrueWithNarrowedSectionAccess()
    {
        // BATCH_PROJECT_LINE_ONLY: DeliveryManagerOnly is DM on Phoenix; ProjectAssignee is a
        // plain Member on Phoenix; no reporting-line between them.
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        var body = new
        {
            viewerPersonId = FixtureSeedData.DeliveryManagerOnlyId,
            subjectPersonIds = new[] { FixtureSeedData.ProjectAssigneeId },
        };
        using var response = await client.PostAsync(
            "/api/v1/access-roles/resolve-batch",
            new StringContent(System.Text.Json.JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json"));

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);
        var item = root.GetProperty("results")[0];

        Assert.False(item.GetProperty("reportingLine").GetBoolean());
        Assert.True(item.GetProperty("projectLine").GetBoolean());

        var managerSectionAccess = item.GetProperty("managerSectionAccess");
        Assert.Equal(JsonValueKind.Object, managerSectionAccess.ValueKind);
        // Project-line-only narrowing: S2/S3 = None, S5 = Read with restriction.
        AssertSection(managerSectionAccess, "s2", "None", null);
        AssertSection(managerSectionAccess, "s3", "None", null);
        AssertSection(managerSectionAccess, "s5", "Read", "CV and certificates only");
        // S6 is identical to Reporting line even when narrowed.
        AssertSection(managerSectionAccess, "s6", "ReadWrite", null);
    }

    [Fact]
    public async Task BatchResolveEndpoint_PeoplePartnerLine_ReturnsPeoplePartnerLineTrueWithSectionAccess()
    {
        // BATCH_PP_LINE: HrPartnerId is Engineer's directly assigned PP.
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        var body = new
        {
            viewerPersonId = FixtureSeedData.HrPartnerId,
            subjectPersonIds = new[] { FixtureSeedData.EngineerId },
        };
        using var response = await client.PostAsync(
            "/api/v1/access-roles/resolve-batch",
            new StringContent(System.Text.Json.JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json"));

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);
        var item = root.GetProperty("results")[0];

        Assert.False(item.GetProperty("reportingLine").GetBoolean());
        Assert.False(item.GetProperty("projectLine").GetBoolean());
        Assert.True(item.GetProperty("peoplePartnerLine").GetBoolean());
        Assert.Equal(JsonValueKind.Null, item.GetProperty("managerSectionAccess").ValueKind);
        Assert.Equal(JsonValueKind.Object, item.GetProperty("peoplePartnerSectionAccess").ValueKind);
        // PP is ReadWrite on S2/S3/S5 (diverges from unnarrowed Reporting line).
        var ppAccess = item.GetProperty("peoplePartnerSectionAccess");
        AssertSection(ppAccess, "s2", "ReadWrite", null);
        AssertSection(ppAccess, "s3", "ReadWrite", null);
        AssertSection(ppAccess, "s5", "ReadWrite", null);
    }

    [Fact]
    public async Task BatchResolveEndpoint_HrLinePeoplePartner_ReturnsPeoplePartnerLineTrue()
    {
        // BATCH_PP_LINE_HR: HrDirectorId is transitively above Engineer's PP (HrPartnerId) in the
        // PP's own reports-to chain -- the HR line.
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        var body = new
        {
            viewerPersonId = FixtureSeedData.HrDirectorId,
            subjectPersonIds = new[] { FixtureSeedData.EngineerId },
        };
        using var response = await client.PostAsync(
            "/api/v1/access-roles/resolve-batch",
            new StringContent(System.Text.Json.JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json"));

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);
        var item = root.GetProperty("results")[0];

        Assert.True(item.GetProperty("peoplePartnerLine").GetBoolean());
        Assert.Equal(JsonValueKind.Object, item.GetProperty("peoplePartnerSectionAccess").ValueKind);
    }

    [Fact]
    public async Task BatchResolveEndpoint_EmptySubjects_Returns200WithEmptyResultList()
    {
        // EMPTY_SUBJECTS: empty input → 200 + { results: [] }
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        var body = new
        {
            viewerPersonId = FixtureSeedData.ExecutiveId,
            subjectPersonIds = Array.Empty<Guid>(),
        };
        using var response = await client.PostAsync(
            "/api/v1/access-roles/resolve-batch",
            new StringContent(System.Text.Json.JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json"));

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);
        Assert.Equal(0, root.GetProperty("results").GetArrayLength());
    }

    [Fact]
    public async Task BatchResolveEndpoint_ViewerNotInDb_AllSubjectsReturnAllFlagsFalse()
    {
        // VIEWER_NOT_IN_DB: the viewer id doesn't match any person in the DB.
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        var unknownViewer = Guid.NewGuid();
        var body = new
        {
            viewerPersonId = unknownViewer,
            subjectPersonIds = new[] { FixtureSeedData.EngineerId, FixtureSeedData.DirectorId },
        };
        using var response = await client.PostAsync(
            "/api/v1/access-roles/resolve-batch",
            new StringContent(System.Text.Json.JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json"));

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);
        var results = root.GetProperty("results");

        foreach (var item in results.EnumerateArray())
        {
            Assert.False(item.GetProperty("reportingLine").GetBoolean());
            Assert.False(item.GetProperty("projectLine").GetBoolean());
            Assert.False(item.GetProperty("peoplePartnerLine").GetBoolean());
            Assert.Equal(JsonValueKind.Null, item.GetProperty("managerSectionAccess").ValueKind);
            Assert.Equal(JsonValueKind.Null, item.GetProperty("peoplePartnerSectionAccess").ValueKind);
        }
    }

    [Fact]
    public async Task BatchResolveEndpoint_ViewerIdInSubjectIds_ThatEntryAllFlagsFalse()
    {
        // VIEWER_IN_SUBJECTS: viewerPersonId appears in subjectPersonIds -- fail-closed.
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        var body = new
        {
            viewerPersonId = FixtureSeedData.ExecutiveId,
            subjectPersonIds = new[] { FixtureSeedData.ExecutiveId, FixtureSeedData.EngineerId },
        };
        using var response = await client.PostAsync(
            "/api/v1/access-roles/resolve-batch",
            new StringContent(System.Text.Json.JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json"));

        response.EnsureSuccessStatusCode();
        var root = await ReadJsonRootAsync(response);
        var results = root.GetProperty("results");

        // Find the self-entry.
        var selfItem = results.EnumerateArray()
            .Single(item => item.GetProperty("subjectPersonId").GetString() == FixtureSeedData.ExecutiveId.ToString());

        Assert.False(selfItem.GetProperty("reportingLine").GetBoolean());
        Assert.False(selfItem.GetProperty("projectLine").GetBoolean());
        Assert.False(selfItem.GetProperty("peoplePartnerLine").GetBoolean());
        Assert.Equal(JsonValueKind.Null, selfItem.GetProperty("managerSectionAccess").ValueKind);
        Assert.Equal(JsonValueKind.Null, selfItem.GetProperty("peoplePartnerSectionAccess").ValueKind);
    }

    [Fact]
    public async Task BatchResolveEndpoint_DuplicateSubjectIds_ReturnsBadRequest()
    {
        // DUPLICATE_SUBJECTS: duplicate Guid in subjectPersonIds → 400.
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        var body = new
        {
            viewerPersonId = FixtureSeedData.ExecutiveId,
            subjectPersonIds = new[] { FixtureSeedData.EngineerId, FixtureSeedData.EngineerId },
        };
        using var response = await client.PostAsync(
            "/api/v1/access-roles/resolve-batch",
            new StringContent(System.Text.Json.JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task BatchResolveEndpoint_SubjectCountExceeds500_ReturnsBadRequest()
    {
        // BATCH_SIZE_EXCEEDED: subjectPersonIds.Count > 500 → 400.
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        var body = new
        {
            viewerPersonId = FixtureSeedData.ExecutiveId,
            subjectPersonIds = Enumerable.Range(0, 501).Select(_ => Guid.NewGuid()).ToArray(),
        };
        using var response = await client.PostAsync(
            "/api/v1/access-roles/resolve-batch",
            new StringContent(System.Text.Json.JsonSerializer.Serialize(body), System.Text.Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private static async Task<JsonElement> ReadJsonRootAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync();
        var document = JsonDocument.Parse(body);
        return document.RootElement.Clone();
    }

    private static void AssertSection(JsonElement managerSectionAccess, string sectionName, string expectedLevel, string? expectedRestriction)
    {
        var section = managerSectionAccess.GetProperty(sectionName);
        Assert.Equal(expectedLevel, section.GetProperty("level").GetString());

        if (expectedRestriction is null)
        {
            var hasRestriction = section.TryGetProperty("restriction", out var restriction);
            Assert.True(!hasRestriction || restriction.ValueKind == JsonValueKind.Null);
        }
        else
        {
            Assert.Equal(expectedRestriction, section.GetProperty("restriction").GetString());
        }
    }
}
