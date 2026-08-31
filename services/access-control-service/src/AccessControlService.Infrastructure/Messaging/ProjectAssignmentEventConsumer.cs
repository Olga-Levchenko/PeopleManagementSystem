using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace AccessControlService.Infrastructure.Messaging;

/// <summary>
/// Real RabbitMQ.Client wiring for <see cref="ProjectAssignmentEventProcessor"/> (spec-1-1d), which
/// has zero messaging-transport dependency of its own. Connects, declares its own queue plus a
/// dead-letter queue/exchange, subscribes, and for every message: creates one DI scope (the
/// processor and its <c>DbContext</c> are scoped), deserializes the body into a
/// <see cref="ProjectAssignmentChangedEvent"/>, calls <c>ProcessAsync</c>, and acks/rejects
/// according to the outcome.
/// </summary>
/// <remarks>
/// <para>
/// <b>Retry/dead-letter mechanism (confirmed against a real broker):</b> the queue is a
/// <b>quorum queue</b> with <c>x-delivery-limit</c> plus a dead-letter exchange/queue, so RabbitMQ
/// itself counts redeliveries and dead-letters a message once the limit is exceeded -- this
/// consumer never tracks a retry count itself (ADR-001 decision 5). The retry/dead-letter path
/// uses AMQP <c>basic.reject</c> (<see cref="IChannel.BasicRejectAsync"/>), never <c>basic.nack</c>:
/// empirically, a quorum queue's <c>x-delivery-limit</c> only counts a redelivery caused by
/// <c>basic.reject</c> (or a consumer/connection failure) -- <c>basic.nack</c> with
/// <c>requeue: true</c> is an unlimited, uncounted "application routing" requeue that never trips
/// the limit (an earlier <c>basic.nack</c>-based draft looped 5000+ times against a real broker
/// without ever dead-lettering).
/// </para>
/// <para>
/// <b>Outcome mapping:</b> <c>Applied</c>/<c>DuplicateIgnored</c>/<c>RejectedStale</c>/
/// <c>RejectedInvalid</c>/<c>RejectedCrossAggregateConflict</c> are correct, final judgments on the
/// event's content and are always acked. <c>RejectedPersistenceFailure</c>, a malformed message
/// body, and -- per the review-loopback amendment -- <b>any other exception</b> escaping DI-scope
/// creation or the <c>ProcessAsync</c> call are all treated as retryable/dead-letterable: rejected
/// (with requeue for the first two, without requeue for a malformed body, which can never become
/// parseable by retrying) so the quorum queue's own <c>x-delivery-limit</c> bounds the retries.
/// Before this amendment, an exception outside the two already-handled paths propagated to the
/// caller with the delivery never acked or rejected -- under <c>prefetchCount: 1</c> that
/// permanently stops RabbitMQ from delivering any further message to this consumer (no crash, no
/// dead-letter, just one log line, until the process restarts). This is the failure mode the
/// catch-all exists to close.
/// </para>
/// <para>
/// <b>Dead-letter reason tagging:</b> AMQP's <c>basic.reject</c>/<c>basic.nack</c> carry no way to
/// attach a header to the message they requeue or dead-letter -- the broker's own copy of the
/// message properties is immutable from the consumer's side. So the first time a given delivery is
/// rejected for a retryable reason, this consumer republishes a tagged copy (an
/// <c>x-dead-letter-reason</c> header) back onto the same queue and acks the untagged original --
/// every subsequent redelivery (and the eventual transfer to the dead-letter queue once
/// <c>x-delivery-limit</c> is exceeded) then carries the tag automatically, since redelivery
/// preserves the message's properties unchanged. A malformed body is tagged and published directly
/// to the dead-letter exchange (no value in ever redelivering it). Known, deliberate trade-off:
/// this adds one extra publish+ack round trip the first time a message is rejected for retry,
/// meaning the message gets <c>x-delivery-limit + 2</c> total processing attempts rather than
/// exactly <c>x-delivery-limit</c>: the original, untagged delivery (1 attempt), plus up to
/// <c>x-delivery-limit + 1</c> attempts for the republished tagged copy -- the republish is a
/// brand-new message as far as the quorum queue is concerned, so it resets the queue's own
/// delivery-count tracking back to zero rather than continuing to count against the original
/// delivery's count. Still deterministically bounded, and preferred over having this consumer
/// track its own retry count (which ADR-001 decision 5 and the spec's KEEP instructions reserve to
/// the quorum queue itself).
/// </para>
/// <para>
/// <b>Reconnect:</b> the connect/declare/consume sequence is retried with a fixed 5s backoff on any
/// failure (including RabbitMQ being unreachable at startup, or a connection/channel lost mid-run),
/// mirroring this service's existing "boots fine with Postgres down" contract rather than crashing
/// the host. <see cref="ConnectionFactory.AutomaticRecoveryEnabled"/> is explicitly disabled: this
/// consumer already implements its own manual reconnect loop, and leaving RabbitMQ.Client's built-in
/// automatic recovery at its default would risk the two mechanisms fighting (the client silently
/// recovering the connection/topology while this loop is also trying to reconnect and re-declare
/// it). If acking/rejecting a delivery itself throws (e.g. the channel died between receiving the
/// message and finishing processing it), that failure is caught, logged, and treated as a signal to
/// stop reading from this channel and let the outer reconnect loop take over -- never left to
/// propagate out of the RabbitMQ.Client event handler.
/// </para>
/// </remarks>
public sealed class ProjectAssignmentEventConsumer : BackgroundService
{
    public const string QueueName = "access-control.project-assignment-events";
    public const string DeadLetterExchangeName = "access-control.project-assignment-events.dlx";
    public const string DeadLetterQueueName = "access-control.project-assignment-events.dlq";

