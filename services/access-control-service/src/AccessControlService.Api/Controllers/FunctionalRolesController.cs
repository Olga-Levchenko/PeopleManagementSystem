using System.Security.Claims;
using System.Text.Json;
using AccessControlService.Domain.Identity;
using AccessControlService.Domain.Permissions;
using AccessControlService.Infrastructure.Persistence;
using AccessControlService.Infrastructure.Permissions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AccessControlService.Api.Controllers;

[ApiController]
[Route("api/v1")]
public sealed class FunctionalRolesController : ControllerBase
{
    private readonly FunctionalRoleAdministrationService service;
    private readonly IPrincipalPersonResolver principalResolver;
    private readonly ITrustedServicePrincipalAuthorizer trustedServicePrincipalAuthorizer;

    public FunctionalRolesController(
        FunctionalRoleAdministrationService service,
        IPrincipalPersonResolver principalResolver,
        ITrustedServicePrincipalAuthorizer trustedServicePrincipalAuthorizer)
    {
        this.service = service;
        this.principalResolver = principalResolver;
        this.trustedServicePrincipalAuthorizer = trustedServicePrincipalAuthorizer;
    }

    [HttpGet("permissions/catalogue")]
    public async Task<ActionResult<PermissionCatalogueResponse>> GetCatalogue(CancellationToken cancellationToken)
    {
        try
        {
            Guid actor = await ResolveActorAsync(cancellationToken);
            await service.EnsureAdministratorAsync(actor, cancellationToken);
            return Ok(new PermissionCatalogueResponse(
                (await service.GetCatalogueAsync(cancellationToken))
                .Select(permission => new PermissionResponse(permission.Key, permission.RequiresScope))
                .ToArray()));
        }
        catch (Exception exception) when (TryMap(exception, out ActionResult? result))
        {
            return result!;
        }
    }

    [HttpGet("functional-roles")]
    public async Task<ActionResult<FunctionalRoleListResponse>> GetRoles(CancellationToken cancellationToken)
    {
        try
        {
            Guid actor = await ResolveActorAsync(cancellationToken);
            await service.EnsureAdministratorAsync(actor, cancellationToken);
            return Ok(new FunctionalRoleListResponse(
                (await service.GetRolesAsync(cancellationToken)).Select(ToResponse).ToArray()));
        }
        catch (Exception exception) when (TryMap(exception, out ActionResult? result))
        {
            return result!;
        }
    }

    [HttpGet("functional-roles/{roleKey}")]
    public async Task<ActionResult<FunctionalRoleResponse>> GetRole(
        string roleKey,
        CancellationToken cancellationToken)
    {
        try
        {
            Guid actor = await ResolveActorAsync(cancellationToken);
            await service.EnsureAdministratorAsync(actor, cancellationToken);
            FunctionalRole? role = await service.GetRoleAsync(roleKey, cancellationToken);
            return role is null ? NotFound() : Ok(ToResponse(role));
        }
        catch (Exception exception) when (TryMap(exception, out ActionResult? result))
        {
            return result!;
        }
    }

    [HttpGet("functional-roles/{roleKey}/permissions")]
    public async Task<ActionResult<FunctionalRolePermissionListResponse>> GetRolePermissions(
        string roleKey,
        CancellationToken cancellationToken)
    {
        try
        {
            Guid actor = await ResolveActorAsync(cancellationToken);
            await service.EnsureAdministratorAsync(actor, cancellationToken);
            IReadOnlyList<FunctionalRolePermissionView> grants =
                await service.GetRolePermissionsAsync(roleKey, cancellationToken);
            return Ok(new FunctionalRolePermissionListResponse(
                grants.Select(grant =>
                    new FunctionalRolePermissionResponse(grant.Id, roleKey, grant.PermissionKey, grant.Scope))
                    .ToArray()));
        }
        catch (Exception exception) when (TryMap(exception, out ActionResult? result))
        {
            return result!;
        }
    }

