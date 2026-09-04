namespace AccessControlService.Domain.Identity;

public interface IBootstrapRecoveryService
{
    Task<RecoveryProvisioningResult> RecoverBootstrapAdministratorAsync(
        DeploymentAuthenticatedRecoveryRequest request,
        string correlationId,
        CancellationToken cancellationToken = default);
}

public interface IDeploymentRecoveryAuthorizer
{
    Task<DeploymentRecoveryAuthorization> AuthorizeAsync(
        DeploymentAuthenticatedRecoveryRequest request,
        CancellationToken cancellationToken = default);
}

public sealed record DeploymentAuthenticatedRecoveryRequest(string? PrincipalSub);

public sealed record DeploymentRecoveryAuthorizationContext(
    string OperatorIdentity,
    string PrincipalSub);

public abstract record DeploymentRecoveryAuthorization
{
    public sealed record Authorized(DeploymentRecoveryAuthorizationContext Context)
        : DeploymentRecoveryAuthorization;

    public sealed record Denied : DeploymentRecoveryAuthorization;

    public sealed record Unavailable : DeploymentRecoveryAuthorization;
}

public enum RecoveryProvisioningStatus
{
    Recovered,
    InvalidInput,
    Unauthorized,
    Unavailable,
    AmbiguousIdentity,
    PersistenceOrAuditFailure,
}

public sealed record RecoveryProvisioningResult(RecoveryProvisioningStatus Status)
{
    public static RecoveryProvisioningResult Recovered() =>
        new(RecoveryProvisioningStatus.Recovered);

    public static RecoveryProvisioningResult InvalidInput() =>
        new(RecoveryProvisioningStatus.InvalidInput);

    public static RecoveryProvisioningResult Unauthorized() =>
        new(RecoveryProvisioningStatus.Unauthorized);

    public static RecoveryProvisioningResult Unavailable() =>
        new(RecoveryProvisioningStatus.Unavailable);

    public static RecoveryProvisioningResult AmbiguousIdentity() =>
        new(RecoveryProvisioningStatus.AmbiguousIdentity);

    public static RecoveryProvisioningResult PersistenceOrAuditFailure() =>
        new(RecoveryProvisioningStatus.PersistenceOrAuditFailure);
}
