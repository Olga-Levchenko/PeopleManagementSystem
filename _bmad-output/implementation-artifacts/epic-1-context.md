# Epic 1 Context: Access Control Foundation & Employee Profile

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Establish the platform's access-control engine so that every viewer — Self, Reporting-line Manager, Project-line Manager, People Partner, Colleague, or Full-profile-access holder — sees exactly the profile sections and fields they are entitled to, correctly resolved from their real relationship to the subject at request time. HR Admin can create functional roles and assign permissions without a deploy. Full profile access is a separate, journaled grant that can never self-assign and can never be reduced to zero holders. The access-role resolution engine consumes project-assignment relationship-change events through a stubbed contract, so this epic does not block on the real timetracker adapter (Epic 14). Every other epic builds directly on this foundation; the exit gate is a green automated coverage manifest for every section-matrix cell that FR-1 through FR-7 govern — not just "stories merged."

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

**Access-role resolution** is a transitive closure over three relationship types: reports-to chains, department management (including parent departments), and project assignment to a PM or DM. The result is one of: Reporting line (first two sources), Project line (third source), or Colleague (none). The same requester can hold different access roles toward different subjects in the same session — resolution is always per (viewer, subject) pair, never cached as a global user-level role.

**Section-level gating is absolute.** A `—` cell in the section matrix must produce no trace in the API response, export, search result, notification, or error message. Sections are not hidden in the frontend — they are absent from the server response. The BFF composes responses from only what the Access Control Service permits.

**Project-line narrowing:** a viewer reaching a subject solely through project assignment loses access to S2 and S3 entirely and gets read-only S5 limited to CV and certificates. All other sections match Reporting-line access. If a viewer qualifies through both lines for the same subject, the most-permissive path wins.

**Colleague whitelist:** a viewer holding none of Manager/PP/Full-profile-access sees exactly S1, S10 (dates only — no leave type), and S11 (project name only). Enforced by asserting no keys outside that set exist in the response body, not by hiding fields.

**S7 flag gating:** management notes carry two server-defaulted-false flags — `visible for employee` and `visible for PM`. UM, DM, and PP get full RW regardless of flags. An employee sees only their explicitly flagged notes. A PM (the specific functional role, not Project line broadly) gets read-only access to notes flagged for PM. A DM reached via project assignment keeps full S7 RW — the PM exception does not apply to DMs.

