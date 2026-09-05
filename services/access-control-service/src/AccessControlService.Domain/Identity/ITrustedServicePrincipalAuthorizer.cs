namespace AccessControlService.Domain.Identity;

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
