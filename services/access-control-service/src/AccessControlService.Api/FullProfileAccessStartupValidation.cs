using AccessControlService.Domain;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace AccessControlService.Api;

/// <summary>
/// Startup-time validation that at least one Full-profile-access holder exists in the database.
/// Runs immediately after the DI container is built, before the host begins accepting requests.
/// Per spec §2.4: the first holder is seeded at deployment; the last holder can never be removed;
/// therefore a zero-row grants table is always a misconfigured or un-migrated deployment -- fail
/// fast with a clear, descriptive error before serving any traffic.
/// </summary>
/// <remarks>
/// Uses <see cref="IHostedService.StartAsync"/> (not <see cref="BackgroundService.ExecuteAsync"/>)
/// so the check blocks host startup, not a background task. The application will not begin
/// listening on its configured port until this check passes or throws.
/// </remarks>
public sealed class FullProfileAccessStartupValidation : IHostedService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<FullProfileAccessStartupValidation> _logger;

    public FullProfileAccessStartupValidation(
        IServiceScopeFactory scopeFactory,
        ILogger<FullProfileAccessStartupValidation> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        await using var scope = _scopeFactory.CreateAsyncScope();
        var repository = scope.ServiceProvider.GetRequiredService<IFullProfileAccessRepository>();

        int count;
        try
        {
            count = await repository.GetActiveCountAsync(cancellationToken);
        }
        catch (PostgresException pgEx)
        {
            // The database is reachable but returned a server-side error (e.g. SqlState 42P01 =
            // relation does not exist, meaning the EF Core migration has not been applied). This
            // is a deployment misconfiguration — fail fast rather than starting with a broken schema.
            var message =
                $"FATAL: Full-profile-access startup validation failed with a database error: " +
                $"{pgEx.MessageText} (SqlState: {pgEx.SqlState}). " +
                "Ensure the EF Core migration has been applied (dotnet ef database update) before " +
                "starting the application.";
            _logger.LogCritical(pgEx, message);
            throw new InvalidOperationException(message, pgEx);
        }
        catch (Exception ex)
        {
            // Postgres is unreachable at startup -- preserve the existing "boots fine with Postgres
            // down" health-check contract (see this service's CLAUDE.md Gotchas). The health check
            // will report Unhealthy; this is not the place to fail fast on a connectivity issue.
            // A zero-ROW situation (reachable DB, migrated schema, but no holder seeded) is always
            // a deployment error and is the only case that fails fast below.
            _logger.LogWarning(
                ex,
                "Full-profile-access startup validation skipped: could not reach the database " +
                "to count active holders. The application will start, but the health check will " +
                "report Unhealthy. If the database is accessible and the migration has been applied, " +
                "ensure at least one Full-profile-access holder exists.");
            return;
        }

        if (count == 0)
        {
            var message =
                "FATAL: the 'full_profile_access_grants' table has zero rows. " +
                "At least one Full-profile-access holder must exist at all times (spec §2.4). " +
                "Ensure the initial EF Core migration has been applied (dotnet ef database update) " +
                "and that the bootstrap seed row seeding PlatformLeadId as the first holder is present. " +
                "The application will not start until this condition is met.";
            _logger.LogCritical(message);
            throw new InvalidOperationException(message);
        }

        _logger.LogInformation(
            "Full-profile-access startup validation passed: {Count} active holder(s) found.",
            count);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
