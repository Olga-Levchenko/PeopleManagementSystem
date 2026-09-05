using AccessControlService.Infrastructure.Messaging;
using AccessControlService.Domain.Identity;

namespace AccessControlService.Api.Configuration;

/// <summary>
/// Strongly-typed, validated view over the handful of required startup config values.
/// Constructed once at startup via <see cref="Load"/> so the app fails fast, before
/// <c>WebApplication.Build()</c>, rather than surfacing a null/format error deep in a request.
/// </summary>
public sealed class AppConfig
{
    public int Port { get; }
    public string CorsOrigin { get; }
    public string PostgresConnectionString { get; }
    public string RabbitMqHost { get; }
    public int RabbitMqPort { get; }
    public string RabbitMqUser { get; }
    public string RabbitMqPassword { get; }
    public Uri? PeopleServiceBaseUrl { get; }
    public IReadOnlySet<string> AllowedOidcIssuers { get; }
    public bool AllowInsecureOidcHttp { get; }
    /// <summary>
    /// Shared secret for S2S trust from internal callers (e.g. people-service) to
    /// <c>POST /api/v1/permissions/check</c>. Null when not configured — the endpoint
    /// returns 503 rather than failing fast at startup, preserving the "boots fine when
    /// optional integrations are absent" contract.
    /// </summary>
    public string? InternalServiceSecret { get; }

    private AppConfig(
        int port,
        string corsOrigin,
        string postgresConnectionString,
        string rabbitMqHost,
        int rabbitMqPort,
        string rabbitMqUser,
        string rabbitMqPassword,
        Uri? peopleServiceBaseUrl,
        IReadOnlySet<string> allowedOidcIssuers,
        bool allowInsecureOidcHttp,
        string? internalServiceSecret)
    {
        Port = port;
        CorsOrigin = corsOrigin;
        PostgresConnectionString = postgresConnectionString;
        RabbitMqHost = rabbitMqHost;
        RabbitMqPort = rabbitMqPort;
        RabbitMqUser = rabbitMqUser;
        RabbitMqPassword = rabbitMqPassword;
        PeopleServiceBaseUrl = peopleServiceBaseUrl;
        AllowedOidcIssuers = allowedOidcIssuers;
        AllowInsecureOidcHttp = allowInsecureOidcHttp;
        InternalServiceSecret = internalServiceSecret;
    }

    /// <summary>
    /// Reads and validates PORT, CORS_ORIGIN, ConnectionStrings:Postgres, and the
    /// RABBITMQ_HOST/RABBITMQ_PORT/RABBITMQ_USER/RABBITMQ_PASSWORD values
    /// <see cref="ProjectAssignmentEventConsumer"/> needs to reach a real broker, from
    /// <paramref name="configuration"/>. Throws <see cref="InvalidOperationException"/> naming the
    /// offending key on any missing/blank value or a non-numeric PORT/RABBITMQ_PORT -- never a raw
    /// framework exception (NullReferenceException/FormatException) and never a silent
    /// pass-through of an empty string. Note: these are required, fail-fast startup VALUES only --
    /// actually reaching the broker is not attempted here, so the app still boots fine (health
    /// check reporting accordingly) when RabbitMQ itself is unreachable, mirroring the existing
    /// Postgres contract.
    /// </summary>
    public static AppConfig Load(
        IConfiguration configuration,
        string environmentName = "Production")
    {
        var portRaw = RequireNonBlank(configuration, "PORT");
        var corsOrigin = RequireNonBlank(configuration, "CORS_ORIGIN");
        var postgresConnectionString = RequireNonBlank(configuration, "ConnectionStrings:Postgres");
        var rabbitMqHost = RequireNonBlank(configuration, "RABBITMQ_HOST");
        var rabbitMqPortRaw = RequireNonBlank(configuration, "RABBITMQ_PORT");
        var rabbitMqUser = RequireNonBlank(configuration, "RABBITMQ_USER");
        var rabbitMqPassword = RequireNonBlank(configuration, "RABBITMQ_PASSWORD");
        Uri? peopleServiceBaseUrl = OptionalHttpUri(
            configuration,
            "PEOPLE_SERVICE_BASE_URL");
        bool allowInsecureOidcHttp =
            environmentName is "Development" or "Test" or "Local";
        IReadOnlySet<string> allowedOidcIssuers = ReadAllowedOidcIssuers(
            configuration,
            allowInsecureOidcHttp);
        string? internalServiceSecret = OptionalNonBlank(
            configuration,
            "INTERNAL_SERVICE_SECRET");

        var port = ParsePort(portRaw, "PORT");
        var rabbitMqPort = ParsePort(rabbitMqPortRaw, "RABBITMQ_PORT");

        return new AppConfig(
            port,
            corsOrigin,
            postgresConnectionString,
            rabbitMqHost,
            rabbitMqPort,
            rabbitMqUser,
            rabbitMqPassword,
            peopleServiceBaseUrl,
            allowedOidcIssuers,
            allowInsecureOidcHttp,
            internalServiceSecret);
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
        // downstream (e.g. CORS_ORIGIN silently never matching a real Origin header, which differs
        // from the trimmed value only by whitespace).
        return value.Trim();
    }

    private static string? OptionalNonBlank(IConfiguration configuration, string key)
    {
        string? value = configuration[key];
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private static Uri? OptionalHttpUri(
        IConfiguration configuration,
        string key)
    {
        string? value = configuration[key];
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out Uri? uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException(
                $"Configuration value '{key}' must be an absolute HTTP(S) URL.");
        }

        return uri;
    }

    private static IReadOnlySet<string> ReadAllowedOidcIssuers(
        IConfiguration configuration,
        bool allowInsecureHttp)
    {
        string? configuredIssuers = configuration["OIDC_ALLOWED_ISSUERS"];
        HashSet<string> issuers = new(StringComparer.Ordinal);
        if (string.IsNullOrWhiteSpace(configuredIssuers))
        {
            return issuers;
        }

        foreach (string configuredIssuer in configuredIssuers.Split(','))
        {
            if (!OidcPrincipalIdentity.TryCreate(
                    configuredIssuer,
                    "configuration-subject",
                    allowInsecureHttp,
                    out OidcPrincipalIdentity? identity) ||
                identity is null)
            {
                return new HashSet<string>(StringComparer.Ordinal);
            }

            issuers.Add(identity.Issuer);
        }

        return issuers;
    }
}
