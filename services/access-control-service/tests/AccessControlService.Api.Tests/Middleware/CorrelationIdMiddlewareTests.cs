using AccessControlService.Api.Middleware;
using Microsoft.Extensions.Primitives;

namespace AccessControlService.Api.Tests.Middleware;

public class CorrelationIdMiddlewareTests
{
    [Fact]
    public void ResolveCorrelationId_NoHeader_GeneratesNewId()
    {
        var id = CorrelationIdMiddleware.ResolveCorrelationId(StringValues.Empty);

        Assert.False(string.IsNullOrWhiteSpace(id));
        Assert.True(Guid.TryParse(id, out _));
    }

    [Fact]
    public void ResolveCorrelationId_BlankHeader_GeneratesNewId_NotEchoedBlank()
    {
        var id = CorrelationIdMiddleware.ResolveCorrelationId(new StringValues("   "));

        Assert.False(string.IsNullOrWhiteSpace(id));
        Assert.NotEqual("   ", id);
        Assert.True(Guid.TryParse(id, out _));
    }

    [Fact]
    public void ResolveCorrelationId_ValidHeader_EchoesItUnchanged()
    {
        var id = CorrelationIdMiddleware.ResolveCorrelationId(new StringValues("abc-123"));

        Assert.Equal("abc-123", id);
    }

    [Fact]
    public void ResolveCorrelationId_RepeatedHeader_PicksFirstNonEmpty_NotCommaJoined()
    {
        var id = CorrelationIdMiddleware.ResolveCorrelationId(
            new StringValues(["", "  ", "first-valid", "second-valid"]));

        Assert.Equal("first-valid", id);
    }

    [Fact]
    public void ResolveCorrelationId_RepeatedHeaderAllBlank_GeneratesNewId()
    {
        var id = CorrelationIdMiddleware.ResolveCorrelationId(new StringValues(["", "   "]));

        Assert.True(Guid.TryParse(id, out _));
    }
}
