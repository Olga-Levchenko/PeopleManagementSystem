using AccessControlService.Infrastructure.Messaging;
using AccessControlService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Testcontainers.PostgreSql;

namespace AccessControlService.Infrastructure.Tests.Messaging;

/// <summary>
/// Proves <see cref="ProjectAssignmentEventProcessor"/> -- the pure, transport-agnostic decision
/// logic spec-1-1d exists to add -- against a real, ephemeral Postgres instance with the actual EF
/// Core migration applied, mirroring <c>EfRelationshipRepositoryTests</c>' pattern. Covers every
/// scenario in the spec's I/O matrix plus every acceptance criterion added by the review-loopback
/// amendment: the cross-aggregate-conflict check, the equal-version/different-event-id case, and
/// the SchemaVersion/Role/empty-id validation checks.
/// </summary>
public sealed class ProjectAssignmentEventProcessorTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("access_control_service_test")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();

    private AccessControlDbContext _dbContext = null!;
    private ProjectAssignmentEventProcessor _processor = null!;

    public async Task InitializeAsync()
    {
        await _postgresContainer.StartAsync();

        var options = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(_postgresContainer.GetConnectionString())
            .Options;

        _dbContext = new AccessControlDbContext(options);
        await _dbContext.Database.MigrateAsync();

        _processor = new ProjectAssignmentEventProcessor(
            _dbContext,
            NullLogger<ProjectAssignmentEventProcessor>.Instance);
    }

    public async Task DisposeAsync()
    {
        await _dbContext.DisposeAsync();
        await _postgresContainer.DisposeAsync();
    }

    private static ProjectAssignmentChangedEvent MakeEvent(
        Guid aggregateId,
        long aggregateVersion,
        bool isGrant,
        Guid projectId,
        Guid personId,
        ProjectAssignmentRole role = ProjectAssignmentRole.Member,
        Guid? eventId = null,
        int schemaVersion = ProjectAssignmentEventProcessor.SupportedSchemaVersion)
    {
        return new ProjectAssignmentChangedEvent
        {
            EventId = eventId ?? Guid.NewGuid(),
            AggregateId = aggregateId,
            AggregateVersion = aggregateVersion,
            OccurredAtUtc = DateTime.UtcNow,
            SchemaVersion = schemaVersion,
            IsGrant = isGrant,
            ProjectId = projectId,
            PersonId = personId,
            Role = role,
        };
    }

    // -- I/O matrix: grant event, new assignment --

    [Fact]
    public async Task ProcessAsync_GrantEventNewAssignment_InsertsProjectAssignmentRowAndReturnsApplied()
    {
        var aggregateId = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        // PersonId is FK-constrained to a real seeded Person row -- reuse a fixture person with no
        // existing project assignment. Each test method gets its own ephemeral container (per
        // IAsyncLifetime lifecycle), so reusing the same fixture person id across test methods is
        // safe -- there is no shared state between them.
        var personId = FixtureSeedData.ExecutiveId;
        var @event = MakeEvent(aggregateId, aggregateVersion: 1, isGrant: true, projectId, personId, ProjectAssignmentRole.DeliveryManager);

        var outcome = await _processor.ProcessAsync(@event);

        Assert.Equal(ProjectAssignmentEventOutcome.Applied, outcome);

        var row = await _dbContext.ProjectAssignments
            .SingleAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId);
        Assert.Equal(ProjectAssignmentRole.DeliveryManager, row.Role);

        var watermark = await _dbContext.ProjectAssignmentEventWatermarks.SingleAsync(w => w.AggregateId == aggregateId);
        Assert.Equal(1, watermark.LastAppliedVersion);
        Assert.Equal(@event.EventId, watermark.LastAppliedEventId);
        Assert.Equal(projectId, watermark.OwnedProjectId);
        Assert.Equal(personId, watermark.OwnedPersonId);
    }

    // -- I/O matrix: revoke event, existing assignment --

    [Fact]
    public async Task ProcessAsync_RevokeEventExistingAssignment_RemovesRowAndReleasesOwnership()
    {
        var aggregateId = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;

        var grantOutcome = await _processor.ProcessAsync(
            MakeEvent(aggregateId, aggregateVersion: 1, isGrant: true, projectId, personId));
        Assert.Equal(ProjectAssignmentEventOutcome.Applied, grantOutcome);

        var revokeOutcome = await _processor.ProcessAsync(
            MakeEvent(aggregateId, aggregateVersion: 2, isGrant: false, projectId, personId));

        Assert.Equal(ProjectAssignmentEventOutcome.Applied, revokeOutcome);
        Assert.False(await _dbContext.ProjectAssignments.AnyAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId));

        var watermark = await _dbContext.ProjectAssignmentEventWatermarks.SingleAsync(w => w.AggregateId == aggregateId);
        Assert.Equal(2, watermark.LastAppliedVersion);
        Assert.Null(watermark.OwnedProjectId);
        Assert.Null(watermark.OwnedPersonId);
    }

    // -- I/O matrix: duplicate event id --

    [Fact]
    public async Task ProcessAsync_DuplicateEventId_SecondProcessingIsNoOp()
    {
        var aggregateId = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;
        var @event = MakeEvent(aggregateId, aggregateVersion: 1, isGrant: true, projectId, personId, ProjectAssignmentRole.ProjectManager);

        var firstOutcome = await _processor.ProcessAsync(@event);
        Assert.Equal(ProjectAssignmentEventOutcome.Applied, firstOutcome);

        var secondOutcome = await _processor.ProcessAsync(@event);
        Assert.Equal(ProjectAssignmentEventOutcome.DuplicateIgnored, secondOutcome);

        var row = await _dbContext.ProjectAssignments.SingleAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId);
        Assert.Equal(ProjectAssignmentRole.ProjectManager, row.Role);

        var watermark = await _dbContext.ProjectAssignmentEventWatermarks.SingleAsync(w => w.AggregateId == aggregateId);
        Assert.Equal(1, watermark.LastAppliedVersion);
        Assert.Equal(@event.EventId, watermark.LastAppliedEventId);
    }

    // -- I/O matrix: stale/out-of-order event --

    [Fact]
    public async Task ProcessAsync_StaleEventOlderVersion_RejectedAndWatermarkUnchanged()
    {
        var aggregateId = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;

        var latestOutcome = await _processor.ProcessAsync(
            MakeEvent(aggregateId, aggregateVersion: 5, isGrant: true, projectId, personId, ProjectAssignmentRole.DeliveryManager));
        Assert.Equal(ProjectAssignmentEventOutcome.Applied, latestOutcome);

        var staleOutcome = await _processor.ProcessAsync(
            MakeEvent(aggregateId, aggregateVersion: 3, isGrant: true, projectId, personId, ProjectAssignmentRole.Member));

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedStale, staleOutcome);

        var row = await _dbContext.ProjectAssignments.SingleAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId);
        Assert.Equal(ProjectAssignmentRole.DeliveryManager, row.Role);

        var watermark = await _dbContext.ProjectAssignmentEventWatermarks.SingleAsync(w => w.AggregateId == aggregateId);
        Assert.Equal(5, watermark.LastAppliedVersion);
    }

    // -- I/O matrix: revoke for a non-existent assignment --

    [Fact]
    public async Task ProcessAsync_RevokeEventNonExistentAssignment_NoOpButApplied()
    {
        var aggregateId = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;

        var outcome = await _processor.ProcessAsync(
            MakeEvent(aggregateId, aggregateVersion: 1, isGrant: false, projectId, personId));

        Assert.Equal(ProjectAssignmentEventOutcome.Applied, outcome);
        Assert.False(await _dbContext.ProjectAssignments.AnyAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId));

        var watermark = await _dbContext.ProjectAssignmentEventWatermarks.SingleAsync(w => w.AggregateId == aggregateId);
        Assert.Equal(1, watermark.LastAppliedVersion);
        Assert.Null(watermark.OwnedProjectId);
        Assert.Null(watermark.OwnedPersonId);
    }

    // -- Amendment: equal-version event with a different event id is handled per the <= comparison --

    [Fact]
    public async Task ProcessAsync_EqualVersionDifferentEventId_RejectedAsStaleNotDuplicate()
    {
        var aggregateId = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;

        var firstEvent = MakeEvent(aggregateId, aggregateVersion: 4, isGrant: true, projectId, personId, ProjectAssignmentRole.DeliveryManager);
        var firstOutcome = await _processor.ProcessAsync(firstEvent);
        Assert.Equal(ProjectAssignmentEventOutcome.Applied, firstOutcome);

        // Same version, but a genuinely different event id -- must be rejected as stale (the
        // documented <= comparison), not mistaken for the exact-duplicate case.
        var secondEvent = MakeEvent(aggregateId, aggregateVersion: 4, isGrant: true, projectId, personId, ProjectAssignmentRole.Member);
        var secondOutcome = await _processor.ProcessAsync(secondEvent);

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedStale, secondOutcome);

        var watermark = await _dbContext.ProjectAssignmentEventWatermarks.SingleAsync(w => w.AggregateId == aggregateId);
        Assert.Equal(firstEvent.EventId, watermark.LastAppliedEventId);

        var row = await _dbContext.ProjectAssignments.SingleAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId);
        Assert.Equal(ProjectAssignmentRole.DeliveryManager, row.Role);
    }

    // -- Amendment: cross-aggregate conflict -- the most important addition --

    [Fact]
    public async Task ProcessAsync_CrossAggregateConflict_GrantFromDifferentAggregate_RejectedWithoutOverwritingOwner()
    {
        var ownerAggregateId = Guid.NewGuid();
        var challengerAggregateId = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;

        var ownerOutcome = await _processor.ProcessAsync(
            MakeEvent(ownerAggregateId, aggregateVersion: 1, isGrant: true, projectId, personId, ProjectAssignmentRole.DeliveryManager));
        Assert.Equal(ProjectAssignmentEventOutcome.Applied, ownerOutcome);

        // A different aggregate, starting its own version count from 1, tries to claim the same
        // (ProjectId, PersonId) pair. The per-aggregate watermark alone would not catch this (the
        // challenger has no watermark yet, so nothing looks "stale" from its own point of view) --
        // only the cross-aggregate ownership check does.
        var challengerOutcome = await _processor.ProcessAsync(
            MakeEvent(challengerAggregateId, aggregateVersion: 1, isGrant: true, projectId, personId, ProjectAssignmentRole.ProjectManager));

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedCrossAggregateConflict, challengerOutcome);

        var row = await _dbContext.ProjectAssignments.SingleAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId);
        Assert.Equal(ProjectAssignmentRole.DeliveryManager, row.Role);

        Assert.False(await _dbContext.ProjectAssignmentEventWatermarks.AnyAsync(w => w.AggregateId == challengerAggregateId));
    }

    [Fact]
    public async Task ProcessAsync_CrossAggregateConflict_RevokeFromDifferentAggregate_RejectedWithoutDeletingOwnersRow()
    {
        var ownerAggregateId = Guid.NewGuid();
        var challengerAggregateId = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;

        await _processor.ProcessAsync(
            MakeEvent(ownerAggregateId, aggregateVersion: 1, isGrant: true, projectId, personId, ProjectAssignmentRole.DeliveryManager));

        // A different aggregate attempts to revoke a pair it does not own -- also a conflict, not a
        // legitimate revoke, and must not delete the owner's row.
        var challengerOutcome = await _processor.ProcessAsync(
            MakeEvent(challengerAggregateId, aggregateVersion: 1, isGrant: false, projectId, personId));

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedCrossAggregateConflict, challengerOutcome);
        Assert.True(await _dbContext.ProjectAssignments.AnyAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId));
    }

    [Fact]
    public async Task ProcessAsync_AfterRevokeReleasesOwnership_DifferentAggregateCanLaterGrantSamePairWithoutConflict()
    {
        var firstAggregateId = Guid.NewGuid();
        var secondAggregateId = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;

        // First aggregate's assignment lifecycle: granted, then revoked (ended).
        await _processor.ProcessAsync(
            MakeEvent(firstAggregateId, aggregateVersion: 1, isGrant: true, projectId, personId, ProjectAssignmentRole.Member));
        await _processor.ProcessAsync(
            MakeEvent(firstAggregateId, aggregateVersion: 2, isGrant: false, projectId, personId));

        // A new assignment for the same (ProjectId, PersonId) pair later starts under a different
        // aggregate id -- must be treated as legitimate, not as a conflict with the now-inactive
        // first aggregate.
        var secondOutcome = await _processor.ProcessAsync(
            MakeEvent(secondAggregateId, aggregateVersion: 1, isGrant: true, projectId, personId, ProjectAssignmentRole.ProjectManager));

        Assert.Equal(ProjectAssignmentEventOutcome.Applied, secondOutcome);

        var row = await _dbContext.ProjectAssignments.SingleAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId);
        Assert.Equal(ProjectAssignmentRole.ProjectManager, row.Role);

        var secondWatermark = await _dbContext.ProjectAssignmentEventWatermarks.SingleAsync(w => w.AggregateId == secondAggregateId);
        Assert.Equal(projectId, secondWatermark.OwnedProjectId);
        Assert.Equal(personId, secondWatermark.OwnedPersonId);
    }

    // -- Amendment: SchemaVersion validation --

    [Fact]
    public async Task ProcessAsync_UnrecognizedSchemaVersion_RejectedAndNotApplied()
    {
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;
        var @event = MakeEvent(
            Guid.NewGuid(), aggregateVersion: 1, isGrant: true, projectId, personId,
            schemaVersion: ProjectAssignmentEventProcessor.SupportedSchemaVersion + 99);

        var outcome = await _processor.ProcessAsync(@event);

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedInvalid, outcome);
        Assert.False(await _dbContext.ProjectAssignments.AnyAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId));
        Assert.False(await _dbContext.ProjectAssignmentEventWatermarks.AnyAsync(w => w.AggregateId == @event.AggregateId));
    }

    // -- Amendment: undefined Role validation --

    [Fact]
    public async Task ProcessAsync_UndefinedRole_RejectedAndNotApplied()
    {
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;
        var @event = MakeEvent(
            Guid.NewGuid(), aggregateVersion: 1, isGrant: true, projectId, personId,
            role: (ProjectAssignmentRole)999);

        var outcome = await _processor.ProcessAsync(@event);

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedInvalid, outcome);
        Assert.False(await _dbContext.ProjectAssignments.AnyAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId));
    }

    // -- Amendment: empty EventId/AggregateId/ProjectId/PersonId validation --

    [Fact]
    public async Task ProcessAsync_EmptyEventId_RejectedAndNotApplied()
    {
        var @event = MakeEvent(Guid.NewGuid(), aggregateVersion: 1, isGrant: true, Guid.NewGuid(), Guid.NewGuid(), eventId: Guid.Empty);

        var outcome = await _processor.ProcessAsync(@event);

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedInvalid, outcome);
    }

    [Fact]
    public async Task ProcessAsync_EmptyAggregateId_RejectedAndNotApplied()
    {
        var @event = MakeEvent(Guid.Empty, aggregateVersion: 1, isGrant: true, Guid.NewGuid(), Guid.NewGuid());

        var outcome = await _processor.ProcessAsync(@event);

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedInvalid, outcome);
    }

    [Fact]
    public async Task ProcessAsync_EmptyProjectId_RejectedAndNotApplied()
    {
        var @event = MakeEvent(Guid.NewGuid(), aggregateVersion: 1, isGrant: true, Guid.Empty, Guid.NewGuid());

        var outcome = await _processor.ProcessAsync(@event);

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedInvalid, outcome);
    }

    [Fact]
    public async Task ProcessAsync_EmptyPersonId_RejectedAndNotApplied()
    {
        var @event = MakeEvent(Guid.NewGuid(), aggregateVersion: 1, isGrant: true, Guid.NewGuid(), Guid.Empty);

        var outcome = await _processor.ProcessAsync(@event);

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedInvalid, outcome);
    }

    // -- Patch: AggregateVersion must be positive --

    [Fact]
    public async Task ProcessAsync_NonPositiveAggregateVersion_RejectedAndNotApplied()
    {
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;
        var @event = MakeEvent(Guid.NewGuid(), aggregateVersion: 0, isGrant: true, projectId, personId);

        var outcome = await _processor.ProcessAsync(@event);

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedInvalid, outcome);
        Assert.False(await _dbContext.ProjectAssignments.AnyAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId));
        Assert.False(await _dbContext.ProjectAssignmentEventWatermarks.AnyAsync(w => w.AggregateId == @event.AggregateId));
    }

    [Fact]
    public async Task ProcessAsync_NegativeAggregateVersion_RejectedAndNotApplied()
    {
        var @event = MakeEvent(Guid.NewGuid(), aggregateVersion: -1, isGrant: true, Guid.NewGuid(), FixtureSeedData.ExecutiveId);

        var outcome = await _processor.ProcessAsync(@event);

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedInvalid, outcome);
    }

    // -- Patch: PersonId must exist in the People table --

    [Fact]
    public async Task ProcessAsync_NonExistentPersonId_RejectedAndNotApplied()
    {
        var nonExistentPersonId = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        var @event = MakeEvent(Guid.NewGuid(), aggregateVersion: 1, isGrant: true, projectId, nonExistentPersonId);

        var outcome = await _processor.ProcessAsync(@event);

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedInvalid, outcome);
        Assert.False(await _dbContext.ProjectAssignments.AnyAsync(pa => pa.ProjectId == projectId && pa.PersonId == nonExistentPersonId));
        Assert.False(await _dbContext.ProjectAssignmentEventWatermarks.AnyAsync(w => w.AggregateId == @event.AggregateId));
    }

    // -- Patch: valid re-grant by the SAME aggregate upserts the role in place, no duplicate row --

    [Fact]
    public async Task ProcessAsync_ReGrantBySameAggregate_UpdatesRoleInPlaceWithNoDuplicateRow()
    {
        var aggregateId = Guid.NewGuid();
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;

        var firstOutcome = await _processor.ProcessAsync(
            MakeEvent(aggregateId, aggregateVersion: 1, isGrant: true, projectId, personId, ProjectAssignmentRole.Member));
        Assert.Equal(ProjectAssignmentEventOutcome.Applied, firstOutcome);

        var secondOutcome = await _processor.ProcessAsync(
            MakeEvent(aggregateId, aggregateVersion: 2, isGrant: true, projectId, personId, ProjectAssignmentRole.DeliveryManager));

        Assert.Equal(ProjectAssignmentEventOutcome.Applied, secondOutcome);

        var rows = await _dbContext.ProjectAssignments
            .Where(pa => pa.ProjectId == projectId && pa.PersonId == personId)
            .ToListAsync();
        var row = Assert.Single(rows);
        Assert.Equal(ProjectAssignmentRole.DeliveryManager, row.Role);

        var watermark = await _dbContext.ProjectAssignmentEventWatermarks.SingleAsync(w => w.AggregateId == aggregateId);
        Assert.Equal(2, watermark.LastAppliedVersion);
    }

    // -- Patch: broadened cross-aggregate conflict -- an existing row with NO watermark at all
    //    (e.g. fixture-seeded data, mirroring FixtureSeedData.ProjectAssignments which seeds rows
    //    with zero corresponding watermark rows) must be treated as a conflict, not as "unclaimed
    //    and safe to overwrite." This is the most important scenario in this patch set.

    [Fact]
    public async Task ProcessAsync_ExistingRowWithNoWatermarkAtAll_RejectedAsCrossAggregateConflictAndRowUntouched()
    {
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;

        // Seed a ProjectAssignment row directly, bypassing the processor entirely -- mirroring how
        // FixtureSeedData/the EF Core migration's HasData seeds rows with no corresponding
        // watermark row. Confirmed no watermark exists for this pair.
        var preExistingRow = new ProjectAssignment
        {
            Id = Guid.NewGuid(),
            ProjectId = projectId,
            PersonId = personId,
            Role = ProjectAssignmentRole.ProjectManager,
        };
        _dbContext.ProjectAssignments.Add(preExistingRow);
        await _dbContext.SaveChangesAsync();

        Assert.False(await _dbContext.ProjectAssignmentEventWatermarks
            .AnyAsync(w => w.OwnedProjectId == projectId && w.OwnedPersonId == personId));

        // A fresh aggregate (no watermark of its own either) sends a grant event for the same
        // (ProjectId, PersonId) pair.
        var challengerAggregateId = Guid.NewGuid();
        var outcome = await _processor.ProcessAsync(
            MakeEvent(challengerAggregateId, aggregateVersion: 1, isGrant: true, projectId, personId, ProjectAssignmentRole.DeliveryManager));

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedCrossAggregateConflict, outcome);

        // The pre-existing row must be completely untouched -- same id, same role.
        var row = await _dbContext.ProjectAssignments.SingleAsync(pa => pa.ProjectId == projectId && pa.PersonId == personId);
        Assert.Equal(preExistingRow.Id, row.Id);
        Assert.Equal(ProjectAssignmentRole.ProjectManager, row.Role);

        // No watermark was created for the challenger -- the rejection happened before any mutation.
        Assert.False(await _dbContext.ProjectAssignmentEventWatermarks.AnyAsync(w => w.AggregateId == challengerAggregateId));
    }

    // -- Patch: the unique filtered index on (OwnedProjectId, OwnedPersonId) is a real DB-level
    //    constraint, independent of the processor's own application-level conflict check.

    [Fact]
    public async Task UniqueOwnedPairIndex_TwoWatermarksClaimingSamePair_SaveChangesThrowsDbUpdateException()
    {
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;

        _dbContext.ProjectAssignmentEventWatermarks.Add(new ProjectAssignmentEventWatermark
        {
            AggregateId = Guid.NewGuid(),
            LastAppliedVersion = 1,
            LastAppliedEventId = Guid.NewGuid(),
            OwnedProjectId = projectId,
            OwnedPersonId = personId,
        });
        await _dbContext.SaveChangesAsync();

        _dbContext.ProjectAssignmentEventWatermarks.Add(new ProjectAssignmentEventWatermark
        {
            AggregateId = Guid.NewGuid(),
            LastAppliedVersion = 1,
            LastAppliedEventId = Guid.NewGuid(),
            OwnedProjectId = projectId,
            OwnedPersonId = personId,
        });

        await Assert.ThrowsAsync<DbUpdateException>(() => _dbContext.SaveChangesAsync());
    }

    // -- Review (chunk 4/5, PR #14): drive a real DbUpdateException through ProcessAsync itself,
    //    not via a raw SaveChangesAsync call bypassing the processor -- proves the
    //    RejectedPersistenceFailure catch block's ChangeTracker.Clear() recovery actually leaves
    //    the DbContext instance reusable for a subsequent call, which
    //    UniqueOwnedPairIndex_TwoWatermarksClaimingSamePair_... above never exercises (it calls
    //    SaveChangesAsync directly).

    [Fact]
    public async Task ProcessAsync_DbUpdateExceptionFromUnderlyingConstraint_ReturnsRejectedPersistenceFailureAndContextRemainsUsable()
    {
        var projectId = Guid.NewGuid();
        var personId = FixtureSeedData.ExecutiveId;

        // Seed a watermark for aggregate A that already claims (projectId, personId) -- but
        // deliberately with NO corresponding ProjectAssignment row (an orphaned-ownership state).
        // This matters because ProcessAsync's own cross-aggregate-conflict check is keyed off an
        // *existing ProjectAssignment row* (`existingAssignment is not null`) -- with no row
        // present, that check is skipped entirely, so aggregate B's grant below sails past the
        // application-level guard and only the database's own unique filtered index on
        // (OwnedProjectId, OwnedPersonId) catches the conflict, inside ProcessAsync's own
        // SaveChangesAsync call.
        var aggregateA = Guid.NewGuid();
        _dbContext.ProjectAssignmentEventWatermarks.Add(new ProjectAssignmentEventWatermark
        {
            AggregateId = aggregateA,
            LastAppliedVersion = 1,
            LastAppliedEventId = Guid.NewGuid(),
            OwnedProjectId = projectId,
            OwnedPersonId = personId,
        });
        await _dbContext.SaveChangesAsync();

        var aggregateB = Guid.NewGuid();
        var outcome = await _processor.ProcessAsync(
            MakeEvent(aggregateB, aggregateVersion: 1, isGrant: true, projectId, personId));

        Assert.Equal(ProjectAssignmentEventOutcome.RejectedPersistenceFailure, outcome);

        // Aggregate B's own watermark write must not have persisted -- SaveChangesAsync failed
        // atomically, and ChangeTracker.Clear() discarded the failed in-memory changes rather than
        // leaving them half-applied.
        Assert.False(await _dbContext.ProjectAssignmentEventWatermarks.AnyAsync(w => w.AggregateId == aggregateB));

        // The DbContext instance (and the same processor built on top of it) must remain usable for
        // a subsequent, unrelated event -- proving ChangeTracker.Clear() actually left the tracker
        // clean, not just that the failing call itself returned the right outcome.
        var followUpOutcome = await _processor.ProcessAsync(
            MakeEvent(Guid.NewGuid(), aggregateVersion: 1, isGrant: true, Guid.NewGuid(), FixtureSeedData.DirectorId));

        Assert.Equal(ProjectAssignmentEventOutcome.Applied, followUpOutcome);
    }

    // -- Review (chunk 4/5, PR #14): every existing cross-aggregate test exercises a *conflicting*
    //    claim to the same pair; none prove the ordinary multi-assignment case works cleanly.

    [Fact]
    public async Task ProcessAsync_OnePersonTwoNonConflictingProjectsViaTwoAggregates_BothApplyCleanly()
    {
        var personId = FixtureSeedData.ExecutiveId;
        var firstProjectId = Guid.NewGuid();
        var secondProjectId = Guid.NewGuid();
        var firstAggregateId = Guid.NewGuid();
        var secondAggregateId = Guid.NewGuid();

        var firstOutcome = await _processor.ProcessAsync(
            MakeEvent(firstAggregateId, aggregateVersion: 1, isGrant: true, firstProjectId, personId, ProjectAssignmentRole.DeliveryManager));
        var secondOutcome = await _processor.ProcessAsync(
            MakeEvent(secondAggregateId, aggregateVersion: 1, isGrant: true, secondProjectId, personId, ProjectAssignmentRole.ProjectManager));

        Assert.Equal(ProjectAssignmentEventOutcome.Applied, firstOutcome);
        Assert.Equal(ProjectAssignmentEventOutcome.Applied, secondOutcome);

        var rows = await _dbContext.ProjectAssignments
            .Where(pa => pa.PersonId == personId && (pa.ProjectId == firstProjectId || pa.ProjectId == secondProjectId))
            .ToListAsync();
        Assert.Equal(2, rows.Count);
        Assert.Contains(rows, r => r.ProjectId == firstProjectId && r.Role == ProjectAssignmentRole.DeliveryManager);
        Assert.Contains(rows, r => r.ProjectId == secondProjectId && r.Role == ProjectAssignmentRole.ProjectManager);

        var firstWatermark = await _dbContext.ProjectAssignmentEventWatermarks.SingleAsync(w => w.AggregateId == firstAggregateId);
        var secondWatermark = await _dbContext.ProjectAssignmentEventWatermarks.SingleAsync(w => w.AggregateId == secondAggregateId);
        Assert.Equal(firstProjectId, firstWatermark.OwnedProjectId);
        Assert.Equal(secondProjectId, secondWatermark.OwnedProjectId);
    }
}

/// <summary>
/// Verifies the "zero messaging-transport dependency" acceptance criterion by inspecting the
/// processor's actual constructor -- separated from the Testcontainers-backed class above so this
/// cheap, DB-free check doesn't pay for spinning up a Postgres container.
/// </summary>
public sealed class ProjectAssignmentEventProcessorSignatureTests
{
    [Fact]
    public void Constructor_DependsOnlyOnDbContextAndLogger()
    {
        var constructors = typeof(ProjectAssignmentEventProcessor).GetConstructors();
        var constructor = Assert.Single(constructors);

        var parameterTypes = constructor.GetParameters().Select(p => p.ParameterType).ToArray();

        Assert.Equal(
            new[]
            {
                typeof(AccessControlDbContext),
                typeof(Microsoft.Extensions.Logging.ILogger<ProjectAssignmentEventProcessor>),
            },
            parameterTypes);
    }
}
