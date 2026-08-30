using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Primitives;

namespace AccessControlService.Api.Tests.Testing;

/// <summary>
/// Minimal <see cref="IConfiguration"/> test double that only supports the flat-key indexer
/// <c>AppConfig.Load</c> relies on -- avoids depending on a real configuration provider package
/// just to exercise one method with a handful of key/value pairs.
/// </summary>
internal sealed class FakeConfiguration : IConfiguration
{
    private readonly Dictionary<string, string?> _values;

    public FakeConfiguration(Dictionary<string, string?> values)
    {
        _values = values;
    }

    public string? this[string key]
    {
        get => _values.TryGetValue(key, out var value) ? value : null;
        set => _values[key] = value;
    }

    public IEnumerable<IConfigurationSection> GetChildren() =>
        throw new NotSupportedException("Not needed by AppConfig.Load.");

    public IChangeToken GetReloadToken() =>
        throw new NotSupportedException("Not needed by AppConfig.Load.");

    public IConfigurationSection GetSection(string key) =>
        throw new NotSupportedException("Not needed by AppConfig.Load.");
}
