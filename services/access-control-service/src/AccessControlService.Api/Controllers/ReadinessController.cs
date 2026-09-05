using AccessControlService.Api.ErrorHandling;
using AccessControlService.Infrastructure.Permissions;
using Microsoft.AspNetCore.Mvc;

namespace AccessControlService.Api.Controllers;

[ApiController]
[Route("api/v1/readiness")]
public sealed class ReadinessController : ControllerBase
{
    private readonly FunctionalRoleAdministrationService service;

    public ReadinessController(FunctionalRoleAdministrationService service)
    {
        this.service = service;
    }

    [HttpGet]
    public async Task<ActionResult<ReadinessResponse>> Get(CancellationToken cancellationToken)
    {
        try
        {
            AdministrationOperationalState state =
                await service.GetOperationalStateAsync(cancellationToken);
            bool ready = state == AdministrationOperationalState.HasActiveAdministrator;
            return ready
                ? Ok(new ReadinessResponse(true))
                : StatusCode(503, new ReadinessResponse(false));
        }
        catch (Exception exception) when (ApiExceptionMapper.IsUnavailable(exception))
        {
            return StatusCode(503, new ReadinessResponse(false));
        }
    }
}

public sealed record ReadinessResponse(bool Ready);
