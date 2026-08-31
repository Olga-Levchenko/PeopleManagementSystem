using AccessControlService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace AccessControlService.Infrastructure.Messaging;

/// <summary>
/// The outcome of <see cref="ProjectAssignmentEventProcessor.ProcessAsync"/> for a single event.
/// <see cref="Applied"/>/<see cref="DuplicateIgnored"/>/<see cref="RejectedStale"/> are this spec's
/// original three outcomes (preserved as-is per the spec's Change Log KEEP instructions);
/// <see cref="RejectedInvalid"/> and <see cref="RejectedCrossAggregateConflict"/> were added by the
/// review-loopback amendment -- both are additive, neither replaces an existing value.
/// <see cref="RejectedPersistenceFailure"/> was added by a later patch-level review pass, also
/// additive.
/// </summary>
public enum ProjectAssignmentEventOutcome
{
    /// <summary>The event was valid, not a duplicate, not stale, not conflicting -- grant or revoke was applied and the watermark advanced.</summary>
    Applied,

    /// <summary>The exact same <c>EventId</c> was already applied for this aggregate -- no-op, idempotent.</summary>
    DuplicateIgnored,

    /// <summary>The event's <c>AggregateVersion</c> is less than or equal to the aggregate's last applied version -- rejected, watermark unchanged.</summary>
    RejectedStale,

    /// <summary>The event failed basic validation (empty id, unrecognized schema version, undefined role, non-positive aggregate version, or unknown person) -- rejected before touching the watermark or the assignment table.</summary>
    RejectedInvalid,

    /// <summary>
    /// The (ProjectId, PersonId) pair has an existing <see cref="Persistence.ProjectAssignment"/> row
    /// that this event's own aggregate does not have a watermark establishing ownership of -- either
    /// because a *different* aggregate's watermark claims the pair, or because no watermark exists
    /// for the pair at all (e.g. a row seeded outside the normal event flow). Rejected either way, to
    /// avoid silently overwriting or deleting a row this event's aggregate doesn't provably own.
    /// </summary>
    RejectedCrossAggregateConflict,

    /// <summary>
    /// The event passed all application-level checks, but the database itself rejected the write
    /// (e.g. <c>DbUpdateException</c> from a constraint violation) when <c>SaveChangesAsync</c> was
    /// called -- rejected, logged, no partial state committed.
    /// </summary>
    RejectedPersistenceFailure,
}

/// <summary>
/// Given an already-deserialized <see cref="ProjectAssignmentChangedEvent"/>, decides whether to
/// upsert/remove the corresponding <see cref="ProjectAssignment"/> row and updates the per-aggregate
/// watermark accordingly -- idempotent and replay-safe. Has zero messaging-transport dependency: the
/// only dependencies are <see cref="AccessControlDbContext"/> and <see cref="ILogger{TCategoryName}"/>,
/// so <c>spec-1-1e</c>'s real RabbitMQ consumer can call <see cref="ProcessAsync"/> directly once it
/// exists, without this type changing.
/// </summary>
/// <remarks>
/// Processing order matters: (1) validate the event's own shape (including that
/// <c>PersonId</c> actually exists), (2) check this aggregate's own watermark for an
/// exact-duplicate or stale/out-of-order version, (3) if an existing <see cref="ProjectAssignment"/>
/// row is found for the event's (ProjectId, PersonId) pair, check that this aggregate's own
/// watermark is the one establishing ownership of it -- the cross-aggregate-conflict check
/// spec-1-1d's review loopback added, later broadened to also cover "no watermark exists for the
/// pair at all" -- and only then (4) mutate the <see cref="ProjectAssignment"/> row and this
/// aggregate's watermark, in the same
/// <see cref="AccessControlDbContext.SaveChangesAsync(CancellationToken)"/> call so both stay
/// consistent with each other. A <c>DbUpdateException</c> from that final save is caught and
/// reported as <see cref="ProjectAssignmentEventOutcome.RejectedPersistenceFailure"/> rather than
/// propagating raw to the caller.
/// </remarks>
public sealed class ProjectAssignmentEventProcessor
{
    /// <summary>
    /// The only <c>SchemaVersion</c> this processor currently understands. A future, deliberate
    /// schema evolution extends this (or the validation below) explicitly -- an unrecognized value
    /// is never silently treated as current.
    /// </summary>
    public const int SupportedSchemaVersion = 1;

