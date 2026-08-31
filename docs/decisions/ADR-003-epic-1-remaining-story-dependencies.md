# ADR-003: Access-role-resolution consumer API and Epic 1 story dependency status (1.4–1.10)

- **Status:** Accepted
- **Date:** 2026-08-31

## Context

ADR-002 resolved the People↔Access-Control boundary questions for Stories 1.3/1.4 (permission
checks, the organisational-relationship event contract, the outbox boundary). A follow-up question
covered the rest of Epic 1's dependency chain — Stories 1.4 through 1.10 — each blocked, in the
requester's own analysis, on "the excluded Access Control service" or "PR #14 infrastructure."

PR #14 has since merged to `main`: `services/access-control-service` now has a real
`AccessRoleResolver`, a real Project-line data/event pipeline, and (per ADR-002) a documented,
stubbable path for the organisational-relationship side. That changes the shape of the remaining
blockers — some stories are now genuinely unblocked, one acceptance criterion turns out to already
be satisfied as a side effect of Story 1.1's design, and one gap (not the permission-check endpoint
ADR-002 covers) turns out to be the single blocker underneath four of the seven remaining stories.
This ADR documents that gap and gives a story-by-story status.

## Decision

### The central remaining gap: no HTTP endpoint calls `AccessRoleResolver`

