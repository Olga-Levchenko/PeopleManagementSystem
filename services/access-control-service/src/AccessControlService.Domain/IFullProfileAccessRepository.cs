namespace AccessControlService.Domain;

/// <summary>
/// Read/write operations for the Full-profile-access grant store. Every write method
/// (<see cref="GrantAsync"/> / <see cref="RevokeAsync"/>) is atomic: the grant-row mutation and
/// the <see cref="FullProfileAccessJournalEntry"/> write are a single database transaction, never
/// two independent operations. Callers must enforce all business rules (non-holder guard,
/// self-grant guard, last-holder guard) before calling these methods.
/// </summary>
public interface IFullProfileAccessRepository
{
    /// <summary>
    /// Returns <c>true</c> when <paramref name="personId"/> currently holds an active
    /// Full-profile-access grant; <c>false</c> otherwise (no grant row, or unknown person).
    /// </summary>
    Task<bool> IsHolderAsync(Guid personId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Returns the current count of active Full-profile-access grant rows. Used at startup
    /// (zero-holder fail-fast check) and in the last-holder guard on revoke.
    /// </summary>
    Task<int> GetActiveCountAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Grants Full-profile-access to <paramref name="subjectId"/>, recording a
    /// <see cref="FullProfileAccessJournalEntry"/> in the same transaction. Callers must verify
    /// the actor is an existing holder and that <paramref name="subjectId"/> != actor before
    /// calling.
    /// </summary>
    Task GrantAsync(Guid actorId, Guid subjectId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Revokes Full-profile-access from <paramref name="subjectId"/>, recording a
    /// <see cref="FullProfileAccessJournalEntry"/> in the same transaction. Callers must verify the
    /// active-holder count is at least 2 before calling (last-holder guard).
    /// </summary>
    Task RevokeAsync(Guid actorId, Guid subjectId, CancellationToken cancellationToken = default);
}
