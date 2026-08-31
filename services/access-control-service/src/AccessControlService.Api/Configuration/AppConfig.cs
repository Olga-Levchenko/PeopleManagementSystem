using AccessControlService.Infrastructure.Messaging;

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

    private AppConfig(
        int port,
        string corsOrigin,
        string postgresConnectionString,
        string rabbitMqHost,
        int rabbitMqPort,
        string rabbitMqUser,
        string rabbitMqPassword)
    {
        Port = port;
        CorsOrigin = corsOrigin;
        PostgresConnectionString = postgresConnectionString;
        RabbitMqHost = rabbitMqHost;
        RabbitMqPort = rabbitMqPort;
        RabbitMqUser = rabbitMqUser;
        RabbitMqPassword = rabbitMqPassword;
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
    public static AppConfig Load(IConfiguration configuration)
    {
        var portRaw = RequireNonBlank(configuration, "PORT");
        var corsOrigin = RequireNonBlank(configuration, "CORS_ORIGIN");
        var postgresConnectionString = RequireNonBlank(configuration, "ConnectionStrings:Postgres");
        var rabbitMqHost = RequireNonBlank(configuration, "RABBITMQ_HOST");
        var rabbitMqPortRaw = RequireNonBlank(configuration, "RABBITMQ_PORT");
        var rabbitMqUser = RequireNonBlank(configuration, "RABBITMQ_USER");
        var rabbitMqPassword = RequireNonBlank(configuration, "RABBITMQ_PASSWORD");

        var port = ParsePort(portRaw, "PORT");
        var rabbitMqPort = ParsePort(rabbitMqPortRaw, "RABBITMQ_PORT");

        return new AppConfig(
            port,
            corsOrigin,
            postgresConnectionString,
            rabbitMqHost,
            rabbitMqPort,
            rabbitMqUser,
            rabbitMqPassword);
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
}
