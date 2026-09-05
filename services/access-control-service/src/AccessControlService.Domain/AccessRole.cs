namespace AccessControlService.Domain;

/// <summary>
/// Resolved access-role qualification for a single (viewer, subject) pair, for exactly the
/// relationships this spec resolves. Exposes <see cref="ReportingLine"/> (transitive reports-to /
/// department-management, per 2.1), <see cref="ProjectLine"/> (project assignment to a subject
/// managed by the viewer as DM or PM, per 2.1), and <see cref="PeoplePartnerLine"/> (the subject's
/// assigned PP, or the HR line above that PP, per 2.1/spec-1-6b) as three independent,
/// never-collapsed flags -- a viewer can qualify for any combination of these toward the same
/// subject. Any later line (Full profile access) can be added as a further additional property in
/// a follow-up spec without changing what any existing flag means or breaking any existing caller.
/// Do not replace this with an enum or a single "role" value -- see above.
/// </summary>
public sealed record AccessRole
{
    /// <summary>
    /// True when the viewer qualifies for Reporting-line access toward the subject: transitive
    /// reports-to at any depth, or department-management of the subject's department or any
    /// ancestor department. False for every other case, including a viewer resolving toward
    /// themselves (Self is a separate access role the caller must check before consulting this
    /// resolver -- a person is never their own manager).
    /// </summary>
    public bool ReportingLine { get; init; }

    /// <summary>
    /// True when the viewer qualifies for Project-line access toward the subject: the viewer is
    /// the DM or PM of a project the subject is assigned to. Independent of
    /// <see cref="ReportingLine"/> -- both can be true for the same (viewer, subject) pair (e.g. a
    /// subject's direct reports-to manager who is also DM on one of the subject's projects). False
    /// for every other case, including a viewer resolving toward themselves.
    /// </summary>
    /// <remarks>
    /// <b>Not equivalent to <see cref="ReportingLine"/> for data access.</b> Per
    /// <c>.claude/rules/access-control-invariants.md</c> and the section matrix
    /// (<c>docs/access-control/section-matrix.md</c>), the Project line is one of exactly two
    /// documented narrowing exceptions to "a Manager sees everything" (v1.5): a PM or DM who
    /// qualifies only via <see cref="ProjectLine"/> (not also via <see cref="ReportingLine"/>)
    /// loses sections S2 and S3 entirely, and gets S5 restricted to CV+certificates only --
    /// everything else, including S6, is identical to the Reporting line. A future caller (e.g.
    /// Story 1.6's section-gated response, Story 1.9's precedence/narrowing logic) MUST NOT treat
    /// <c>ProjectLine = true</c> as granting the same section access as
    /// <c>ReportingLine = true</c> -- it must apply this narrowing explicitly. This flag only
    /// records the qualification; it does not itself carry out the narrowing.
    /// </remarks>
    public bool ProjectLine { get; init; }

    /// <summary>
    /// True when the viewer qualifies for People-Partner-line access toward the subject: the
    /// viewer is the subject's assigned people partner, or is transitively above that PP in the
    /// PP's own reports-to chain (the "HR line" -- the PP's manager chain, never the subject's own
    /// reporting line). Independent of <see cref="ReportingLine"/> and <see cref="ProjectLine"/> --
    /// resolved unconditionally, never short-circuited by either. False when the subject has no
    /// assigned PP on file, and false for a viewer resolving toward themselves (Self is a separate
    /// access role the caller must check before consulting this resolver).
    /// </summary>
    /// <remarks>
    /// Per <c>.claude/rules/access-control-invariants.md</c> and the section matrix
    /// (<c>docs/access-control/section-matrix.md</c>), PP is never narrowed like the Project
    /// line -- its per-section access is cell-for-cell identical to the unnarrowed Reporting-line
    /// view. See <c>AccessRolesController</c> for how this flag is mapped to section access.
    /// </remarks>
    public bool PeoplePartnerLine { get; init; }

    /// <summary>
    /// True when the viewer holds a Full-profile-access grant: a stored, explicitly-granted
    /// privilege (not derived from any relationship) that gives read-write access to every profile
    /// section (S1-S16). Resolved from <c>IFullProfileAccessRepository.IsHolderAsync</c>, not from
    /// any relationship traversal -- independent of, and takes precedence over, all three
    /// relationship-derived lines above. False for every viewer who does not hold an active grant.
    /// </summary>
    /// <remarks>
    /// Per <c>.claude/rules/access-control-invariants.md</c> spec §2.4: only an existing holder can
    /// grant it, no self-assignment, first holder seeded at deployment, and the last holder can
    /// never be removed. The caller (<c>AccessRolesController</c>) maps this flag to
    /// <c>ManagerSectionAccessPolicy.ForFullProfileAccess()</c>'s all-RW section access whenever
    /// it is <c>true</c>.
    /// </remarks>
    public bool FullProfileAccessLine { get; init; }

    /// <summary>Convenience instance for "qualifies for nothing this resolver computes."</summary>
    public static AccessRole None { get; } = new();
}
