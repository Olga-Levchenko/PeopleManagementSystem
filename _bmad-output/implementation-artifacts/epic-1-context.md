# Epic 1 Context: Access Control Foundation & Employee Profile

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Every viewer (self, manager, People Partner, colleague) must see exactly the profile sections and
fields they're entitled to, correctly resolved from their real relationship to the subject —
never from a stored role flag. This epic builds the access-role-resolution engine, the
functional-role/permission administration model, the Full-profile-access grant, and the
server-assembled section-gated profile response that every later epic depends on. It also
establishes that organisational-relationship changes (manager/PP/department/department-manager)
are a dedicated, journaled operation, never a side effect of an ordinary profile edit. Nothing
else in the platform is considered safe to build until this epic's automated coverage proves every
section-matrix cell it governs, because every other epic inherits whatever access-model gaps
remain here.

## Stories

- Story 1.1: Two-dimensional access-role resolution
- Story 1.2: Access role un-derives when a relationship ends
- Story 1.3: Organisational-relationship changes as a dedicated, journaled operation
- Story 1.4: Functional roles and permissions as runtime-editable data
- Story 1.5: Full profile access as a separate, journaled grant
- Story 1.6: Server-assembled, section-gated profile response
- Story 1.7: S7 Management notes flag gating
- Story 1.8: Colleague view field whitelist
- Story 1.9: Project line narrowing vs. Reporting line
- Story 1.10: Custom field visibility enforcement

## Requirements & Constraints

- Access roles are derived per (viewer, subject) request, never stored: the Reporting line
  (reports-to + department management, transitive) and the Project line (project assignment) are
  no longer equivalent — Project line is narrowed to exclude S2/S3 entirely and limits S5 to
  CV+certificates, with everything else, including S6, matching Reporting line. Where a viewer
  reaches a subject through more than one path, the most-permissive resolved access wins.
- Revocation timing is split: a platform-owned relationship edit (manager/PP/department/
  department-manager) takes effect on the requester's very next request; access derived solely
  from a project assignment is removed within 15 minutes under normal sync, degrading to forced
  withdrawal within 4 hours if sync itself is failing. Any cache backing resolution must respect
  these bounds — proven by test, not assumed from TTL.
- HR Admin is config-only (custom fields, dictionaries, departments, functional roles/permissions)
  with no standing profile data access. Full profile access is a separate, journaled grant: only
  an existing holder can grant it, no self-grant, one holder seeded at deployment, and the last
  remaining holder can never be removed.
- Functional-role permissions never widen data access beyond the holder's independently-resolved
  access role; role/permission changes take effect on the assignee's very next request, no deploy.
- The profile API must omit any section the viewer has no access to from every surface (API,
  export, search, notification, error) — never hidden client-side. Manager/PP/department/
  department-manager fields are read-only through the profile header and only writable through
  the dedicated Story 1.3 screen; that screen itself must reject self-assignment.
- S7 notes default both visibility flags to false; UM/DM/PP always get full RW regardless of
  flags; a PM specifically (not Project line generally) gets read-only access limited to notes
  flagged visible-for-PM.
- Colleague view is an exact whitelist — S1, S10 (dates only, no leave type), S11 (project name
  only) — verified by asserting no other keys exist in the response.
- Custom-field visibility (management/employee/colleague) must be enforced identically everywhere
  a field could appear (values, filters, columns, exports, search), through one shared decision
  point later surfaces reuse rather than re-implement.
- Exit bar (SM-1): 100% of section-matrix cells (every audience x relationship path x section,
  every `—` cell, S7 unflagged cases, narrowed Project-line cells, colleague whitelist) need an
  automated test asserting actual API response shape — a test that only checks UI hiding does not
  count.

## Technical Decisions

- Access Control (`services/access-control-service`, .NET) is the sole owner of access-role
  resolution, functional permissions, and section/record/operation policy decisions — no other
  service may hardcode a role-name check in its place.