    [HttpPost("functional-roles")]
    public async Task<ActionResult<FunctionalRoleResponse>> CreateRole(
        CreateFunctionalRoleRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            Guid actor = await ResolveActorAsync(cancellationToken);
            FunctionalRole role = await service.CreateRoleAsync(
                actor,
                request.RoleKey,
                request.DisplayName,
                CorrelationId(),
                Request.Headers["Idempotency-Key"].FirstOrDefault(),
                cancellationToken);
            return CreatedAtAction(nameof(GetRole), new { roleKey = role.RoleKey }, ToResponse(role));
        }
        catch (Exception exception) when (TryMap(exception, out ActionResult? result))
        {
            return result!;
        }
    }

    [HttpPatch("functional-roles/{roleKey}")]
    public async Task<ActionResult<FunctionalRoleResponse>> UpdateRole(
        string roleKey,
        UpdateFunctionalRoleRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            Guid actor = await ResolveActorAsync(cancellationToken);
            FunctionalRole role = await service.UpdateRoleAsync(
                actor, roleKey, request.DisplayName, CorrelationId(), cancellationToken);
            return Ok(ToResponse(role));
        }
        catch (Exception exception) when (TryMap(exception, out ActionResult? result))
        {
            return result!;
        }
    }

    [HttpPost("functional-roles/{roleKey}/deactivate")]
    public async Task<ActionResult<FunctionalRoleResponse>> DeactivateRole(
        string roleKey,
        DeactivateFunctionalRoleRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            Guid actor = await ResolveActorAsync(cancellationToken);
            FunctionalRole role = await service.DeactivateRoleAsync(
                actor, roleKey, request.Reason, CorrelationId(), cancellationToken);
            return Ok(ToResponse(role));
        }
        catch (Exception exception) when (TryMap(exception, out ActionResult? result))
        {
            return result!;
        }
    }

    [HttpPut("functional-roles/{roleKey}/permissions/{permissionKey}")]
    public async Task<ActionResult<FunctionalRolePermissionResponse>> GrantPermission(
        string roleKey,
        string permissionKey,
        GrantPermissionRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            Guid actor = await ResolveActorAsync(cancellationToken);
            FunctionalRolePermissionGrant grant = await service.GrantPermissionAsync(
                actor,
                roleKey,
                permissionKey,
                ScopeText(request.Scope),
                CorrelationId(),
                Request.Headers["Idempotency-Key"].FirstOrDefault(),
                cancellationToken);
            return Ok(new FunctionalRolePermissionResponse(
                grant.Id, roleKey, permissionKey, grant.Scope));
        }
        catch (Exception exception) when (TryMap(exception, out ActionResult? result))
        {
            return result!;
        }
    }

    [HttpDelete("functional-roles/{roleKey}/permissions/{permissionKey}")]
    public async Task<IActionResult> RevokePermission(
        string roleKey,
        string permissionKey,
        [FromQuery] string? scope,
        CancellationToken cancellationToken)
    {
        try
        {
            Guid actor = await ResolveActorAsync(cancellationToken);
            await service.RevokePermissionAsync(
                actor, roleKey, permissionKey, scope, CorrelationId(), cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (TryMap(exception, out ActionResult? result))
        {
            return result!;
        }
    }

    [HttpPost("people/{personId:guid}/functional-roles")]
    public async Task<ActionResult<AssignmentResponse>> AssignRole(
        Guid personId,
        AssignFunctionalRoleRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            Guid actor = await ResolveActorAsync(cancellationToken);
            AssignmentOperationResult operation = await service.AssignRoleAsync(
                actor,
                personId,
                request.RoleKey,
                CorrelationId(),
                Request.Headers["Idempotency-Key"].FirstOrDefault(),
                cancellationToken);
            return StatusCode(operation.Created ? 201 : 200,
                new AssignmentResponse(operation.Assignment.Id, personId, request.RoleKey, operation.Assignment.IsActive));
        }
        catch (Exception exception) when (TryMap(exception, out ActionResult? result))
        {
            return result!;
        }
    }

    [HttpDelete("people/{personId:guid}/functional-roles/{roleKey}")]
    public async Task<IActionResult> RevokeRole(
        Guid personId,
        string roleKey,
        CancellationToken cancellationToken)
    {
        try
        {
            Guid actor = await ResolveActorAsync(cancellationToken);
            await service.RevokeRoleAsync(actor, personId, roleKey, CorrelationId(), cancellationToken);
            return NoContent();
        }
        catch (Exception exception) when (TryMap(exception, out ActionResult? result))
        {
            return result!;
        }
    }

    [HttpGet("people/{personId:guid}/functional-roles")]
    public async Task<ActionResult<FunctionalRoleAssignmentListResponse>> GetAssignments(
        Guid personId,
        CancellationToken cancellationToken)
    {
        try
        {
            Guid actor = await ResolveActorAsync(cancellationToken);
            await service.EnsureAdministratorAsync(actor, cancellationToken);
            IReadOnlyList<AssignmentView> assignments =
                await service.GetAssignmentsAsync(personId, cancellationToken);
            return Ok(new FunctionalRoleAssignmentListResponse(
                assignments.Select(view =>
                    new AssignmentResponse(view.Assignment.Id, personId, view.RoleKey, view.Assignment.IsActive))
                .ToArray()));
        }
        catch (Exception exception) when (TryMap(exception, out ActionResult? result))
        {
            return result!;
        }
    }

    [HttpPost("permissions/check")]
    public async Task<ActionResult<PermissionCheckResponse>> CheckPermission(
        PermissionCheckRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            TrustedServicePrincipalAuthorization authorization =
                await trustedServicePrincipalAuthorizer.AuthorizeAsync(cancellationToken);
            if (authorization == TrustedServicePrincipalAuthorization.Unavailable)
            {
                throw new ServiceUnavailableException();
            }

            if (authorization == TrustedServicePrincipalAuthorization.Unauthorized)
            {
                throw new UnauthorizedException();
            }

            Guid actor = await ResolveActorAsync(cancellationToken);
            bool granted = await service.CheckPermissionAsync(
                actor, request.PermissionKey, ScopeText(request.Scope), cancellationToken);
            return Ok(new PermissionCheckResponse(granted));
        }
        catch (Exception exception) when (TryMap(exception, out ActionResult? result))
        {
            return result!;
        }
    }

    private async Task<Guid> ResolveActorAsync(CancellationToken cancellationToken)
    {
        if (User.Identity?.IsAuthenticated != true)
        {
            throw new UnauthorizedException();
        }

        string? sub = User.FindFirstValue("sub");
        if (string.IsNullOrWhiteSpace(sub))
        {
            throw new UnauthorizedException();
        }

        return await principalResolver.ResolvePersonIdAsync(sub, cancellationToken) ??
               throw new ServiceUnavailableException();
    }

    private string CorrelationId() =>
        Request.Headers["x-correlation-id"].FirstOrDefault() ?? Guid.NewGuid().ToString("N");

    private static string? ScopeText(JsonElement? scope) =>
        scope is null ? null : scope.Value.GetRawText();

    private static FunctionalRoleResponse ToResponse(FunctionalRole role) =>
        new(role.Id, role.RoleKey, role.DisplayName, role.IsSeeded, role.IsActive);

    private static bool TryMap(Exception exception, out ActionResult? result)
    {
        result = exception switch
        {
            UnauthorizedException => ToProblemDetails(401, "Unauthorized", "Authentication is required."),
            ForbiddenException forbidden => ToProblemDetails(403, "Forbidden", forbidden.Message),
            ServiceUnavailableException => ToProblemDetails(503, "Service Unavailable", "A required authorization dependency is unavailable."),
            ValidationException validation => ToProblemDetails(400, "Bad Request", validation.Message),
            NotFoundException notFound => ToProblemDetails(404, "Not Found", notFound.Message),
            RoleConflictException conflict => ToProblemDetails(409, "Conflict", conflict.Message),
            IdempotencyConflictException idempotencyConflict => ToProblemDetails(409, "Conflict", idempotencyConflict.Message),
            ArgumentException argument => new ObjectResult(new ProblemDetails
            {
                Status = StatusCodes.Status400BadRequest,
                Title = "Bad Request",
                Detail = argument.Message,
            })
            {
                StatusCode = StatusCodes.Status400BadRequest,
            },
            DbUpdateException => ToProblemDetails(409, "Conflict", "The operation conflicts with current state."),
            _ => null,
        };
        return result is not null;
    }

    private static ObjectResult ToProblemDetails(int status, string title, string detail) =>
        new(new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
        })
        {
            StatusCode = status,
        };
}

