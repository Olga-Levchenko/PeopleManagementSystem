using AccessControlService.Domain;
using Microsoft.AspNetCore.Mvc;

namespace AccessControlService.Api.Controllers;

/// <summary>
/// Exposes <see cref="AccessRoleResolver"/> over HTTP -- the gap ADR-003 identified as blocking
/// four of Epic 1's remaining stories -- and, on top of it, resolves the Manager and PP audiences'
/// per-section access via <see cref="ManagerSectionAccessPolicy"/> in the same response. Thin
/// wrapper only: no new domain logic lives here, per AD-1/AD-2 (Domain owns the decisions, Api owns
/// transport).
/// </summary>
[ApiController]
[Route("api/v1/access-roles")]
public sealed class AccessRolesController : ControllerBase
{
    private readonly AccessRoleResolver _resolver;

    public AccessRolesController(AccessRoleResolver resolver)
    {
        _resolver = resolver;
    }

    /// <summary>
    /// Resolves <paramref name="viewerPersonId"/>'s access role toward
    /// <paramref name="subjectPersonId"/>, plus the Manager and PP audiences' per-section access
    /// derived from it. <c>managerSectionAccess</c> is <c>null</c> whenever neither Reporting-line
    /// nor Project-line qualifies; <c>peoplePartnerSectionAccess</c> is <c>null</c> whenever
    /// People-Partner-line doesn't qualify -- this endpoint never guesses at Self/Colleague access,
    /// which neither <see cref="AccessRoleResolver"/> nor <see cref="ManagerSectionAccessPolicy"/>
    /// computes. An <see cref="Guid"/> query parameter present but not parseable as a GUID fails
    /// ASP.NET Core's built-in model binding, which -- via <see cref="ApiControllerAttribute"/>'s
    /// automatic model-state validation -- returns the framework's default 400 validation problem
    /// body with no custom code needed here. A parameter that's entirely <b>absent</b> is a
    /// different case, not a 400: ASP.NET Core's default model binding for a non-nullable value
    /// type with no value in the request binds it to <c>default(Guid)</c> (<see cref="Guid.Empty"/>)
    /// rather than failing validation, so the request resolves normally (200) against whatever
    /// <see cref="AccessRoleResolver.ResolveAsync"/> returns for that id -- typically
    /// <see cref="AccessRole.None"/>, since <c>Guid.Empty</c> won't match a real person.
    /// </summary>
    [HttpGet("resolve")]
    public async Task<ActionResult<AccessRoleResolveResponse>> Resolve(
        [FromQuery] Guid viewerPersonId,
        [FromQuery] Guid subjectPersonId,
        CancellationToken cancellationToken)
    {
        var accessRole = await _resolver.ResolveAsync(viewerPersonId, subjectPersonId, cancellationToken);

        var managerSectionAccess = accessRole.ReportingLine || accessRole.ProjectLine
            ? ToResponse(ManagerSectionAccessPolicy.Resolve(accessRole))
            : null;

        // PP is never narrowed (unlike Project line) and matches the unnarrowed Reporting-line
        // view for most sections, but genuinely diverges for S2/S3/S5 (PP = ReadWrite, Reporting
        // line = Read even unnarrowed) -- see ManagerSectionAccessPolicy.ResolveForPeoplePartner's
        // doc comment for the matrix citations. Do not compute this via Resolve(new AccessRole
        // { ReportingLine = true }) -- that silently reproduces the wrong (Read-only) S2/S3/S5
        // levels for PP.
        var peoplePartnerSectionAccess = accessRole.PeoplePartnerLine
            ? ToResponse(ManagerSectionAccessPolicy.ResolveForPeoplePartner())
            : null;

        return Ok(new AccessRoleResolveResponse
        {
            ReportingLine = accessRole.ReportingLine,
            ProjectLine = accessRole.ProjectLine,
            PeoplePartnerLine = accessRole.PeoplePartnerLine,
            ManagerSectionAccess = managerSectionAccess,
            PeoplePartnerSectionAccess = peoplePartnerSectionAccess,
        });
    }

