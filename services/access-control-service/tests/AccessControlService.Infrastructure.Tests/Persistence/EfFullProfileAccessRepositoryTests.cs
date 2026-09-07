using AccessControlService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;

namespace AccessControlService.Infrastructure.Tests.Persistence;

/// <summary>
/// Proves <see cref="EfFullProfileAccessRepository"/> -- the only production implementation of
/// <see cref="AccessControlService.Domain.IFullProfileAccessRepository"/> -- against a real,
/// ephemeral Postgres instance with the actual EF Core migration applied. Same Testcontainers
/// pattern as <see cref="EfRelationshipRepositoryTests"/>.
/// </summary>
public sealed class EfFullProfileAccessRepositoryTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgresContainer = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("access_control_service_test")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();

    private AccessControlDbContext _dbContext = null!;
    private EfFullProfileAccessRepository _repository = null!;

    public async Task InitializeAsync()
    {
        await _postgresContainer.StartAsync();

        var options = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(_postgresContainer.GetConnectionString())
            .Options;

        _dbContext = new AccessControlDbContext(options);
        await _dbContext.Database.MigrateAsync();

        _repository = new EfFullProfileAccessRepository(_dbContext);
    }

    public async Task DisposeAsync()
    {
        await _dbContext.DisposeAsync();
        await _postgresContainer.DisposeAsync();
    }

    // -- IsHolderAsync --

    [Fact]
    public async Task IsHolderAsync_BootstrapSeedHolder_ReturnsTrue()
    {
        // PlatformLeadId is seeded as the bootstrap holder by the AddFullProfileAccess migration.
        var result = await _repository.IsHolderAsync(FixtureSeedData.PlatformLeadId);

        Assert.True(result);
    }

    [Fact]
    public async Task IsHolderAsync_NonHolder_ReturnsFalse()
    {
        var result = await _repository.IsHolderAsync(FixtureSeedData.EngineerId);

        Assert.False(result);
    }

    [Fact]
    public async Task IsHolderAsync_UnknownPersonId_ReturnsFalse()
    {
        var result = await _repository.IsHolderAsync(Guid.NewGuid());

        Assert.False(result);
    }

    // -- GetActiveCountAsync --

    [Fact]
    public async Task GetActiveCountAsync_AfterMigration_ReturnsOne()
    {
        // Only the bootstrap seed row exists after a fresh migration.
        var count = await _repository.GetActiveCountAsync();

        Assert.Equal(1, count);
    }

    // -- GrantAsync --

    [Fact]
    public async Task GrantAsync_NewSubject_CreatesGrantRowAndJournalEntry()
    {
        var actorId = FixtureSeedData.PlatformLeadId;
        var subjectId = FixtureSeedData.EngineerId;

        await _repository.GrantAsync(actorId, subjectId);

        // Grant row exists for the subject.
        Assert.True(await _repository.IsHolderAsync(subjectId));

        // Journal entry was written atomically.
        var journalEntry = await _dbContext.FullProfileAccessJournalEntries
            .Where(e => e.ActorId == actorId && e.SubjectId == subjectId && e.Action == FullProfileAccessAction.Grant)
            .SingleOrDefaultAsync();
        Assert.NotNull(journalEntry);
    }

    [Fact]
    public async Task GrantAsync_NewSubject_IncreasesActiveCount()
    {
        var countBefore = await _repository.GetActiveCountAsync();

        await _repository.GrantAsync(FixtureSeedData.PlatformLeadId, FixtureSeedData.EngineerId);

        var countAfter = await _repository.GetActiveCountAsync();
        Assert.Equal(countBefore + 1, countAfter);
    }

    // -- RevokeAsync --

    [Fact]
    public async Task RevokeAsync_ExistingHolder_RemovesGrantRowAndWritesJournalEntry()
    {
        // First grant the subject so there is something to revoke.
        await _repository.GrantAsync(FixtureSeedData.PlatformLeadId, FixtureSeedData.EngineerId);
        Assert.True(await _repository.IsHolderAsync(FixtureSeedData.EngineerId));

        await _repository.RevokeAsync(FixtureSeedData.PlatformLeadId, FixtureSeedData.EngineerId);

        // Grant row removed.
        Assert.False(await _repository.IsHolderAsync(FixtureSeedData.EngineerId));

        // Journal entry was written atomically.
        var journalEntry = await _dbContext.FullProfileAccessJournalEntries
            .Where(e =>
                e.ActorId == FixtureSeedData.PlatformLeadId
                && e.SubjectId == FixtureSeedData.EngineerId
                && e.Action == FullProfileAccessAction.Revoke)
            .SingleOrDefaultAsync();
        Assert.NotNull(journalEntry);
    }

    [Fact]
    public async Task RevokeAsync_ExistingHolder_DecreasesActiveCount()
    {
        await _repository.GrantAsync(FixtureSeedData.PlatformLeadId, FixtureSeedData.EngineerId);
        var countBefore = await _repository.GetActiveCountAsync();

        await _repository.RevokeAsync(FixtureSeedData.PlatformLeadId, FixtureSeedData.EngineerId);

        var countAfter = await _repository.GetActiveCountAsync();
        Assert.Equal(countBefore - 1, countAfter);
    }

    [Fact]
    public async Task RevokeAsync_SubjectIsNotHolder_EarlyReturnsWithoutWritingJournalEntry()
    {
        // The controller's subject-is-holder guard is the primary defence, but RevokeAsync has its
        // own early-return guard to ensure the journal is never written without a corresponding
        // grant-row removal -- verified here directly at the repository layer.
        var count = await _repository.GetActiveCountAsync();

        // EngineerId has no grant row (only PlatformLeadId is seeded). Call RevokeAsync directly,
        // bypassing the controller's subject-is-holder check.
        await _repository.RevokeAsync(FixtureSeedData.PlatformLeadId, FixtureSeedData.EngineerId);

        // Count unchanged -- no grant row was removed.
        Assert.Equal(count, await _repository.GetActiveCountAsync());

        // No journal entry written for a no-op revoke.
        var journalEntry = await _dbContext.FullProfileAccessJournalEntries
            .Where(e => e.SubjectId == FixtureSeedData.EngineerId && e.Action == FullProfileAccessAction.Revoke)
            .FirstOrDefaultAsync();
        Assert.Null(journalEntry);
    }

    [Fact]
    public async Task GrantAsync_DuplicateHolder_SaveChangesThrowsOnUniqueConstraintViolation()
    {
        // PlatformLeadId is already a holder from the bootstrap seed -- a second grant for the
        // same person must fail with a unique-constraint violation, not silently succeed.
        await Assert.ThrowsAsync<DbUpdateException>(() =>
            _repository.GrantAsync(FixtureSeedData.PlatformLeadId, FixtureSeedData.PlatformLeadId));
    }
}
