namespace AccessControlService.Domain.Identity;

public interface IPrincipalPersonResolver
{
    Task<PrincipalPersonResolution> ResolvePersonAsync(
        OidcPrincipalIdentity identity,
        CancellationToken cancellationToken = default);
}

public sealed record OidcPrincipalIdentity
{
    private OidcPrincipalIdentity(string issuer, string subject)
    {
        Issuer = issuer;
        Subject = subject;
    }

    public string Issuer { get; }
    public string Subject { get; }

    public static bool TryCreate(
        string? issuer,
        string? subject,
        out OidcPrincipalIdentity? identity)
    {
        identity = null;
        if (string.IsNullOrWhiteSpace(issuer) ||
            string.IsNullOrWhiteSpace(subject) ||
            issuer != issuer.Trim())
        {
            return false;
        }

        if (!Uri.TryCreate(issuer, UriKind.Absolute, out Uri? parsedIssuer) ||
            parsedIssuer.UserInfo.Length > 0 ||
            !string.IsNullOrEmpty(parsedIssuer.Query) ||
            !string.IsNullOrEmpty(parsedIssuer.Fragment) ||
            parsedIssuer.Host.Length == 0 ||
            (parsedIssuer.Scheme != Uri.UriSchemeHttps &&
             !(parsedIssuer.Scheme == Uri.UriSchemeHttp &&
               (parsedIssuer.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                parsedIssuer.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)))))
        {
            return false;
        }

        string scheme = parsedIssuer.Scheme.ToLowerInvariant();
        string host = parsedIssuer.Host.ToLowerInvariant();
        int port = parsedIssuer.IsDefaultPort ? -1 : parsedIssuer.Port;
        string path = parsedIssuer.AbsolutePath == "/"
            ? string.Empty
            : parsedIssuer.AbsolutePath.EndsWith("/", StringComparison.Ordinal)
                ? parsedIssuer.AbsolutePath[..^1]
                : parsedIssuer.AbsolutePath;
        string canonicalIssuer = port < 0
            ? $"{scheme}://{host}{path}"
            : $"{scheme}://{host}:{port}{path}";

        identity = new OidcPrincipalIdentity(canonicalIssuer, subject);
        return true;
    }
}

public abstract record PrincipalPersonResolution
{
    public sealed record Resolved(Guid PersonId) : PrincipalPersonResolution;

    public sealed record Missing : PrincipalPersonResolution;

    public sealed record Unavailable : PrincipalPersonResolution;

    public sealed record Ambiguous : PrincipalPersonResolution;

    public sealed record InvalidIdentity : PrincipalPersonResolution;
}

public interface ICorrelationIdAccessor
{
    string? Current { get; }
}
