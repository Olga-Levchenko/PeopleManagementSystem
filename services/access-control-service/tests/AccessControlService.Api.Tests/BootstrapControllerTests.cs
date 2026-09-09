using System.Security.Claims;
using AccessControlService.Api.Controllers;
using AccessControlService.Domain.Identity;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;

namespace AccessControlService.Api.Tests;

public sealed class BootstrapControllerTests
{
    [Fact]
    public async Task ProvisionAdministrator_UsesVerifiedOperatorAndSeparateTarget()
    {
        BootstrapProvisioningRequest? captured = null;
        var service = new StubProvisioningService(request =>
        {
            captured = request;
            return BootstrapProvisioningResult.Provisioned();
        });
        var controller = CreateController(service);

        IActionResult result = await controller.ProvisionAdministrator(
            new BootstrapAdministratorRequest
            {
                Issuer = "https://id.example.test/realms/people-management",
                Subject = "target-subject",
            },
            CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(captured);
        Assert.Equal("target-subject", captured!.PrincipalSub);
        Assert.Equal(
            "deployment:https://operator.example/realms/ops|operator-subject|deployment-bootstrap",
            captured.TrustedProvisioningActor);
    }

    [Theory]
    [InlineData(BootstrapProvisioningStatus.MissingIdentity, 404)]
    [InlineData(BootstrapProvisioningStatus.AmbiguousIdentity, 409)]
    [InlineData(BootstrapProvisioningStatus.UnavailableIdentity, 503)]
    [InlineData(BootstrapProvisioningStatus.PersistenceOrAuditFailure, 503)]
    public async Task ProvisionAdministrator_MapsProvisioningFailures(
        BootstrapProvisioningStatus status,
        int expectedStatus)
    {
        var controller = CreateController(
            new StubProvisioningService(_ => new BootstrapProvisioningResult(status)));

        IActionResult result = await controller.ProvisionAdministrator(
            new BootstrapAdministratorRequest
            {
                Issuer = "https://id.example.test/realms/people-management",
                Subject = "target-subject",
            },
            CancellationToken.None);

        var statusResult = Assert.IsAssignableFrom<IStatusCodeActionResult>(result);
        Assert.Equal(expectedStatus, statusResult.StatusCode);
    }

    private static BootstrapController CreateController(
        StubProvisioningService service)
    {
        BootstrapController controller = new(
            service,
            new StubCorrelationIdAccessor());
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(
                    new ClaimsIdentity(
                    [
                        new Claim("iss", "https://operator.example/realms/ops"),
                        new Claim("sub", "operator-subject"),
                        new Claim("azp", "deployment-bootstrap"),
                    ],
                    "test")),
            },
        };
        return controller;
    }

    private sealed class StubProvisioningService : IBootstrapProvisioningService
    {
        private readonly Func<BootstrapProvisioningRequest, BootstrapProvisioningResult> handler;

        public StubProvisioningService(
            Func<BootstrapProvisioningRequest, BootstrapProvisioningResult> handler)
        {
            this.handler = handler;
        }

        public Task<BootstrapProvisioningResult> ProvisionAsync(
            BootstrapProvisioningRequest request,
            string correlationId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult(handler(request));
    }

    private sealed class StubCorrelationIdAccessor : ICorrelationIdAccessor
    {
        public string? Current => "test-correlation";
    }
}
