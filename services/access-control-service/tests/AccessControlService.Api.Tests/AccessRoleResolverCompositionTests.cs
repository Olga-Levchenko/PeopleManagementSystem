using AccessControlService.Domain;
using AccessControlService.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
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
}
