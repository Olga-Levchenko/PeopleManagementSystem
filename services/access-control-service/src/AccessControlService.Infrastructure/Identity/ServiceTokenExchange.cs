using System.Security.Cryptography;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace AccessControlService.Infrastructure.Identity;

public sealed class ServiceTokenExchange
{
    private const string TOKEN_EXCHANGE_GRANT =
        "urn:ietf:params:oauth:grant-type:token-exchange";
    private const string ACCESS_TOKEN_TYPE =
        "urn:ietf:params:oauth:token-type:access_token";
    private readonly HttpClient httpClient;
    private readonly PeopleIdentityResolverOptions options;

    public ServiceTokenExchange(
        HttpClient httpClient,
        PeopleIdentityResolverOptions options)
    {
        this.httpClient = httpClient;
        this.options = options;
    }

    public async Task<string?> ExchangeForPeopleAsync(
        string? subjectToken,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(subjectToken) ||
            string.IsNullOrWhiteSpace(options.TokenEndpoint) ||
            string.IsNullOrWhiteSpace(options.ServicePrivateKeyPath) ||
            string.IsNullOrWhiteSpace(options.ServiceKeyId))
        {
            return null;
        }

        try
        {
            string now = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
            string clientAssertion = await CreateClientAssertionAsync(
                options.ServiceKeyId,
                options.TokenEndpoint,
                now);

            using FormUrlEncodedContent content = new(new Dictionary<string, string>
            {
                ["grant_type"] = TOKEN_EXCHANGE_GRANT,
                ["subject_token"] = subjectToken,
                ["subject_token_type"] = ACCESS_TOKEN_TYPE,
                ["requested_token_type"] = ACCESS_TOKEN_TYPE,
                ["audience"] = "people-service",
                ["scope"] = "people-service-audience",
                ["client_id"] = "access-control-service",
                ["client_assertion_type"] =
                    "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                ["client_assertion"] = clientAssertion,
            });

            using HttpResponseMessage response = await httpClient.PostAsync(
                options.TokenEndpoint,
                content,
                cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return null;
            }

            TokenResponse? token = await response.Content.ReadFromJsonAsync<TokenResponse>(
                cancellationToken);
            return string.IsNullOrWhiteSpace(token?.AccessToken)
                ? null
                : token.AccessToken;
        }
        catch (CryptographicException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }
        catch (HttpRequestException)
        {
            return null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private async Task<string> CreateClientAssertionAsync(
        string keyId,
        string audience,
        string now)
    {
        using RSA rsa = RSA.Create();
        rsa.ImportFromPem(await File.ReadAllTextAsync(options.ServicePrivateKeyPath!));

        string header = Base64UrlEncode(
            JsonSerializer.SerializeToUtf8Bytes(new
            {
                alg = "RS256",
                typ = "JWT",
                kid = keyId,
            }));
        string payload = Base64UrlEncode(
            JsonSerializer.SerializeToUtf8Bytes(new
            {
                iss = "access-control-service",
                sub = "access-control-service",
                aud = audience,
                iat = long.Parse(now),
                exp = long.Parse(now) + 30,
                jti = Guid.NewGuid().ToString("N"),
            }));
        byte[] signature = rsa.SignData(
            Encoding.UTF8.GetBytes($"{header}.{payload}"),
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);

        return $"{header}.{payload}.{Base64UrlEncode(signature)}";
    }

    private static string Base64UrlEncode(byte[] value) =>
        Convert.ToBase64String(value)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    private sealed record TokenResponse(
        [property: JsonPropertyName("access_token")] string? AccessToken);
}
