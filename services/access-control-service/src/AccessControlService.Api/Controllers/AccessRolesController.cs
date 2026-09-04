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

        // Full-profile-access is the maximum possible access -- all 16 sections ReadWrite, no
        // restriction on any section. It is non-null only when FullProfileAccessLine is true;
        // callers (people-service) apply it as the most-permissive path, overriding all other lines.
        var fullProfileAccessSectionAccess = accessRole.FullProfileAccessLine
            ? ToResponse(ManagerSectionAccessPolicy.ForFullProfileAccess())
            : null;

        return Ok(new AccessRoleResolveResponse
        {
            ReportingLine = accessRole.ReportingLine,
            ProjectLine = accessRole.ProjectLine,
            PeoplePartnerLine = accessRole.PeoplePartnerLine,
            FullProfileAccessLine = accessRole.FullProfileAccessLine,
            ManagerSectionAccess = managerSectionAccess,
            PeoplePartnerSectionAccess = peoplePartnerSectionAccess,
            FullProfileAccessSectionAccess = fullProfileAccessSectionAccess,
        });
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
    /// <c>true</c> when the viewer holds an active Full-profile-access grant (spec §2.4). This is
    /// the maximum possible access -- all 16 sections as ReadWrite. When <c>true</c>,
    /// <see cref="FullProfileAccessSectionAccess"/> is non-null and takes precedence over all
    /// other qualifying lines.
    /// </summary>
    public required bool FullProfileAccessLine { get; init; }

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

    /// <summary>
    /// All 16 sections as ReadWrite, or <c>null</c> when <see cref="FullProfileAccessLine"/> is
    /// <c>false</c>. When non-null, callers (people-service) must use this as the effective section
    /// set, overriding all other qualifying lines (most-permissive-path-wins; Full profile access
    /// is the maximum possible access level).
    /// </summary>
    public required ManagerSectionAccessResponse? FullProfileAccessSectionAccess { get; init; }
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
