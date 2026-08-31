using System.Text;
using System.Text.Json;
using RabbitMQ.Client;

namespace AccessControlService.Infrastructure.Messaging;

/// <summary>
/// Test-only producer that publishes to the exact same queue/contract
/// <see cref="ProjectAssignmentEventConsumer"/> consumes -- proves the real broker wiring
/// end-to-end without a real timetracker adapter (Epic 14's real producer, deferred). Because this
/// publishes a plain <see cref="ProjectAssignmentChangedEvent"/> as JSON to the same queue name, no
/// consumer-side code change would be needed for a real producer to publish here instead.
/// </summary>
public sealed class FakeProjectAssignmentEventProducer : IAsyncDisposable
{
    private readonly IConnection _connection;
    private readonly IChannel _channel;

    private FakeProjectAssignmentEventProducer(IConnection connection, IChannel channel)
    {
        _connection = connection;
        _channel = channel;
    }

    public static async Task<FakeProjectAssignmentEventProducer> CreateAsync(
        RabbitMqConnectionOptions connectionOptions,
        CancellationToken cancellationToken = default)
    {
        var factory = new ConnectionFactory
        {
            HostName = connectionOptions.HostName,
            Port = connectionOptions.Port,
            UserName = connectionOptions.UserName,
            Password = connectionOptions.Password,
            RequestedConnectionTimeout = TimeSpan.FromSeconds(5),
            AutomaticRecoveryEnabled = false,
        };

        var connection = await factory.CreateConnectionAsync(cancellationToken);
        var channel = await connection.CreateChannelAsync(cancellationToken: cancellationToken);

        // Declares the identical topology the consumer declares -- AMQP declarations are
        // idempotent as long as the arguments match, so it does not matter which side (this fake
        // producer, in a test, or the real consumer) happens to run first.
        await ProjectAssignmentEventConsumer.DeclareTopologyAsync(channel, cancellationToken);

        return new FakeProjectAssignmentEventProducer(connection, channel);
    }

    /// <summary>Publishes a well-formed event, serialized exactly as the real consumer expects.</summary>
    public Task PublishAsync(ProjectAssignmentChangedEvent @event, CancellationToken cancellationToken = default)
    {
        var body = JsonSerializer.SerializeToUtf8Bytes(@event);
        return PublishRawAsync(body, cancellationToken);
    }

    /// <summary>
    /// Publishes an arbitrary, possibly non-deserializable body -- used to prove the consumer's
    /// malformed-body handling without needing a second, contrived producer type.
    /// </summary>
    public async Task PublishRawAsync(byte[] body, CancellationToken cancellationToken = default)
    {
        var properties = new BasicProperties
        {
            ContentType = "application/json",
            DeliveryMode = DeliveryModes.Persistent,
        };

        await _channel.BasicPublishAsync(
            exchange: string.Empty,
            routingKey: ProjectAssignmentEventConsumer.QueueName,
            mandatory: false,
            basicProperties: properties,
            body: body,
            cancellationToken: cancellationToken);
    }

    /// <summary>Convenience overload for a raw non-JSON string body (malformed-body test scenario).</summary>
    public Task PublishRawAsync(string body, CancellationToken cancellationToken = default) =>
        PublishRawAsync(Encoding.UTF8.GetBytes(body), cancellationToken);

    public async ValueTask DisposeAsync()
    {
        await _channel.DisposeAsync();
        await _connection.DisposeAsync();
    }
}
