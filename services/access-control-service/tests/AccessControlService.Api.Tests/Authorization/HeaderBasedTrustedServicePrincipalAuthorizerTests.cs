using AccessControlService.Api.Authorization;
using AccessControlService.Api.Configuration;
using AccessControlService.Api.Tests.Testing;
using AccessControlService.Domain.Identity;
using Microsoft.AspNetCore.Http;

namespace AccessControlService.Api.Tests.Authorization;

public sealed class HeaderBasedTrustedServicePrincipalAuthorizerTests
{
    private static AppConfig MakeConfig(string? secret) => AppConfig.Load(
        new FakeConfiguration(new Dictionary<string, string?>
        {
            ["PORT"] = "3007",
            ["CORS_ORIGIN"] = "http://localhost:4200",
            ["ConnectionStrings:Postgres"] = "Host=localhost;Database=acs",
            ["RABBITMQ_HOST"] = "localhost",
            ["RABBITMQ_PORT"] = "5672",
            ["RABBITMQ_USER"] = "guest",
            ["RABBITMQ_PASSWORD"] = "guest",
            ["INTERNAL_SERVICE_SECRET"] = secret,
        }));

    private static IHttpContextAccessor MakeAccessor(
        Dictionary<string, string>? headers = null)
    {
        var context = new DefaultHttpContext();
        if (headers is not null)
        {
            foreach (KeyValuePair<string, string> header in headers)
                context.Request.Headers[header.Key] = header.Value;
        }

        return new FakeHttpContextAccessor(context);
    }

    private sealed class FakeHttpContextAccessor(HttpContext? httpContext) : IHttpContextAccessor
    {
        public HttpContext? HttpContext { get; set; } = httpContext;
    }

    [Fact]
    public async Task AuthorizeAsync_WhenSecretNotConfigured_ReturnsUnavailable()
    {
        AppConfig config = MakeConfig(secret: null);
        var authorizer = new HeaderBasedTrustedServicePrincipalAuthorizer(
            MakeAccessor(), config);

        TrustedPermissionCheckAuthorization result = await authorizer.AuthorizeAsync();

        Assert.IsType<TrustedPermissionCheckAuthorization.Unavailable>(result);
    }

    [Fact]
    public async Task AuthorizeAsync_WhenNoSecretHeader_ReturnsUnauthorized()
    {
        AppConfig config = MakeConfig(secret: "my-secret");
        var authorizer = new HeaderBasedTrustedServicePrincipalAuthorizer(
            MakeAccessor(), config);

        TrustedPermissionCheckAuthorization result = await authorizer.AuthorizeAsync();

        Assert.IsType<TrustedPermissionCheckAuthorization.Unauthorized>(result);
    }

    [Fact]
    public async Task AuthorizeAsync_WhenWrongSecret_ReturnsUnauthorized()
    {
        AppConfig config = MakeConfig(secret: "correct-secret");
        var authorizer = new HeaderBasedTrustedServicePrincipalAuthorizer(
            MakeAccessor(new Dictionary<string, string>
            {
                ["X-Internal-Service-Secret"] = "wrong-secret",
                ["X-Internal-Service-Identity"] = "people-service",
                ["X-Delegated-Actor-Issuer"] = "https://keycloak/realms/test",
                ["X-Delegated-Actor-Sub"] = "user-sub",
            }), config);

        TrustedPermissionCheckAuthorization result = await authorizer.AuthorizeAsync();

        Assert.IsType<TrustedPermissionCheckAuthorization.Unauthorized>(result);
    }

    [Theory]
    [InlineData("X-Internal-Service-Identity")]
    [InlineData("X-Delegated-Actor-Issuer")]
    [InlineData("X-Delegated-Actor-Sub")]
    public async Task AuthorizeAsync_WhenRequiredDelegatedHeaderMissing_ReturnsUnauthorized(
        string missingHeader)
    {
        AppConfig config = MakeConfig(secret: "my-secret");
        var allHeaders = new Dictionary<string, string>
        {
            ["X-Internal-Service-Secret"] = "my-secret",
            ["X-Internal-Service-Identity"] = "people-service",
            ["X-Delegated-Actor-Issuer"] = "https://keycloak/realms/test",
            ["X-Delegated-Actor-Sub"] = "user-sub",
        };
        allHeaders.Remove(missingHeader);

        var authorizer = new HeaderBasedTrustedServicePrincipalAuthorizer(
            MakeAccessor(allHeaders), config);

        TrustedPermissionCheckAuthorization result = await authorizer.AuthorizeAsync();

        Assert.IsType<TrustedPermissionCheckAuthorization.Unauthorized>(result);
    }

    [Fact]
    public async Task AuthorizeAsync_WhenValidRequest_ReturnsAuthorizedWithContext()
    {
        AppConfig config = MakeConfig(secret: "my-secret");
        var authorizer = new HeaderBasedTrustedServicePrincipalAuthorizer(
            MakeAccessor(new Dictionary<string, string>
            {
                ["X-Internal-Service-Secret"] = "my-secret",
                ["X-Internal-Service-Identity"] = "people-service",
                ["X-Delegated-Actor-Issuer"] = "https://keycloak/realms/people-management",
                ["X-Delegated-Actor-Sub"] = "sub-12345",
            }), config);

        TrustedPermissionCheckAuthorization result = await authorizer.AuthorizeAsync();

        TrustedPermissionCheckAuthorization.Authorized authorized =
            Assert.IsType<TrustedPermissionCheckAuthorization.Authorized>(result);
        Assert.Equal("people-service", authorized.Context.ServiceIdentity);
        Assert.Equal("https://keycloak/realms/people-management", authorized.Context.DelegatedActorIssuer);
        Assert.Equal("sub-12345", authorized.Context.DelegatedActorSub);
    }
}
