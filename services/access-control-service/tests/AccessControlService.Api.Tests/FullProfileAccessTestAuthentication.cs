using System.Security.Claims;
using AccessControlService.Domain.Identity;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AccessControlService.Api.Tests;

internal static class FullProfileAccessTestAuthentication
{
    public const string SCHEME = "FullProfileAccessTest";
    public const string SUBJECT_HEADER = "X-Test-Sub";
    public const string ANONYMOUS_HEADER = "X-Test-Anonymous";
    public const string ISSUER = "https://id.example.test/realms/people-management";

    public static void Configure(IServiceCollection services)
    {
        services.AddSingleton<IPrincipalPersonResolver, TestPrincipalPersonResolver>();
        services.AddAuthentication(SCHEME)
            .AddScheme<AuthenticationSchemeOptions, Handler>(SCHEME, _ => { });
        services.AddAuthorization(options =>
        {
            options.AddPolicy(
                "AdministrationJwt",
                policy => policy
                    .AddAuthenticationSchemes(SCHEME)
                    .RequireAuthenticatedUser()
                    .RequireClaim("azp", "bff-confidential")
                    .RequireClaim("aud", "access-control-service"));
            options.AddPolicy(
                "AccessRoleResolutionJwt",
                policy => policy
                    .AddAuthenticationSchemes(SCHEME)
                    .RequireAuthenticatedUser()
                    .RequireClaim("azp", "people-service")
                    .RequireClaim("aud", "access-control-service"));
        });
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

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (Request.Headers.ContainsKey(ANONYMOUS_HEADER))
            {
                return Task.FromResult(AuthenticateResult.NoResult());
            }

            string? subject = Request.Headers[SUBJECT_HEADER].FirstOrDefault();
            if (!Guid.TryParse(subject, out _))
            {
                return Task.FromResult(AuthenticateResult.NoResult());
            }

            ClaimsIdentity identity = new(
                [
                    new Claim("iss", ISSUER),
                    new Claim("sub", subject),
                    new Claim("azp", "bff-confidential"),
                    new Claim("azp", "people-service"),
                    new Claim("aud", "access-control-service"),
                ],
                SCHEME);
            return Task.FromResult(AuthenticateResult.Success(
                new AuthenticationTicket(new ClaimsPrincipal(identity), SCHEME)));
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
