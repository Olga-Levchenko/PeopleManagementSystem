using AccessControlService.Api.Configuration;
using AccessControlService.Api.Health;
using AccessControlService.Api.Middleware;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;

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

app.Run();

// Exposes the implicit Program class to WebApplicationFactory<Program> in the test project.
public partial class Program
{
}
