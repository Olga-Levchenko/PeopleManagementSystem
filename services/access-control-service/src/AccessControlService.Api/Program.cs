using AccessControlService.Api;
using AccessControlService.Api.Configuration;
using AccessControlService.Api.ErrorHandling;
using AccessControlService.Api.Health;
using AccessControlService.Api.Middleware;
using AccessControlService.Domain;
using AccessControlService.Domain.Identity;
using AccessControlService.Infrastructure.Messaging;
using AccessControlService.Infrastructure.Identity;
using AccessControlService.Infrastructure.Permissions;
using AccessControlService.Infrastructure.Persistence;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Security.Cryptography;

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

var appConfig = AppConfig.Load(
    builder.Configuration,
    builder.Environment.EnvironmentName);
builder.Services.AddSingleton(appConfig);
const string TARGET_AUDIENCE = "access-control-service";

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IIncomingAccessTokenAccessor, HttpIncomingAccessTokenAccessor>();
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = appConfig.OidcIssuer;
        options.MetadataAddress =
            $"{appConfig.OidcIssuer}/.well-known/openid-configuration";
        options.RequireHttpsMetadata = !appConfig.AllowInsecureOidcHttp;
        options.ConfigurationManager = new ConfigurationManager<OpenIdConnectConfiguration>(
            options.MetadataAddress,
            new OpenIdConnectConfigurationRetriever(),
            new HttpDocumentRetriever
            {
                RequireHttps = options.RequireHttpsMetadata,
            });
        options.Audience = TARGET_AUDIENCE;
        options.SaveToken = false;
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = appConfig.OidcIssuer,
            ValidateAudience = true,
            ValidAudiences = [TARGET_AUDIENCE],
            ValidateLifetime = true,
            RequireExpirationTime = true,
            RequireSignedTokens = true,
            ValidateIssuerSigningKey = true,
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
            ClockSkew = TimeSpan.FromSeconds(5),
        };
        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = context =>
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                context.Fail("Authentication failed.");
                return Task.CompletedTask;
            },
            OnTokenValidated = context =>
            {
                string? subject = context.Principal?.FindFirst("sub")?.Value;
                if (string.IsNullOrWhiteSpace(subject))
                {
                    context.Fail("The verified token does not contain a usable subject.");
                }
                else if (!context.Principal!
                    .FindAll("aud")
                    .Select(claim => claim.Value)
                    .Contains(TARGET_AUDIENCE, StringComparer.Ordinal))
                {
                    context.Fail("The verified token is not intended for this service.");
                }

                return Task.CompletedTask;
            },
        };
    });
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy(
        "AdministrationJwt",
        policy => policy
            .AddAuthenticationSchemes(JwtBearerDefaults.AuthenticationScheme)
            .RequireAuthenticatedUser()
            .RequireClaim("azp", "bff-confidential")
            .RequireClaim("aud", "access-control-service"));
    options.AddPolicy(
        "PeopleServiceJwt",
        policy => policy
            .AddAuthenticationSchemes(JwtBearerDefaults.AuthenticationScheme)
            .RequireAuthenticatedUser()
            .RequireClaim("azp", "people-service")
            .RequireClaim("aud", "access-control-service"));
    options.AddPolicy(
        "AccessRoleResolutionJwt",
        policy => policy
            .AddAuthenticationSchemes(JwtBearerDefaults.AuthenticationScheme)
            .RequireAuthenticatedUser()
            .RequireClaim("aud", "access-control-service")
            .RequireAssertion(context =>
                context.User.FindAll("azp").Any(claim =>
                    claim.Value is "people-service" or "work-management-service")));
    options.AddPolicy(
        "DeploymentBootstrapJwt",
        policy => policy
            .AddAuthenticationSchemes(JwtBearerDefaults.AuthenticationScheme)
            .RequireAuthenticatedUser()
            .RequireClaim("azp", "deployment-bootstrap")
            .RequireClaim("aud", "access-control-service"));
});

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
builder.Services.AddScoped<FunctionalRoleAdministrationService>();
builder.Services.AddScoped<FunctionalRoleReconciliationService>();
builder.Services.AddSingleton(new PeopleIdentityResolverOptions(
    appConfig.PeopleServiceBaseUrl,
    TimeSpan.FromSeconds(2),
    appConfig.AllowedOidcIssuers,
    appConfig.AllowInsecureOidcHttp,
    $"{appConfig.OidcIssuer}/protocol/openid-connect/token",
    appConfig.ServiceAuthPrivateKeyPath,
    appConfig.ServiceAuthKeyId));
