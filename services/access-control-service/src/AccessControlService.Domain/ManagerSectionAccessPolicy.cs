namespace AccessControlService.Domain;

/// <summary>
/// The level of access an audience has to a single profile section, per
/// <c>docs/access-control/section-matrix.md</c>'s legend (<c>—</c>/R/RW). Kept as a plain enum with
/// no JSON attribute -- Domain stays dependency-free (AD-1); the Api layer maps it to a string via
/// <c>Level.ToString()</c>, matching <c>HealthCheckResponseWriter</c>'s existing convention.
/// </summary>
public enum SectionAccessLevel
{
    None,
    Read,
    ReadWrite,
}

/// <summary>
/// The resolved access level for one profile section, plus an optional, human-readable restriction
/// narrowing what that level actually covers within the section -- e.g. S5 narrowed to
/// "CV and certificates only" for a Project-line-only viewer, per <c>section-matrix.md</c>'s R
/// footnote. <see cref="Restriction"/> is <c>null</c> whenever the level is unrestricted.
/// </summary>
public sealed record SectionAccess
{
    public required SectionAccessLevel Level { get; init; }

    public string? Restriction { get; init; }

    public static SectionAccess None { get; } = new() { Level = SectionAccessLevel.None };

    public static SectionAccess Read { get; } = new() { Level = SectionAccessLevel.Read };

    public static SectionAccess ReadWrite { get; } = new() { Level = SectionAccessLevel.ReadWrite };
}

/// <summary>
/// The Manager audience's resolved access to every profile section (S1-S16), per
/// <c>docs/access-control/section-matrix.md</c>'s Reporting-line/Project-line columns. Sixteen
/// explicit named properties, not a <c>Dictionary&lt;enum, ...&gt;</c> -- avoids enum-key JSON
/// serialization ambiguity and gives a self-documenting, fixed-shape contract for a fixed
/// 16-section matrix (see spec-1-9's Design Notes).
/// </summary>
public sealed record ManagerSectionAccess
{
    public required SectionAccess S1 { get; init; }
    public required SectionAccess S2 { get; init; }
    public required SectionAccess S3 { get; init; }
    public required SectionAccess S4 { get; init; }
    public required SectionAccess S5 { get; init; }
    public required SectionAccess S6 { get; init; }
    public required SectionAccess S7 { get; init; }
    public required SectionAccess S8 { get; init; }
    public required SectionAccess S9 { get; init; }
    public required SectionAccess S10 { get; init; }
    public required SectionAccess S11 { get; init; }
    public required SectionAccess S12 { get; init; }
    public required SectionAccess S13 { get; init; }
    public required SectionAccess S14 { get; init; }
    public required SectionAccess S15 { get; init; }
    public required SectionAccess S16 { get; init; }
}

