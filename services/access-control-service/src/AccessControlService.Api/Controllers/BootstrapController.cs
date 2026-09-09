using System.ComponentModel.DataAnnotations;
using AccessControlService.Domain.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AccessControlService.Api.Controllers;

[ApiController]
[Route("api/v1/internal/bootstrap")]
public sealed class BootstrapController : ControllerBase
{
    private readonly IBootstrapProvisioningService provisioningService;
    private readonly ICorrelationIdAccessor correlationIdAccessor;

    public BootstrapController(
        IBootstrapProvisioningService provisioningService,
        ICorrelationIdAccessor correlationIdAccessor)
    {
        this.provisioningService = provisioningService;
        this.correlationIdAccessor = correlationIdAccessor;
    }

    [HttpPost("administrator")]
    [Authorize(Policy = "DeploymentBootstrapJwt")]
    public async Task<IActionResult> ProvisionAdministrator(
        [FromBody] BootstrapAdministratorRequest? request,
        CancellationToken cancellationToken)
    {
        if (request is null)
        {
            return BadRequest();
        }

        string? issuer = User.FindFirst("iss")?.Value;
        string? subject = User.FindFirst("sub")?.Value;
        string? authorizedParty = User.FindFirst("azp")?.Value;
        if (string.IsNullOrWhiteSpace(issuer) ||
            string.IsNullOrWhiteSpace(subject) ||
            string.IsNullOrWhiteSpace(authorizedParty))
        {
            return Unauthorized();
        }

        BootstrapProvisioningResult result =
            await provisioningService.ProvisionAsync(
                new BootstrapProvisioningRequest(
                    request.Issuer,
                    request.Subject,
                    $"deployment:{issuer}|{subject}|{authorizedParty}"),
                correlationIdAccessor.Current ?? Guid.NewGuid().ToString("N"),
                cancellationToken);

        return result.Status switch
        {
            BootstrapProvisioningStatus.Provisioned =>
                Ok(new { status = "provisioned" }),
            BootstrapProvisioningStatus.AlreadyProvisioned =>
                Ok(new { status = "already-provisioned" }),
            BootstrapProvisioningStatus.InvalidInput =>
                BadRequest(),
            BootstrapProvisioningStatus.MissingIdentity =>
                NotFound(),
            BootstrapProvisioningStatus.AmbiguousIdentity =>
                Conflict(),
            _ => StatusCode(StatusCodes.Status503ServiceUnavailable),
        };
    }
}

public sealed class BootstrapAdministratorRequest
{
    [Required]
    public string? Issuer { get; init; }

    [Required]
    public string? Subject { get; init; }
}