    private readonly AccessControlDbContext _dbContext;
    private readonly ILogger<ProjectAssignmentEventProcessor> _logger;

    public ProjectAssignmentEventProcessor(
        AccessControlDbContext dbContext,
        ILogger<ProjectAssignmentEventProcessor> logger)
    {
        _dbContext = dbContext;
        _logger = logger;
    }

    public async Task<ProjectAssignmentEventOutcome> ProcessAsync(
        ProjectAssignmentChangedEvent @event,
        CancellationToken cancellationToken = default)
    {
        if (!TryValidate(@event, out var validationError))
        {
            _logger.LogWarning(
                "Rejected invalid project-assignment event {EventId} for aggregate {AggregateId} (occurred at {OccurredAtUtc}): {ValidationError}",
                @event.EventId,
                @event.AggregateId,
                @event.OccurredAtUtc,
                validationError);
            return ProjectAssignmentEventOutcome.RejectedInvalid;
        }

        if (!await _dbContext.People.AnyAsync(p => p.Id == @event.PersonId, cancellationToken))
        {
            _logger.LogWarning(
                "Rejected invalid project-assignment event {EventId} for aggregate {AggregateId} (occurred at {OccurredAtUtc}): PersonId {PersonId} does not exist.",
                @event.EventId,
                @event.AggregateId,
                @event.OccurredAtUtc,
                @event.PersonId);
            return ProjectAssignmentEventOutcome.RejectedInvalid;
        }

        var ownWatermark = await _dbContext.ProjectAssignmentEventWatermarks
            .FirstOrDefaultAsync(w => w.AggregateId == @event.AggregateId, cancellationToken);

        if (ownWatermark is not null)
        {
            if (ownWatermark.LastAppliedEventId == @event.EventId)
            {
                _logger.LogInformation(
                    "Ignored duplicate project-assignment event {EventId} for aggregate {AggregateId} (occurred at {OccurredAtUtc}, already applied at version {LastAppliedVersion}).",
                    @event.EventId,
                    @event.AggregateId,
                    @event.OccurredAtUtc,
                    ownWatermark.LastAppliedVersion);
                return ProjectAssignmentEventOutcome.DuplicateIgnored;
            }

            if (@event.AggregateVersion <= ownWatermark.LastAppliedVersion)
            {
                _logger.LogWarning(
                    "Rejected stale project-assignment event {EventId} for aggregate {AggregateId} (occurred at {OccurredAtUtc}): event version {EventVersion} <= last applied version {LastAppliedVersion}.",
                    @event.EventId,
                    @event.AggregateId,
                    @event.OccurredAtUtc,
                    @event.AggregateVersion,
                    ownWatermark.LastAppliedVersion);
                return ProjectAssignmentEventOutcome.RejectedStale;
            }
        }

        var existingAssignment = await _dbContext.ProjectAssignments
            .FirstOrDefaultAsync(
                pa => pa.ProjectId == @event.ProjectId && pa.PersonId == @event.PersonId,
                cancellationToken);

        if (existingAssignment is not null)
        {
            // Cross-aggregate-conflict check (review-loopback amendment, later broadened): the
            // watermark lookup above only guards against a stale/duplicate event for THIS
            // aggregate. It says nothing about whether the (ProjectId, PersonId) pair's existing
            // row is actually owned by this aggregate. Two distinct scenarios both count as a
            // conflict here and are indistinguishable from the row's point of view: (a) some OTHER
            // aggregate's watermark claims the pair (the pair's aggregate lineage changed under a
            // new aggregate id), or (b) no watermark exists for the pair at all (e.g. a row seeded
            // outside the normal event flow, such as fixture data) -- "no ownership record" is not
            // "unclaimed and safe to overwrite," it is exactly the same risk this check exists to
            // prevent. Reject rather than silently overwrite or delete a row this aggregate cannot
            // prove it owns.
            var ownsThisPair = ownWatermark is not null
                && ownWatermark.OwnedProjectId == @event.ProjectId
                && ownWatermark.OwnedPersonId == @event.PersonId;

            if (!ownsThisPair)
            {
                // Best-effort lookup of whoever *does* own the pair, for diagnostics only -- may
                // legitimately come back null (scenario (b) above), which is itself the conflict.
                var owningWatermark = await _dbContext.ProjectAssignmentEventWatermarks
                    .FirstOrDefaultAsync(
                        w => w.OwnedProjectId == @event.ProjectId && w.OwnedPersonId == @event.PersonId,
                        cancellationToken);

                _logger.LogWarning(
                    "Rejected project-assignment event {EventId} for aggregate {AggregateId} (occurred at {OccurredAtUtc}): pair (ProjectId {ProjectId}, PersonId {PersonId}) has an existing assignment row with no watermark confirming this aggregate owns it (owning aggregate on record: {OwningAggregateId}).",
                    @event.EventId,
                    @event.AggregateId,
                    @event.OccurredAtUtc,
                    @event.ProjectId,
                    @event.PersonId,
                    owningWatermark is null ? "none" : owningWatermark.AggregateId.ToString());
                return ProjectAssignmentEventOutcome.RejectedCrossAggregateConflict;
            }
        }

        if (@event.IsGrant)
        {
            if (existingAssignment is null)
            {
                _dbContext.ProjectAssignments.Add(new ProjectAssignment
                {
                    Id = Guid.NewGuid(),
                    ProjectId = @event.ProjectId,
                    PersonId = @event.PersonId,
                    Role = @event.Role,
                });
            }
            else
            {
                existingAssignment.Role = @event.Role;
            }
        }
        else if (existingAssignment is not null)
        {
            _dbContext.ProjectAssignments.Remove(existingAssignment);
        }
        // else: revoke for a pair with no existing row -- no-op on the assignment table, idempotent
        // (already "not assigned"). The watermark still advances below.

        if (ownWatermark is null)
        {
            ownWatermark = new ProjectAssignmentEventWatermark { AggregateId = @event.AggregateId };
            _dbContext.ProjectAssignmentEventWatermarks.Add(ownWatermark);
        }

        ownWatermark.LastAppliedVersion = @event.AggregateVersion;
        ownWatermark.LastAppliedEventId = @event.EventId;

        // A grant claims the pair; a revoke releases it, so a future aggregate can legitimately
        // claim it later without tripping the conflict check above.
        ownWatermark.OwnedProjectId = @event.IsGrant ? @event.ProjectId : null;
        ownWatermark.OwnedPersonId = @event.IsGrant ? @event.PersonId : null;

        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            // Detach the failed changes so this DbContext instance (which may be reused for a
            // subsequent event, e.g. across ProcessAsync calls sharing a request/test scope) isn't
            // left with a poisoned change tracker after a failed save.
            _dbContext.ChangeTracker.Clear();

            _logger.LogError(
                ex,
                "Rejected project-assignment event {EventId} for aggregate {AggregateId} (occurred at {OccurredAtUtc}): SaveChangesAsync failed for project {ProjectId}, person {PersonId}.",
                @event.EventId,
                @event.AggregateId,
                @event.OccurredAtUtc,
                @event.ProjectId,
                @event.PersonId);
            return ProjectAssignmentEventOutcome.RejectedPersistenceFailure;
        }

