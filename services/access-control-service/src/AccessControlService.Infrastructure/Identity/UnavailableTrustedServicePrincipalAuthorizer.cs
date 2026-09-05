using AccessControlService.Domain.Identity;

namespace AccessControlService.Infrastructure.Identity;

public sealed class UnavailableTrustedServicePrincipalAuthorizer : ITrustedServicePrincipalAuthorizer
{
    public Task<TrustedPermissionCheckAuthorization> AuthorizeAsync(
        CancellationToken cancellationToken = default) =>
        Task.FromResult<TrustedPermissionCheckAuthorization>(
            new TrustedPermissionCheckAuthorization.Unavailable());
}
