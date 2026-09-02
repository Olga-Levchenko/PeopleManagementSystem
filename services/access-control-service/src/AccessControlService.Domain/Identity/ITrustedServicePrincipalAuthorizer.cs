namespace AccessControlService.Domain.Identity;

public interface ITrustedServicePrincipalAuthorizer
{
    Task<TrustedServicePrincipalAuthorization> AuthorizeAsync(
        CancellationToken cancellationToken = default);
}

public enum TrustedServicePrincipalAuthorization
{
    Authorized,
    Unauthorized,
    Unavailable,
}
