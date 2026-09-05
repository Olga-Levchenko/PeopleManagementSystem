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
    string? PrincipalSub);

public enum BootstrapProvisioningStatus
{
    Provisioned,
    AlreadyProvisioned,
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