    /// <summary>
    /// Resolves <paramref name="request.ViewerPersonId"/>'s access role toward every id in
    /// <paramref name="request.SubjectPersonIds"/>, returning one result per subject. Subjects
    /// absent from the DB resolve to <see cref="AccessRole.None"/> (fail-closed). Enforces two
    /// limits: duplicate subject ids → 400; more than 500 subject ids → 400.
    /// <c>managerSectionAccess</c> is <c>null</c> for a subject entry when neither Reporting-line
    /// nor Project-line qualifies; <c>peoplePartnerSectionAccess</c> is <c>null</c> when
    /// People-Partner-line doesn't qualify.
    /// </summary>
    [HttpPost("resolve-batch")]
    public async Task<ActionResult<AccessRoleBatchResolveResponse>> ResolveBatch(
        [FromBody] AccessRoleBatchResolveRequest request,
        CancellationToken cancellationToken)
    {
        if (request.SubjectPersonIds is null)
        {
            return BadRequest(new { error = "subjectPersonIds is required." });
        }

        if (request.SubjectPersonIds.Count != request.SubjectPersonIds.Distinct().Count())
        {
            return BadRequest(new { error = "subjectPersonIds must not contain duplicate values." });
        }

        if (request.SubjectPersonIds.Count > 500)
        {
            return BadRequest(new { error = "subjectPersonIds.Count must not exceed 500." });
        }

        if (request.SubjectPersonIds.Count == 0)
        {
            return Ok(new AccessRoleBatchResolveResponse { Results = Array.Empty<AccessRoleBatchResultItem>() });
        }

        var accessRoles = await _resolver.ResolveBatchAsync(
            request.ViewerPersonId,
            request.SubjectPersonIds,
            cancellationToken);

        var results = request.SubjectPersonIds.Select(subjectId =>
        {
            var accessRole = accessRoles.TryGetValue(subjectId, out var role) ? role : AccessRole.None;

            var managerSectionAccess = accessRole.ReportingLine || accessRole.ProjectLine
                ? ToResponse(ManagerSectionAccessPolicy.Resolve(accessRole))
                : null;

            var peoplePartnerSectionAccess = accessRole.PeoplePartnerLine
                ? ToResponse(ManagerSectionAccessPolicy.ResolveForPeoplePartner())
                : null;

            return new AccessRoleBatchResultItem
            {
                SubjectPersonId = subjectId,
                ReportingLine = accessRole.ReportingLine,
                ProjectLine = accessRole.ProjectLine,
                PeoplePartnerLine = accessRole.PeoplePartnerLine,
                ManagerSectionAccess = managerSectionAccess,
                PeoplePartnerSectionAccess = peoplePartnerSectionAccess,
            };
        }).ToList();

        return Ok(new AccessRoleBatchResolveResponse { Results = results });
    }

    private static ManagerSectionAccessResponse ToResponse(ManagerSectionAccess access) => new()
    {
        S1 = ToResponse(access.S1),
        S2 = ToResponse(access.S2),
        S3 = ToResponse(access.S3),
        S4 = ToResponse(access.S4),
        S5 = ToResponse(access.S5),
        S6 = ToResponse(access.S6),
        S7 = ToResponse(access.S7),
        S8 = ToResponse(access.S8),
        S9 = ToResponse(access.S9),
        S10 = ToResponse(access.S10),
        S11 = ToResponse(access.S11),
        S12 = ToResponse(access.S12),
        S13 = ToResponse(access.S13),
        S14 = ToResponse(access.S14),
        S15 = ToResponse(access.S15),
        S16 = ToResponse(access.S16),
    };

    // Enum-to-string mapping lives here in the Api layer only, matching
    // HealthCheckResponseWriter's existing `report.Status.ToString()` convention -- Domain's
    // SectionAccessLevel enum carries no JSON attribute of its own (AD-1).
    private static SectionAccessResponse ToResponse(SectionAccess access) => new()
    {
        Level = access.Level.ToString(),
        Restriction = access.Restriction,
    };
}

/// <summary>Response body for <c>GET /api/v1/access-roles/resolve</c>, per ADR-003.</summary>
public sealed record AccessRoleResolveResponse
{
    public required bool ReportingLine { get; init; }

    public required bool ProjectLine { get; init; }

    public required bool PeoplePartnerLine { get; init; }