- Access Control resolves against a derived relationship projection, not synchronous People
  lookups: People/Organization is authoritative for relationships and publishes relationship
  domain events through a transactional outbox over RabbitMQ; consumers are idempotent,
  replay-safe, prioritize revocation events, and fail closed while freshness is uncertain. A
  periodic reconciliation sweep against People/Organization's authoritative data catches an event
  that was never published (not just one that's late) — a gap a watermark-only design would miss.
  A synchronous People lookup is an exceptional freshness check, not the default path.
- `AccessRoleResolver` already exists (Story 1.1, merged), is fully tested, resolves live on every
  call with no caching, and has a working Project-line data/event pipeline (project-assignment
  revoke removes the row immediately) — so Story 1.2's Project-line acceptance criterion is
  effectively already satisfied; only tests remain to formally claim it. Reporting-line
  revocation still depends on the organisational-relationship event pipeline below.
- No HTTP endpoint yet exposes `AccessRoleResolver`. Proposed interim (non-binding) shape:
  `GET /api/v1/access-roles/resolve?viewerPersonId={guid}&subjectPersonId={guid}` returning
  `{ "reportingLine": bool, "projectLine": bool }` — single-subject only; a batch variant for
  Epic 2's All Employees list is explicitly out of scope here. This one endpoint is the shared
  blocker underneath Stories 1.6, 1.8, 1.9, and 1.10.
- People/Organization's Story 1.3 write path must call Access Control synchronously, at write
  time, to check the "change organisational relationships" permission before applying a change
  (interim shape: `POST /api/v1/permissions/check` with `{actorPersonId, permission}` →
  `{granted}`) — a point-in-time write gate, not a violation of the async-default resolution path.
- The organisational-relationship event contract (manager/PP/department/department-manager
  changes) reuses the same envelope already implemented for project assignment
  (`ProjectAssignmentChangedEvent`): `EventId`, `AggregateId` (= PersonId), `AggregateVersion`,
  `OccurredAtUtc`, `SchemaVersion`, plus a `RelationshipType` enum (`Manager`|`PeoplePartner`|
  `Department`|`DepartmentManager`), `PersonId`, `NewValueId`. Queue:
  `access-control.organisational-relationship-events`, mirroring the existing consumer's pattern
  (quorum queue, `x-delivery-limit`, DLX/DLQ). People/Organization owns the outbox: relationship
  change + journal entry + outbox row commit in one transaction; a separate publisher process
  reads and publishes — never publish inside the request transaction.
- Story 1.7 needs one more design point beyond the resolution endpoint: distinguishing "PM
  specifically" from "Project-line generally," since `ProjectLine` is currently a plain boolean.
  Recommended: extend the resolution endpoint's response with an optional `projectRoles` field
  rather than having work-management-service query project-assignment data directly (keeps the
  role-resolution decision in one place).
- Story 1.9 shipped: `GET /api/v1/access-roles/resolve` now exists (`AccessRolesController`,
  calling `AccessRoleResolver`), and the S2/S3/S5 narrowing logic lives in a new sibling Domain
  component, `ManagerSectionAccessPolicy` — not inside `AccessRoleResolver` itself, and not in
  Story 1.6's profile-response-assembly layer either, since section-level policy decisions belong
  to access-control-service per AD-2. `ProjectLine = true` alone (without `ReportingLine`) narrows
  S2/S3 to no access and S5 to CV+certificates-only; whenever `ReportingLine` also qualifies, the
  unnarrowed result wins (most-permissive-path-wins, now resolved in
  `docs/access-control/section-matrix.md` rather than an open question). The endpoint's response
  adds a third field, `managerSectionAccess`, beyond the `{reportingLine, projectLine}` shape ADR-003
  originally proposed (see that ADR's addendum) — `null` whenever neither line qualifies. Story
  1.6 still owns assembling the *actual profile field data* per section; this story only decided
  the per-section access level for the Manager audience.
- Story 1.10 is blocked on people-service's custom-field data model existing at all (no schema
  yet); whether the visibility decision point lives in People/Organization or is proxied through
  Access Control for consistency with every other authorization decision is not yet decided.
- The BFF composes domain APIs and must omit restricted sections server-side before they reach
  React — it must never own authorization policy itself.
- CI must run a machine-readable authorization coverage manifest covering every section-matrix
  audience/relationship-path combination, every `—` cell, S7 flag-gating, the colleague whitelist,
  and custom-field visibility, failing the build on any uncovered cell — the exit bar (SM-1) above
  is enforced mechanically, not by review discipline alone.

## UX & Interaction Patterns

- Story 1.6 implements the "Section omission" pattern from the UX design spine: a section the
  viewer has no access to is absent from the DOM entirely — never disabled, blurred, or shown
  behind a lock icon. This is the UI-side expression of the server-side omission rule and is the
  UX contract every later profile-rendering story should also follow.
- The `FlagIndicator` component (S7's two flags) is editable only by RW holders (reporting line/
  DM/PP) and read-only for a PM; its accessible name must state the flag itself (e.g. "Visible for
  employee: Off"), never a bare toggle.
- Manager/PP/department fields are never inline-editable anywhere in the UI — only through the
  dedicated organisational-relationship screen from Story 1.3.
- The Administration surface (HR Admin) exposes functional roles, permission grants, custom
  fields, and departments only — zero profile-data surfaces are reachable from it.

## Cross-Story Dependencies

- Story 1.5 is blocked on Story 1.3 (journal) and Story 1.4 (permission model) landing first; the
  journal schema and the Full-access RW-everywhere policy are already fully specified, so only
  plumbing remains once those two land.
- Story 1.6 depends on Story 1.1 (done) plus Story 1.3's relationship-field write-rejection logic;
  read-side profile assembly can start as soon as the access-role-resolution HTTP endpoint exists.
- Stories 1.8 and 1.9 follow directly from Story 1.6's endpoint/assembly layer — neither needs new
  work inside `access-control-service` itself.
- Story 1.7 additionally depends on the not-yet-designed DM-vs-PM distinction above, and lives
  partly in `work-management-service`, which is currently an empty scaffold.
- Story 1.10 is blocked on people-service's custom-field model, which does not exist yet.
- This epic closes the negative half of FR-15 (self can never read own S6); the other three FR-15
  sub-clauses (self-complete action item, self-complete IDP, self open-to-mentoring flag) are owned
  by Epics 3, 9, and 10 respectively, tracked as a cross-epic split.
- Story 1.8's colleague whitelist is the base Epic 11 additively extends later (campaign-author S14
  exception) — that extension is out of scope here.
- Epic 1 is a hard gate for the rest of the platform: Epics 2 through 16 all build directly or
  indirectly on this access model, so an unverified section-matrix cell here is inherited by every
  one of them, not just the next epic in sequence.
