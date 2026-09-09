using System.Security.Claims;
using System.Text.Json;
using AccessControlService.Domain.Identity;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AccessControlService.Api.Tests;

internal static class AccessRoleTestAuthentication
{
    public const string SCHEME = "AccessRoleTest";
    public const string SUBJECT_HEADER = "X-Test-Sub";
    public const string ISSUER = "https://id.example.test/realms/people-management";

    public static void Configure(IServiceCollection services)
    {
        services.AddSingleton<IPrincipalPersonResolver, TestPrincipalPersonResolver>();
        services.AddAuthentication(SCHEME)
            .AddScheme<AuthenticationSchemeOptions, Handler>(SCHEME, _ => { });
        services.AddAuthorization(options =>
            options.AddPolicy(
                "AccessRoleResolutionJwt",
                policy => policy
                    .AddAuthenticationSchemes(SCHEME)
                    .RequireAuthenticatedUser()
                    .RequireClaim("azp", "people-service")
                    .RequireClaim("aud", "access-control-service")));
    }

    private sealed class Handler : AuthenticationHandler<AuthenticationSchemeOptions>
    {
        public Handler(
            IOptionsMonitor<AuthenticationSchemeOptions> options,
            ILoggerFactory logger,
            System.Text.Encodings.Web.UrlEncoder encoder)
            : base(options, logger, encoder)
        {
        }

        protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            string? subject = Request.Query["viewerPersonId"].FirstOrDefault();
            if (!Guid.TryParse(subject, out _) &&
                Request.Headers.TryGetValue(SUBJECT_HEADER, out var headerSubject))
            {
                subject = headerSubject.FirstOrDefault();
            }
            if (string.IsNullOrWhiteSpace(subject) &&
                HttpMethods.IsPost(Request.Method))
            {
                Request.EnableBuffering();
                using StreamReader reader = new(Request.Body, leaveOpen: true);
                string body = await reader.ReadToEndAsync();
                Request.Body.Position = 0;
                if (!string.IsNullOrWhiteSpace(body))
                {
                    using JsonDocument document = JsonDocument.Parse(body);
                    if (document.RootElement.TryGetProperty(
                            "viewerPersonId",
                            out JsonElement viewer))
                    {
                        subject = viewer.GetString();
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(subject) ||
                !Guid.TryParse(subject, out _))
            {
                return AuthenticateResult.NoResult();
            }

            ClaimsIdentity identity = new(
                [
                    new Claim("iss", ISSUER),
                    new Claim("sub", subject),
                    new Claim("azp", "people-service"),
                    new Claim("aud", "access-control-service"),
                ],
                SCHEME);
            return AuthenticateResult.Success(
                new AuthenticationTicket(new ClaimsPrincipal(identity), SCHEME));
        }
    }

    private sealed class TestPrincipalPersonResolver : IPrincipalPersonResolver
    {
        public Task<PrincipalPersonResolution> ResolvePersonAsync(
            OidcPrincipalIdentity identity,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<PrincipalPersonResolution>(
                Guid.TryParse(identity.Subject, out Guid personId)
                    ? new PrincipalPersonResolution.Resolved(personId)
                    : new PrincipalPersonResolution.Missing());
    }
}
