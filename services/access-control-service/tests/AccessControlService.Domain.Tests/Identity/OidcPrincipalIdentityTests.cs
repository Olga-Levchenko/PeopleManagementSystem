using AccessControlService.Domain.Identity;

namespace AccessControlService.Domain.Tests.Identity;

public sealed class OidcPrincipalIdentityTests
{
    [Fact]
    public void TryCreate_CanonicalizesIssuerAndPreservesSubjectExactly()
    {
        bool created = OidcPrincipalIdentity.TryCreate(
            "HTTPS://ID.EXAMPLE.TEST/realms/people-management/",
            "Subject With-Case",
            out OidcPrincipalIdentity? identity);

        Assert.True(created);
        Assert.NotNull(identity);
        Assert.Equal(
            "https://id.example.test/realms/people-management",
            identity!.Issuer);
        Assert.Equal("Subject With-Case", identity.Subject);
    }

    [Theory]
    [InlineData(null, "subject")]
    [InlineData("", "subject")]
    [InlineData("https://id.example.test/realm?tenant=one", "subject")]
    [InlineData("http://id.example.test/realm", "subject")]
    [InlineData("https://id.example.test/realm", null)]
    [InlineData("https://id.example.test/realm", "")]
    [InlineData("https://id.example.test/realm", "   ")]
    public void TryCreate_RejectsInvalidIdentity(string? issuer, string? subject)
    {
        bool created = OidcPrincipalIdentity.TryCreate(
            issuer,
            subject,
            out OidcPrincipalIdentity? identity);

        Assert.False(created);
        Assert.Null(identity);
    }

    [Fact]
    public void TryCreate_KeepsDifferentIssuersIsolated()
    {
        Assert.True(OidcPrincipalIdentity.TryCreate(
            "https://issuer-one.example.test",
            "same-subject",
            out OidcPrincipalIdentity? first));
        Assert.True(OidcPrincipalIdentity.TryCreate(
            "https://issuer-two.example.test",
            "same-subject",
            out OidcPrincipalIdentity? second));

        Assert.NotEqual(first!.Issuer, second!.Issuer);
        Assert.Equal(first.Subject, second.Subject);
    }
}
