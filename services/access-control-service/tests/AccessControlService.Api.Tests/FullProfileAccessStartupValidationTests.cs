using AccessControlService.Domain;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace AccessControlService.Api.Tests;

/// <summary>
/// Unit tests for <see cref="FullProfileAccessStartupValidation"/>. These tests exercise the
/// zero-holder fail-fast path and the normal-startup path using a DI-backed scope factory with
/// a minimal in-process <see cref="IFullProfileAccessRepository"/> stub -- no Testcontainers
/// or network required.
/// </summary>
public class FullProfileAccessStartupValidationTests
{
    [Fact]
    public async Task StartAsync_ZeroHolders_ThrowsInvalidOperationException()
    {
        var scopeFactory = BuildScopeFactory(activeCount: 0);
        var sut = new FullProfileAccessStartupValidation(
            scopeFactory,
            NullLogger<FullProfileAccessStartupValidation>.Instance);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            sut.StartAsync(CancellationToken.None));
    }

    [Fact]
    public async Task StartAsync_OneOrMoreHolders_CompletesWithoutThrowing()
    {
        var scopeFactory = BuildScopeFactory(activeCount: 1);
        var sut = new FullProfileAccessStartupValidation(
            scopeFactory,
            NullLogger<FullProfileAccessStartupValidation>.Instance);

        // Must not throw -- the startup validation gate passes when at least one holder exists.
        await sut.StartAsync(CancellationToken.None);
    }

    // Builds a real Microsoft.Extensions.DependencyInjection scope factory backed by a stub
    // repository that returns the specified count from GetActiveCountAsync.
    private static IServiceScopeFactory BuildScopeFactory(int activeCount)
    {
        var services = new ServiceCollection();
        services.AddScoped<IFullProfileAccessRepository>(_ => new StubRepository(activeCount));
        return services.BuildServiceProvider().GetRequiredService<IServiceScopeFactory>();
    }

    private sealed class StubRepository : IFullProfileAccessRepository
    {
        private readonly int _activeCount;

        public StubRepository(int activeCount) => _activeCount = activeCount;

        public Task<int> GetActiveCountAsync(CancellationToken cancellationToken = default) =>
            Task.FromResult(_activeCount);

        public Task<bool> IsHolderAsync(Guid personId, CancellationToken cancellationToken = default) =>
            Task.FromResult(_activeCount > 0);

        public Task GrantAsync(Guid actorId, Guid subjectId, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;

        public Task RevokeAsync(Guid actorId, Guid subjectId, CancellationToken cancellationToken = default) =>
            Task.CompletedTask;
    }
}
