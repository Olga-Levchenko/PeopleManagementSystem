using System.Security.Claims;
using System.Text.Json;
using AccessControlService.Api.Configuration;
using AccessControlService.Domain.Identity;
using AccessControlService.Domain.Permissions;
using AccessControlService.Api.ErrorHandling;
using AccessControlService.Infrastructure.Persistence;
using AccessControlService.Infrastructure.Permissions;
using Microsoft.AspNetCore.Mvc;

namespace AccessControlService.Api.Controllers;

[ApiController]
[Route("api/v1")]
public sealed class FunctionalRolesController : ControllerBase
{
    private readonly FunctionalRoleAdministrationService service;
    private readonly IPrincipalPersonResolver principalResolver;
    private readonly ITrustedServicePrincipalAuthorizer trustedServicePrincipalAuthorizer;
    private readonly AppConfig appConfig;

    public FunctionalRolesController(
        FunctionalRoleAdministrationService service,
        IPrincipalPersonResolver principalResolver,
        ITrustedServicePrincipalAuthorizer trustedServicePrincipalAuthorizer,
        AppConfig appConfig)
    {
        this.service = service;
        this.principalResolver = principalResolver;
        this.trustedServicePrincipalAuthorizer = trustedServicePrincipalAuthorizer;
        this.appConfig = appConfig;
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
            TrustedPermissionCheckAuthorization authorization =
                await trustedServicePrincipalAuthorizer.AuthorizeAsync(cancellationToken);
            if (authorization is TrustedPermissionCheckAuthorization.Unavailable)
            {
                throw new ServiceUnavailableException();
            }

            if (authorization is TrustedPermissionCheckAuthorization.Unauthorized)
            {
                throw new UnauthorizedException();
            }

            if (authorization is not TrustedPermissionCheckAuthorization.Authorized authorized)
            {
                throw new UnauthorizedException();
            }

            Guid actor = await ResolveDelegatedActorAsync(
                authorized.Context,
                cancellationToken);
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

        if (!OidcPrincipalIdentity.TryCreate(
                User.FindFirstValue("iss"),
                User.FindFirstValue("sub"),
                appConfig.AllowInsecureOidcHttp,
                out OidcPrincipalIdentity? identity) ||
            identity is null)
        {
            throw new UnauthorizedException();
        }

        PrincipalPersonResolution resolution =
            await principalResolver.ResolvePersonAsync(identity, cancellationToken);
        return resolution switch
        {
            PrincipalPersonResolution.Resolved resolved => resolved.PersonId,
            PrincipalPersonResolution.Unavailable => throw new ServiceUnavailableException(),
            PrincipalPersonResolution.Ambiguous => throw new ServiceUnavailableException(),
            PrincipalPersonResolution.Missing => throw new UnauthorizedException(),
            PrincipalPersonResolution.InvalidIdentity => throw new UnauthorizedException(),
            _ => throw new ServiceUnavailableException(),
        };
    }

    private async Task<Guid> ResolveDelegatedActorAsync(
        TrustedPermissionCheckContext context,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(context.ServiceIdentity) ||
            !OidcPrincipalIdentity.TryCreate(
                context.DelegatedActorIssuer,
                context.DelegatedActorSub,
                appConfig.AllowInsecureOidcHttp,
                out OidcPrincipalIdentity? identity) ||
            identity is null)
        {
            throw new UnauthorizedException();
        }

        PrincipalPersonResolution resolution =
            await principalResolver.ResolvePersonAsync(
                identity,
                cancellationToken);
        return resolution switch
        {
            PrincipalPersonResolution.Resolved resolved => resolved.PersonId,
            PrincipalPersonResolution.Unavailable => throw new ServiceUnavailableException(),
            PrincipalPersonResolution.Ambiguous => throw new UnauthorizedException(),
            PrincipalPersonResolution.Missing => throw new UnauthorizedException(),
            PrincipalPersonResolution.InvalidIdentity => throw new UnauthorizedException(),
            _ => throw new UnauthorizedException(),
        };
    }

    private string CorrelationId() =>
        Request.Headers["x-correlation-id"].FirstOrDefault() ?? Guid.NewGuid().ToString("N");

    private static string? ScopeText(JsonElement? scope) =>
        scope is null ? null : scope.Value.GetRawText();

    private static FunctionalRoleResponse ToResponse(FunctionalRole role) =>
        new(role.Id, role.RoleKey, role.DisplayName, role.IsSeeded, role.IsActive);

    private static bool TryMap(Exception exception, out ActionResult? result)
    {
        if (!ApiExceptionMapper.TryMap(exception, out ApiError error))
        {
            result = null;
            return false;
        }

        result = ApiExceptionMapper.ToProblemDetails(error);
        return true;
    }

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
