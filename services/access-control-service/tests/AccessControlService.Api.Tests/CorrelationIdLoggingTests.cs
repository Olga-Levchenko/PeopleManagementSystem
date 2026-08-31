using System.Collections.Concurrent;
using AccessControlService.Api.Middleware;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Logging;

namespace AccessControlService.Api.Tests;

/// <summary>
/// Proves the spec's own acceptance criterion -- "the server log line includes the correlation
/// id" -- is actually true of <see cref="CorrelationIdMiddleware"/>'s real
/// <c>_logger.LogInformation(...)</c> call, not just that the middleware resolves/echoes a
/// correlation id on the response (which <see cref="HealthEndpointTests"/> already covers).
/// Dropping the logging call entirely, or rewriting its format string to omit the correlation id,
/// would not fail any pre-existing test -- only this one.
/// </summary>
/// <remarks>
/// Joins the same disabled-parallelization collection <see cref="HealthEndpointTests"/> uses,
/// since both mutate the same process-wide environment variables
/// (<c>PORT</c>/<c>CORS_ORIGIN</c>/<c>ConnectionStrings__Postgres</c>/<c>RABBITMQ_*</c>) that
/// <c>AppConfig.Load</c> reads before <c>WebApplicationFactory</c>'s own config-override hooks
/// apply -- running concurrently with any other test class setting the same keys would race.
/// </remarks>
[Collection("HealthEndpointTests")]
public class CorrelationIdLoggingTests : IDisposable
{
    public CorrelationIdLoggingTests()
    {
        Environment.SetEnvironmentVariable("PORT", "5097");
        Environment.SetEnvironmentVariable("CORS_ORIGIN", "http://localhost:4200");
        Environment.SetEnvironmentVariable(
            "ConnectionStrings__Postgres",
            "Host=localhost;Port=5497;Database=access_control_service_test;Username=postgres;Password=postgres;Timeout=1");
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", "localhost");
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", "5697");
        Environment.SetEnvironmentVariable("RABBITMQ_USER", "guest");
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", "guest");
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("PORT", null);
        Environment.SetEnvironmentVariable("CORS_ORIGIN", null);
        Environment.SetEnvironmentVariable("ConnectionStrings__Postgres", null);
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", null);
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", null);
        Environment.SetEnvironmentVariable("RABBITMQ_USER", null);
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", null);
    }

    [Fact]
    public async Task Health_WithCorrelationHeader_LogsCorrelationIdInMiddlewareLogLine()
    {
        var capturingProvider = new CapturingLoggerProvider();

        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureLogging(logging =>
            {
                logging.ClearProviders();
                logging.AddProvider(capturingProvider);
                logging.SetMinimumLevel(LogLevel.Information);
            });
        });

        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/v1/health");
        const string correlationId = "log-capture-correlation-id";
        request.Headers.Add(CorrelationIdMiddleware.HeaderName, correlationId);

        using var response = await client.SendAsync(request);

        var middlewareCategory = typeof(CorrelationIdMiddleware).FullName!;
        var matchingEntry = capturingProvider.Entries.FirstOrDefault(entry =>
            entry.Category == middlewareCategory && entry.Message.Contains(correlationId));

        Assert.NotNull(matchingEntry);
    }

    private sealed record CapturedLogEntry(string Category, string Message);

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        public ConcurrentBag<CapturedLogEntry> Entries { get; } = new();

        public ILogger CreateLogger(string categoryName) => new CapturingLogger(categoryName, Entries);

        public void Dispose()
        {
        }

        private sealed class CapturingLogger : ILogger
        {
            private readonly string _categoryName;
            private readonly ConcurrentBag<CapturedLogEntry> _entries;

            public CapturingLogger(string categoryName, ConcurrentBag<CapturedLogEntry> entries)
            {
                _categoryName = categoryName;
                _entries = entries;
            }

            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(
                LogLevel logLevel,
                EventId eventId,
                TState state,
                Exception? exception,
                Func<TState, Exception?, string> formatter)
            {
                _entries.Add(new CapturedLogEntry(_categoryName, formatter(state, exception)));
            }
        }
    }
}
