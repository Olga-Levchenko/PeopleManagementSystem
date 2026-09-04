using AccessControlService.Domain.Identity;

namespace AccessControlService.Infrastructure.Identity;

public sealed class UnavailablePrincipalPersonResolver : IPrincipalPersonResolver
{
    public Task<PrincipalPersonResolution> ResolvePersonAsync(
        string principalSub,
        CancellationToken cancellationToken = default) =>
        Task.FromResult<PrincipalPersonResolution>(
            new PrincipalPersonResolution.Unavailable());
}
