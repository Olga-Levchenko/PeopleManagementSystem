using System.Net;
using System.Text.Json;
using AccessControlService.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;

namespace AccessControlService.Api.Tests;

[Collection("HealthEndpointTests")]
public sealed class ReadinessEndpointTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer postgresContainer = new PostgreSqlBuilder("postgres:16-alpine")
        .WithDatabase("access_control_service_readiness_test")
        .WithUsername("postgres")
        .WithPassword("postgres")
        .Build();

    private WebApplicationFactory<Program> factory = null!;
    private HttpClient client = null!;

    public async Task InitializeAsync()
    {
        await postgresContainer.StartAsync();
        Environment.SetEnvironmentVariable("PORT", "5098");
        Environment.SetEnvironmentVariable("CORS_ORIGIN", "http://localhost:4200");
        Environment.SetEnvironmentVariable(
            "ConnectionStrings__Postgres",
            postgresContainer.GetConnectionString());
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", "localhost");
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", "5699");
        Environment.SetEnvironmentVariable("RABBITMQ_USER", "guest");
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", "guest");

        DbContextOptions<AccessControlDbContext> options = new DbContextOptionsBuilder<AccessControlDbContext>()
            .UseNpgsql(postgresContainer.GetConnectionString())
            .Options;
        await using AccessControlDbContext context = new(options);
        await context.Database.MigrateAsync();
        context.PersonFunctionalRoleAssignments.Add(new PersonFunctionalRoleAssignment
        {
            Id = Guid.NewGuid(),
            PersonId = FixtureSeedData.ExecutiveId,
            FunctionalRoleId = FixtureSeedData.HrAdminRoleId,
            IsActive = true,
            AssignedAtUtc = DateTime.UtcNow,
        });
        await context.SaveChangesAsync();

        factory = new WebApplicationFactory<Program>();
        client = factory.CreateClient();
    }

    public async Task DisposeAsync()
    {
        client.Dispose();
        await factory.DisposeAsync();
        Environment.SetEnvironmentVariable("PORT", null);
        Environment.SetEnvironmentVariable("CORS_ORIGIN", null);
        Environment.SetEnvironmentVariable("ConnectionStrings__Postgres", null);
        Environment.SetEnvironmentVariable("RABBITMQ_HOST", null);
        Environment.SetEnvironmentVariable("RABBITMQ_PORT", null);
        Environment.SetEnvironmentVariable("RABBITMQ_USER", null);
        Environment.SetEnvironmentVariable("RABBITMQ_PASSWORD", null);
        await postgresContainer.DisposeAsync();
    }

    [Fact]
    public async Task Readiness_WithActiveAdministrator_ReturnsReady()
    {
        using HttpResponseMessage response = await client.GetAsync("/api/v1/readiness");
        using JsonDocument body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(body.RootElement.GetProperty("ready").GetBoolean());
        Assert.DoesNotContain("personId", body.RootElement.ToString(), StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("role", body.RootElement.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Readiness_WithNoActiveAdministrator_ReturnsUnreadyWithoutDetails()
    {
        using (IServiceScope scope = factory.Services.CreateScope())
        {
            AccessControlDbContext context = scope.ServiceProvider
                .GetRequiredService<AccessControlDbContext>();
            context.PersonFunctionalRoleAssignments.RemoveRange(
                await context.PersonFunctionalRoleAssignments.ToListAsync());
            await context.SaveChangesAsync();
        }

        using HttpResponseMessage response = await client.GetAsync("/api/v1/readiness");
        using JsonDocument body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.False(body.RootElement.GetProperty("ready").GetBoolean());
        Assert.Single(body.RootElement.EnumerateObject());
    }
}
