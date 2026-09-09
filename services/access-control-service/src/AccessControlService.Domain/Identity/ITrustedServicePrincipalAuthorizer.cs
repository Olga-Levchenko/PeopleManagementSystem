namespace AccessControlService.Domain.Identity;

// Retained only as a test seam for legacy contract fixtures. Production permission
// endpoints use the PeopleServiceJwt policy and do not resolve this abstraction.
public interface ITrustedServicePrincipalAuthorizer
{
    Task<TrustedPermissionCheckAuthorization> AuthorizeAsync(
        CancellationToken cancellationToken = default);
}

public sealed record TrustedPermissionCheckContext(
    string ServiceIdentity,
    string DelegatedActorIssuer,
    string DelegatedActorSub);

public abstract record TrustedPermissionCheckAuthorization
{
    public sealed record Authorized(TrustedPermissionCheckContext Context)
        : TrustedPermissionCheckAuthorization;

    public sealed record Unauthorized : TrustedPermissionCheckAuthorization;

    public sealed record Unavailable : TrustedPermissionCheckAuthorization;
}
