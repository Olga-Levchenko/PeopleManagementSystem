using AuthenticationService.Api.Configuration;
using Microsoft.Extensions.Configuration;

namespace AuthenticationService.Api.Tests;

/// <summary>
/// Unit-level coverage of <see cref="AppConfig"/>'s fail-fast validation and its derived
/// issuer/JWKS/discovery URLs -- no host, no network, mirroring
/// <c>access-control-service</c>'s equivalent config-validation test coverage.
/// </summary>
public class AppConfigTests
{
    private static IConfiguration BuildConfiguration(Dictionary<string, string?> values) =>
        new ConfigurationBuilder().AddInMemoryCollection(values).Build();

    private static Dictionary<string, string?> ValidValues() => new()
    {
        ["PORT"] = "3008",
        ["CORS_ORIGIN"] = "http://localhost:4200",
        ["KEYCLOAK_BASE_URL"] = "http://localhost:8080",
        ["KEYCLOAK_REALM"] = "people-management",
    };

    [Fact]
    public void Load_WithAllRequiredValues_ReturnsPopulatedConfig()
    {
        var config = AppConfig.Load(BuildConfiguration(ValidValues()));

        Assert.Equal(3008, config.Port);
        Assert.Equal("http://localhost:4200", config.CorsOrigin);
        Assert.Equal("http://localhost:8080", config.KeycloakBaseUrl);
        Assert.Equal("people-management", config.KeycloakRealm);
    }

    [Fact]
    public void Load_DerivesIssuerJwksUriAndDiscoveryDocumentUri_FromBaseUrlAndRealm()
    {
        var config = AppConfig.Load(BuildConfiguration(ValidValues()));

        Assert.Equal("http://localhost:8080/realms/people-management", config.Issuer);
        Assert.Equal(
            "http://localhost:8080/realms/people-management/protocol/openid-connect/certs",
            config.JwksUri);
        Assert.Equal(
            "http://localhost:8080/realms/people-management/.well-known/openid-configuration",
            config.DiscoveryDocumentUri);
    }

    [Fact]
    public void Load_WithTrailingSlashOnBaseUrl_TrimsItBeforeDerivingUrls()
    {
        var values = ValidValues();
        values["KEYCLOAK_BASE_URL"] = "http://localhost:8080/";

        var config = AppConfig.Load(BuildConfiguration(values));

        Assert.Equal("http://localhost:8080", config.KeycloakBaseUrl);
        Assert.Equal("http://localhost:8080/realms/people-management", config.Issuer);
    }

    [Theory]
    [InlineData("PORT")]
    [InlineData("CORS_ORIGIN")]
    [InlineData("KEYCLOAK_BASE_URL")]
    [InlineData("KEYCLOAK_REALM")]
    public void Load_WithMissingRequiredValue_ThrowsNamingTheKey(string missingKey)
    {
        var values = ValidValues();
        values.Remove(missingKey);

        var ex = Assert.Throws<InvalidOperationException>(() => AppConfig.Load(BuildConfiguration(values)));
        Assert.Contains(missingKey, ex.Message);
    }

    [Theory]
    [InlineData("PORT")]
    [InlineData("CORS_ORIGIN")]
    [InlineData("KEYCLOAK_BASE_URL")]
    [InlineData("KEYCLOAK_REALM")]
    public void Load_WithBlankRequiredValue_ThrowsNamingTheKey(string blankKey)
    {
        var values = ValidValues();
        values[blankKey] = "   ";

        var ex = Assert.Throws<InvalidOperationException>(() => AppConfig.Load(BuildConfiguration(values)));
        Assert.Contains(blankKey, ex.Message);
    }

    [Fact]
    public void Load_WithNonNumericPort_ThrowsDescriptiveException()
    {
        var values = ValidValues();
        values["PORT"] = "not-a-number";

        var ex = Assert.Throws<InvalidOperationException>(() => AppConfig.Load(BuildConfiguration(values)));
        Assert.Contains("PORT", ex.Message);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("65536")]
    [InlineData("-1")]
    public void Load_WithOutOfRangePort_ThrowsDescriptiveException(string outOfRangePort)
    {
        var values = ValidValues();
        values["PORT"] = outOfRangePort;

        var ex = Assert.Throws<InvalidOperationException>(() => AppConfig.Load(BuildConfiguration(values)));
        Assert.Contains("PORT", ex.Message);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("///")]
    public void Load_WithKeycloakBaseUrlOfOnlySlashes_ThrowsInsteadOfProducingMalformedUri(string onlySlashes)
    {
        var values = ValidValues();
        values["KEYCLOAK_BASE_URL"] = onlySlashes;

        var ex = Assert.Throws<InvalidOperationException>(() => AppConfig.Load(BuildConfiguration(values)));
        Assert.Contains("KEYCLOAK_BASE_URL", ex.Message);
    }

    [Fact]
    public void Load_WithNonAbsoluteKeycloakBaseUrl_ThrowsNamingTheKey()
    {
        var values = ValidValues();
        values["KEYCLOAK_BASE_URL"] = "not-a-url";

        var ex = Assert.Throws<InvalidOperationException>(() => AppConfig.Load(BuildConfiguration(values)));
        Assert.Contains("KEYCLOAK_BASE_URL", ex.Message);
    }

    [Theory]
    [InlineData("people/management")]
    [InlineData("people?management")]
    [InlineData("people#management")]
    [InlineData("people management")]
    public void Load_WithKeycloakRealmContainingDisallowedCharacters_ThrowsNamingTheKey(string invalidRealm)
    {
        var values = ValidValues();
        values["KEYCLOAK_REALM"] = invalidRealm;

        var ex = Assert.Throws<InvalidOperationException>(() => AppConfig.Load(BuildConfiguration(values)));
        Assert.Contains("KEYCLOAK_REALM", ex.Message);
    }

    [Theory]
    [InlineData("people-management")]
    [InlineData("people_management")]
    [InlineData("PeopleManagement123")]
    public void Load_WithKeycloakRealmOfAllowedCharacters_Succeeds(string validRealm)
    {
        var values = ValidValues();
        values["KEYCLOAK_REALM"] = validRealm;

        var config = AppConfig.Load(BuildConfiguration(values));

        Assert.Equal(validRealm, config.KeycloakRealm);
    }

    [Fact]
    public void Load_WithTrailingSlashOnCorsOrigin_TrimsItSoItMatchesABrowserOriginHeaderExactly()
    {
        var values = ValidValues();
        values["CORS_ORIGIN"] = "http://localhost:4200/";

        var config = AppConfig.Load(BuildConfiguration(values));

        Assert.Equal("http://localhost:4200", config.CorsOrigin);
    }
}
