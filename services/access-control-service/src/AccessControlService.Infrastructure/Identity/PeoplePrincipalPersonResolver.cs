using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using AccessControlService.Domain.Identity;

namespace AccessControlService.Infrastructure.Identity;

public sealed class PeoplePrincipalPersonResolver : IPrincipalPersonResolver
{
    private const string RESOLVE_PATH = "/api/v1/internal/identity-mappings/resolve";
    private static readonly JsonSerializerOptions JSON_OPTIONS = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    private readonly HttpClient httpClient;
    private readonly PeopleIdentityResolverOptions options;
    private readonly IInternalServiceCredentialProvider credentialProvider;
    private readonly ICorrelationIdAccessor correlationIdAccessor;

    public PeoplePrincipalPersonResolver(
        HttpClient httpClient,
        PeopleIdentityResolverOptions options,
        IInternalServiceCredentialProvider credentialProvider,
        ICorrelationIdAccessor correlationIdAccessor)
    {
        this.httpClient = httpClient;
        this.options = options;
        this.credentialProvider = credentialProvider;
        this.correlationIdAccessor = correlationIdAccessor;
    }

    public async Task<PrincipalPersonResolution> ResolvePersonAsync(
        OidcPrincipalIdentity identity,
        CancellationToken cancellationToken = default)
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

        InternalServiceCredentialResult credential =
            await credentialProvider.GetAsync(cancellationToken);
        if (credential is not InternalServiceCredentialResult.Available available ||
            string.IsNullOrWhiteSpace(available.Scheme) ||
            string.IsNullOrWhiteSpace(available.Credential))
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
                new Uri(options.BaseAddress, RESOLVE_PATH));
            request.Content = JsonContent.Create(new
            {
                issuer = canonicalIdentity.Issuer,
                subject = canonicalIdentity.Subject,
            });
            request.Headers.Authorization = new AuthenticationHeaderValue(
                available.Scheme,
                available.Credential);

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
