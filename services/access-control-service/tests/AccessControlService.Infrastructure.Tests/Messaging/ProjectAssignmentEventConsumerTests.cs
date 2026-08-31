using System.Text;
using AccessControlService.Infrastructure.Messaging;
using AccessControlService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using RabbitMQ.Client;
using Testcontainers.PostgreSql;
using Testcontainers.RabbitMq;

namespace AccessControlService.Infrastructure.Tests.Messaging;

/// <summary>
/// Proves <see cref="ProjectAssignmentEventConsumer"/> -- the real <c>RabbitMQ.Client</c> wiring
/// spec-1-1e adds on top of spec-1-1d's pure <see cref="ProjectAssignmentEventProcessor"/> -- against
/// a real, ephemeral RabbitMQ broker (<c>Testcontainers.RabbitMq</c>) and a real, ephemeral Postgres
/// instance (<c>Testcontainers.PostgreSql</c>), mirroring the Testcontainers pattern already proven
/// for <c>EfRelationshipRepositoryTests</c> and <c>ProjectAssignmentEventProcessorTests</c>. Covers
/// every scenario in the spec's I/O matrix plus the review-loopback amendment's stall-proofing
/// acceptance criterion.
/// </summary>
public sealed class ProjectAssignmentEventConsumerTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("access_control_service_test")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();

    // Same image infra/docker-compose.yml pins for local dev -- proving this consumer against the
    // same broker version/build the team actually runs, not an arbitrary "latest".
    private readonly RabbitMqContainer _rabbitMqContainer = new RabbitMqBuilder("rabbitmq:4-management-alpine")
        .WithUsername("guest")
        .WithPassword("guest")
        .Build();

    private string _postgresConnectionString = null!;
    private RabbitMqConnectionOptions _connectionOptions = null!;

    public async Task InitializeAsync()
    {
        await Task.WhenAll(_postgresContainer.StartAsync(), _rabbitMqContainer.StartAsync());

        _postgresConnectionString = _postgresContainer.GetConnectionString();

        var options = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(_postgresConnectionString)
            .Options;
        await using var migrationContext = new AccessControlDbContext(options);
        await migrationContext.Database.MigrateAsync();

        _connectionOptions = new RabbitMqConnectionOptions
        {
            HostName = _rabbitMqContainer.Hostname,
            Port = _rabbitMqContainer.GetMappedPublicPort(5672),
            UserName = "guest",
            Password = "guest",
        };
    }

    public async Task DisposeAsync()
    {
        await Task.WhenAll(_postgresContainer.DisposeAsync().AsTask(), _rabbitMqContainer.DisposeAsync().AsTask());
    }

    // -- I/O matrix: valid grant event published --

    [Fact]
    public async Task ValidGrantEvent_ProcessedEndToEnd_RowInsertedAndMessageAcked()
    {
        await using var producer = await FakeProjectAssignmentEventProducer.CreateAsync(_connectionOptions);
        var (provider, scopeFactory) = BuildRealScopeFactory(_postgresConnectionString);
        await using var _ = provider;
        using var consumer = new ProjectAssignmentEventConsumer(
            scopeFactory, _connectionOptions, NullLogger<ProjectAssignmentEventConsumer>.Instance);
        await consumer.StartAsync(CancellationToken.None);
        try
        {
            var projectId = Guid.NewGuid();
            var personId = FixtureSeedData.ExecutiveId;
            var @event = MakeEvent(Guid.NewGuid(), 1, isGrant: true, projectId, personId, ProjectAssignmentRole.DeliveryManager);

            await producer.PublishAsync(@event);

            await WaitUntilAsync(
                async () =>
                {
                    await using var dbContext = NewDbContext();
                    return await dbContext.ProjectAssignments
                        .AnyAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId && pa.Role == ProjectAssignmentRole.DeliveryManager);
                },
                TimeSpan.FromSeconds(20));
        }
        finally
        {
            await consumer.StopAsync(CancellationToken.None);
        }
    }

    // -- I/O matrix: malformed message body --

    [Fact]
    public async Task MalformedMessageBody_DeadLetteredImmediatelyWithReasonHeader()
    {
        await using var producer = await FakeProjectAssignmentEventProducer.CreateAsync(_connectionOptions);
        var (provider, scopeFactory) = BuildRealScopeFactory(_postgresConnectionString);
        await using var _ = provider;
        using var consumer = new ProjectAssignmentEventConsumer(
            scopeFactory, _connectionOptions, NullLogger<ProjectAssignmentEventConsumer>.Instance);
        await consumer.StartAsync(CancellationToken.None);
        try
        {
            await producer.PublishRawAsync("this is not valid JSON {{{");

            var reason = await WaitForDeadLetterReasonAsync(TimeSpan.FromSeconds(20));

            Assert.Equal(ProjectAssignmentEventConsumer.MalformedBodyReason, reason);
        }
        finally
        {
            await consumer.StopAsync(CancellationToken.None);
        }
    }

    // -- I/O matrix: persistence failure, retried past the bounded limit, then dead-lettered --

    [Fact]
    public async Task PersistenceFailure_RetriedPastLimit_EndsInDeadLetterQueueWithReasonHeader()
    {
        await using var producer = await FakeProjectAssignmentEventProducer.CreateAsync(_connectionOptions);
        var (provider, scopeFactory) = BuildRealScopeFactory(_postgresConnectionString);
        await using var _ = provider;
        using var consumer = new ProjectAssignmentEventConsumer(
            scopeFactory, _connectionOptions, NullLogger<ProjectAssignmentEventConsumer>.Instance);

        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;

        // Pre-seed a watermark row (bypassing the processor entirely) claiming ownership of
        // (projectId, personId) for a phantom aggregate that never sends any event. No
        // ProjectAssignment row is seeded for the pair, so the processor's own app-level
        // cross-aggregate-conflict check (which only fires when an existing ProjectAssignment ROW
        // is found) never triggers -- the event below sails past that check, adds a brand new
        // ProjectAssignment row for a brand new aggregate, and only then collides with the
        // pre-seeded watermark's unique (OwnedProjectId, OwnedPersonId) index at SaveChangesAsync
        // time -- a genuine DbUpdateException from the database itself, deterministically
        // reproducible on every single delivery attempt, mirroring
        // ProjectAssignmentEventProcessorTests' own
        // UniqueOwnedPairIndex_TwoWatermarksClaimingSamePair_SaveChangesThrowsDbUpdateException.
        await using (var seedContext = NewDbContext())
        {
            seedContext.ProjectAssignmentEventWatermarks.Add(new ProjectAssignmentEventWatermark
            {
                AggregateId = Guid.NewGuid(),
                LastAppliedVersion = 1,
                LastAppliedEventId = Guid.NewGuid(),
                OwnedProjectId = projectId,
                OwnedPersonId = personId,
            });
            await seedContext.SaveChangesAsync();
        }

        await consumer.StartAsync(CancellationToken.None);
        try
        {
            var @event = MakeEvent(Guid.NewGuid(), 1, isGrant: true, projectId, personId, ProjectAssignmentRole.ProjectManager);
            await producer.PublishAsync(@event);

            var reason = await WaitForDeadLetterReasonAsync(TimeSpan.FromSeconds(30));

            Assert.Equal(ProjectAssignmentEventConsumer.PersistenceFailureExhaustedReason, reason);

            // The colliding write never actually committed -- only the pre-seeded phantom
            // watermark's ownership of the pair exists, no ProjectAssignment row was ever
            // persisted for it.
            await using var assertContext = NewDbContext();
            Assert.False(await assertContext.ProjectAssignments.AnyAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId));
        }
        finally
        {
            await consumer.StopAsync(CancellationToken.None);
        }
    }

    // -- Amendment: an exception escaping ProcessAsync that isn't already a defined outcome is
    //    rejected (not left unacked), and the consumer keeps consuming afterward -- it never
    //    permanently stalls under prefetchCount: 1. This is the most important scenario the
    //    review-loopback amendment added.

    [Fact]
    public async Task UnhandledExceptionEscapingProcessAsync_RejectedAndDoesNotStallSubsequentMessage()
    {
        await using var producer = await FakeProjectAssignmentEventProducer.CreateAsync(_connectionOptions);
        var (provider, realScopeFactory) = BuildRealScopeFactory(_postgresConnectionString);
        await using var _ = provider;

        // The FIRST message this factory hands out a scope for gets a processor backed by a
        // DbContext pointed at an unreachable Postgres endpoint -- its very first query (checking
        // PersonId exists) throws a raw Npgsql/socket exception, NOT a DbUpdateException, so it
        // never passes through ProcessAsync's own DbUpdateException handling. Every later call
        // (including a redelivery of the same poisoned message) falls through to the real,
        // working factory -- proving this is a transient escape, not a permanently broken
        // consumer.
        var scopeFactory = new OneShotFailureScopeFactory(realScopeFactory, BrokenPostgresConnectionString());

        using var consumer = new ProjectAssignmentEventConsumer(
            scopeFactory, _connectionOptions, NullLogger<ProjectAssignmentEventConsumer>.Instance);
        await consumer.StartAsync(CancellationToken.None);
        try
        {
            var poisonedProjectId = Guid.NewGuid();
            var poisonedPersonId = FixtureSeedData.ExecutiveId;
            var poisonedEvent = MakeEvent(Guid.NewGuid(), 1, isGrant: true, poisonedProjectId, poisonedPersonId, ProjectAssignmentRole.Member);
            await producer.PublishAsync(poisonedEvent);

            var followUpProjectId = Guid.NewGuid();
            var followUpPersonId = FixtureSeedData.ExecutiveId;
            var followUpEvent = MakeEvent(Guid.NewGuid(), 1, isGrant: true, followUpProjectId, followUpPersonId, ProjectAssignmentRole.ProjectManager);
            await producer.PublishAsync(followUpEvent);

            // Both events must eventually be applied -- the poisoned one on a later, successful
            // retry (since only the very first CreateScope call is rigged to fail), and the
            // follow-up one proving prefetchCount: 1 never left the consumer stuck behind the
            // first message's initial failure.
            await WaitUntilAsync(
                async () =>
                {
                    await using var dbContext = NewDbContext();
                    var poisonedApplied = await dbContext.ProjectAssignments
                        .AnyAsync(pa => pa.ProjectId == poisonedProjectId && pa.PersonId == poisonedPersonId);
                    var followUpApplied = await dbContext.ProjectAssignments
                        .AnyAsync(pa => pa.ProjectId == followUpProjectId && pa.PersonId == followUpPersonId);
                    return poisonedApplied && followUpApplied;
                },
                TimeSpan.FromSeconds(30));
        }
        finally
        {
            await consumer.StopAsync(CancellationToken.None);
        }
    }

    private AccessControlDbContext NewDbContext()
    {
        var options = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(_postgresConnectionString)
            .Options;
        return new AccessControlDbContext(options);
    }

    private static string BrokenPostgresConnectionString() =>
        // Port 1 is a privileged port essentially never listening -- fails fast (short timeout)
        // with a real connection-level exception, never a DbUpdateException.
        "Host=127.0.0.1;Port=1;Database=does_not_exist;Username=test;Password=test;Timeout=2;Command Timeout=2";

    private static (ServiceProvider Provider, IServiceScopeFactory ScopeFactory) BuildRealScopeFactory(string postgresConnectionString)
    {
        var services = new ServiceCollection();
        services.AddDbContext<AccessControlDbContext>(options => options.UseNpgsql(postgresConnectionString));
        services.AddSingleton<ILogger<ProjectAssignmentEventProcessor>>(NullLogger<ProjectAssignmentEventProcessor>.Instance);
        services.AddScoped<ProjectAssignmentEventProcessor>();

        var provider = services.BuildServiceProvider();
        return (provider, provider.GetRequiredService<IServiceScopeFactory>());
    }

    private static ProjectAssignmentChangedEvent MakeEvent(
        Guid aggregateId,
        long aggregateVersion,
        bool isGrant,
        Guid projectId,
        Guid personId,
        ProjectAssignmentRole role)
    {
        return new ProjectAssignmentChangedEvent
        {
            EventId = Guid.NewGuid(),
            AggregateId = aggregateId,
            AggregateVersion = aggregateVersion,
            OccurredAtUtc = DateTime.UtcNow,
            SchemaVersion = ProjectAssignmentEventProcessor.SupportedSchemaVersion,
            IsGrant = isGrant,
            ProjectId = projectId,
            PersonId = personId,
            Role = role,
        };
    }

    private static async Task WaitUntilAsync(Func<Task<bool>> predicate, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            if (await predicate())
            {
                return;
            }

            await Task.Delay(TimeSpan.FromMilliseconds(200));
        }

        Assert.Fail($"Condition was not met within {timeout}.");
    }

    private async Task<string?> WaitForDeadLetterReasonAsync(TimeSpan timeout)
    {
        var factory = new ConnectionFactory
        {
            HostName = _connectionOptions.HostName,
            Port = _connectionOptions.Port,
            UserName = _connectionOptions.UserName,
            Password = _connectionOptions.Password,
            AutomaticRecoveryEnabled = false,
        };

        await using var connection = await factory.CreateConnectionAsync();
        await using var channel = await connection.CreateChannelAsync();

        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            var result = await channel.BasicGetAsync(ProjectAssignmentEventConsumer.DeadLetterQueueName, autoAck: true);
            if (result is not null)
            {
                return ReadReasonHeader(result.BasicProperties.Headers);
            }

            await Task.Delay(TimeSpan.FromMilliseconds(300));
        }

        Assert.Fail($"No message ever appeared on '{ProjectAssignmentEventConsumer.DeadLetterQueueName}' within {timeout}.");
        return null;
    }

    private static string? ReadReasonHeader(IDictionary<string, object?>? headers)
    {
        if (headers is null || !headers.TryGetValue(ProjectAssignmentEventConsumer.DeadLetterReasonHeader, out var raw))
        {
            return null;
        }

        return raw switch
        {
            null => null,
            byte[] bytes => Encoding.UTF8.GetString(bytes),
            string s => s,
            _ => raw.ToString(),
        };
    }

    /// <summary>
    /// A <see cref="IServiceScopeFactory"/> test double whose very first <see cref="CreateScope"/>
    /// call hands out a scope resolving a <see cref="ProjectAssignmentEventProcessor"/> backed by a
    /// deliberately broken <see cref="AccessControlDbContext"/> (an unreachable connection string)
    /// -- so the first message processed through it fails with a real Npgsql/socket exception, not
    /// a <see cref="DbUpdateException"/>. Every subsequent call delegates to the real factory.
    /// </summary>
    private sealed class OneShotFailureScopeFactory : IServiceScopeFactory
    {
        private readonly IServiceScopeFactory _realFactory;
        private readonly string _brokenConnectionString;
        private int _callCount;

        public OneShotFailureScopeFactory(IServiceScopeFactory realFactory, string brokenConnectionString)
        {
            _realFactory = realFactory;
            _brokenConnectionString = brokenConnectionString;
        }

        public IServiceScope CreateScope()
        {
            if (Interlocked.Increment(ref _callCount) == 1)
            {
                var options = new DbContextOptionsBuilder<AccessControlDbContext>()
                    .UseNpgsql(_brokenConnectionString)
                    .Options;
                var brokenDbContext = new AccessControlDbContext(options);
                var processor = new ProjectAssignmentEventProcessor(brokenDbContext, NullLogger<ProjectAssignmentEventProcessor>.Instance);
                return new SingleProcessorScope(processor, brokenDbContext);
            }

            return _realFactory.CreateScope();
        }

        private sealed class SingleProcessorScope : IServiceScope
        {
            private readonly AccessControlDbContext _dbContext;

            public SingleProcessorScope(ProjectAssignmentEventProcessor processor, AccessControlDbContext dbContext)
            {
                ServiceProvider = new SingleProcessorServiceProvider(processor);
                _dbContext = dbContext;
            }

            public IServiceProvider ServiceProvider { get; }

            public void Dispose() => _dbContext.Dispose();
        }

        private sealed class SingleProcessorServiceProvider : IServiceProvider
        {
            private readonly ProjectAssignmentEventProcessor _processor;

            public SingleProcessorServiceProvider(ProjectAssignmentEventProcessor processor)
            {
                _processor = processor;
            }

            public object? GetService(Type serviceType) =>
                serviceType == typeof(ProjectAssignmentEventProcessor) ? _processor : null;
        }
    }
}
