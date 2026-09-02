namespace AccessControlService.Domain.Identity;

public interface IPrincipalPersonResolver
{
    Task<Guid?> ResolvePersonIdAsync(
        string principalSub,
        CancellationToken cancellationToken = default);
}
