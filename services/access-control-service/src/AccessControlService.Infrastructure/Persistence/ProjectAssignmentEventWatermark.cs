namespace AccessControlService.Infrastructure.Persistence;

/// <summary>
/// Tracks the last-applied event per project-assignment aggregate (idempotency + replay-safety),
/// AND which (<see cref="OwnedProjectId"/>, <see cref="OwnedPersonId"/>) pair that aggregate
/// currently owns.
/// </summary>
/// <remarks>
/// The second piece exists because of spec-1-1d's review loopback finding: a watermark keyed only
/// by <see cref="AggregateId"/> cannot, on its own, catch a stale event from a *superseded*
/// aggregate for a (ProjectId, PersonId) pair now legitimately owned by a different aggregate --
/// each aggregate's own version counter advances independently, so aggregate A's watermark being
/// "behind" tells you nothing about whether aggregate B now owns the same pair. Recording the owned
/// pair directly on the watermark row lets
/// <see cref="AccessControlService.Infrastructure.Messaging.ProjectAssignmentEventProcessor"/> ask
/// "does any *other* aggregate's watermark currently claim this pair?" before ever mutating the
/// <see cref="ProjectAssignment"/> row.
///
/// <see cref="OwnedProjectId"/>/<see cref="OwnedPersonId"/> are both <c>null</c> once this
/// aggregate's most recently applied event was a revoke -- releasing the pair so a later aggregate
/// can legitimately claim it (the "assignment ended, a new one later started under a different
/// aggregate id" scenario the change log calls out), without that later grant being misidentified
/// as a conflict with this now-inactive aggregate.
/// </remarks>
public sealed class ProjectAssignmentEventWatermark
{
    /// <summary>The project-assignment aggregate this watermark tracks. Primary key.</summary>
    public Guid AggregateId { get; set; }

    /// <summary>Version of the last event actually applied for this aggregate.</summary>
    public long LastAppliedVersion { get; set; }

    /// <summary>
    /// Event id of the last event actually applied. Distinguishes an exact-duplicate redelivery
    /// (same <see cref="LastAppliedEventId"/>, no-op) from a genuinely different event whose version
    /// is merely less-than-or-equal (stale/out-of-order, rejected).
    /// </summary>
    public Guid LastAppliedEventId { get; set; }

    /// <summary>
    /// The project id this aggregate currently owns, or <c>null</c> if its last applied event was a
    /// revoke.
    /// </summary>
    public Guid? OwnedProjectId { get; set; }

    /// <summary>
    /// The person id this aggregate currently owns, or <c>null</c> if its last applied event was a
    /// revoke.
    /// </summary>
    public Guid? OwnedPersonId { get; set; }
}
