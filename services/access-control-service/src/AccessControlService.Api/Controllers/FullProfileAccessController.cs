using AccessControlService.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace AccessControlService.Api.Controllers;

/// <summary>
/// Manages Full-profile-access grants (spec §2.4): grant and revoke operations, guarded by
/// stored-holder check, self-grant check, and last-holder check. All business rules are enforced
/// here before delegating the atomic write to <see cref="IFullProfileAccessRepository"/>. Thin
/// controller -- no domain logic lives here (AD-1/AD-2).
/// </summary>
/// <remarks>
/// <para>
/// <b>Authentication / actor identity:</b> This service does not yet have JWT authentication
/// infrastructure (as of spec-1-5). The <c>actorId</c> is supplied in the request body as a
/// <c>Guid</c>, matching the same pattern used for all other caller-supplied ids in the
/// access-control-service today. When JWT infrastructure is added to this service, this should be
/// migrated to read from <c>User.FindFirstValue(ClaimTypes.NameIdentifier)</c> and the request
/// body field removed, consistent with spec §2.4's "resolve actorId from the JWT sub claim"
/// intent.
/// </para>
/// <para>
/// <b>BFF proxy endpoints</b> for grant/revoke are deferred -- see spec-1-5 Boundaries. All
/// acceptance criteria are verified against this service directly.
/// </para>
/// </remarks>
[ApiController]
[Route("api/v1/full-profile-access")]
public sealed class FullProfileAccessController : ControllerBase
{
    private readonly IFullProfileAccessRepository _repository;

    public FullProfileAccessController(IFullProfileAccessRepository repository)
    {
        _repository = repository;
    }

    /// <summary>
    /// Grants Full-profile-access to the person identified by <see cref="FullProfileAccessGrantRequest.SubjectId"/>.
    /// Guards: actor must be an existing holder; actor must not equal subject. Returns 201 on
    /// success, 403 when the actor is not a holder or attempts self-grant.
    /// </summary>
    [HttpPost("grant")]
    public async Task<IActionResult> Grant(
        [FromBody] FullProfileAccessGrantRequest request,
        CancellationToken cancellationToken)
    {
        var actorId = request.ActorId;
        var subjectId = request.SubjectId;

        // Self-grant guard: spec §2.4 -- no self-assignment.
        if (actorId == subjectId)
        {
            return Problem(
                detail: "An actor cannot grant Full-profile-access to themselves.",
                statusCode: StatusCodes.Status403Forbidden);
        }

        // Non-holder guard: only an existing holder may grant.
        var actorIsHolder = await _repository.IsHolderAsync(actorId, cancellationToken);
        if (!actorIsHolder)
        {
            return Problem(
                detail: "Only an existing Full-profile-access holder may grant this access.",
                statusCode: StatusCodes.Status403Forbidden);
        }

        // Duplicate-grant guard: granting to an existing holder would violate the unique index
        // on HolderId and propagate as a DbUpdateException (500). Return 409 instead.
        var subjectAlreadyHolder = await _repository.IsHolderAsync(subjectId, cancellationToken);
        if (subjectAlreadyHolder)
        {
            return Problem(
                detail: "The specified subject already holds Full-profile-access.",
                statusCode: StatusCodes.Status409Conflict);
        }

        try
        {
            await _repository.GrantAsync(actorId, subjectId, cancellationToken);
        }
        catch (DbUpdateException)
        {
            // A concurrent grant request committed between the IsHolderAsync duplicate-holder check
            // above and SaveChangesAsync, hitting the unique index on HolderId. Surface the same
            // 409 the explicit duplicate-holder guard above would have returned.
            return Problem(
                detail: "The specified subject already holds Full-profile-access.",
                statusCode: StatusCodes.Status409Conflict);
        }

        return StatusCode(StatusCodes.Status201Created);
    }

    /// <summary>
    /// Revokes Full-profile-access from the person identified by <see cref="FullProfileAccessRevokeRequest.SubjectId"/>.
    /// Guards: actor must be an existing holder; subject must be an existing holder; at least 2
    /// active holders must exist (last-holder guard). Returns 200 on success, 403 when the actor is
    /// not a holder, 404 when the subject is not a holder, 409 when revocation would leave zero
    /// holders.
    /// </summary>
    [HttpPost("revoke")]
    public async Task<IActionResult> Revoke(
        [FromBody] FullProfileAccessRevokeRequest request,
        CancellationToken cancellationToken)
    {
        var actorId = request.ActorId;
        var subjectId = request.SubjectId;

        // Non-holder guard: only an existing holder may revoke.
        var actorIsHolder = await _repository.IsHolderAsync(actorId, cancellationToken);
        if (!actorIsHolder)
        {
            return Problem(
                detail: "Only an existing Full-profile-access holder may revoke this access.",
                statusCode: StatusCodes.Status403Forbidden);
        }

        // Subject-is-holder guard: revoke is a no-op (and would corrupt the journal) if the
        // subject never held the grant.
        var subjectIsHolder = await _repository.IsHolderAsync(subjectId, cancellationToken);
        if (!subjectIsHolder)
        {
            return Problem(
                detail: "The specified subject does not currently hold Full-profile-access.",
                statusCode: StatusCodes.Status404NotFound);
        }

        // Last-holder guard: spec §2.4 -- the last holder can never be removed.
        var activeCount = await _repository.GetActiveCountAsync(cancellationToken);
        if (activeCount <= 1)
        {
            return Problem(
                detail: "The last Full-profile-access holder cannot be revoked. At least one holder must remain at all times.",
                statusCode: StatusCodes.Status409Conflict);
        }

        await _repository.RevokeAsync(actorId, subjectId, cancellationToken);
        return Ok();
    }
}

/// <summary>Request body for <c>POST /api/v1/full-profile-access/grant</c>.</summary>
public sealed record FullProfileAccessGrantRequest
{
    /// <summary>
    /// The actor performing the grant. Must be an existing Full-profile-access holder and must not
    /// equal <see cref="SubjectId"/>. Temporarily supplied in the request body -- see the
    /// controller's doc comment for the planned migration to JWT sub claim.
    /// </summary>
    public required Guid ActorId { get; init; }

    /// <summary>The person to whom Full-profile-access is being granted.</summary>
    public required Guid SubjectId { get; init; }
}

/// <summary>Request body for <c>POST /api/v1/full-profile-access/revoke</c>.</summary>
public sealed record FullProfileAccessRevokeRequest
{
    /// <summary>
    /// The actor performing the revoke. Must be an existing Full-profile-access holder.
    /// Temporarily supplied in the request body -- see the controller's doc comment for the
    /// planned migration to JWT sub claim.
    /// </summary>
    public required Guid ActorId { get; init; }

    /// <summary>The person from whom Full-profile-access is being revoked.</summary>
    public required Guid SubjectId { get; init; }
}
