# ADR-004: Epic 2 open decisions — batch access-role resolution and upload storage

- **Status:** Accepted — all three decisions made (see 2026-09-02 addenda below)
- **Date:** 2026-09-02

## Context

A `/planning-gap-audit` pass on Epic 2 (All Employees List & Self-Service) found two gaps that
are architecture decisions, not missing implementation — nobody has picked a shape yet, so no
story can be scoped against either one without guessing. Unlike ADR-003's `projectRoles`
decision, these are being recorded here as **open**, per an explicit instruction to outline
rather than resolve them unilaterally. Whoever picks up Story 2.1 or 2.6 needs to make the call
below (or escalate it) before implementation starts.

## Decision 1: how does the All Employees list resolve access for 500+ subjects within 2 seconds?

**The gap.** Story 2.1's own acceptance criteria (`_bmad-output/planning-artifacts/epics.md`,
Story 2.1) states plainly: *"Given 500+ employee records and an arbitrary combination of filters
and derived fields, when the list is requested, including permission resolution, then the
response returns within 2 seconds (NFR-2/SM-4) — this is a hard release gate for this story, not
an aspiration."*

Today, the only access-role-resolution capability that exists is
`GET /api/v1/access-roles/resolve?viewerPersonId=...&subjectPersonId=...` — one `(viewer,
subject)` pair per call, and `AccessRoleResolver`'s own design does one DB round-trip per
reports-to/department-management hop, with no caching (`deferred-work.md` lines 93-95 already
flag this as a scaling risk once real org depth exists). Calling that endpoint once per row for a
500+-row list would mean 500+ sequential per-hop-chained round-trips inside one HTTP request — this
will not meet a 2-second budget under any realistic network/DB latency.

ADR-003 anticipated this exact problem and said a "batch-shaped variant" would be needed for Epic
2, "tracked separately below" — but no such tracking entry was ever actually written. This ADR is
that tracking, now that Epic 2 is in scope.

**Options:**

1. **Batch HTTP endpoint** — extend `access-control-service` with e.g.
   `POST /api/v1/access-roles/resolve-batch` taking one `viewerPersonId` and a list of
   `subjectPersonId`s, returning the same per-subject shape as today's endpoint. Keeps the
   "resolve access role" decision in one place (AD-2), same principle ADR-003 already applied to
   the `projectRoles` question. Still needs its own internal optimization (set-based/recursive-CTE
   query, per the existing deferred-work entry) to avoid just doing 500 round-trips inside the
   batch call instead of outside it.
2. **Materialized/cached permission projection** — precompute and cache each viewer's resolved
   section access per subject (or per department/project scope), invalidated on relationship
   change events People/Organization already publishes. Faster at read time, but adds a new
   staleness surface that must respect the same revocation-timing bounds
   (`access-control-invariants.md`: next-request for platform-owned edits, 15 min / 4 hr for
   project-derived access) — a second place that could leak stale access if the invalidation logic
   has a gap.
3. **Push filtering into the query itself** — instead of "list all subjects, then resolve access
   per row," have `access-control-service` (or a projection it publishes) answer "which subjects
   can this viewer see at what level," so People/Organization's list query joins against that set
   directly rather than post-filtering. Most invasive to design, least amount of resolution work
   done per request.

**Recommendation (non-binding, same status as ADR-002/003's proposals):** option 1, for the same
AD-2 consistency reason ADR-003 already established, done in the same pass as the recursive-CTE
optimization `deferred-work.md` already tracks — a batch endpoint that still does one
round-trip-per-row internally doesn't solve the real problem. This is flagged as a genuine open
question, not settled — whoever picks up Story 2.1 should confirm or override before spec.

## Decision 2: where do uploaded photos and certificates live?

**The gap.** Story 2.6's acceptance criteria require accepting and storing an uploaded photo or
certificate against an employee's own record. No file-storage mechanism is decided or provisioned
anywhere in the codebase: `ARCHITECTURE-SPINE.md` has no mention of object storage, blob storage,
or an upload path; `infra/docker-compose.yml` provisions only Postgres, RabbitMQ, and Keycloak —
no MinIO/S3-compatible container, no volume-backed file server.

This isn't Story 2.6-only — S1's photo field and S5's CV/certificates (referenced across Stories
1.6, 1.8, 1.9, 2.5, 2.7) all assume some file survives somewhere; nobody has picked where.

**Options:**

