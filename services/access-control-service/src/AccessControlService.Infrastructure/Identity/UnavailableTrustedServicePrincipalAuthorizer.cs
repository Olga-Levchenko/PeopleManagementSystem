using AccessControlService.Domain.Identity;

namespace AccessControlService.Infrastructure.Identity;

public sealed class UnavailableTrustedServicePrincipalAuthorizer : ITrustedServicePrincipalAuthorizer
{
    public Task<TrustedServicePrincipalAuthorization> AuthorizeAsync(
        CancellationToken cancellationToken = default) =>
        Task.FromResult(TrustedServicePrincipalAuthorization.Unavailable);
}