/// <summary>
/// Maps a resolved <see cref="AccessRole"/> to the Manager audience's per-section access, per
/// <c>docs/access-control/section-matrix.md</c>'s Reporting-line/Project-line columns. Pure function
/// of its input -- no I/O, no new dependencies (AD-1) -- and independent of any actual profile field
/// data (that assembly is Story 1.6's job).
/// </summary>
/// <remarks>
/// <para>
/// <b>Most-permissive-path-wins</b> (resolves <c>section-matrix.md</c>'s former "Open question"):
/// whenever <see cref="AccessRole.ReportingLine"/> is <c>true</c>, the result is always the
/// unnarrowed Reporting-line access for every section, regardless of
/// <see cref="AccessRole.ProjectLine"/>. Only a viewer who qualifies via <c>ProjectLine</c> ALONE
/// (<c>ProjectLine: true</c>, <c>ReportingLine: false</c>) gets the narrowed treatment: S2 and S3
/// drop to <see cref="SectionAccessLevel.None"/>, and S5 narrows to
/// <see cref="SectionAccessLevel.Read"/> restricted to CV and certificates. Every other section,
/// including S6, is identical to the Reporting line in both cases.
/// </para>
/// <para>
/// Calling this with an <see cref="AccessRole"/> that qualifies for neither line
/// (<see cref="AccessRole.None"/>) is out of this method's contract and throws
/// <see cref="ArgumentException"/> (fail closed, not fail open) -- callers (the
/// <c>/api/v1/access-roles/resolve</c> endpoint) must check
/// <see cref="AccessRole.ReportingLine"/>/<see cref="AccessRole.ProjectLine"/> first and return no
/// Manager section access at all in that case, never guessing at Self/PP/Colleague access this
/// policy doesn't compute.
/// </para>
/// <para>
/// No S7 PM-vs-DM distinction here -- <see cref="AccessRole.ProjectLine"/> doesn't yet distinguish
/// DM from PM, so S7 is always <see cref="SectionAccessLevel.ReadWrite"/> for any Manager access;
/// the PM-specific flag-gated read-only nuance is Story 1.7's job. No per-custom-field S16
/// breakdown either -- S16 is section-level <see cref="SectionAccessLevel.ReadWrite"/> only;
/// per-field visibility is Story 1.10's job.
/// </para>
/// </remarks>
public static class ManagerSectionAccessPolicy
{
    /// <summary>
    /// The exact restriction text surfaced for S5 when narrowed to a Project-line-only viewer, per
    /// <c>section-matrix.md</c>'s S5 footnote ("R, CV + certificates only").
    /// </summary>
    public const string DocumentsCvAndCertificatesOnlyRestriction = "CV and certificates only";

    public static ManagerSectionAccess Resolve(AccessRole accessRole)
    {
        // Fail closed, not fail open: an AccessRole qualifying for neither line is out of this
        // method's own documented contract (see the remarks above) -- silently returning the
        // unnarrowed, mostly-ReadWrite result for AccessRole.None would be a data-access bug
        // waiting for a caller that forgets the ReportingLine||ProjectLine check. Callers (the
        // /api/v1/access-roles/resolve endpoint) must check first and never call this for that
        // input at all.
        if (!accessRole.ReportingLine && !accessRole.ProjectLine)
        {
            throw new ArgumentException(
                $"{nameof(ManagerSectionAccessPolicy)}.{nameof(Resolve)} requires the viewer to " +
                $"qualify for at least one of {nameof(AccessRole.ReportingLine)}/" +
                $"{nameof(AccessRole.ProjectLine)} -- it never computes Self/PP/Colleague access. " +
                "Callers must check AccessRole.ReportingLine || AccessRole.ProjectLine before " +
                "calling this method.",
                nameof(accessRole));
        }

        // Most-permissive-path-wins: ReportingLine=true always yields the unnarrowed result, even
        // when ProjectLine is also true. Only ProjectLine-only narrows.
        var narrowed = accessRole.ProjectLine && !accessRole.ReportingLine;

        return new ManagerSectionAccess
        {
            S1 = SectionAccess.ReadWrite,
            S2 = narrowed ? SectionAccess.None : SectionAccess.Read,
            S3 = narrowed ? SectionAccess.None : SectionAccess.Read,
            S4 = SectionAccess.ReadWrite,
            S5 = narrowed
                ? new SectionAccess
                {
                    Level = SectionAccessLevel.Read,
                    Restriction = DocumentsCvAndCertificatesOnlyRestriction,
                }
                : SectionAccess.Read,
            S6 = SectionAccess.ReadWrite,
            S7 = SectionAccess.ReadWrite,
            S8 = SectionAccess.ReadWrite,
            S9 = SectionAccess.ReadWrite,
            S10 = SectionAccess.Read,
            S11 = SectionAccess.Read,
            S12 = SectionAccess.ReadWrite,
            S13 = SectionAccess.ReadWrite,
            S14 = SectionAccess.ReadWrite,
            S15 = SectionAccess.Read,
            S16 = SectionAccess.ReadWrite,
        };
    }
}