        _logger.LogInformation(
            "Applied {Action} project-assignment event {EventId} for aggregate {AggregateId} (occurred at {OccurredAtUtc}): project {ProjectId}, person {PersonId}, role {Role}.",
            @event.IsGrant ? "grant" : "revoke",
            @event.EventId,
            @event.AggregateId,
            @event.OccurredAtUtc,
            @event.ProjectId,
            @event.PersonId,
            @event.Role);

        return ProjectAssignmentEventOutcome.Applied;
    }

    private static bool TryValidate(ProjectAssignmentChangedEvent @event, out string? error)
    {
        if (@event.EventId == Guid.Empty)
        {
            error = "EventId is empty.";
            return false;
        }

        if (@event.AggregateId == Guid.Empty)
        {
            error = "AggregateId is empty.";
            return false;
        }

        if (@event.ProjectId == Guid.Empty)
        {
            error = "ProjectId is empty.";
            return false;
        }

        if (@event.PersonId == Guid.Empty)
        {
            error = "PersonId is empty.";
            return false;
        }

        if (@event.AggregateVersion <= 0)
        {
            error = $"AggregateVersion must be positive (was {@event.AggregateVersion}).";
            return false;
        }

        if (@event.SchemaVersion != SupportedSchemaVersion)
        {
            error = $"Unrecognized SchemaVersion {@event.SchemaVersion} (supported: {SupportedSchemaVersion}).";
            return false;
        }

        if (!Enum.IsDefined(typeof(ProjectAssignmentRole), @event.Role))
        {
            error = $"Undefined Role value {(int)@event.Role}.";
            return false;
        }

        error = null;
        return true;
    }
}
