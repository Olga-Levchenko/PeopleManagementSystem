namespace AccessControlService.Infrastructure.Identity;

public sealed record PeopleIdentityResolverOptions(
    Uri? BaseAddress,
    TimeSpan Timeout,
    IReadOnlySet<string>? AllowedIssuers = null,
    bool AllowInsecureHttp = false,
    string? TokenEndpoint = null,
    string? ServicePrivateKeyPath = null,
    string? ServiceKeyId = null);

public interface IInternalServiceCredentialProvider
{
    ValueTask<InternalServiceCredentialResult> GetAsync(
        CancellationToken cancellationToken = default);
}

public abstract record InternalServiceCredentialResult
{
    public sealed record Available(string Scheme, string Credential)
        : InternalServiceCredentialResult;

    public sealed record Unavailable : InternalServiceCredentialResult;
}
