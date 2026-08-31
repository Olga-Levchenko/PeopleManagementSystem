using AccessControlService.Infrastructure.Messaging;
using AccessControlService.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;

namespace AccessControlService.Api.Tests;

/// <summary>
/// Proves the real, DI-composed path in <c>Program.cs</c> that maps
/// <c>AppConfig.RabbitMqHost/RabbitMqPort/RabbitMqUser/RabbitMqPassword</c> into a
/// <c>RabbitMqConnectionOptions</c> instance (around lines 60-66) actually works end-to-end --
/// not just that <see cref="ProjectAssignmentEventConsumer"/> works when handed a
/// hand-constructed <c>RabbitMqConnectionOptions</c>, which is all
/// <c>AccessControlService.Infrastructure.Tests.Messaging.ProjectAssignmentEventConsumerTests</c>
/// already covers.
/// </summary>
/// <remarks>
/// <para>
/// <b>The gap this closes:</b> a field-mapping bug in <c>Program.cs</c> (e.g. swapping
/// <c>HostName = appConfig.RabbitMqUser</c> with <c>UserName = appConfig.RabbitMqHost</c>) would
/// compile cleanly, DI would resolve without error, and every existing test would still pass.
/// <see cref="HealthEndpointTests"/> and <see cref="RealServerBindingTests"/> both deliberately
/// point RabbitMQ at an unreachable target (an unreachable broker is meant to be a harmless,
/// "boots fine, logs and retries in the background" state for those tests) -- which means a
/// credential/host swap there is indistinguishable from "broker down": the consumer fails to
/// connect either way, and neither test asserts anything about whether the connection actually
/// succeeded. The Infrastructure-layer <c>ProjectAssignmentEventConsumerTests</c> proves the
/// consumer's own logic against a real broker, but constructs <c>RabbitMqConnectionOptions</c> by
/// hand -- it never exercises <c>Program.cs</c>'s mapping code at all.
/// </para>
/// <para>
/// <b>Approach -- WebApplicationFactory, not a subprocess:</b> boots the real app in-process via
/// <see cref="WebApplicationFactory{Program}"/>, which builds and starts the exact same
/// composition root <c>Program.cs</c> defines, including calling <c>StartAsync</c> on every
/// registered <c>IHostedService</c> -- i.e. the real <see cref="ProjectAssignmentEventConsumer"/>,
/// wired from <c>AppConfig</c> exactly as production would. <see cref="RealServerBindingTests"/>
/// uses a real subprocess instead because it specifically needs to prove real Kestrel socket
/// binding, something <c>WebApplicationFactory</c>'s in-memory <c>TestServer</c> cannot prove. This
/// test needs no such proof -- only that the hosted consumer connects to the broker it was told to
/// and applies an event -- so the in-process factory is preferred: it avoids the subprocess
/// approach's extra layer of startup-timing complexity (waiting for a real process to bind a port)
/// on top of the timing this test already has to handle (waiting for the hosted consumer to
/// connect, subscribe, and process a message against real, ephemeral Testcontainers).
/// </para>
/// <para>
/// <b>Real infrastructure:</b> both a real, ephemeral Postgres (<c>Testcontainers.PostgreSql</c>,
/// migrated via the same <c>AccessControlDbContext</c> migrations the app itself would apply
/// manually) and a real, ephemeral RabbitMQ (<c>Testcontainers.RabbitMq</c>) are started -- the app
/// needs both to fully start the hosted consumer and actually persist the resulting row.
/// <see cref="FakeProjectAssignmentEventProducer"/> publishes directly against the same broker,
/// using its own independently-constructed <c>RabbitMqConnectionOptions</c> (never through
/// <c>Program.cs</c>), so the only thing under test connecting via the production mapping code is
/// the app's own hosted consumer.
/// </para>
/// <para>
/// Joins the same disabled-parallelization collection <see cref="HealthEndpointTests"/> uses,
/// since both mutate the same process-wide environment variables
/// (<c>PORT</c>/<c>CORS_ORIGIN</c>/<c>ConnectionStrings__Postgres</c>/<c>RABBITMQ_*</c>) that
/// <c>AppConfig.Load</c> reads before <c>WebApplicationFactory</c>'s own config-override hooks
/// apply -- running concurrently with any other test class setting the same keys would race.
/// </para>
/// </remarks>
[Collection("HealthEndpointTests")]
public sealed class ProjectAssignmentEventConsumerCompositionTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("access_control_service_test")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();

    // Same image infra/docker-compose.yml pins for local dev, matching the Infrastructure-layer
    // ProjectAssignmentEventConsumerTests' own choice.
    private readonly RabbitMqContainer _rabbitMqContainer = new RabbitMqBuilder("rabbitmq:4-management-alpine")
        .WithUsername("guest")
        .WithPassword("guest")
        .Build();

    private string _postgresConnectionString = null!;
    private RabbitMqConnectionOptions _connectionOptions = null!;
    private WebApplicationFactory<Program>? _factory;

    public async Task InitializeAsync()
    {
        await Task.WhenAll(_postgresContainer.StartAsync(), _rabbitMqContainer.StartAsync());

        _postgresConnectionString = _postgresContainer.GetConnectionString();

        var migrationOptions = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(_postgresConnectionString)
            .Options;
        await using (var migrationContext = new AccessControlDbContext(migrationOptions))
        {
            await migrationContext.Database.MigrateAsync();
        }

        _connectionOptions = new RabbitMqConnectionOptions
        {
            HostName = _rabbitMqContainer.Hostname,
            Port = _rabbitMqContainer.GetMappedPublicPort(5672),
            UserName = "guest",
            Password = "guest",
        };

        // AppConfig.Load runs in Program.cs before WebApplication.Build() -- i.e. before
        // WebApplicationFactory's own config-override hooks are applied -- so, same reasoning
        // HealthEndpointTests documents, the process environment is the only reliable way to feed
        // this in-process host real, reachable connection details for both Postgres and RabbitMQ.
        Environment.SetEnvironmentVariable("PORT", "5098");
        Environment.SetEnvironmentVariable("CORS_ORIGIN", "http://localhost:4200");
        Environment.SetEnvironmentVariable("ConnectionStrings__Postgres", _postgresConnectionString);
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", _connectionOptions.HostName);
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", _connectionOptions.Port.ToString());
        Environment.SetEnvironmentVariable("RABBITMQ_USER", _connectionOptions.UserName);
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", _connectionOptions.Password);
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

        await Task.WhenAll(_postgresContainer.DisposeAsync().AsTask(), _rabbitMqContainer.DisposeAsync().AsTask());
    }

    [Fact]
    public async Task RealDiComposedConsumer_AppliesEventPublishedToRealBroker_RowAppearsInRealPostgres()
    {
        _factory = new WebApplicationFactory<Program>();

        // CreateClient() triggers the factory to build and start the real host -- including
        // starting every registered IHostedService, i.e. the real ProjectAssignmentEventConsumer,
        // composed exactly the way Program.cs wires it (AppConfig.Load -> RabbitMqConnectionOptions
        // mapping), not a hand-constructed options object. If that mapping ever swapped a field
        // (e.g. HostName = appConfig.RabbitMqUser), the consumer started here would never reach the
        // real broker and this test's polling loop below would time out and fail -- proving the
        // mapping, not just the consumer's own internal logic.
        using var client = _factory.CreateClient();

        await using var producer = await FakeProjectAssignmentEventProducer.CreateAsync(_connectionOptions);

        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;
        var @event = new ProjectAssignmentChangedEvent
        {
            EventId = Guid.NewGuid(),
            AggregateId = Guid.NewGuid(),
            AggregateVersion = 1,
            OccurredAtUtc = DateTime.UtcNow,
            SchemaVersion = ProjectAssignmentEventProcessor.SupportedSchemaVersion,
            IsGrant = true,
            ProjectId = projectId,
            PersonId = personId,
            Role = ProjectAssignmentRole.DeliveryManager,
        };

        await producer.PublishAsync(@event);

        var applied = await WaitUntilAppliedAsync(projectId, personId, TimeSpan.FromSeconds(30));

        Assert.True(
            applied,
            "Expected a ProjectAssignment row to appear via the real, DI-composed consumer within 30s. " +
            "If this times out, the most likely cause is a Program.cs RabbitMqConnectionOptions field-mapping regression " +
            "(e.g. HostName/UserName swapped), since the broker and Postgres containers themselves are confirmed reachable " +
            "by this test's own producer and migration step.");
    }

    private async Task<bool> WaitUntilAppliedAsync(Guid projectId, Guid personId, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            var options = new DbContextOptionsBuilder<AccessControlDbContext>()
                .UseNpgsql(_postgresConnectionString)
                .Options;
            await using var dbContext = new AccessControlDbContext(options);
            var applied = await dbContext.ProjectAssignments.AnyAsync(pa =>
                pa.ProjectId == projectId && pa.PersonId == personId && pa.Role == ProjectAssignmentRole.DeliveryManager);

            if (applied)
            {
                return true;
            }

            await Task.Delay(TimeSpan.FromMilliseconds(300));
        }

        return false;
    }
}
