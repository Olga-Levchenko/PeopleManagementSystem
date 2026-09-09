using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using AccessControlService.Domain.Identity;

namespace AccessControlService.Infrastructure.Identity;

public sealed class PeoplePrincipalPersonResolver
    : IPrincipalPersonResolver, IBootstrapTargetPersonResolver
{
    private const string RESOLVE_PATH = "/api/v1/internal/identity-mappings/resolve";
    private const string BOOTSTRAP_RESOLVE_PATH =
        "/api/v1/internal/bootstrap/identity-mappings/resolve";
    private static readonly JsonSerializerOptions JSON_OPTIONS = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    private readonly HttpClient httpClient;
    private readonly PeopleIdentityResolverOptions options;
    private readonly ServiceTokenExchange tokenExchange;
    private readonly IIncomingAccessTokenAccessor accessTokenAccessor;
    private readonly ICorrelationIdAccessor correlationIdAccessor;
    private readonly IInternalServiceCredentialProvider? legacyCredentialProvider;

    public PeoplePrincipalPersonResolver(
        HttpClient httpClient,
        PeopleIdentityResolverOptions options,
        ServiceTokenExchange tokenExchange,
        IIncomingAccessTokenAccessor accessTokenAccessor,
        ICorrelationIdAccessor correlationIdAccessor)
    {
        this.httpClient = httpClient;
        this.options = options;
        this.tokenExchange = tokenExchange;
        this.accessTokenAccessor = accessTokenAccessor;
        this.correlationIdAccessor = correlationIdAccessor;
    }

    public PeoplePrincipalPersonResolver(
        HttpClient httpClient,
        PeopleIdentityResolverOptions options,
        IInternalServiceCredentialProvider credentialProvider,
        ICorrelationIdAccessor correlationIdAccessor)
        : this(
            httpClient,
            options,
            new ServiceTokenExchange(httpClient, options),
            new UnavailableIncomingAccessTokenAccessor(),
            correlationIdAccessor)
    {
        legacyCredentialProvider = credentialProvider;
    }

    public async Task<PrincipalPersonResolution> ResolvePersonAsync(
        OidcPrincipalIdentity identity,
        CancellationToken cancellationToken = default)
    {
        return await ResolveAsync(identity, RESOLVE_PATH, cancellationToken);
    }

    public async Task<PrincipalPersonResolution> ResolveBootstrapTargetAsync(
        OidcPrincipalIdentity identity,
        CancellationToken cancellationToken = default)
    {
        return await ResolveAsync(identity, BOOTSTRAP_RESOLVE_PATH, cancellationToken);
    }

    private async Task<PrincipalPersonResolution> ResolveAsync(
        OidcPrincipalIdentity identity,
        string path,
        CancellationToken cancellationToken)
    {
        if (!OidcPrincipalIdentity.TryCreate(
                identity.Issuer,
                identity.Subject,
                options.AllowInsecureHttp,
                out OidcPrincipalIdentity? canonicalIdentity) ||
            canonicalIdentity is null)
        {
            return new PrincipalPersonResolution.InvalidIdentity();
        }

        if (options.BaseAddress is null ||
            options.Timeout <= TimeSpan.Zero ||
            options.AllowedIssuers is null ||
            options.AllowedIssuers.Count == 0)
        {
            return new PrincipalPersonResolution.Unavailable();
        }
        if (!options.AllowedIssuers.Contains(canonicalIdentity.Issuer))
        {
            return new PrincipalPersonResolution.InvalidIdentity();
        }

        string? delegatedToken;
        if (legacyCredentialProvider is not null)
        {
            InternalServiceCredentialResult credential =
                await legacyCredentialProvider.GetAsync(cancellationToken);
            delegatedToken = credential is InternalServiceCredentialResult.Available available &&
                string.Equals(available.Scheme, "Bearer", StringComparison.Ordinal) &&
                !string.IsNullOrWhiteSpace(available.Credential)
                ? available.Credential
                : null;
        }
        else
        {
            delegatedToken = await tokenExchange.ExchangeForPeopleAsync(
                accessTokenAccessor.Current,
                cancellationToken);
        }
        if (string.IsNullOrWhiteSpace(delegatedToken))
        {
            return new PrincipalPersonResolution.Unavailable();
        }

        using CancellationTokenSource timeoutCancellation =
            CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCancellation.CancelAfter(options.Timeout);

        try
        {
            using HttpRequestMessage request = new(
                HttpMethod.Post,
                new Uri(options.BaseAddress, path));
            request.Content = JsonContent.Create(new
            {
                issuer = canonicalIdentity.Issuer,
                subject = canonicalIdentity.Subject,
            });
            request.Headers.Authorization = new AuthenticationHeaderValue(
                "Bearer",
                delegatedToken);

            string? correlationId = correlationIdAccessor.Current;
            if (!string.IsNullOrWhiteSpace(correlationId))
            {
                request.Headers.TryAddWithoutValidation(
                    "x-correlation-id",
                    correlationId);
            }

            using HttpResponseMessage response = await httpClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                timeoutCancellation.Token);

            return await MapResponseAsync(response, timeoutCancellation.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new PrincipalPersonResolution.Unavailable();
        }
        catch (HttpRequestException)
        {
            return new PrincipalPersonResolution.Unavailable();
        }
        catch (JsonException)
        {
            return new PrincipalPersonResolution.Unavailable();
        }
        catch (FormatException)
        {
            return new PrincipalPersonResolution.Unavailable();
        }
    }

    private static async Task<PrincipalPersonResolution> MapResponseAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        return response.StatusCode switch
        {
            System.Net.HttpStatusCode.OK => await ReadResolvedAsync(
                response,
                cancellationToken),
            System.Net.HttpStatusCode.BadRequest => new PrincipalPersonResolution.InvalidIdentity(),
            System.Net.HttpStatusCode.NotFound => new PrincipalPersonResolution.Missing(),
            System.Net.HttpStatusCode.Conflict => new PrincipalPersonResolution.Ambiguous(),
            _ => new PrincipalPersonResolution.Unavailable(),
        };
    }

    private static async Task<PrincipalPersonResolution> ReadResolvedAsync(
        HttpResponseMessage response,
        CancellationToken cancellationToken)
    {
        ResolvePersonResponse? payload =
            await response.Content.ReadFromJsonAsync<ResolvePersonResponse>(
                JSON_OPTIONS,
                cancellationToken);
        return payload?.PersonId is Guid personId && personId != Guid.Empty
            ? new PrincipalPersonResolution.Resolved(personId)
            : new PrincipalPersonResolution.Unavailable();
    }

    private sealed record ResolvePersonResponse(Guid PersonId);

}

internal sealed class UnavailableIncomingAccessTokenAccessor
    : IIncomingAccessTokenAccessor
{
    public string? Current => null;
}
