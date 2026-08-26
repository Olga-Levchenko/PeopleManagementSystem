# Internal timetracker integration

Status: **research pending** — no API investigation has happened yet. This is still a template
for capturing findings as the foundation-phase owner does the work, but the v1.5 spec changelog
(`docs/requirements/Spec_Changelog_v1.2_to_v1.5.md`) has already settled several of the questions
this doc used to leave open — those are filled in below rather than left as blanks.

Source requirement: `docs/requirements/project-requirements.md` Section 5.1, as amended by the
v1.5 changelog. **The timetracker is now the only required integration** (PeopleForce is
good-to-have as of v1.5 — see the sibling doc). Two APIs are provided by the timetracker
architect: **Leaves** and **Projects and people**. The second one is load-bearing beyond display —
project assignment (who's on which project, and its PM/DM) is a direct input to access-role
resolution (Section 2.1), not just something shown on a profile. As of v1.5, Manager access
resolution has a *third* feeding relation besides reports-to and project assignment — **department
management** — which is first-party/platform data, not something this integration needs to supply.

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
- **Still genuinely open (flagged by the v1.5 changelog itself, not yet answered):** does this API
  push **events** (assignment created/ended) or only expose **state at sync time** (a snapshot you
  diff yourself)? The changelog explicitly says to establish this from the documentation — it
  affects whether the 15-minute revocation guarantee below is achievable by polling alone or needs
  a webhook/event feed. Record the answer here once known.
- Update model: push vs. pull, and how quickly a new assignment or an ended one propagates to
  access resolution. Section 6 warns that a stale permission cache is a data leak — the sync
  latency here is a real access-control parameter, not just a data-freshness one. **The latency
  bound itself is no longer open** (v1.5, §2.1/§5.1): project-derived access must change within
  **15 minutes** of the underlying assignment change under normal sync; if sync itself is failing,
  project-derived access must be forcibly withdrawn within **4 hours** regardless (serve
  last-known leave/project data behind a visible "unable to refresh" banner in the meantime — never
  silently keep stale access active past that bound). Platform-owned relationship edits (reporting
  line, department, PP assignment) are not this integration's concern — those take effect on the
  very next request since they're first-party data with no external-sync excuse.

### Identity resolution
Per Section 6: "A person exists as a PeopleForce candidate, then as an employee here, and
separately as a timetracker user... email alone is not sufficient." Record the decision on how
this platform's employee id maps to a timetracker user id.

### Failure handling
Section 7 requires external integration failures to degrade gracefully and never take the
application down. **v1.5 settles the outage behavior explicitly:** serve last-known S10/S11 data
behind a visible "unable to refresh" banner, and forcibly withdraw project-derived access after 4
hours of failed sync regardless of what the last-known state said (fail closed past that bound —
never leave ended or stale access active). What's still to record here: the exact mechanism for
detecting "sync has been failing for 4 hours" (a scheduler job? a staleness timestamp checked at
request time?) and whether S10/S11 display itself degrades sooner than the 4-hour access-withdrawal
bound (the changelog only mandates the banner, not a specific display-side timeout).

### Rate limits
Record any documented or observed limits, and how the sync/polling design respects them.

## Decision log

<!-- As decisions are made, append entries here in the ADR-lite style used in docs/decisions/:
     what was decided, why, and date. Cross-link to a full ADR in docs/decisions/ if the decision
     is significant enough to warrant one on its own (e.g. the identity-resolution strategy). -->

## Open questions

- **Events vs. state at sync time** for the Projects and people API (v1.5 changelog explicitly
  flags this as still-to-establish from the documentation). Affects whether the 15-minute
  revocation guarantee is achievable by polling alone or needs a push/webhook feed.
- Exact mechanism for detecting a 4-hour sync-failure window for the forced access-withdrawal bound.

## Population

Per v1.5: the employee population is a seeded list, generated and imported into the timetracker
test environment, **delivered 2026-08-26**. Import it — that is who the platform is built and
tested against; do not import real employee data beyond this seeded list
(`.claude/rules/pseudonymized-data-only.md`). No SSO/Active Directory and no employee-creation flow
this iteration — authentication is a first-party implementation over this seeded population.

## Related

- `docs/requirements/project-requirements.md` Sections 2.1, 5.1, 6, 7
- `docs/requirements/Spec_Changelog_v1.2_to_v1.5.md` — source of the revocation-timing and
  outage-behavior decisions recorded above
- `.claude/rules/access-control-invariants.md` — cache-invalidation invariant this integration
  must satisfy
- `docs/integrations/peopleforce.md` — the sibling integration doc