**Organisational-relationship fields (manager, people partner, department, department's manager)** are never writable through a general S1 edit. They change only through a dedicated, permissioned, journaled screen. No self-assignment. Every change writes a journal entry (one of six journaled event types: manager change, PP change, department change, department-manager change, Full-profile-access grant, shared-link access).

**Functional roles are runtime data:** HR Admin creates roles, grants any subset of independently-grantable permissions, and assigns roles — all with no deploy. A functional role never widens data access beyond the holder's existing access role. HR Admin's own grant is configuration-only (custom fields, dictionaries, departments, functional roles/permissions) with no standing profile-section access.

**Full profile access** is seeded to one holder at deployment, can only be granted by an existing holder, cannot be self-assigned, and the last holder can never be removed. Grants and removals are journaled.

**Relationship-change timing:** platform-owned edits (reporting line, department, PP assignment) take effect on the very next request. Project-derived access changes within 15 minutes of the underlying assignment change under normal sync, and is forcibly withdrawn within 4 hours if timetracker sync is failing. Any cache backing access resolution must invalidate within these bounds.

**Custom field visibility** (`management`, `employee`, `colleague`) is enforced identically across profile reads, list columns, filter options, and exports. A requester who cannot see a field must not be offered it as a filter option — binary-search inference via range filters is a data leak.

**CI exit gate (SM-1):** a machine-readable authorization coverage manifest must be green for every audience × relationship-path × section combination, every `—` cell, the S7 unflagged-note cases against both employee and PM, and the Project-line narrowing cells. The epic is not done until this manifest is green.

## Technical Decisions

**Access Control is a separate .NET service** (`services/access-control-service`, AD-2). No other service may hardcode a role-name check in place of calling it. It owns access-role resolution, functional permissions, and section/record/operation policy decisions.

**Derived relationship projection** (AD-3): Access Control does not synchronously query People/Organization on each request. People/Organization publishes relationship-change events through a transactional outbox over RabbitMQ. Access Control maintains a derived projection, processes events idempotently, prioritizes revocation events with fail-closed handling, and records applied source versions and freshness watermarks. A synchronous People lookup is an exceptional freshness check only.

**Stub event contract for project assignments:** Story 1.2 consumes a project-assignment-ended event against a stubbed/fake producer. The internal normalized relationship-change contract is defined in this epic; Epic 14's real timetracker adapter must publish the same contract. Authorization never consumes raw timetracker payloads.

**Persistence isolation** (AD-4): each service owns its own PostgreSQL database/schema and runs its own migrations. Services never read or write another service's tables.

**BFF is the browser boundary** (AD-5): validates Keycloak-issued tokens, adds correlation context, composes domain APIs, and returns consistent errors. It must not own authorization policy. Restricted sections are omitted before reaching React. React never calls a domain service directly.

**Authentication (Story 1.11):** Keycloak issues identity tokens. The BFF rejects any request with a missing, expired, malformed, or signature-failed token before forwarding. Domain services receive a platform-established verified identity — never a caller-supplied actorId from a request body or query string. Service-to-service calls carry a trusted service identity. A revoked or expired session is rejected the same as a never-authenticated request.

**Shared contracts** live in `libs/contracts` (versioned DTOs and message schemas, AD-9). Additive evolution within a version; breaking changes require a new version and a migration plan, verified by CI contract checks.

**Authorization caches** must not preserve revoked access beyond the approved propagation bounds (15 minutes for project-derived access, next-request for platform-owned edits). Redis is used only where a measured need justifies it and is never the system of record.

**Stack:** .NET for `access-control-service`; Node.js/TypeScript for `people-service`, `bff`, and other Node services; React 19 + Vite + Tailwind v4 + shadcn/ui (`radix-nova`) for `frontend`; PostgreSQL as primary store; RabbitMQ for messaging; Keycloak as identity provider. All versions must be verified and pinned before implementation — the architecture spine's stack table intentionally defers pinning.

## UX & Interaction Patterns

**Section omission** is the load-bearing frontend rule for this epic: a section the viewer has no access to is absent from the DOM — not disabled, not blurred, not behind a lock icon. The page layout reflows around its absence. The same profile route renders different section sets for different viewers; the frontend has no knowledge of why a section is absent. This is Story 1.6's UX contract and the pattern every later profile-rendering story follows.

**Permission-adjacent absence** is the general form: a capability or field that does not exist for this viewer is simply not present, not offered as a greyed-out option. No "you don't have permission" message is ever shown — that message would itself reveal that the section exists.

**FlagIndicator** (S7 flags): two independent, separately-labeled toggles, both defaulting off, editable only by UM/DM/PP. Read-only display for a PM who can see the record. Accessible name states the flag itself ("Visible for employee: Off"), never a bare unlabeled toggle.

**Organisational-relationship fields** (manager, PP, department) are never inline-editable anywhere in the UI — only changeable through the dedicated screen from Story 1.3.

**Administration surface** (HR Admin): exposes functional roles, permission grants, custom fields, and departments only — zero profile-data surfaces are reachable from it.

## Cross-Story Dependencies

**Story 1.11 (authentication)** is a logical prerequisite for all other stories — access-role resolution requires a verified identity on every request — but has no code dependency on 1.1–1.10 and can be built in parallel.

**Story 1.1 (resolution engine)** is a prerequisite for 1.6, 1.8, and 1.9 — the resolution result is what those stories gate or narrow.

**Story 1.3 (org-relationship screen)** must be complete before 1.6 can correctly reject S1 writes to manager/PP/department fields. Story 1.5 also requires 1.3's journal infrastructure and 1.4's permission model.

**Story 1.6 (section-gated response)** integrates resolution (1.1, 1.9) with the API surface — it depends on the access-role result and the section matrix to assemble each response. Stories 1.8 and 1.9 follow directly from 1.6's assembly layer.

**Story 1.10 (custom field visibility)** must be designed as a callable policy point that later surfaces (All Employees in Epic 2, exports, filters) reuse — not a profile-page-only rule.

**Story 1.8's colleague whitelist** is the base that Epic 11 additively extends (campaign-author S14 exception) — that extension is out of scope here but must be designed as an extension point.

**FR-15 split:** this epic covers only the negative clause (self can never read own S6). The other three FR-15 sub-clauses live in Epics 3, 9, and 10.

**FR-44 split:** Story 1.2 defines the internal relationship-change event contract and consumes it from a stub. Epic 14 fulfills the same contract with the real timetracker adapter. The resolution engine must not change when Epic 14 ships.

**Epic gate:** Epics 2 through 16 all build on this access model. An unverified section-matrix cell here is inherited by all of them. The SM-1 manifest must be green before any other epic is considered safe to build on top of this one.