`AccessRoleResolver` exists, is fully tested, and is wired into DI — but nothing in
`services/access-control-service` exposes it over HTTP. This was a deliberate, tracked deferral
during Story 1.1 (`deferred-work.md`: *"Add an HTTP endpoint exposing access-role resolution once a
real consumer (e.g. the BFF, or Story 1.6's section-gated profile response) needs to call it"*) —
not an oversight, but it means every story below that needs a (viewer, subject) → {ReportingLine,
ProjectLine} decision has no contract to call yet, distinct from ADR-002's permission-check
endpoint (which answers a different question: "can this actor perform this action," not "what is
this viewer's role toward this subject").

**Recommended interim shape** (non-binding, same stub-don't-wait status as ADR-002's proposals):

```
GET /api/v1/access-roles/resolve?viewerPersonId={guid}&subjectPersonId={guid}
```

Response:

```json
{ "reportingLine": true, "projectLine": false }
```

Field-for-field, this is `AccessRole`'s own two properties — the endpoint is a thin HTTP wrapper
around `AccessRoleResolver.ResolveAsync`, nothing more. Whoever builds it should reuse
`AccessRoleResolverCompositionTests.cs`'s existing DI-composition proof as the pattern (the
resolver and repository are already correctly wired; the new work is purely the controller/route).

This is deliberately **not** a batch/multi-subject endpoint yet — Story 1.1's own AC only commits
to correct per-(viewer, subject) resolution, and `AccessRoleResolver`'s own doc comment requires
sequential, non-concurrent calls per instance (see the already-deferred recursive-CTE/scaling
entry in `deferred-work.md`). A caller resolving many subjects at once (e.g. the All Employees list,
Epic 2) will need a batch-shaped variant — out of scope for Epic 1, tracked separately below.

### Story-by-story status

**1.4 — Functional roles and permissions.** Primarily an access-control-service-side story
(permission storage, decisions, functional-role assignment) plus BFF/admin UI. No longer blocked
by "excluded Access Control service" — the service exists, and Story 1.4 extends it using the exact
pattern Story 1.1 already established (a new EF Core entity alongside `Person`/`Department`, a new
controller alongside the health endpoint). ADR-002 Decision 1 already specifies the one contract
this story owes People/Organization (the permission-check endpoint). **Unblocked; ready to start.**

**1.5 — Full profile access grant.** Depends on 1.4's permission model (not yet built) and 1.3's
journal (not yet built) — genuinely still blocked on those two. One clarification: the journal's
shape is *not* an open design question blocking this story — `.claude/rules/access-control-invariants.md`
already fixes the journal to exactly six event types, one of which is "Full profile access grants."
The journal's schema is decided; only its implementation (Story 1.3) is pending. Section-level
policy for a Full-profile-access holder is also already fully specified (`docs/access-control/section-matrix.md`'s
RW-everywhere row) — no new authorization design needed here, only the grant/journal plumbing.
**Blocked on 1.3 and 1.4 landing; not newly unblocked by PR #14.**

**1.6 — Server-assembled, section-gated profile response.** Depends on 1.1 (done) and 1.3
(server-side relationship-field restrictions, not yet built) and the full-access policy (already
specified, per 1.5 above — not blocking). The "must call excluded Access Control service" blocker
is now two concrete, addressable gaps: the access-role-resolution endpoint proposed above (new), and
1.3's relationship-field write-rejection logic (ADR-002 territory, People/Organization-side).
**Partially unblocked**: profile-assembly work that only needs read-side role resolution can start
once the endpoint above exists; the S1 write-rejection AC still needs 1.3.

**1.7 — S7 management-note flag gating.** Lives in `services/work-management-service` (currently an
empty NestJS scaffold, same state as `people-service`/`bff`) plus BFF and the Access Control API.
Needs the same access-role-resolution endpoint proposed above, plus — per this story's own AC 4 —
a way to distinguish "PM specifically" from "Project-line generally," which `AccessRoleResolver`'s
`ProjectLine` flag alone doesn't carry (it's a boolean, not a role-typed value). This is a real,
additional gap beyond the endpoint: work-management-service needs either (a) the resolver endpoint
to also expose *which* project-assignment role(s) the viewer holds (DM vs. PM), or (b)
work-management-service to query `EfRelationshipRepository`-equivalent project-assignment data
itself. Recommend (a) — extending the proposed endpoint's response with an optional
`projectRoles: ["DeliveryManager"]`-shaped field — to keep the "resolve access role" decision in one
place (AD-2), rather than a second service reading project-assignment data directly. **Blocked on
the endpoint above plus this one additional design decision**, tracked below.

**1.8 — Colleague view field whitelist.** Depends on 1.1 (done) and 1.6 (partially unblocked, see
above). No new gap beyond what 1.6 already needs — the whitelist itself (S1/S10/S11) is fully
specified in the section matrix already. **Follows 1.6's status directly.**

**1.9 — Project-line narrowing vs. Reporting line.** Depends on 1.1 (done) and 1.2 (not formally
started). **Worth flagging directly: Story 1.2's Project-line acceptance criterion is already
satisfied as a side effect of Story 1.1's design**, not something still to build. `ProjectAssignmentEventProcessor`
already removes the `ProjectAssignment` row on a revoke event (`ProcessAsync_RevokeEventExistingAssignment_RemovesRowAndReleasesOwnership`,
shipped in PR #14), and `AccessRoleResolver` never caches — it resolves live, per request, every
time (its own doc comment: *"Resolve per (viewer, subject) pair on every call; never cache..."*).
So "the resulting access change is reflected on the very next request" is already true for
Project-line, with no additional revocation logic to write — only tests to add proving it, if Story
1.2 wants to claim the AC formally. The Reporting-line half of 1.2's AC (manager/PP/department
changes) is still genuinely pending — it depends on ADR-002's not-yet-built organisational-relationship
event pipeline, but once that lands, the same "no cache" property means Reporting-line revocation
will *also* fall out for free, not need separate implementation. For 1.9 itself: the actual narrowing
logic (S2/S3 → `—`, S5 → CV+certs-only when `ProjectLine=true` and `ReportingLine=false`) is a
profile-response-assembly concern (Story 1.6's layer), not `AccessRoleResolver`'s — `AccessRole.cs`'s
own XML doc already says as much (*"A future caller... MUST NOT treat `ProjectLine = true` as
granting the same section access as `ReportingLine = true`... This flag only records the
qualification; it does not itself carry out the narrowing"*). **Effectively depends on 1.6's
endpoint/assembly layer, not on new work in access-control-service.**

**1.10 — Custom field visibility enforcement.** Depends on 1.1 (done), 1.6 (see above), and
custom-field ownership in People/Organization (not yet built — `people-service`'s Prisma schema has
no models at all yet). The visibility *policy* is already fully specified (`docs/access-control/section-matrix.md`
S16: per-field `management`/`employee`/`colleague`) — the gap is entirely implementation: People
needs the custom-field data model with a visibility column, and one shared decision point (per this
story's own AC 2: *"the same authorization decision this story exposes is the one they must
call"*) that profile/filters/exports/search all consume. Whether that decision point lives in
People/Organization (it owns the field + its visibility setting) or is proxied through Access
Control (for AD-2 consistency with every other authorization decision) is not yet decided — flagged
below as new tracked work, not resolved by this ADR. **Blocked on People's own custom-field model
existing at all; the access-control side is unblocked once 1.1's audience resolution (done) is
available.**

## Consequences

### Positive

- Identifies the one endpoint (access-role resolution over HTTP) that unblocks four of the six
  still-blocked stories (1.6, 1.7, 1.8, 1.9, 1.10 all need it directly or transitively), rather than
  each story owner independently concluding they're blocked on "Access Control" without a shared,
  concrete target to build against.
- Surfaces that Story 1.2's Project-line AC needs no new implementation, preventing duplicated
  effort re-solving an already-solved problem.
- Keeps the narrowing/whitelist/visibility *policy* work correctly scoped to where it's already
  fully specified (the section matrix), separating "policy is undecided" (not true for 1.8/1.9/1.10's
  core rules) from "implementation doesn't exist yet" (true for all of them).

### Negative

- The proposed access-role-resolution endpoint shape, like ADR-002's proposals, is non-binding —
  whoever builds it may reasonably choose a different shape (e.g. batch-first), and 1.7's
  `projectRoles` extension is a genuinely new, undecided design point this ADR flags but doesn't
  settle.
- 1.10's decision-point ownership (People vs. Access Control) is left open, not resolved — a real
  design question for whoever picks up that story.

## Scope

Story-by-story implementation remains real, not-yet-built work. This ADR only maps current status
and proposes stub contracts, per `parallel-work-boundaries.md`.

## Related

- `docs/decisions/ADR-002-people-access-control-relationship-boundary.md` — the sibling ADR this
  one follows, covering the People↔Access-Control boundary for Stories 1.3/1.4.
- `_bmad-output/implementation-artifacts/deferred-work.md` — already tracked the access-role-resolution
  endpoint's absence during Story 1.1; this ADR gives it a concrete proposed shape and names its
  actual blocking consumers.
- `docs/access-control/section-matrix.md` — the already-decided policy (full-access RW-everywhere
  row, S16 custom-field visibility, colleague whitelist) several stories above depend on for
  *policy* but not *implementation*.
