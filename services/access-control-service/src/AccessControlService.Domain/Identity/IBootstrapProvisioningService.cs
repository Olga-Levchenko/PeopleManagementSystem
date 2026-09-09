namespace AccessControlService.Domain.Identity;

public interface IBootstrapProvisioningService
{
    Task<BootstrapProvisioningResult> ProvisionAsync(
        BootstrapProvisioningRequest request,
        string correlationId,
        CancellationToken cancellationToken = default);
}

public sealed record BootstrapProvisioningRequest(
    string? PrincipalIssuer,
    string? PrincipalSub,
    string? TrustedProvisioningActor = null);

public enum BootstrapProvisioningStatus
{
    Provisioned,
    AlreadyProvisioned,
    MissingIdentity,
    UnavailableIdentity,
    AmbiguousIdentity,
    InvalidInput,
    MissingSeededRole,
    PersistenceOrAuditFailure,
}

public sealed record BootstrapProvisioningResult(BootstrapProvisioningStatus Status)
{
    public static BootstrapProvisioningResult Provisioned() =>
        new(BootstrapProvisioningStatus.Provisioned);

    public static BootstrapProvisioningResult AlreadyProvisioned() =>
        new(BootstrapProvisioningStatus.AlreadyProvisioned);

    public static BootstrapProvisioningResult MissingIdentity() =>
        new(BootstrapProvisioningStatus.MissingIdentity);

    public static BootstrapProvisioningResult UnavailableIdentity() =>
        new(BootstrapProvisioningStatus.UnavailableIdentity);

    public static BootstrapProvisioningResult AmbiguousIdentity() =>
        new(BootstrapProvisioningStatus.AmbiguousIdentity);

    public static BootstrapProvisioningResult InvalidInput() =>
        new(BootstrapProvisioningStatus.InvalidInput);

    public static BootstrapProvisioningResult MissingSeededRole() =>
        new(BootstrapProvisioningStatus.MissingSeededRole);

    public static BootstrapProvisioningResult PersistenceOrAuditFailure() =>
        new(BootstrapProvisioningStatus.PersistenceOrAuditFailure);
}
