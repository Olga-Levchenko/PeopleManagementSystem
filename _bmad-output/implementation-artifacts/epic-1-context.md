# Epic 1 Context: Access Control Foundation & Employee Profile

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give every viewer — Self, Reporting-line Manager, Project-line Manager, People Partner, Colleague, or Full-profile-access holder — exactly the profile sections/fields they're entitled to for a given subject, resolved from their real relationships at request time, never from a stored role flag. HR Admin can create functional roles and grant permissions with no deploy, but that grant is configuration-only and never itself confers profile-data access. Full profile access is a separate, journaled grant that can never be self-assigned or reduced to zero holders. Resolution consumes project-assignment changes through a stubbed event contract so this epic doesn't block on Epic 14's real timetracker adapter. Every other epic reads from this foundation; the exit gate is a green automated coverage manifest for every section-matrix cell FR-1–FR-7 govern, not merely "stories merged."

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
- Story 1.11: Platform authentication via Keycloak

## Requirements & Constraints

**Access-role resolution** is the transitive closure of reports-to, department management (incl. parent departments), and project assignment to a PM/DM — the first two form the Reporting line, the third the Project line. Resolved per (viewer, subject) pair on every request; never cached or reused as a single global "current user's role."

**Revocation timing is split**: platform-owned edits (manager/PP/department/department-manager) take effect on the viewer's next request; project-derived access changes within 15 minutes of the underlying assignment change under normal sync, forcibly withdrawn within 4 hours if sync itself is failing. Any cache must invalidate within these bounds, proven by test.

**Organisational-relationship changes** are never writable through a general profile edit — only through a dedicated, permissioned, journaled screen, and never self-assignable even by a permission holder.

**Functional roles/permissions are runtime data**, live immediately on grant/revocation, and never widen access beyond the holder's already-resolved access role. HR Admin's own grant is configuration-only — no standing profile-section access.

**Full profile access**: exactly one holder seeded at deployment; only an existing holder can grant it; last holder can never be removed; a holder gets RW on every section.

**Section-gated response**: a `—` cell leaves zero trace on any surface (API, export, search, notification, error), never a client-side hide. The header shows manager/PP/mentor read-only to anyone who can see S1; writing those three via a normal S1 edit is rejected server-side.

**S7 note flags** (`visible for employee`, `visible for PM`) default false. UM/DM/PP get full RW regardless. A viewer who is *specifically* a PM (a DM keeps full RW) sees only PM-flagged notes, read-only. Where multiple relationship paths apply, the most-permissive wins.

**Colleague whitelist**: exactly S1, S10 (dates only), S11 (project name only) — verified by asserting no other keys exist. Campaign-author's S14 exception (Epic 11) is an additive extension point, not built here.

**Project line narrows only S2 (absent), S3 (absent), S5 (R-only, CV+certificates)** vs. Reporting line; everything else, including S6, matches. Reporting line wins whenever it also qualifies for the same subject.

**Custom field visibility** (`management`/`employee`/`colleague`) is one decision reused identically by profile reads, list columns, filters, exports, and search — a field the requester can't see must never be offered as a filter option (closes the range-search inference gap).

**Authentication**: every request carries a Keycloak-verified identity; the BFF rejects a missing/expired/malformed/invalid-signature token before it reaches any domain service, never forwarding a caller-supplied `actorId`/`personId`. Service-to-service calls carry a trusted platform identity too.

**Exit gate (SM-1)**: coverage manifest green for every audience × relationship-path × section combination FR-1–FR-7 govern, including every `—` cell and both S7 unflagged-note cases, before Epic 2+ builds on this.

**Genuinely open**: whether the header's mentor field follows "anyone who sees S1" or excludes Colleague; default permission grants for the expanded permission list, pending PO confirmation.

**NFR-2** (2s at 500+ records incl. permission resolution) and **NFR-6** (access control as the primary quality attribute) apply directly here.

## Technical Decisions

Access Control is a dedicated .NET service (`services/access-control-service`), sole owner of access-role resolution, functional-permission decisions, and section/record/operation policy — no other service may hardcode a role-name check instead.

It holds a **derived relationship projection**, not synchronous People lookups: People/Organization publishes relationship-change events via transactional outbox over RabbitMQ; the consumer is idempotent, prioritizes revocations with fail-closed handling under uncertain freshness, and tracks applied source versions. A synchronous People call is an exceptional freshness check only.

The **BFF is the sole browser boundary**, not a second policy engine: validates Keycloak auth, composes domain APIs, and omits restricted sections server-side before React sees them.

Persistence is isolated per bounded context — each service owns its own Postgres schema/migrations, no cross-service table access.

Cross-service contracts live in `libs/contracts`, versioned, additive-only within a version.

Authorization caches (Redis, only where measured need justifies it) must not preserve revoked access beyond the propagation bounds above.

CI runs a machine-readable authorization coverage manifest across every matrix cell, plus revocation tests for reporting-line and project-assignment endings (outbox atomicity, duplicate/reordered events, replay, stale-projection denial).

Stack: .NET (`access-control-service`); Node.js/TypeScript (other services, BFF); React (frontend); Keycloak; PostgreSQL; RabbitMQ; Redis where justified — versions to be pinned before implementation.

## UX & Interaction Patterns

**Section omission** is the load-bearing rule: an inaccessible section is absent from the DOM — never disabled, blurred, or lock-iconed — and the layout reflows around it. The same route renders a different section set per viewer.

**Permission-adjacent absence** generalizes this: a filter/column/feature the viewer lacks is simply not offered, never shown greyed-out — a "no permission" message would itself leak that the thing exists.

**FlagIndicator** (S7 flags): editable only by RW holders (Reporting line, DM, PP); read-only for a PM who can see the record; accessible name states the flag itself ("Visible for employee: Off").

Manager/PP/department fields are never inline-editable anywhere — only through Story 1.3's dedicated screen.

## Cross-Story Dependencies

Story 1.11 (Keycloak auth) is a logical prerequisite for every other story but has no code dependency on 1.1–1.10 — can proceed in parallel.

Story 1.1's resolution result is what 1.6, 1.8, 1.9 gate/narrow against; narrowing/whitelist logic itself belongs at 1.6's response-assembly layer, not inside resolution.

Story 1.3's journal/screen underpins 1.5 (grant journaling) and 1.6 (rejecting manager/PP/department writes via S1).

Story 1.10's decision must be one callable policy point later surfaces (Epic 2's columns/filters/exports) reuse — not profile-page-only.

Story 1.8's whitelist is the base Epic 11 later extends (campaign-author S14) — design as an extension point.

**FR-15 split**: this epic covers only "self never reads own S6"; self-complete-action-item/IDP/mentorship-flag live in Epics 3, 9, 10.

**FR-44 split**: Story 1.2 defines/consumes the relationship-change contract against a stub; Epic 14's real adapter fulfills the same contract without the resolver changing.

**Epic gate**: Epics 2–16 all build on this model; SM-1 must be green before any of them builds on top of Epic 1.
