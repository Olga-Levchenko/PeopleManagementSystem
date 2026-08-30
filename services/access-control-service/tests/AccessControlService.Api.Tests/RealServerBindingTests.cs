using System.Diagnostics;
using System.Net.Sockets;

namespace AccessControlService.Api.Tests;

/// <summary>
/// Proves the app actually binds to and is reachable on the configured <c>PORT</c> via a real Kestrel
/// listener -- something <see cref="HealthEndpointTests"/> cannot prove, since
/// <c>WebApplicationFactory&lt;Program&gt;.CreateClient()</c> runs entirely in-memory against
/// <c>TestServer</c> and never honors <c>UseUrls</c>/real socket binding. If the URL format string in
/// <c>Program.cs</c> were broken, or <c>appConfig.Port</c> were silently ignored, the in-memory tests
/// would still pass in full while this one would fail.
///
/// Approach: start the actual compiled app (<c>AccessControlService.Api.dll</c>, already built as a
/// dependency of this test project and copied alongside it) as a real subprocess with a known
/// <c>PORT</c>, then reach it with a real <see cref="HttpClient"/> over a real socket -- not through
/// the factory's in-memory <c>HttpClient</c>. This was chosen over
/// <c>factory.WithWebHostBuilder(builder => builder.UseKestrel())</c> because
/// <c>WebApplicationFactory</c> deliberately replaces the server with <c>TestServer</c> inside its own
/// <c>CreateHost</c>, and reliably overriding that requires subclassing the factory and re-implementing
/// its host-building internals -- more fragile, and no more direct a proof of real socket binding, than
/// simply launching the compiled app and hitting it over the network.
/// </summary>
public class RealServerBindingTests
{
    [Fact]
    public async Task App_StartedAsRealProcessWithConfiguredPort_IsReachableOverRealHttpSocket()
    {
        var port = GetFreeTcpPort();
        var apiDllPath = Path.Combine(AppContext.BaseDirectory, "AccessControlService.Api.dll");
        Assert.True(File.Exists(apiDllPath), $"Expected to find built API assembly at '{apiDllPath}'.");

        var startInfo = new ProcessStartInfo
        {
            FileName = "dotnet",
            Arguments = $"\"{apiDllPath}\"",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            WorkingDirectory = AppContext.BaseDirectory,
        };
        startInfo.EnvironmentVariables["PORT"] = port.ToString();
        startInfo.EnvironmentVariables["CORS_ORIGIN"] = "http://localhost:4200";
        startInfo.EnvironmentVariables["ConnectionStrings__Postgres"] =
            "Host=localhost;Port=5499;Database=access_control_service_test;Username=postgres;Password=postgres;Timeout=1";
        // Avoid this subprocess picking up a real developer '.env' file and overriding the above.
        startInfo.EnvironmentVariables["DOTNET_ENVIRONMENT"] = "Production";

        using var process = Process.Start(startInfo);
        Assert.NotNull(process);

        try
        {
            using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            var healthUrl = $"http://localhost:{port}/api/v1/health";

            HttpResponseMessage? response = null;
            var deadline = DateTime.UtcNow.AddSeconds(30);
            Exception? lastException = null;

            while (DateTime.UtcNow < deadline)
            {
                if (process.HasExited)
                {
                    var stderr = await process.StandardError.ReadToEndAsync();
                    Assert.Fail($"App process exited early (code {process.ExitCode}) before becoming reachable. Stderr: {stderr}");
                }

                try
                {
                    response = await httpClient.GetAsync(healthUrl);
                    break;
                }
                catch (Exception ex) when (ex is HttpRequestException or SocketException or TaskCanceledException)
                {
                    lastException = ex;
                    await Task.Delay(250);
                }
            }

            Assert.True(response is not null, $"App never became reachable on real port {port}. Last exception: {lastException}");
            // 200 (Healthy) or 503 (Unhealthy, e.g. Postgres unreachable in this environment) both prove
            // a real Kestrel listener answered on the configured port with a well-formed response --
            // that is the property this test is verifying, not database connectivity.
            Assert.True(
                response.StatusCode is System.Net.HttpStatusCode.OK or System.Net.HttpStatusCode.ServiceUnavailable,
                $"Expected a well-formed health response, got {(int)response.StatusCode}.");
        }
        finally
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
                process.WaitForExit(5000);
            }
        }
    }

    private static int GetFreeTcpPort()
    {
        var listener = new TcpListener(System.Net.IPAddress.Loopback, 0);
        listener.Start();
        var port = ((System.Net.IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }
}
