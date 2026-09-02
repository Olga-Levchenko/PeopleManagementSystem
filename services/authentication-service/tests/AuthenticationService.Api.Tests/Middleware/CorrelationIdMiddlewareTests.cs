using AuthenticationService.Api.Middleware;
using Microsoft.Extensions.Primitives;

namespace AuthenticationService.Api.Tests.Middleware;

/// <summary>
/// Mirrors <c>access-control-service</c>'s <c>CorrelationIdMiddlewareTests</c> fact-for-fact
/// against this service's own <see cref="CorrelationIdMiddleware.ResolveCorrelationId"/> -- this
/// service's own doc comment describes the middleware as "identical" to that one, so its safety-
/// filtering branches (repeated-header-first-non-empty, all-blank, control-character injection,
/// over-/at-MaxLength) need the same coverage here, not just in the sibling service.
/// </summary>
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

    [Fact]
    public void ResolveCorrelationId_ValueContainingControlCharacter_GeneratesNewId_NotEchoedVerbatim()
    {
        var id = CorrelationIdMiddleware.ResolveCorrelationId(new StringValues("abc\r\ninjected: value"));

        Assert.True(Guid.TryParse(id, out _));
    }

    [Fact]
    public void ResolveCorrelationId_ValueOverMaxLength_GeneratesNewId_NotEchoedVerbatim()
    {
        var overLong = new string('a', CorrelationIdMiddleware.MaxLength + 1);

        var id = CorrelationIdMiddleware.ResolveCorrelationId(new StringValues(overLong));

        Assert.True(Guid.TryParse(id, out _));
    }

    [Fact]
    public void ResolveCorrelationId_ValueAtMaxLength_IsEchoedUnchanged()
    {
        var exactLength = new string('a', CorrelationIdMiddleware.MaxLength);

        var id = CorrelationIdMiddleware.ResolveCorrelationId(new StringValues(exactLength));

        Assert.Equal(exactLength, id);
    }
}
