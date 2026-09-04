using AccessControlService.Api;
using AccessControlService.Api.Configuration;
using AccessControlService.Api.Health;
using AccessControlService.Api.Middleware;
using AccessControlService.Domain;
using AccessControlService.Infrastructure.Messaging;
using AccessControlService.Infrastructure.Persistence;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;

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

builder.Services.AddControllers();
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
builder.Services.AddScoped<IFullProfileAccessRepository, EfFullProfileAccessRepository>();
builder.Services.AddScoped<AccessRoleResolver>();

// spec-1-1d: the pure, transport-agnostic project-assignment event processor. Scoped because its
// DbContext dependency is scoped -- spec-1-1e's consumer below creates one DI scope per message
// rather than resolving this once at startup.
builder.Services.AddScoped<ProjectAssignmentEventProcessor>();

// spec-1-5: zero-holder fail-fast check -- runs after DI is fully built, before the host begins
// serving requests. If full_profile_access_grants has zero rows the application fails immediately
// with a descriptive error naming the missing bootstrap state (spec §2.4: first holder is seeded
// at deployment, and the last holder can never be removed via the revoke endpoint).
builder.Services.AddHostedService<FullProfileAccessStartupValidation>();

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
