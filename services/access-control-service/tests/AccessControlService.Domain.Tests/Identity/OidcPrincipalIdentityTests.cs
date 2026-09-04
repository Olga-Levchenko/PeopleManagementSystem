using AccessControlService.Domain.Identity;
using System.Text.Json;

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

    [Fact]
    public void TryCreate_MatchesSharedIssuerFixtureForProductionAndLocalRules()
    {
        foreach (IssuerCase issuerCase in ReadIssuerCases())
        {
            bool productionValid = OidcPrincipalIdentity.TryCreate(
                issuerCase.Issuer,
                issuerCase.Subject,
                allowInsecureHttp: false,
                out OidcPrincipalIdentity? productionIdentity);
            bool localValid = OidcPrincipalIdentity.TryCreate(
                issuerCase.Issuer,
                issuerCase.Subject,
                allowInsecureHttp: true,
                out OidcPrincipalIdentity? localIdentity);

            Assert.Equal(issuerCase.ValidInProduction, productionValid);
            Assert.Equal(issuerCase.ValidInLocal, localValid);
            if (productionValid || localValid)
            {
                Assert.Equal(issuerCase.CanonicalIssuer, (productionIdentity ?? localIdentity)!.Issuer);
                Assert.Equal(issuerCase.Subject, (productionIdentity ?? localIdentity)!.Subject);
            }
        }
    }

    private static IReadOnlyList<IssuerCase> ReadIssuerCases()
    {
        DirectoryInfo? directory = new(AppContext.BaseDirectory);
        while (directory is not null)
        {
            string path = Path.Combine(
                directory.FullName,
                "docs",
                "integrations",
                "contracts",
                "people-identity-resolution.issuer-cases.v1.json");
            if (File.Exists(path))
            {
                return JsonSerializer.Deserialize<IssuerCase[]>(File.ReadAllText(path)) ??
                    throw new InvalidOperationException("Issuer fixture was empty.");
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException("Issuer fixture was not found.");
    }

    private sealed record IssuerCase(
        string Issuer,
        string Subject,
        string? CanonicalIssuer,
        bool ValidInProduction,
        bool ValidInLocal);
}