public sealed record PermissionCatalogueResponse(IReadOnlyList<PermissionResponse> Permissions);
public sealed record PermissionResponse(string PermissionKey, bool RequiresScope);
public sealed record FunctionalRoleListResponse(IReadOnlyList<FunctionalRoleResponse> Roles);
public sealed record FunctionalRoleResponse(Guid Id, string RoleKey, string DisplayName, bool IsSeeded, bool IsActive);
public sealed record FunctionalRolePermissionResponse(Guid Id, string RoleKey, string PermissionKey, string? Scope);
public sealed record FunctionalRolePermissionListResponse(
    IReadOnlyList<FunctionalRolePermissionResponse> Grants);
public sealed record AssignmentResponse(Guid Id, Guid PersonId, string RoleKey, bool IsActive);
public sealed record FunctionalRoleAssignmentListResponse(IReadOnlyList<AssignmentResponse> Assignments);
public sealed record PermissionCheckResponse(bool Granted);

public sealed record CreateFunctionalRoleRequest(string RoleKey, string DisplayName);
public sealed record UpdateFunctionalRoleRequest(string DisplayName);
public sealed record DeactivateFunctionalRoleRequest(string Reason);
public sealed record GrantPermissionRequest(JsonElement? Scope);
public sealed record AssignFunctionalRoleRequest(string RoleKey);
public sealed record PermissionCheckRequest(string PermissionKey, JsonElement? Scope);

public sealed class UnauthorizedException : Exception;
public sealed class ServiceUnavailableException : Exception;
