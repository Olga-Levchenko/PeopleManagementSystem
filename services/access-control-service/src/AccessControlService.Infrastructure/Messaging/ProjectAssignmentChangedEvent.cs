using AccessControlService.Infrastructure.Persistence;

namespace AccessControlService.Infrastructure.Messaging;

/// <summary>
/// Provider-neutral "project-assignment changed" event contract (ADR-001 decision 3;
/// ARCHITECTURE-SPINE AD-11) -- the shape People/Organization's transactional outbox publishes and
/// Epic 14's real timetracker adapter (deferred to <c>spec-1-1e</c>) will produce instances of, once
/// wired to a real broker. Deliberately has no timetracker-specific fields, so this contract stays
/// stable across a future producer swap.
/// </summary>
/// <remarks>
/// This spec (<c>spec-1-1d</c>) only needs an already-deserialized instance of this type handed
/// directly to <see cref="ProjectAssignmentEventProcessor"/> -- there is no RabbitMQ.Client
/// reference anywhere in this service, and no code that produces or consumes a message off a real
/// broker. That wiring is <c>spec-1-1e</c>'s separate, deferred concern.
/// </remarks>
public sealed record ProjectAssignmentChangedEvent
{
    /// <summary>
    /// Unique id of this specific event instance. Re-processing the same <see cref="EventId"/> is a
    /// no-op (idempotency) -- distinct from <see cref="AggregateVersion"/>, which orders events
    /// within one aggregate's lineage.
    /// </summary>
    public required Guid EventId { get; init; }

    /// <summary>
    /// Id of the source aggregate (one project-assignment relationship's lifecycle) this event
    /// belongs to. The watermark tracking replay-safety is keyed by this id.
    /// </summary>
    public required Guid AggregateId { get; init; }

    /// <summary>
    /// Monotonically increasing version of <see cref="AggregateId"/> at the time this event was
    /// produced. An event whose version is less than or equal to the aggregate's last applied
    /// version is stale/out-of-order and must be rejected, never applied.
    /// </summary>
    public required long AggregateVersion { get; init; }

    /// <summary>UTC instant the source event occurred (not when it happens to be processed here).</summary>
    public required DateTime OccurredAtUtc { get; init; }

    /// <summary>
    /// Schema version of this event payload's shape. Validated against the version(s) this
    /// processor understands -- an unrecognized value is rejected, never silently treated as
    /// current.
    /// </summary>
    public required int SchemaVersion { get; init; }

    /// <summary><c>true</c> = grant (upsert the assignment); <c>false</c> = revoke (remove it).</summary>
    public required bool IsGrant { get; init; }

    /// <summary>Opaque project identifier the assignment belongs to.</summary>
    public required Guid ProjectId { get; init; }

    /// <summary>The person the assignment is for.</summary>
    public required Guid PersonId { get; init; }

    /// <summary>The role the person holds on this project assignment.</summary>
    public required ProjectAssignmentRole Role { get; init; }
}
