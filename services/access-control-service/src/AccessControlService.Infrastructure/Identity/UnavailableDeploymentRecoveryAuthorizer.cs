using AccessControlService.Domain.Identity;

namespace AccessControlService.Infrastructure.Identity;

public sealed class UnavailableDeploymentRecoveryAuthorizer : IDeploymentRecoveryAuthorizer
{
    public Task<DeploymentRecoveryAuthorization> AuthorizeAsync(
        DeploymentAuthenticatedRecoveryRequest request,
        CancellationToken cancellationToken = default) =>
        Task.FromResult<DeploymentRecoveryAuthorization>(
            new DeploymentRecoveryAuthorization.Unavailable());
}
