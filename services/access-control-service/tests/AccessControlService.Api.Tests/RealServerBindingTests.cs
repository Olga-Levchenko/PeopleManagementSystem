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
    /// <summary>
    /// Number of attempts to pick a free port and start the subprocess before giving up. A freed
    /// <see cref="TcpListener"/> port can, in principle, be grabbed by another process between
    /// <see cref="GetFreeTcpPort"/> releasing it and the subprocess binding to it (this test cannot
    /// hand the same OS socket to the subprocess directly, since it launches a separate process
    /// rather than binding Kestrel in-process). If that ever happens, the subprocess fails to bind
    /// and exits early; retrying with a freshly picked port turns a rare race into a self-healing
    /// retry instead of a flaky failure.
    /// </summary>
    private const int MaxPortAttempts = 3;

    [Fact]
    public async Task App_StartedAsRealProcessWithConfiguredPort_IsReachableOverRealHttpSocket()
    {
        var apiDllPath = Path.Combine(AppContext.BaseDirectory, "AccessControlService.Api.dll");
        Assert.True(File.Exists(apiDllPath), $"Expected to find built API assembly at '{apiDllPath}'.");

        Exception? lastFailure = null;

        for (var attempt = 1; attempt <= MaxPortAttempts; attempt++)
        {
            // Picked immediately before Process.Start, right below, to keep the release-to-bind
            // window as narrow as this subprocess-based design allows -- see MaxPortAttempts.
            var port = GetFreeTcpPort();

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
            // Required, fail-fast AppConfig values for ProjectAssignmentEventConsumer -- an
            // unreachable broker (deliberately a non-standard port here) does not stop the app from
            // booting or answering /health: the hosted consumer just logs and retries in the
            // background, same contract as the Postgres connection string above.
            startInfo.EnvironmentVariables["RABBITMQ_HOST"] = "localhost";
            startInfo.EnvironmentVariables["RABBITMQ_PORT"] = "5699";
            startInfo.EnvironmentVariables["RABBITMQ_USER"] = "guest";
            startInfo.EnvironmentVariables["RABBITMQ_PASSWORD"] = "guest";
            // '.env'-override protection for this subprocess comes from DotNetEnv.Env.NoClobber()
            // in Program.cs, not from this -- NoClobber() only skips a key that's already set in
            // the process environment (all the keys above), regardless of environment name.
            // DOTNET_ENVIRONMENT=Production is set here instead to prove the app boots and answers
            // /health correctly outside Development (e.g. with Swagger's dev-only conditional
            // compiled out of the active code path), matching how it actually runs in a real
            // deployment.
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
                var exitedEarly = false;

                while (DateTime.UtcNow < deadline)
                {
                    if (process.HasExited)
                    {
                        exitedEarly = true;
                        break;
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

                if (exitedEarly)
                {
                    var stderr = await process.StandardError.ReadToEndAsync();
                    lastFailure = new Exception(
                        $"App process exited early (code {process.ExitCode}) before becoming reachable on port {port} " +
                        $"(attempt {attempt}/{MaxPortAttempts}). Stderr: {stderr}");
                    continue;
                }

                Assert.True(response is not null, $"App never became reachable on real port {port}. Last exception: {lastException}");
                // 200 (Healthy) or 503 (Unhealthy, e.g. Postgres unreachable in this environment) both prove
                // a real Kestrel listener answered on the configured port with a well-formed response --
                // that is the property this test is verifying, not database connectivity.
                Assert.True(
                    response.StatusCode is System.Net.HttpStatusCode.OK or System.Net.HttpStatusCode.ServiceUnavailable,
                    $"Expected a well-formed health response, got {(int)response.StatusCode}.");
                return;
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

        Assert.Fail(
            $"App failed to bind and become reachable after {MaxPortAttempts} attempts, each with a freshly picked port. " +
            $"Last failure: {lastFailure}");
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