    /// <summary>
    /// The Manager audience's resolved per-section access, or <c>null</c> when neither
    /// <see cref="ReportingLine"/> nor <see cref="ProjectLine"/> qualifies (no Manager access at
    /// all toward this subject).
    /// </summary>
    public required ManagerSectionAccessResponse? ManagerSectionAccess { get; init; }

    /// <summary>
    /// The PP audience's resolved per-section access, per
    /// <c>docs/access-control/section-matrix.md</c>'s PP column -- matches the unnarrowed
    /// Reporting-line view except S2/S3/S5, where PP is ReadWrite -- or <c>null</c> when
    /// <see cref="PeoplePartnerLine"/> is <c>false</c> (no PP access at all toward this subject).
    /// </summary>
    public required ManagerSectionAccessResponse? PeoplePartnerSectionAccess { get; init; }
}

/// <summary>The Manager audience's resolved access to every profile section (S1-S16).</summary>
public sealed record ManagerSectionAccessResponse
{
    public required SectionAccessResponse S1 { get; init; }
    public required SectionAccessResponse S2 { get; init; }
    public required SectionAccessResponse S3 { get; init; }
    public required SectionAccessResponse S4 { get; init; }
    public required SectionAccessResponse S5 { get; init; }
    public required SectionAccessResponse S6 { get; init; }
    public required SectionAccessResponse S7 { get; init; }
    public required SectionAccessResponse S8 { get; init; }
    public required SectionAccessResponse S9 { get; init; }
    public required SectionAccessResponse S10 { get; init; }
    public required SectionAccessResponse S11 { get; init; }
    public required SectionAccessResponse S12 { get; init; }
    public required SectionAccessResponse S13 { get; init; }
    public required SectionAccessResponse S14 { get; init; }
    public required SectionAccessResponse S15 { get; init; }
    public required SectionAccessResponse S16 { get; init; }
}

/// <summary>
/// One section's resolved access: <see cref="Level"/> is the PascalCase string form of
/// <see cref="SectionAccessLevel"/> (e.g. <c>"ReadWrite"</c>); <see cref="Restriction"/> is
/// non-null only when that level is narrowed within the section (e.g. S5's CV+certificates-only
/// case).
/// </summary>
public sealed record SectionAccessResponse
{
    public required string Level { get; init; }

    public string? Restriction { get; init; }
}

/// <summary>Request body for <c>POST /api/v1/access-roles/resolve-batch</c>.</summary>
public sealed record AccessRoleBatchResolveRequest
{
    /// <summary>The viewer whose access roles toward every subject are resolved.</summary>
    public required Guid ViewerPersonId { get; init; }

    /// <summary>
    /// The subjects to resolve. Must not contain duplicates; must not exceed 500 entries; may
    /// be empty (returns an empty results list).
    /// </summary>
    public required IReadOnlyList<Guid> SubjectPersonIds { get; init; }
}

/// <summary>Response body for <c>POST /api/v1/access-roles/resolve-batch</c>.</summary>
public sealed record AccessRoleBatchResolveResponse
{
    /// <summary>One entry per requested subject id, in the same order as the input list.</summary>
    public required IReadOnlyList<AccessRoleBatchResultItem> Results { get; init; }
}

/// <summary>
/// Per-subject result item inside <see cref="AccessRoleBatchResolveResponse.Results"/>. Carries
/// the same fields as <see cref="AccessRoleResolveResponse"/> (the single-resolve response) rather
/// than referencing it directly, so the batch DTO is not coupled to the single-resolve DTO type.
/// </summary>
public sealed record AccessRoleBatchResultItem
{
    public required Guid SubjectPersonId { get; init; }

    public required bool ReportingLine { get; init; }

    public required bool ProjectLine { get; init; }

    public required bool PeoplePartnerLine { get; init; }

    /// <summary>
    /// The Manager audience's resolved per-section access, or <c>null</c> when neither
    /// <see cref="ReportingLine"/> nor <see cref="ProjectLine"/> qualifies.
    /// </summary>
    public required ManagerSectionAccessResponse? ManagerSectionAccess { get; init; }

    /// <summary>
    /// The PP audience's resolved per-section access, or <c>null</c> when
    /// <see cref="PeoplePartnerLine"/> is <c>false</c>.
    /// </summary>
    public required ManagerSectionAccessResponse? PeoplePartnerSectionAccess { get; init; }
}
