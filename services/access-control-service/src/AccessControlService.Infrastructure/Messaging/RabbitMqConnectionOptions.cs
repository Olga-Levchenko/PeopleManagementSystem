namespace AccessControlService.Infrastructure.Messaging;

/// <summary>
/// Connection settings <see cref="ProjectAssignmentEventConsumer"/> (and
/// <see cref="FakeProjectAssignmentEventProducer"/>, in tests) needs to reach a real RabbitMQ
/// broker. Deliberately a plain data holder with no dependency on
/// <c>AccessControlService.Api.Configuration.AppConfig</c> -- Infrastructure has no reference to
/// the Api project (composition only flows the other way, per AD-1's hexagonal split), so
/// <c>Program.cs</c> reads the real values via <c>AppConfig</c>'s own fail-fast validation and maps
/// them into an instance of this type registered in DI.
/// </summary>
public sealed record RabbitMqConnectionOptions
{
    public required string HostName { get; init; }

    public required int Port { get; init; }

    public required string UserName { get; init; }

    public required string Password { get; init; }

    /// <summary>
    /// Overrides the compiler-generated record <c>ToString()</c>, which would otherwise print
    /// <see cref="Password"/> in cleartext -- e.g. a future <c>LogDebug("{Options}", ...)</c> call
    /// logging this instance would leak the broker credential.
    /// </summary>
    public override string ToString() =>
        $"{nameof(RabbitMqConnectionOptions)} {{ {nameof(HostName)} = {HostName}, {nameof(Port)} = {Port}, {nameof(UserName)} = {UserName}, {nameof(Password)} = [redacted] }}";
}
