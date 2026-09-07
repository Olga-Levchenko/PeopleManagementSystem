using AccessControlService.Domain;

namespace AccessControlService.Domain.Tests;

/// <summary>
/// In-memory fake for <see cref="IFullProfileAccessRepository"/>, for
/// <see cref="AccessRoleResolverTests"/> and <see cref="ManagerSectionAccessPolicyTests"/>.
/// Defaults to returning <c>false</c> for <see cref="IsHolderAsync"/> (no holder) so existing
/// tests that don't care about Full-profile-access continue to work without modification.
/// Call <see cref="AddHolder"/> to seed a holder before the test.
/// </summary>
public sealed class FakeFullProfileAccessRepository : IFullProfileAccessRepository
{
    private readonly HashSet<Guid> _holders = new();

    public FakeFullProfileAccessRepository AddHolder(Guid holderId)
    {
        _holders.Add(holderId);
        return this;
    }

    public Task<bool> IsHolderAsync(Guid personId, CancellationToken cancellationToken = default) =>
        Task.FromResult(_holders.Contains(personId));

    public Task<int> GetActiveCountAsync(CancellationToken cancellationToken = default) =>
        Task.FromResult(_holders.Count);

    public Task GrantAsync(Guid actorId, Guid subjectId, CancellationToken cancellationToken = default)
    {
        _holders.Add(subjectId);
        return Task.CompletedTask;
    }

    public Task RevokeAsync(Guid actorId, Guid subjectId, CancellationToken cancellationToken = default)
    {
        _holders.Remove(subjectId);
        return Task.CompletedTask;
    }
}
