namespace AccessControlService.Domain.Identity;

public interface IPrincipalPersonResolver
{
    Task<PrincipalPersonResolution> ResolvePersonAsync(
        string principalSub,
        CancellationToken cancellationToken = default);
}

public abstract record PrincipalPersonResolution
{
    public sealed record Resolved(Guid PersonId) : PrincipalPersonResolution;

    public sealed record Unavailable : PrincipalPersonResolution;

    public sealed record Ambiguous : PrincipalPersonResolution;
}
