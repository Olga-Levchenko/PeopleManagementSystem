using AccessControlService.Domain.Identity;

namespace AccessControlService.Infrastructure.Identity;

public sealed class UnavailablePrincipalPersonResolver : IPrincipalPersonResolver
{
    public Task<Guid?> ResolvePersonIdAsync(
        string principalSub,
        CancellationToken cancellationToken = default) =>
        Task.FromResult<Guid?>(null);
}
