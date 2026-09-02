namespace AuthenticationService.Api.Configuration;

/// <summary>
/// Strongly-typed, validated view over the handful of required startup config values.
/// Constructed once at startup via <see cref="Load"/> so the app fails fast, before
/// <c>WebApplication.Build()</c>, rather than surfacing a null/format error deep in a request.
/// Mirrors <c>access-control-service</c>'s <c>AppConfig</c> convention (see its
/// <c>Configuration/AppConfig.cs</c>).
/// </summary>
public sealed class AppConfig
{
    public int Port { get; }
    public string CorsOrigin { get; }
    public string KeycloakBaseUrl { get; }
    public string KeycloakRealm { get; }

    /// <summary>
    /// This realm's OIDC issuer, as Keycloak itself reports it in its discovery document's
    /// <c>iss</c>/<c>issuer</c> field -- <c>{KeycloakBaseUrl}/realms/{KeycloakRealm}</c>.
    /// </summary>
    public string Issuer => $"{KeycloakBaseUrl}/realms/{KeycloakRealm}";

    /// <summary>This realm's JWKS endpoint, derived the same way Keycloak's own discovery document does.</summary>
    public string JwksUri => $"{Issuer}/protocol/openid-connect/certs";

    /// <summary>
    /// This realm's OIDC discovery document endpoint -- pinged by the <c>keycloak</c> health check
    /// (see <c>Program.cs</c>) to prove both "Keycloak is up" and "our realm actually exists" in
    /// one check, and used by <see cref="Issuer"/>/<see cref="JwksUri"/>'s tests to assert parity
    /// against Keycloak's real discovery document.
    /// </summary>
    public string DiscoveryDocumentUri => $"{Issuer}/.well-known/openid-configuration";

    private AppConfig(int port, string corsOrigin, string keycloakBaseUrl, string keycloakRealm)
    {
        Port = port;
        CorsOrigin = corsOrigin;
        KeycloakBaseUrl = keycloakBaseUrl;
        KeycloakRealm = keycloakRealm;
    }

    /// <summary>
    /// Reads and validates PORT, CORS_ORIGIN, KEYCLOAK_BASE_URL, and KEYCLOAK_REALM from
    /// <paramref name="configuration"/>. Throws <see cref="InvalidOperationException"/> naming the
    /// offending key on any missing/blank value or a non-numeric PORT -- never a raw framework
    /// exception (NullReferenceException/FormatException) and never a silent pass-through of an
    /// empty string. Note: these are required, fail-fast startup VALUES only -- actually reaching
    /// Keycloak is not attempted here, so the app still boots fine (health check reporting
    /// accordingly) when Keycloak itself is unreachable.
    /// </summary>
    public static AppConfig Load(IConfiguration configuration)
    {
        var portRaw = RequireNonBlank(configuration, "PORT");
        var corsOrigin = RequireNonBlank(configuration, "CORS_ORIGIN");
        var keycloakBaseUrl = RequireNonBlank(configuration, "KEYCLOAK_BASE_URL");
        var keycloakRealm = RequireNonBlank(configuration, "KEYCLOAK_REALM");

        var port = ParsePort(portRaw, "PORT");

        // Trimmed of any trailing slash before it's stored: a KEYCLOAK_BASE_URL copy-pasted with a
        // trailing slash (e.g. "http://localhost:8080/") would otherwise produce a
        // double-slash in every derived URL (Issuer/JwksUri/DiscoveryDocumentUri), which would not
        // match Keycloak's own discovery document byte-for-byte.
        keycloakBaseUrl = keycloakBaseUrl.TrimEnd('/');
        keycloakBaseUrl = ValidateAbsoluteUrl(keycloakBaseUrl, "KEYCLOAK_BASE_URL");

        // Same trailing-slash trim as KEYCLOAK_BASE_URL, for a different reason: a browser's
        // `Origin` header never carries a trailing slash, so a CORS_ORIGIN with one would pass this
        // validation yet silently never match in `WithOrigins` (which requires an exact string
        // match), producing a CORS rejection years-of-debugging away from this line.
        corsOrigin = corsOrigin.TrimEnd('/');

        ValidateRealmName(keycloakRealm, "KEYCLOAK_REALM");

        return new AppConfig(port, corsOrigin, keycloakBaseUrl, keycloakRealm);
    }

    /// <summary>
    /// Fails fast with a descriptive <see cref="InvalidOperationException"/> naming
    /// <paramref name="key"/> when <paramref name="value"/> (already trimmed of a trailing slash)
    /// is empty or is not a well-formed absolute URI. Guards against inputs like <c>"/"</c> or
    /// <c>"///"</c>, which pass the earlier non-blank check but reduce to an empty string after
    /// trimming and would otherwise surface as an unhandled <see cref="UriFormatException"/> from
    /// <c>new Uri(...)</c> deep in <c>Program.cs</c>'s health-check registration, instead of the
    /// fail-fast startup error this class promises.
    /// </summary>
    private static string ValidateAbsoluteUrl(string value, string key)
    {
        if (value.Length == 0 || !Uri.TryCreate(value, UriKind.Absolute, out _))
        {
            throw new InvalidOperationException(
                $"Configuration value '{key}' must be a well-formed absolute URL, but was '{value}'.");
        }

        return value;
    }

    /// <summary>
    /// Fails fast with a descriptive <see cref="InvalidOperationException"/> naming
    /// <paramref name="key"/> when <paramref name="value"/> contains anything other than letters,
    /// digits, hyphens, or underscores. <see cref="KeycloakRealm"/> is spliced directly into
    /// <see cref="Issuer"/>/<see cref="JwksUri"/>/<see cref="DiscoveryDocumentUri"/> and then used
    /// in a real outbound health-check request -- an unvalidated value containing '/', '?', '#', or
    /// whitespace would silently produce a malformed or unintended URL instead of failing fast the
    /// way PORT already does.
    /// </summary>
    private static void ValidateRealmName(string value, string key)
    {
        foreach (var c in value)
        {
            if (!char.IsLetterOrDigit(c) && c != '-' && c != '_')
            {
                throw new InvalidOperationException(
                    $"Configuration value '{key}' must contain only letters, digits, hyphens, or " +
                    $"underscores, but was '{value}'.");
            }
        }
    }

    private static int ParsePort(string raw, string key)
    {
        if (!int.TryParse(raw, out var port))
        {
            throw new InvalidOperationException(
                $"Configuration value '{key}' must be a valid integer, but was '{raw}'.");
        }

        if (port is < 1 or > 65535)
        {
            throw new InvalidOperationException(
                $"Configuration value '{key}' must be a valid TCP port in the range 1-65535, but was '{port}'.");
        }

        return port;
    }

    private static string RequireNonBlank(IConfiguration configuration, string key)
    {
        var value = configuration[key];
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException(
                $"Missing required configuration value '{key}'. Set it via environment variable, " +
                "'.env', or appsettings -- it must not be null, empty, or whitespace-only.");
        }

        // Trim before storing/using: a value copy-pasted from a '.env' line with stray leading/
        // trailing whitespace would otherwise pass this non-blank check yet fail to match anything
        // downstream, the same reasoning as access-control-service's AppConfig.
        return value.Trim();
    }
}
