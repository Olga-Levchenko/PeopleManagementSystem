namespace AccessControlService.Infrastructure.Identity;

public sealed record PeopleIdentityResolverOptions(
    Uri? BaseAddress,
    TimeSpan Timeout,
    IReadOnlySet<string>? AllowedIssuers = null,
    bool AllowInsecureHttp = false);

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

public sealed class UnavailableInternalServiceCredentialProvider
    : IInternalServiceCredentialProvider
{
    public ValueTask<InternalServiceCredentialResult> GetAsync(
        CancellationToken cancellationToken = default) =>
        ValueTask.FromResult<InternalServiceCredentialResult>(
            new InternalServiceCredentialResult.Unavailable());
}
