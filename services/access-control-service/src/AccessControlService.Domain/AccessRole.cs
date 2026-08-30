namespace AccessControlService.Domain;

/// <summary>
/// Resolved access-role qualification for a single (viewer, subject) pair, for exactly the
/// relationships this spec resolves. Currently exposes only <see cref="ReportingLine"/>
/// (transitive reports-to / department-management, per 2.1); shaped as a result type so a
/// Project-line flag (and any later line -- People Partner, Full profile access) can be added as
/// an additional property in a follow-up spec (see <c>spec-1-1c</c>, deferred) without changing
/// what <see cref="ReportingLine"/> means or breaking any existing caller. Do not replace this with
/// an enum or a single "role" value -- a viewer can independently qualify for more than one line
/// toward the same subject, and the two dimensions must never collapse into one flag.
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

    /// <summary>Convenience instance for "qualifies for nothing this resolver computes."</summary>
    public static AccessRole None { get; } = new();
}
