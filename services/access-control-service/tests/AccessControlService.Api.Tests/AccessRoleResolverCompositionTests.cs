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
        // Proves that claim concretely: two ResolveAsync calls launched concurrently via
        // Task.WhenAll against the same DI-composed resolver instance throw, rather than silently
        // racing or corrupting results. AccessRoleResolverTests (the fake-repository unit tests)
        // can't demonstrate this -- FakeRelationshipRepository completes synchronously and has no
        // real shared, non-thread-safe state, so nothing there would actually interleave.
        _factory = new WebApplicationFactory<Program>();
        using var client = _factory.CreateClient();

        using var scope = _factory.Services.CreateScope();
        var resolver = scope.ServiceProvider.GetRequiredService<AccessRoleResolver>();

        var firstCall = resolver.ResolveAsync(FixtureSeedData.PlatformLeadId, FixtureSeedData.EngineerId);
        var secondCall = resolver.ResolveAsync(FixtureSeedData.EngineerId, FixtureSeedData.PlatformLeadId);

        await Assert.ThrowsAnyAsync<InvalidOperationException>(() => Task.WhenAll(firstCall, secondCall));
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
}
