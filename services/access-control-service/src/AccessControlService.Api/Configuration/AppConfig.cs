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

    private AppConfig(int port, string corsOrigin, string postgresConnectionString)
    {
        Port = port;
        CorsOrigin = corsOrigin;
        PostgresConnectionString = postgresConnectionString;
    }

    /// <summary>
    /// Reads and validates PORT, CORS_ORIGIN, and ConnectionStrings:Postgres from
    /// <paramref name="configuration"/>. Throws <see cref="InvalidOperationException"/> naming the
    /// offending key on any missing/blank value or a non-numeric PORT -- never a raw framework
    /// exception (NullReferenceException/FormatException) and never a silent pass-through of an
    /// empty string.
    /// </summary>
    public static AppConfig Load(IConfiguration configuration)
    {
        var portRaw = RequireNonBlank(configuration, "PORT");
        var corsOrigin = RequireNonBlank(configuration, "CORS_ORIGIN");
        var postgresConnectionString = RequireNonBlank(configuration, "ConnectionStrings:Postgres");

        if (!int.TryParse(portRaw, out var port))
        {
            throw new InvalidOperationException(
                $"Configuration value 'PORT' must be a valid integer, but was '{portRaw}'.");
        }

        if (port is < 1 or > 65535)
        {
            throw new InvalidOperationException(
                $"Configuration value 'PORT' must be a valid TCP port in the range 1-65535, but was '{port}'.");
        }

        return new AppConfig(port, corsOrigin, postgresConnectionString);
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

        return value;
    }
}
