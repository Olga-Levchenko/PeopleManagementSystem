# Epic 1 Context: Access Control Foundation & Employee Profile

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Every viewer (self, manager, People Partner, colleague) must see exactly the profile sections and
fields they're entitled to, correctly resolved from their real relationship to the subject — never
from a stored role flag. This epic builds the two-dimensional access model (derived access roles vs.
assigned, runtime-editable functional roles), the section-gated profile response, and the handful of
named exceptions (S7 flag gating, colleague whitelist, Project-line narrowing, custom-field
visibility). It is the foundational epic: every other epic builds directly or indirectly on this
access model, and its exit criteria require an automated coverage manifest to be green for every
section-matrix cell FR-1 through FR-7 govern before any later epic is considered safe to build on
top of it.

## Stories

- Story 1.1: Two-dimensional access-role resolution (split for delivery: part 1 scaffolds
  `access-control-service`, part 2 — deferred, see `deferred-work.md` — implements the resolution
  engine itself)
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

- Access role resolution is the transitive closure of three relations — reports-to, department
  management, and project assignment to a PM/DM — forming two distinct lines: Reporting line and
  Project line. Resolution runs per (viewer, subject) pair, never cached as one global "current
  user role."
- Revocation timing is split: a platform-owned relationship edit (manager/PP/department/department-
  manager) takes effect on the next request; project-derived access is removed within 15 minutes of
  the underlying assignment change under normal sync, degrading to forced withdrawal within 4 hours
  if sync itself is failing.
- Organisational-relationship changes (manager, PP, department, department-manager) are a dedicated,
  permissioned, journaled operation — never a side effect of a general profile edit — and are never
  self-assignable.
- Functional roles/permissions are runtime-editable, no-deploy data; a functional role never widens
  data access beyond the holder's independently-resolved access role. HR Admin's own grant is
  config-only (custom fields, dictionaries, departments, functional-role management), with no
  standing profile data access.
- Full profile access is a separate, journaled grant: only an existing holder can grant it, no
  self-grant, exactly one holder is seeded at deployment, and the last remaining holder can never be
  removed.
- A denied section must be absent from every surface (API, export, search, notification, error) —
  never merely hidden client-side.
- Colleague whitelist: exactly S1, S10 (dates only, no leave type), S11 (project name only).
- Project-line narrowing: S2/S3 become `—` and S5 becomes CV+certificates-only, read-only; every
  other section (including S6) matches Reporting line. Where a viewer reaches a subject through
  multiple paths, the most-permissive resolved access wins (same rule applies to S7).
- S7 notes default both visibility flags to false; UM/DM/PP always get full RW regardless of flags; a
  PM specifically (not Project-line generally) gets read-only on PM-flagged notes only.
- Custom field visibility (management/employee/colleague) must be enforced by one authorization
  decision reused by every consuming surface (profile, filters, columns, exports) built in later
  epics — a hidden field must never be inferable via filtering.

## Technical Decisions

- Access Control is a separate .NET policy service (`services/access-control-service`, distinct from
  `authentication-service`) owning access-role resolution, functional permissions, and section/
  record/operation decisions. No other service may hardcode a role-name check in its place.
- Access Control evaluates policy against a derived relationship projection, not synchronous People
  lookups. People/Organization publishes relationship changes via a transactional outbox over
  RabbitMQ (event id, source aggregate/version, occurred-at, schema version, grant/revoke flag). The
  consumer is idempotent, replay-safe, prioritizes revocation events, fails closed while freshness is
  uncertain, and tracks applied source watermarks. A synchronous People lookup is an exceptional
  fallback, never the default path.
- Epic 1 builds and consumes a stubbed relationship-change/project-assignment event contract; Epic 14
  later swaps in the real timetracker adapter as producer without changing the contract shape.
- People/Organization owns profiles, org structure, reporting lines, departments, custom-field
  definitions/values, dictionaries, and the career-timeline store. Each service owns its own
  Postgres schema; none reads/writes another's tables directly.
- The BFF composes domain APIs but must not own authorization policy; restricted sections/fields are
  omitted server-side before a response ever reaches the frontend.
- CI must run a machine-readable authorization coverage manifest covering every section-matrix
  audience/relationship-path combination, every `—` cell, S7 flag-gating, the colleague whitelist,
  and custom-field visibility, failing the build on any uncovered cell. Revocation tests cover outbox
  atomicity, duplicate/reordered events, replay, and stale-projection denial.

## UX & Interaction Patterns

- One Employee Profile component renders every audience (Self, Reporting-line, Project-line, PP,
  Colleague, Shared-link, Full-access) — the sections rendered differ per resolved role; there is no
  separate page or route per audience.
- "Section omission" is the governing pattern: a section the viewer can't access is absent from the
  DOM — never disabled, blurred, or lock-iconed — and no "you don't have permission" message is ever
  shown, since that message would itself leak the section's existence.
- The `FlagIndicator` component (S7's two flags) is editable only by RW holders (reporting line/DM/
  PP) and read-only for a PM; its accessible name must state the flag itself (e.g. "Visible for
  employee: Off"), never a bare toggle.
- Manager/PP/department fields are never inline-editable anywhere in the UI — only through the
  dedicated organisational-relationship screen from Story 1.3.
- The Administration surface (HR Admin) exposes functional roles, permission grants, custom fields,
  and departments only — zero profile-data surfaces are reachable from it.

## Cross-Story Dependencies

- Story 1.6 (section-gated response) depends on Story 1.1's role resolution and is the enforcement
  point that Stories 1.7, 1.8, 1.9, and 1.10 each add a specific narrowing/whitelist/flag rule to.
- Story 1.2's revocation logic and Story 1.1's Project-line resolution both consume the same stubbed
  relationship/project-assignment event contract that Epic 14 later fulfills with a real adapter.
- Story 1.3 is the only legal write path for manager/PP/department fields; Story 1.6 must reject
  those fields on a general profile write.
- Story 1.9's Project-line narrowing and Story 1.7's S7 gating both apply the same
  most-permissive-path-wins principle when a viewer reaches a subject through more than one path.
- Story 1.8's colleague whitelist is the base Epic 11 additively extends later (campaign-author S14
  exception) — that extension is out of scope here.
- This epic closes the negative half of FR-15 (self can never read own S6); the other three FR-15
  sub-clauses (self-complete action item, self-complete IDP, self open-to-mentoring flag) are owned
  by Epics 3, 9, and 10 respectively, tracked as a cross-epic split.
- Epic 1's exit gate (green coverage manifest for FR-1 through FR-7) blocks every other epic from
  being considered safe to build on top of this access model.