    /// <summary>
    /// The quorum queue's <c>x-delivery-limit</c>: RabbitMQ dead-letters a message once it has been
    /// rejected/redelivered more times than this.
    /// </summary>
    public const int DeliveryLimit = 5;

    /// <summary>Header carrying this consumer's own classification of why a message was rejected.</summary>
    public const string DeadLetterReasonHeader = "x-dead-letter-reason";

    public const string MalformedBodyReason = "malformed-body";
    public const string PersistenceFailureExhaustedReason = "persistence-failure-exhausted";
    public const string UnhandledExceptionReason = "unhandled-exception";

    private static readonly TimeSpan ReconnectDelay = TimeSpan.FromSeconds(5);

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly RabbitMqConnectionOptions _connectionOptions;
    private readonly ILogger<ProjectAssignmentEventConsumer> _logger;

    public ProjectAssignmentEventConsumer(
        IServiceScopeFactory scopeFactory,
        RabbitMqConnectionOptions connectionOptions,
        ILogger<ProjectAssignmentEventConsumer> logger)
    {
        _scopeFactory = scopeFactory;
        _connectionOptions = connectionOptions;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "RabbitMQ consumer connection failed or was lost; retrying in {DelaySeconds}s.",
                    ReconnectDelay.TotalSeconds);
            }

            if (stoppingToken.IsCancellationRequested)
            {
                break;
            }

            try
            {
                await Task.Delay(ReconnectDelay, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task RunOnceAsync(CancellationToken stoppingToken)
    {
        var factory = new ConnectionFactory
        {
            HostName = _connectionOptions.HostName,
            Port = _connectionOptions.Port,
            UserName = _connectionOptions.UserName,
            Password = _connectionOptions.Password,
            RequestedConnectionTimeout = TimeSpan.FromSeconds(5),
            // This consumer already implements its own manual reconnect loop (this method is
            // retried by ExecuteAsync's outer loop on any failure) -- leaving RabbitMQ.Client's
            // built-in automatic recovery at its default risks the two mechanisms fighting, e.g.
            // the client silently recovering the connection/topology while this loop is also
            // trying to reconnect and re-declare it.
            AutomaticRecoveryEnabled = false,
        };

        await using var connection = await factory.CreateConnectionAsync(stoppingToken);
        await using var channel = await connection.CreateChannelAsync(cancellationToken: stoppingToken);

        await DeclareTopologyAsync(channel, stoppingToken);
        await channel.BasicQosAsync(prefetchSize: 0, prefetchCount: 1, global: false, cancellationToken: stoppingToken);

        // Signaled when the connection/channel is lost, or when a message handler fails to
        // ack/reject (e.g. because the channel died) -- either way, this method must stop reading
        // from a channel that may itself be dead and let ExecuteAsync's outer reconnect loop take
        // over instead of continuing to consume.
        var loopEnded = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        channel.ChannelShutdownAsync += (_, args) =>
        {
            _logger.LogWarning("RabbitMQ channel shut down: {ReplyText}", args.ReplyText);
            loopEnded.TrySetResult();
            return Task.CompletedTask;
        };
        connection.ConnectionShutdownAsync += (_, args) =>
        {
            _logger.LogWarning("RabbitMQ connection shut down: {ReplyText}", args.ReplyText);
            loopEnded.TrySetResult();
            return Task.CompletedTask;
        };

        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += (_, ea) => HandleMessageAsync(channel, ea, loopEnded, stoppingToken);

        await channel.BasicConsumeAsync(queue: QueueName, autoAck: false, consumer: consumer, cancellationToken: stoppingToken);

        await using var registration = stoppingToken.Register(() => loopEnded.TrySetResult());
        await loopEnded.Task;

        stoppingToken.ThrowIfCancellationRequested();

        // loopEnded completed but we were not cancelled: the channel/connection shut down
        // unexpectedly, or a message handler could not ack/reject. Throw so ExecuteAsync's outer
        // catch logs it and reconnects after the backoff delay, instead of silently returning and
        // leaving the BackgroundService looking like it is still consuming.
        throw new InvalidOperationException("RabbitMQ consume loop ended unexpectedly; reconnecting.");
    }

    /// <summary>
    /// Declares this consumer's queue plus its dead-letter exchange/queue. Also called by
    /// <see cref="FakeProjectAssignmentEventProducer"/> so both sides agree on the exact same
    /// topology -- AMQP declarations are idempotent as long as the arguments match, so it does not
    /// matter which side declares first.
    /// </summary>
    internal static async Task DeclareTopologyAsync(IChannel channel, CancellationToken cancellationToken)
    {
        await channel.ExchangeDeclareAsync(
            exchange: DeadLetterExchangeName,
            type: ExchangeType.Fanout,
            durable: true,
            autoDelete: false,
            cancellationToken: cancellationToken);

        await channel.QueueDeclareAsync(
            queue: DeadLetterQueueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            cancellationToken: cancellationToken);

        await channel.QueueBindAsync(
            queue: DeadLetterQueueName,
            exchange: DeadLetterExchangeName,
            routingKey: string.Empty,
            cancellationToken: cancellationToken);

        var queueArgs = new Dictionary<string, object?>
        {
            ["x-queue-type"] = "quorum",
            ["x-delivery-limit"] = DeliveryLimit,
            ["x-dead-letter-exchange"] = DeadLetterExchangeName,
        };

        await channel.QueueDeclareAsync(
            queue: QueueName,
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: queueArgs,
            cancellationToken: cancellationToken);
    }

    private async Task HandleMessageAsync(
        IChannel channel,
        BasicDeliverEventArgs ea,
        TaskCompletionSource loopEnded,
        CancellationToken stoppingToken)
    {
        ProjectAssignmentChangedEvent? @event;
        try
        {
            @event = JsonSerializer.Deserialize<ProjectAssignmentChangedEvent>(ea.Body.Span, SerializerOptions);
        }
        catch (Exception ex)
        {
            // Unconditional catch-all: matches the breadth of the ProcessAsync catch-all below --
            // any exception type escaping deserialization (not just JsonException/
            // NotSupportedException/ArgumentException) must not escape unhandled either, or it
            // reopens the same "permanently stalls the consumer under prefetchCount: 1" failure
            // mode the ProcessAsync catch-all exists to close.
            _logger.LogWarning(
                ex,
                "Malformed project-assignment message body (delivery tag {DeliveryTag}); dead-lettering.",
                ea.DeliveryTag);
            await DeadLetterImmediatelyAsync(channel, ea, MalformedBodyReason, loopEnded, stoppingToken);
            return;
        }

        if (@event is null)
        {
            _logger.LogWarning(
                "Project-assignment message body deserialized to null (delivery tag {DeliveryTag}); dead-lettering.",
                ea.DeliveryTag);
            await DeadLetterImmediatelyAsync(channel, ea, MalformedBodyReason, loopEnded, stoppingToken);
            return;
        }

        ProjectAssignmentEventOutcome outcome;
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var processor = scope.ServiceProvider.GetRequiredService<ProjectAssignmentEventProcessor>();
            outcome = await processor.ProcessAsync(@event, stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Ordinary host shutdown, not a failure: let it propagate so the caller (the
            // RabbitMQ.Client event-handler plumbing / ExecuteAsync's own shutdown path) sees a
            // clean cancellation rather than this method misclassifying it as an unhandled
            // exception and rejecting/tagging the message for retry, which would pollute the
            // dead-letter queue and logs with a false "unhandled exception" on every shutdown.
            throw;
        }
        catch (Exception ex)
        {
            // Catch-all (review-loopback amendment): anything ProcessAsync itself did not already
            // turn into RejectedPersistenceFailure -- an unexpected Npgsql exception, a DI
            // resolution failure, anything else escaping scope creation or the ProcessAsync call --
            // is treated exactly like RejectedPersistenceFailure: reject-with-requeue, letting the
            // quorum queue's own x-delivery-limit bound the retries and eventually dead-letter it.
            _logger.LogError(
                ex,
                "Unhandled exception processing project-assignment event (delivery tag {DeliveryTag}); rejecting for retry.",
                ea.DeliveryTag);
            await RejectForRetryAsync(channel, ea, UnhandledExceptionReason, loopEnded, stoppingToken);
            return;
        }

        switch (outcome)
        {
            case ProjectAssignmentEventOutcome.RejectedPersistenceFailure:
                await RejectForRetryAsync(channel, ea, PersistenceFailureExhaustedReason, loopEnded, stoppingToken);
                return;

            case ProjectAssignmentEventOutcome.Applied:
                // No consumer-level log for the common case -- ProjectAssignmentEventProcessor
                // itself already logs at the domain level, and this is the expected, high-volume
                // outcome.
                await SafeAckAsync(channel, ea.DeliveryTag, loopEnded, stoppingToken);
                return;

            case ProjectAssignmentEventOutcome.DuplicateIgnored:
                _logger.LogInformation(
                    "Project-assignment event ignored as a duplicate (delivery tag {DeliveryTag}); acking.",
                    ea.DeliveryTag);
                await SafeAckAsync(channel, ea.DeliveryTag, loopEnded, stoppingToken);
                return;

            case ProjectAssignmentEventOutcome.RejectedStale:
                _logger.LogInformation(
                    "Project-assignment event rejected as stale (delivery tag {DeliveryTag}); acking.",
                    ea.DeliveryTag);
                await SafeAckAsync(channel, ea.DeliveryTag, loopEnded, stoppingToken);
                return;

            case ProjectAssignmentEventOutcome.RejectedInvalid:
                _logger.LogWarning(
                    "Project-assignment event rejected as invalid (delivery tag {DeliveryTag}); acking.",
                    ea.DeliveryTag);
                await SafeAckAsync(channel, ea.DeliveryTag, loopEnded, stoppingToken);
                return;

            case ProjectAssignmentEventOutcome.RejectedCrossAggregateConflict:
                _logger.LogWarning(
                    "Project-assignment event rejected as a cross-aggregate conflict (delivery tag {DeliveryTag}); acking.",
                    ea.DeliveryTag);
                await SafeAckAsync(channel, ea.DeliveryTag, loopEnded, stoppingToken);
                return;

            default:
                // Defensive: a future ProjectAssignmentEventOutcome value added without updating
                // this mapping must fail loudly in tests/logs rather than silently falling through
                // to an ack, which would be a silent behavior change for an outcome nobody has
                // actually judged safe to acknowledge.
                throw new NotSupportedException(
                    $"Unrecognized {nameof(ProjectAssignmentEventOutcome)} value: {outcome}.");
        }
    }

    private async Task DeadLetterImmediatelyAsync(
        IChannel channel,
        BasicDeliverEventArgs ea,
        string reason,
        TaskCompletionSource loopEnded,
        CancellationToken stoppingToken)
    {
        try
        {
            var properties = ClonePropertiesWithReason(ea.BasicProperties, reason);

            await channel.BasicPublishAsync(
                exchange: DeadLetterExchangeName,
                routingKey: string.Empty,
                mandatory: false,
                basicProperties: properties,
                body: ea.Body,
                cancellationToken: stoppingToken);

            await channel.BasicAckAsync(ea.DeliveryTag, multiple: false, cancellationToken: stoppingToken);
        }
        catch (Exception ex)
        {
            HandleAckOrRejectFailure(ex, ea.DeliveryTag, loopEnded);
        }
    }

    private async Task RejectForRetryAsync(
        IChannel channel,
        BasicDeliverEventArgs ea,
        string reason,
        TaskCompletionSource loopEnded,
        CancellationToken stoppingToken)
    {
        try
        {
            var alreadyTagged = ea.BasicProperties.Headers is not null
                && ea.BasicProperties.Headers.ContainsKey(DeadLetterReasonHeader);

            if (alreadyTagged)
            {
                // A redelivery of a copy already tagged on a previous attempt -- the header rides
                // along automatically through further redeliveries and the eventual dead-letter
                // transfer once x-delivery-limit is exceeded. Just reject-with-requeue as normal.
                await channel.BasicRejectAsync(ea.DeliveryTag, requeue: true, cancellationToken: stoppingToken);
                return;
            }

            // First rejection of this delivery: basic.reject carries no way to attach a header to
            // the message it requeues -- the broker's copy of the properties is immutable from
            // here. Republish a tagged copy onto the same queue, then ack the untagged original, so
            // every subsequent redelivery (and the eventual dead-letter transfer) carries the
            // reason automatically.
            var properties = ClonePropertiesWithReason(ea.BasicProperties, reason);

            await channel.BasicPublishAsync(
                exchange: string.Empty,
                routingKey: QueueName,
                mandatory: false,
                basicProperties: properties,
                body: ea.Body,
                cancellationToken: stoppingToken);

            await channel.BasicAckAsync(ea.DeliveryTag, multiple: false, cancellationToken: stoppingToken);
        }
        catch (Exception ex)
        {
            HandleAckOrRejectFailure(ex, ea.DeliveryTag, loopEnded);
        }
    }

    private async Task SafeAckAsync(
        IChannel channel,
        ulong deliveryTag,
        TaskCompletionSource loopEnded,
        CancellationToken stoppingToken)
    {
        try
        {
            await channel.BasicAckAsync(deliveryTag, multiple: false, cancellationToken: stoppingToken);
        }
        catch (Exception ex)
        {
            HandleAckOrRejectFailure(ex, deliveryTag, loopEnded);
        }
    }

    /// <summary>
    /// Called when BasicAckAsync/BasicPublishAsync/BasicRejectAsync itself throws (e.g. the channel
    /// died between receiving the message and finishing processing it). Never rethrown -- this runs
    /// inside a RabbitMQ.Client event handler -- instead logged and signaled so <see cref="RunOnceAsync"/>
    /// stops reading from a channel that may itself be dead and lets ExecuteAsync's outer reconnect
    /// loop take over.
    /// </summary>
    private void HandleAckOrRejectFailure(Exception ex, ulong deliveryTag, TaskCompletionSource loopEnded)
    {
        _logger.LogError(
            ex,
            "Failed to ack/reject delivery tag {DeliveryTag}; the channel may be dead. Ending this consume loop so the outer reconnect logic can take over.",
            deliveryTag);
        loopEnded.TrySetResult();
    }

    private static BasicProperties ClonePropertiesWithReason(IReadOnlyBasicProperties original, string reason)
    {
        var headers = original.Headers is null
            ? new Dictionary<string, object?>()
            : new Dictionary<string, object?>(original.Headers);

        headers[DeadLetterReasonHeader] = reason;

        return new BasicProperties
        {
            ContentType = original.ContentType,
            ContentEncoding = original.ContentEncoding,
            DeliveryMode = original.DeliveryMode,
            Priority = original.Priority,
            CorrelationId = original.CorrelationId,
            ReplyTo = original.ReplyTo,
            Expiration = original.Expiration,
            MessageId = original.MessageId,
            Timestamp = original.Timestamp,
            Type = original.Type,
            UserId = original.UserId,
            AppId = original.AppId,
            ClusterId = original.ClusterId,
            Headers = headers,
        };
    }
}
