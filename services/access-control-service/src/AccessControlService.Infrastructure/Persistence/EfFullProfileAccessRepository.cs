using AccessControlService.Domain;
using Microsoft.EntityFrameworkCore;

namespace AccessControlService.Infrastructure.Persistence;

/// <summary>
/// EF Core implementation of <see cref="IFullProfileAccessRepository"/> against this service's
/// own <see cref="AccessControlDbContext"/>. Each write method wraps the grant-row mutation and
/// the journal-entry insert in an explicit EF Core transaction so both succeed or fail together --
/// the journal must never be written without the corresponding grant-row change, and vice versa.
/// </summary>
public sealed class EfFullProfileAccessRepository : IFullProfileAccessRepository
{
    private readonly AccessControlDbContext _dbContext;

    public EfFullProfileAccessRepository(AccessControlDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public Task<bool> IsHolderAsync(Guid personId, CancellationToken cancellationToken = default) =>
        _dbContext.FullProfileAccessGrants
            .AsNoTracking()
            .AnyAsync(g => g.HolderId == personId, cancellationToken);

    public Task<int> GetActiveCountAsync(CancellationToken cancellationToken = default) =>
        _dbContext.FullProfileAccessGrants
            .AsNoTracking()
            .CountAsync(cancellationToken);

    public async Task GrantAsync(Guid actorId, Guid subjectId, CancellationToken cancellationToken = default)
    {
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

        _dbContext.FullProfileAccessGrants.Add(new FullProfileAccessGrant
        {
            Id = Guid.NewGuid(),
            HolderId = subjectId,
            GrantedByActorId = actorId,
            GrantedAtUtc = DateTime.UtcNow,
        });

        _dbContext.FullProfileAccessJournalEntries.Add(new FullProfileAccessJournalEntry
        {
            Id = Guid.NewGuid(),
            ActorId = actorId,
            SubjectId = subjectId,
            Action = FullProfileAccessAction.Grant,
            OccurredAtUtc = DateTime.UtcNow,
        });

        await _dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public async Task RevokeAsync(Guid actorId, Guid subjectId, CancellationToken cancellationToken = default)
    {
        await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);

        var grant = await _dbContext.FullProfileAccessGrants
            .Where(g => g.HolderId == subjectId)
            .FirstOrDefaultAsync(cancellationToken);

        if (grant is not null)
        {
            _dbContext.FullProfileAccessGrants.Remove(grant);
        }

        _dbContext.FullProfileAccessJournalEntries.Add(new FullProfileAccessJournalEntry
        {
            Id = Guid.NewGuid(),
            ActorId = actorId,
            SubjectId = subjectId,
            Action = FullProfileAccessAction.Revoke,
            OccurredAtUtc = DateTime.UtcNow,
        });

        await _dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }
}
