namespace AccessControlService.Domain;

/// <summary>
/// Resolved access-role qualification for a single (viewer, subject) pair, for exactly the
/// relationships this spec resolves. Exposes <see cref="ReportingLine"/> (transitive reports-to /
/// department-management, per 2.1) and <see cref="ProjectLine"/> (project assignment to a subject
/// managed by the viewer as DM or PM, per 2.1) as two independent, never-collapsed flags -- a
/// viewer can qualify for either, both, or neither toward the same subject. Any later line
/// (People Partner, Full profile access) can be added as a further additional property in a
/// follow-up spec without changing what either existing flag means or breaking any existing
/// caller. Do not replace this with an enum or a single "role" value -- see above.
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

    /// <summary>Convenience instance for "qualifies for nothing this resolver computes."</summary>
    public static AccessRole None { get; } = new();
}
