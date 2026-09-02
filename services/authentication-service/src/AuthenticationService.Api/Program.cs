using AuthenticationService.Api.Configuration;
using AuthenticationService.Api.Health;
using AuthenticationService.Api.Middleware;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;

// Load '.env' for local-dev parity with the Node services (committed '.env' is gitignored,
// '.env.example' is the template). Never clobbers a variable already set in the process
// environment, so CI/test-injected env vars always win, and a missing '.env' file is a no-op
// rather than a startup failure. Must run BEFORE WebApplication.CreateBuilder: the environment
// variables configuration provider it adds internally snapshots process env vars at that point,
// so loading '.env' afterward would be invisible to IConfiguration. Only reads '.env' from the
// process's own working directory -- no upward directory traversal -- matching
// access-control-service's own convention (and the Node services' NestJS ConfigModule.forRoot()).
DotNetEnv.Env.NoClobber().Load();

var builder = WebApplication.CreateBuilder(args);

var appConfig = AppConfig.Load(builder.Configuration);

// Registered in DI so AuthConfigController can resolve issuer/jwksUri/realm without re-deriving
// them or re-reading IConfiguration itself -- AppConfig is the single validated source of truth.
builder.Services.AddSingleton(appConfig);

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

// Pings the realm's own OIDC discovery document -- proves both "Keycloak is up" and "our realm
// actually exists" in one check, not just a bare TCP ping. This service is stateless (no
// database of its own), so this is the only real dependency check it has. An explicit 5s timeout
// keeps a merely-slow (not down) Keycloak from hanging /api/v1/health for the HttpClient default
// timeout -- "unreachable" and "slow" must both surface as unhealthy promptly, not just the former.
builder.Services.AddHealthChecks()
    .AddUrlGroup(
        new Uri(appConfig.DiscoveryDocumentUri),
        name: "keycloak",
        timeout: TimeSpan.FromSeconds(5));

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
