using System.Net;
using System.Security.Cryptography;
using System.Text.Json;
using AccessControlService.Infrastructure.Identity;

namespace AccessControlService.Infrastructure.Tests.Identity;

public sealed class ServiceTokenExchangeTests
{
    [Fact]
    public async Task ExchangeForPeopleAsync_UsesPeopleAudienceAndPrivateKeyJwt()
    {
        string? form = null;
        using RSA rsa = RSA.Create(2048);
        string keyPath = Path.GetTempFileName();
        await File.WriteAllTextAsync(keyPath, rsa.ExportRSAPrivateKeyPem());

        try
        {
            using StubHandler handler = new(async request =>
            {
                form = await request.Content!.ReadAsStringAsync();
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(
                        """{"access_token":"exchanged-token"}"""),
                };
            });
            using HttpClient httpClient = new(handler);
            ServiceTokenExchange exchange = new(
                httpClient,
                new PeopleIdentityResolverOptions(
                    new Uri("https://people.example.test"),
                    TimeSpan.FromSeconds(1),
                    TokenEndpoint: "https://id.example.test/realms/test/token",
                    ServicePrivateKeyPath: keyPath,
                    ServiceKeyId: "acs-key-1"));

            string? result = await exchange.ExchangeForPeopleAsync("incoming-token");

            Assert.Equal("exchanged-token", result);
            Assert.NotNull(form);
            Assert.Contains("audience=people-service", form);
            Assert.Contains("scope=people-service-audience", form);
            Assert.Contains("client_id=access-control-service", form);
            Assert.Contains("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Atoken-exchange", form);
            string assertion = ParseForm(form, "client_assertion");
            string[] parts = assertion.Split('.');
            Assert.Equal(3, parts.Length);
            using JsonDocument header = ParseJwtPart(parts[0]);
            Assert.Equal("acs-key-1", header.RootElement.GetProperty("kid").GetString());
            using JsonDocument payload = ParseJwtPart(parts[1]);
            Assert.Equal(
                "https://id.example.test/realms/test/token",
                payload.RootElement.GetProperty("aud").GetString());
            Assert.True(payload.RootElement.GetProperty("exp").GetInt64() -
                payload.RootElement.GetProperty("iat").GetInt64() <= 30);
            Assert.NotEqual(
                payload.RootElement.GetProperty("jti").GetString(),
                string.Empty);
        }
        finally
        {
            File.Delete(keyPath);
        }
    }

    private static string ParseForm(string form, string key) =>
        form.Split('&')
            .Select(pair => pair.Split('=', 2))
            .Where(pair => pair[0] == key)
            .Select(pair => Uri.UnescapeDataString(pair[1]))
            .Single();

    private static JsonDocument ParseJwtPart(string value) =>
        JsonDocument.Parse(
            Convert.FromBase64String(
                value.Replace('-', '+').Replace('_', '/') +
                new string('=', (4 - value.Length % 4) % 4)));

    private sealed class StubHandler(
        Func<HttpRequestMessage, Task<HttpResponseMessage>> responseFactory)
        : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            responseFactory(request);
    }
}
