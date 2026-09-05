using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace AccessControlService.Api.Tests;

[Collection("HealthEndpointTests")]
public sealed class FunctionalRolesControllerTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly HttpClient client;

    public FunctionalRolesControllerTests(WebApplicationFactory<Program> factory)
    {
        Environment.SetEnvironmentVariable("PORT", "5099");
        Environment.SetEnvironmentVariable("CORS_ORIGIN", "http://localhost:4200");
        Environment.SetEnvironmentVariable(
            "ConnectionStrings__Postgres",
            "Host=localhost;Port=5499;Database=access_control_service_test;Username=postgres;Password=postgres;Timeout=1");
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", "localhost");
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", "5699");
        Environment.SetEnvironmentVariable("RABBITMQ_USER", "guest");
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", "guest");
        client = factory.CreateClient();
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("PORT", null);
        Environment.SetEnvironmentVariable("CORS_ORIGIN", null);
        Environment.SetEnvironmentVariable("ConnectionStrings__Postgres", null);
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", null);
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", null);
        Environment.SetEnvironmentVariable("RABBITMQ_USER", null);
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", null);
        client.Dispose();
    }

    [Fact]
    public async Task Catalogue_WithoutVerifiedPrincipal_ReturnsUnauthorized()
    {
        using HttpResponseMessage response = await client.GetAsync("/api/v1/permissions/catalogue");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Assignments_WithoutStoredAdministrationPermission_ReturnsUnauthorized()
    {
        using HttpResponseMessage response = await client.GetAsync(
            "/api/v1/people/22222222-0000-0000-0000-000000000001/functional-roles");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task RolePermissions_WithoutVerifiedPrincipal_ReturnsUnauthorized()
    {
        using HttpResponseMessage response = await client.GetAsync(
            "/api/v1/functional-roles/hr-admin/permissions");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PermissionCheck_WithoutTrustedServicePrincipal_ReturnsServiceUnavailable()
    {
        using HttpResponseMessage response = await client.PostAsync(
            "/api/v1/permissions/check",
            new StringContent(
                """{"permissionKey":"view-dashboard","scope":null}""",
                System.Text.Encoding.UTF8,
                "application/json"));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task CreateRole_WithUnknownRequestField_ReturnsBadRequest()
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/functional-roles")
        {
            Content = new StringContent(
                """{"roleKey":"security-campaign-owner","displayName":"Security Campaign Owner","actorId":"ignored"}""",
                System.Text.Encoding.UTF8,
                "application/json"),
        };

        using HttpResponseMessage response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
