using System.Net;
using System.Text;
using System.Text.Json;
using AccessControlService.Domain.Identity;
using AccessControlService.Infrastructure.Identity;

namespace AccessControlService.Infrastructure.Tests.Identity;

public sealed class PeoplePrincipalPersonResolverTests
{
    private static readonly Uri BASE_ADDRESS = new("https://people.example.test");
    private static readonly OidcPrincipalIdentity IDENTITY =
        OidcPrincipalIdentity.TryCreate(
            "https://id.example.test/realms/people-management",
            "fabricated-subject-001",
            out OidcPrincipalIdentity? identity)
            ? identity!
            : throw new InvalidOperationException("Test identity was invalid.");

    [Fact]
    public async Task ResolveAsync_SendsContractRequestAndParsesFixtureResponse()
    {
        HttpRequestMessage? capturedRequest = null;
        string? capturedBody = null;
        using StubHandler handler = new(async request =>
        {
            capturedRequest = request;
            capturedBody = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    ReadFixture("people-identity-resolution.resolve.v1.response.json"),
                    Encoding.UTF8,
                    "application/json"),
            };
        });
        using HttpClient httpClient = new(handler);
        PeoplePrincipalPersonResolver resolver = CreateResolver(
            httpClient,
            new StubCredentialProvider(new InternalServiceCredentialResult.Available(
                "Bearer",
                "fabricated-test-service-credential")));

        PrincipalPersonResolution result = await resolver.ResolvePersonAsync(IDENTITY);

        PrincipalPersonResolution.Resolved resolved =
            Assert.IsType<PrincipalPersonResolution.Resolved>(result);
        Assert.Equal(Guid.Parse("11111111-1111-4111-8111-111111111111"), resolved.PersonId);
        Assert.NotNull(capturedRequest);
        Assert.Equal(
            "/api/v1/internal/identity-mappings/resolve",
            capturedRequest!.RequestUri!.AbsolutePath);
        Assert.Equal(
            "Bearer fabricated-test-service-credential",
            capturedRequest.Headers.Authorization!.ToString());
        Assert.Equal("correlation-123", capturedRequest.Headers.GetValues("x-correlation-id").Single());

        using JsonDocument requestJson = JsonDocument.Parse(capturedBody!);
        using JsonDocument fixtureJson = JsonDocument.Parse(ReadFixture(
            "people-identity-resolution.resolve.v1.request.json"));
        Assert.Equal(
            fixtureJson.RootElement.GetProperty("issuer").GetString(),
            requestJson.RootElement.GetProperty("issuer").GetString());
        Assert.Equal(
            fixtureJson.RootElement.GetProperty("subject").GetString(),
            requestJson.RootElement.GetProperty("subject").GetString());
    }

    [Theory]
    [InlineData(HttpStatusCode.BadRequest, "InvalidIdentity")]
    [InlineData(HttpStatusCode.Unauthorized, "Unavailable")]
    [InlineData(HttpStatusCode.Forbidden, "Unavailable")]
    [InlineData(HttpStatusCode.NotFound, "Missing")]
    [InlineData(HttpStatusCode.Conflict, "Ambiguous")]
    [InlineData(HttpStatusCode.ServiceUnavailable, "Unavailable")]
    public async Task ResolveAsync_MapsUpstreamStatusWithoutLeakingResponse(
        HttpStatusCode statusCode,
        string expectedType)
    {
        using StubHandler handler = new(_ => new HttpResponseMessage(statusCode)
        {
            Content = new StringContent("fabricated upstream detail"),
        });
        using HttpClient httpClient = new(handler);
        PeoplePrincipalPersonResolver resolver = CreateResolver(httpClient);

        PrincipalPersonResolution result = await resolver.ResolvePersonAsync(IDENTITY);

        Assert.Equal(expectedType, result.GetType().Name);
    }

    [Fact]
    public async Task ResolveAsync_WhenCredentialUnavailable_DoesNotSendAnonymousRequest()
    {
        int requestCount = 0;
        using StubHandler handler = new(_ =>
        {
            requestCount++;
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        using HttpClient httpClient = new(handler);
        PeoplePrincipalPersonResolver resolver = CreateResolver(
            httpClient,
            new StubCredentialProvider(new InternalServiceCredentialResult.Unavailable()));

        PrincipalPersonResolution result = await resolver.ResolvePersonAsync(IDENTITY);

        Assert.IsType<PrincipalPersonResolution.Unavailable>(result);
        Assert.Equal(0, requestCount);
    }

    [Fact]
    public async Task ResolveAsync_WhenBaseAddressMissing_FailsClosed()
    {
        using StubHandler handler = new(_ => new HttpResponseMessage(HttpStatusCode.OK));
        using HttpClient httpClient = new(handler);
        PeoplePrincipalPersonResolver resolver = new(
            httpClient,
            new PeopleIdentityResolverOptions(null, TimeSpan.FromSeconds(1)),
            new StubCredentialProvider(new InternalServiceCredentialResult.Available(
                "Bearer",
                "fabricated-test-service-credential")),
            new StubCorrelationIdAccessor("correlation-123"));

        PrincipalPersonResolution result = await resolver.ResolvePersonAsync(IDENTITY);

        Assert.IsType<PrincipalPersonResolution.Unavailable>(result);
    }

    [Fact]
    public async Task ResolveAsync_WhenResponseIsMalformed_FailsClosed()
    {
        using StubHandler handler = new(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"personId\":\"not-a-guid\"}"),
        });
        using HttpClient httpClient = new(handler);
        PeoplePrincipalPersonResolver resolver = CreateResolver(httpClient);

        PrincipalPersonResolution result = await resolver.ResolvePersonAsync(IDENTITY);

        Assert.IsType<PrincipalPersonResolution.Unavailable>(result);
    }

    [Fact]
    public async Task ResolveAsync_WhenUpstreamTimesOut_ReturnsUnavailable()
    {
        using StubHandler handler = new(async (_, cancellationToken) =>
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        using HttpClient httpClient = new(handler);
        PeoplePrincipalPersonResolver resolver = new(
            httpClient,
            new PeopleIdentityResolverOptions(BASE_ADDRESS, TimeSpan.FromMilliseconds(10)),
            new StubCredentialProvider(new InternalServiceCredentialResult.Available(
                "Bearer",
                "fabricated-test-service-credential")),
            new StubCorrelationIdAccessor(null));

        PrincipalPersonResolution result = await resolver.ResolvePersonAsync(IDENTITY);

        Assert.IsType<PrincipalPersonResolution.Unavailable>(result);
    }

    private static PeoplePrincipalPersonResolver CreateResolver(
        HttpClient httpClient,
        IInternalServiceCredentialProvider? credentialProvider = null) =>
        new(
            httpClient,
            new PeopleIdentityResolverOptions(BASE_ADDRESS, TimeSpan.FromSeconds(1)),
            credentialProvider ?? new StubCredentialProvider(
                new InternalServiceCredentialResult.Available(
                    "Bearer",
                    "fabricated-test-service-credential")),
            new StubCorrelationIdAccessor("correlation-123"));

    private static string ReadFixture(string name)
    {
        DirectoryInfo? directory = new(AppContext.BaseDirectory);
        while (directory is not null)
        {
            string candidate = Path.Combine(
                directory.FullName,
                "docs",
                "integrations",
                "contracts",
                name);
            if (File.Exists(candidate))
            {
                return File.ReadAllText(candidate);
            }

            directory = directory.Parent;
        }

        throw new FileNotFoundException($"Fixture '{name}' was not found.");
    }

    private sealed class StubCredentialProvider(
        InternalServiceCredentialResult result) : IInternalServiceCredentialProvider
    {
        public ValueTask<InternalServiceCredentialResult> GetAsync(
            CancellationToken cancellationToken = default) =>
            ValueTask.FromResult(result);
    }

    private sealed class StubCorrelationIdAccessor(string? current) : ICorrelationIdAccessor
    {
        public string? Current { get; } = current;
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responseFactory;

        public StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responseFactory)
        {
            this.responseFactory = (request, _) => Task.FromResult(responseFactory(request));
        }

        public StubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> responseFactory)
        {
            this.responseFactory = (request, _) => responseFactory(request);
        }

        public StubHandler(
            Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responseFactory)
        {
            this.responseFactory = responseFactory;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            responseFactory(request, cancellationToken);
    }
}
