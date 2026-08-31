using Microsoft.Extensions.Logging;

namespace AccessControlService.Domain.Tests;

/// <summary>
/// Minimal <see cref="ILogger{TCategoryName}"/> test double that records every log call's level
/// and formatted message -- hand-written rather than a mocking framework, matching
/// <see cref="FakeRelationshipRepository"/>'s own style in this project.
/// </summary>
public sealed class RecordingLogger<T> : ILogger<T>
{
    public List<(LogLevel Level, string Message)> Entries { get; } = new();

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => true;

    public void Log<TState>(
        LogLevel logLevel,
        EventId eventId,
        TState state,
        Exception? exception,
        Func<TState, Exception?, string> formatter)
    {
        Entries.Add((logLevel, formatter(state, exception)));
    }
}