builder.Services.AddHttpClient<PeoplePrincipalPersonResolver>();
builder.Services.AddHttpClient<ServiceTokenExchange>();
builder.Services.AddScoped<IPrincipalPersonResolver, PeoplePrincipalPersonResolver>();
builder.Services.AddScoped<IBootstrapTargetPersonResolver, PeoplePrincipalPersonResolver>();
builder.Services.AddScoped<ICorrelationIdAccessor, HttpCorrelationIdAccessor>();
builder.Services.AddScoped<
    IBootstrapProvisioningService,
    FunctionalRoleBootstrapProvisioningService>();
builder.Services.AddScoped<IBootstrapRecoveryService, FunctionalRoleRecoveryService>();
builder.Services.AddScoped<
    IDeploymentRecoveryAuthorizer,
    UnavailableDeploymentRecoveryAuthorizer>();
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

app.MapGet("/.well-known/jwks.json", async () =>
{
    if (string.IsNullOrWhiteSpace(appConfig.ServiceAuthPrivateKeyPath) ||
        string.IsNullOrWhiteSpace(appConfig.ServiceAuthKeyId))
    {
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }

    try
    {
        using RSA rsa = RSA.Create();
        rsa.ImportFromPem(
            await File.ReadAllTextAsync(appConfig.ServiceAuthPrivateKeyPath));
        RSAParameters parameters = rsa.ExportParameters(false);
        return Results.Json(new
        {
            keys = new[]
            {
                new
                {
                    kty = "RSA",
                    n = Base64Url(parameters.Modulus!),
                    e = Base64Url(parameters.Exponent!),
                    kid = appConfig.ServiceAuthKeyId,
                    alg = "RS256",
                    use = "sig",
                },
            },
        });
    }
    catch (IOException)
    {
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }
    catch (CryptographicException)
    {
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }
});

app.MapGet("/.well-known/deployment-bootstrap-jwks.json", async () =>
{
    if (string.IsNullOrWhiteSpace(appConfig.DeploymentBootstrapPublicKeyPath) ||
        string.IsNullOrWhiteSpace(appConfig.DeploymentBootstrapKeyId))
    {
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }

    try
    {
        using RSA rsa = RSA.Create();
        rsa.ImportFromPem(
            await File.ReadAllTextAsync(appConfig.DeploymentBootstrapPublicKeyPath));
        RSAParameters parameters = rsa.ExportParameters(false);
        return Results.Json(new
        {
            keys = new[]
            {
                new
                {
                    kty = "RSA",
                    n = Base64Url(parameters.Modulus!),
                    e = Base64Url(parameters.Exponent!),
                    kid = appConfig.DeploymentBootstrapKeyId,
                    alg = "RS256",
                    use = "sig",
                },
            },
        });
    }
    catch (IOException)
    {
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }
    catch (CryptographicException)
    {
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();

app.UseMiddleware<CorrelationIdMiddleware>();
app.UseMiddleware<SafeExceptionHandlingMiddleware>();
app.UseAuthentication();
app.UseAuthorization();

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

static string Base64Url(byte[] value) =>
    Convert.ToBase64String(value)
        .TrimEnd('=')
        .Replace('+', '-')
        .Replace('/', '_');

// Exposes the implicit Program class to WebApplicationFactory<Program> in the test project.
public partial class Program
{
}