1. **Local-disk/volume storage inside People/Organization**, mounted via a Docker volume in
   `infra/docker-compose.yml`, served through a People/Organization-owned endpoint. Simplest for
   local dev (matches the project's current "everything runs locally" stance — see
   `.claude/rules/parallel-work-boundaries.md`'s hosting notes), but doesn't resemble a real
   deployment target and complicates backup/multi-instance scenarios.
2. **S3-compatible object storage (e.g. MinIO)** added to `infra/docker-compose.yml`, with
   People/Organization storing only a reference (key/URL) in its own schema. Closer to a real
   production shape, adds one more container to local dev.
3. **Database blob storage** (Postgres `bytea`) — no new infra, but mixes large binary blobs into
   the relational store used for everything else, and works against the same 2-second-class
   performance concerns Decision 1 above is trying to solve if photos are ever joined into list
   queries.

**Recommendation (non-binding):** option 2, since it's the only option that generalizes past local
dev without a later migration, and MinIO is a lightweight addition to the existing
docker-compose-based dev environment. Flagged as open — not settled.

## Decision 3 (added 2026-09-02, open): how is a 500+-row list actually delivered to the frontend?

**The gap.** Story 2.1's AC guarantees a ≤2s *response*, but never states whether that response
carries all 500+ rows at once, a paginated slice, or a virtualized/windowed feed — and no other
Epic 2 story fills the gap either. This affects more than 2.1 itself: Story 2.3 (saved views)
persists "a filter-and-column configuration," Story 2.4 (export) works from "the current list
view," and Story 2.5 (colleague mode) restricts the same list's columns — all four assume some
settled shape for what "the list" actually is per request, which doesn't exist yet.

**Options:**
1. **Full payload per request** — return all matching rows (up to whatever filters narrow it to)
   in one response; simplest, but caps how large "500+" can grow before the 2s budget breaks
   again regardless of Decision 1's fix.
2. **Server-side pagination** — page number/size params, matching how most internal admin tools
   work; interacts with Story 2.3's saved views (does a saved view also remember page size?) and
   Story 2.4's export (does export walk all pages server-side, or only the currently-loaded one?).
3. **Cursor-based/virtualized windowing** — frontend requests a window as the user scrolls; best
   perceived performance, most implementation work, and the least precedent elsewhere in this
   codebase (no other service does windowed delivery today).

**Recommendation (non-binding):** option 2, server-side pagination — it's the most common shape
for this kind of internal tool, composes cleanly with Story 2.4's export (export can intentionally
walk all pages rather than just the visible one, which the AC's "current list view" wording
doesn't rule out), and doesn't require new frontend infrastructure the way virtualization would.

This decision was originally left open, per the same "outline, don't resolve" instruction
Decisions 1 and 2 carried at first — see the second addendum below for its acceptance.

## Consequences

### Positive
- Both gaps are now written down somewhere discoverable, instead of being silently rediscovered by
  whoever starts Story 2.1 or 2.6.
- Options are scoped against existing architectural conventions (AD-2, AD-4, the revocation-timing
  invariants) rather than invented from scratch.

### Negative
- Neither decision is made. Story 2.1 cannot honestly claim its NFR-2/SM-4 acceptance criterion is
  achievable until Decision 1 is resolved; Story 2.6 cannot be implemented at all until Decision 2
  is resolved.

## Scope

This ADR originally only outlined the decisions and their options — see the 2026-09-02 addendum
below for the choices actually made.

## Addendum (2026-09-02): both decisions accepted

**Decision 1 — accepted: option 1, batch HTTP endpoint.** Matches this ADR's own
recommendation. `access-control-service` gets a new batch-shaped endpoint (proposed shape:
`POST /api/v1/access-roles/resolve-batch`, one `viewerPersonId` plus a list of
`subjectPersonId`s, returning the same per-subject `{reportingLine, projectLine,
managerSectionAccess}` shape `GET /resolve` already returns, per-subject) rather than a cached
projection or query push-down. Tracked as a new prerequisite story, parented under Epic 1 (same
pattern as O4-89 for Story 1.7): **O4-90**, linked as blocking Story 2.1 (O4-35). Implementing the
endpoint's own internal round-trip-per-subject cost (the recursive-CTE optimization
`deferred-work.md` already tracks) is in scope for O4-90; wiring Story 2.1's actual list query to
call it is not — that remains Story 2.1's own work.

**Decision 2 — accepted: option 1, local-disk/volume storage, *not* this ADR's recommended
option 2 (MinIO).** Uploaded photos/certificates will be stored on a Docker-mounted volume owned
by People/Organization, matching the project's current everything-runs-locally stance, rather
than adding an S3-compatible object-storage container. This overrides the ADR's own
recommendation deliberately — MinIO remains available as a later migration if a real deployment
target ever requires it, but is not being built now. No separate prerequisite story is needed:
the volume mount is small enough to fold into Story 2.6's own implementation (O4-40) rather than
scaffold ahead of it.

## Addendum (2026-09-02, second): Decision 3 accepted

**Decision 3 — accepted: option 2, server-side pagination.** Matches this ADR's own
recommendation. The All Employees list endpoint takes page number/size params and returns one
page per request; Story 2.3's saved views persist page size alongside the filter/column
configuration; Story 2.4's export walks all pages server-side rather than being limited to
whichever page happened to be loaded client-side (permitted by the AC's "current list view"
wording, which describes the active filter/column configuration, not a single loaded page).

No separate prerequisite story is needed — pagination is core to Story 2.1's own filter/column
engine, not a separable shared capability the way Decision 1's batch endpoint was. Stories 2.3,
2.4, and 2.5 absorb the consequence in their own scope once they're built against 2.1's paginated
shape.

## Related

- `docs/decisions/ADR-003-epic-1-remaining-story-dependencies.md` — named the batch-resolution gap
  first, but never gave it a concrete tracking home; this ADR is that home.
- `_bmad-output/implementation-artifacts/deferred-work.md` — the existing `AccessRoleResolver`
  scaling entry (recursive CTE) that Decision 1's option 1 would need to land alongside.
- `_bmad-output/planning-artifacts/epics.md` — Epic 2, Stories 2.1 and 2.6, source of both gaps'
  acceptance criteria; Decision 3 also touches Stories 2.3, 2.4, 2.5.
