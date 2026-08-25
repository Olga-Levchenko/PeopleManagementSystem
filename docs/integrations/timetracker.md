# Internal timetracker integration

Status: **research pending** — no investigation has happened yet. This is a template for
capturing findings as the foundation-phase owner does the work, not a record of findings.

Source requirement: `docs/requirements/project-requirements.md` Section 5.1. Two APIs are
provided by the timetracker architect: **Leaves** and **Projects and people**. The second one is
load-bearing beyond display — project assignment (who's on which project, and its PM/DM) is a
direct input to access-role resolution (Section 2.1), not just something shown on a profile.

## Owner

Not yet assigned. Whoever owns this should fill in name + date here once claimed.

## What to investigate and record here

### Leaves API
- Endpoint shape, auth mechanism, pagination.
- Leave types supported and how they map to the platform's leave-type display (S10).
- What identifies a person in this API (employee id? email? something else) — needed for the
  identity-resolution decision below.
- Update model: push (webhook) vs. pull (poll on a schedule) — affects how fresh S10 data is.

### Projects and people API
- Endpoint shape, auth mechanism, pagination.
- Exact shape of project → PM/DM assignment, and person → project assignment. This directly
  feeds the Manager access role's "is assigned to a project managed by" relation (2.1) — get the
  exact field names and cardinality (can a project have multiple PMs/DMs? can assignment have a
  start/end date, or is it a snapshot?) since the permission model depends on assignment
  start/end being knowable (2.1: "when a project assignment ends, the derived access ends with
  it").
- What identifies a person and a project in this API.
- Update model: push vs. pull, and how quickly a new assignment or an ended one propagates to
  access resolution. Section 6 warns that a stale permission cache is a data leak — the sync
  latency here is a real access-control parameter, not just a data-freshness one.

### Identity resolution
Per Section 6: "A person exists as a PeopleForce candidate, then as an employee here, and
separately as a timetracker user... email alone is not sufficient." Record the decision on how
this platform's employee id maps to a timetracker user id.

### Failure handling
Section 7 requires external integration failures to degrade gracefully and never take the
application down. Record: what happens to S10/S11 display, and to access resolution, if the
timetracker API is unreachable or returns stale/error data. (Access resolution failing closed —
i.e., denying access rather than silently granting it — is the safe default; confirm and record
the actual decision here.)

### Rate limits
Record any documented or observed limits, and how the sync/polling design respects them.

## Decision log

<!-- As decisions are made, append entries here in the ADR-lite style used in docs/decisions/:
     what was decided, why, and date. Cross-link to a full ADR in docs/decisions/ if the decision
     is significant enough to warrant one on its own (e.g. the identity-resolution strategy). -->

## Open questions

<!-- Anything raised but not yet resolved. -->

## Related

- `docs/requirements/project-requirements.md` Sections 2.1, 5.1, 6, 7
- `.claude/rules/access-control-invariants.md` — cache-invalidation invariant this integration
  must satisfy
- `docs/integrations/peopleforce.md` — the sibling integration doc
