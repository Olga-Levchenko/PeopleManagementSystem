using AccessControlService.Api.Configuration;
using AccessControlService.Api.Health;
using AccessControlService.Api.Middleware;
using AccessControlService.Domain;
using AccessControlService.Domain.Identity;
using AccessControlService.Infrastructure.Messaging;
using AccessControlService.Infrastructure.Identity;
using AccessControlService.Infrastructure.Permissions;
using AccessControlService.Infrastructure.Persistence;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Text.Json.Serialization;

// Load '.env' for local-dev parity with the Node services (committed '.env' is gitignored,
// '.env.example' is the template). Never clobbers a variable already set in the process
// environment, so CI/test-injected env vars always win, and a missing '.env' file is a no-op
// rather than a startup failure. Must run BEFORE WebApplication.CreateBuilder: the environment
// variables configuration provider it adds internally snapshots process env vars at that point,
// so loading '.env' afterward would be invisible to IConfiguration. Only reads '.env' from the
// process's own working directory -- no upward directory traversal -- matching the Node services'
// convention (NestJS's ConfigModule.forRoot()) rather than risking an unrelated ancestor '.env'
// (e.g. from the repo root or 'infra/') depending on where 'dotnet run'/'dotnet test' is invoked from.
DotNetEnv.Env.NoClobber().Load();

var builder = WebApplication.CreateBuilder(args);

var appConfig = AppConfig.Load(builder.Configuration);

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(appConfig.CorsOrigin)
            .AllowAnyHeader()
            .AllowAnyMethod());
});

builder.Services.AddHealthChecks()
    .AddNpgSql(appConfig.PostgresConnectionString, name: "postgres");

// Composition root wiring for the hexagonal split (AD-1): Infrastructure's EF Core repository is
// bound to the Domain-defined IRelationshipRepository port here, never the other way round.
// Deliberately no Database.Migrate()/EnsureCreated() call here -- migrations are applied
// explicitly (see AccessControlService.Infrastructure's Persistence/Migrations), so the app keeps
// booting fine (health check reporting Unhealthy, not crashing) when Postgres is down or
// unmigrated.
builder.Services.AddDbContext<AccessControlDbContext>(options =>
    options.UseNpgsql(appConfig.PostgresConnectionString));
builder.Services.AddScoped<IRelationshipRepository, EfRelationshipRepository>();
builder.Services.AddScoped<AccessRoleResolver>();
builder.Services.AddScoped<FunctionalRoleAdministrationService>();
builder.Services.AddScoped<IPrincipalPersonResolver, UnavailablePrincipalPersonResolver>();
builder.Services.AddScoped<
    ITrustedServicePrincipalAuthorizer,
    UnavailableTrustedServicePrincipalAuthorizer>();

// spec-1-1d: the pure, transport-agnostic project-assignment event processor. Scoped because its
// DbContext dependency is scoped -- spec-1-1e's consumer below creates one DI scope per message
// rather than resolving this once at startup.
builder.Services.AddScoped<ProjectAssignmentEventProcessor>();

// spec-1-1e: the real RabbitMQ.Client wiring that calls ProcessAsync. RabbitMqConnectionOptions is
// a plain data holder in Infrastructure with no dependency on this project's own AppConfig (AD-1
// composition only flows this direction) -- mapped here from the same fail-fast-validated config
// values as everything else in appConfig.
builder.Services.AddSingleton(new RabbitMqConnectionOptions
{
    HostName = appConfig.RabbitMqHost,
    Port = appConfig.RabbitMqPort,
    UserName = appConfig.RabbitMqUser,
    Password = appConfig.RabbitMqPassword,
});
builder.Services.AddHostedService<ProjectAssignmentEventConsumer>();

builder.WebHost.UseUrls($"http://0.0.0.0:{appConfig.Port}");

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();

app.UseMiddleware<CorrelationIdMiddleware>();

app.MapControllers();

app.MapHealthChecks("/api/v1/health", new HealthCheckOptions
{
    ResponseWriter = HealthCheckResponseWriter.WriteResponse,
});

// Wrap startup so a port-bind failure (PORT already in use) surfaces as a clear, descriptive
// exception naming the offending port -- consistent with AppConfig's fail-fast style elsewhere in
// this file -- rather than a raw framework IOException/SocketException with no indication of which
// configured value caused it.
try
{
    app.Run();
}
catch (IOException ex)
{
    throw new InvalidOperationException(
        $"Failed to start listening on configured PORT '{appConfig.Port}'. It may already be in use " +
        "by another process. See the inner exception for details.",
        ex);
}

// Exposes the implicit Program class to WebApplicationFactory<Program> in the test project.
public partial class Program
{
}
