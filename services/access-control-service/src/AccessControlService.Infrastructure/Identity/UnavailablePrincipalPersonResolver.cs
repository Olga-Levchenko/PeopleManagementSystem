using AccessControlService.Domain.Identity;

namespace AccessControlService.Infrastructure.Identity;

public sealed class UnavailablePrincipalPersonResolver : IPrincipalPersonResolver
{
    public Task<PrincipalPersonResolution> ResolvePersonAsync(
        OidcPrincipalIdentity identity,
        CancellationToken cancellationToken = default) =>
        Task.FromResult<PrincipalPersonResolution>(
            new PrincipalPersonResolution.Unavailable());
}
