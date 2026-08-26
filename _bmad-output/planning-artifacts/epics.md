---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics"]
inputDocuments: [
  "_bmad-output/planning-artifacts/prds/prd-PeopleManagementSystem-2026-08-25/prd.md",
  "_bmad-output/planning-artifacts/architecture/architecture-PeopleManagementSystem-2026-08-25/ARCHITECTURE-SPINE.md"
]
---

# PeopleManagementSystem - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for PeopleManagementSystem,
decomposing the requirements from the PRD and Architecture spine into implementable stories. No
UX design contract exists yet (prototyping is in progress); UX Design Requirements will be layered
in as a follow-up refinement pass once `bmad-ux` produces one, per explicit agreement with the
product owner rather than blocking this breakdown on it.

## Requirements Inventory

### Functional Requirements

FR-1: Resolve the viewer's access role per (viewer, subject) pair via the transitive closure of
reports-to, department management, and project-assignment-to-PM/DM, distinguishing the resulting
Reporting line from the Project line.

FR-2: Access role un-derives when the underlying relationship ends: platform-owned relationship
edits (manager/PP/department/department-manager) take effect on the very next request; access
derived solely from a timetracker project assignment is removed no later than 15 minutes after the
assignment ends under normal sync.

FR-2a: Organisational-relationship changes (a person's manager, people partner, department, or a
department's manager) are a dedicated, permissioned, journaled operation with their own screen —
never an ordinary S1 field edit, and never self-assignable.

FR-3: Functional roles and their permissions are runtime-editable data: HR Admin can create a role
and grant it any subset of the independently-grantable permissions with no deploy; assignment/
revocation takes effect immediately; a functional role never grants data access beyond the
holder's existing access role; HR Admin's own grant is config-only (custom fields, dictionaries,
departments, functional-role/permission management) with no standing profile data access.

FR-3a: Full profile access is a separate, journaled grant distinct from HR Admin: only an existing
holder can grant it, no self-grant, the first holder is seeded at deployment, and the last
remaining holder can never be removed.

FR-4: The profile API response is assembled server-side from exactly the sections the resolved
viewer is entitled to — a `-` cell is absent from every surface (API, UI, exports, search,
notifications, error messages), never merely hidden client-side. The profile header shows
manager/people-partner/mentor read-only to any audience that can see S1; changing those three
fields is FR-2a's operation, never a general S1 write.

FR-5: S7 Management notes carry two independent visibility flags (`visible for employee`,
`visible for PM`), both server-defaulted false. UM/DM/PP always get full RW on notes for people
they're responsible for regardless of flags; this exception is tied specifically to the PM
functional role, not to Project line generally. Where a viewer reaches the same subject through
more than one relationship path, the most-permissive resolved access wins.

FR-6: A colleague's profile read returns exactly the S1 / S10 (dates only, no leave type) / S11
(project name only) whitelist, verified by asserting the response body has no keys outside that
set. One narrow exception: a campaign author sees name and completion status (S14) for their own
campaign's recipients only, ending when the campaign closes.

FR-6a: A viewer resolved as Manager solely via project assignment (Project line) gets `-` on S2
and S3, and R-only on S5 limited to CV and certificates — every other section, including S6, is
identical to Reporting line. A viewer who is simultaneously Reporting line and Project line for the
same subject gets the Reporting line's unnarrowed access (most-permissive-path-wins, by analogy to
FR-5/S7).

FR-7: Custom field visibility (management/employee/colleague) is enforced identically across the
profile read and the All Employees list — a management-only field never appears as a value or as
a filter option to a requester who can't see it.

FR-8: A universal filter/column engine operates over profile fields, including custom fields
created after this feature ships, with no code change; derived fields (e.g. "years with company")
are filterable as if stored.

FR-9: Inline editing on All Employees writes through to the profile, subject to the editor's
actual access — an edit attempt on an R-only field is rejected server-side, not merely disabled in
the UI.

FR-10: A saved view (filter + columns) persists under its creator, can be shared with other
managers, and multiple views coexist as separate tabs.

FR-11: An `.xlsx` export contains only the columns the exporter is entitled to see — the same
entitlement check as the live list view.

FR-12: A colleague viewing All Employees sees only whitelist columns; clicking a row opens the
limited profile view, never the full profile with client-side hiding.

FR-13: An employee can view/edit their own S2 (personal contacts, address, place of stay) and S3
(emergency contacts) without any manager/PP action, and upload their own photo and certificates.

FR-14: An employee can read (not write) their own S4 (grade, position, seniority, employment type,
English level), S9 (career timeline), S10 (leaves, linked to the timetracker), and S11 (projects).

FR-15: An employee can read their CDS section and mark their own IDP complete, manage their own
mentorship open-to flag (even while holding an active mentee), and mark their own action items
complete — but can never read their own S6 risk level under any condition.

FR-16: UM, DM, PM, and PP dashboards share one underlying engine (counters, tables, action-item
lists); a fifth audience-scoped dashboard should require only a new configuration, not a new page.

FR-17: The UM dashboard is grouped by person: subordinate headcount, risk counts by level, open/
overdue action item counts, active resourcing request count, open campaign count, a subordinates
table with risk/project/leave status, and the UM's own action items sorted by due date.

FR-18: The DM/PM dashboard is grouped by project: one table per project with a selector defaulting
to "All projects" that recalculates every counter; the DM's page additionally shows requests
created by their PMs; unattached requests surface in a dedicated Unassigned bucket included in the
all-projects counters.

FR-19: The PP dashboard uses the same building blocks scoped to the PP's assigned people, groupable
by department or project, with the resourcing block absent entirely.

FR-20: A UM/DM/PM/PP, or any functional role holding the "create action items" permission, can
create an action item for any person they hold Manager or PP access over — never for a person
outside that scope.

FR-21: Activating a form campaign generates exactly one action item per resolved recipient,
carrying the campaign's link and due date; the resolved recipient list freezes at activation.

FR-22: The assignee completing an action item records a completion date; the author can cancel
with a required reason; any item past its due date renders as overdue everywhere it's shown.

FR-23: A risk record's current level is its most recent record; full history is retained and
readable by Reporting line/Project line/PP. Fixed severity order (low < need attention < medium <
high < leaver) with no "resolved" state; `leaver` is a prediction, never conflated with the
`dismissed` employment-status fact. "Active" counts exclude `low`. A trend arrow appears only when
the level differs from the immediately preceding record.

FR-24: The Risk Dashboard shows counts by level, a severity/date-sorted table with trend arrows,
filterable by unit/department/project/PP/manager, with drill-through to the filtered table and to
the profile — scoped to the viewer's Manager/PP access and never rendered for the employee's own
profile.

FR-25: A DM/PM (or a permissioned role, scoped to that role's own access) can create a resourcing
request, optionally unattached to a project (surfacing in the Unassigned bucket), carrying a
department (routes to the responsible UM), a headcount (default 1), and an expected compensation
level visible only to the request's author, the routed UM, and the reviewing DM.

FR-26: A UM (or a permissioned role) can propose internal specialists and/or external PeopleForce
candidates against a request assigned to them for DM approval; every external candidate gets the
PeopleForce candidate ID stored unconditionally.

FR-27: For an internal candidate the DM doesn't yet hold access over, a narrower auto-generated
share (S1, S4, S11, S12, S5 as CV+certificates, S6 optional; never S2/S3/S7/S8) is created naming
the reviewing DM, valid until decision. Each candidate decision requires both the Manager access
role and the "approve or reject candidates" permission. Approving fills one headcount slot; only
the DM's explicit close action ends a request.

FR-28: Every proposal attempt (proposed → approved/rejected, with feedback) appears in both
Resourcing → Requests and the candidate's own profile S15; approval doesn't itself create a project
record — that appears only after the next timetracker sync.

FR-28a: A resourcing request stays open regardless of headcount fill level; it only closes via an
explicit DM action (or a role holding "close resourcing requests"). A closed request accepts no new
proposals; existing S15 history is unaffected.

FR-29: Creating a profile share requires the requester to hold Manager or PP access over the
subject at creation time; the recipient must be an authenticated, explicitly named person — no
anonymous link mode. Every `cfg` section is off by default except S1; S2/S5/S6/S8 require explicit
per-share enabling; S3/S7/S13/S14 can never be shared under any configuration.

FR-30: Shared links default to 24-hour expiry (configurable), log every access to the journal, and
re-check the creator's own access on every view — the link dies the moment the creator's underlying
relationship ends, even before stated expiry. Revocation rights follow whoever currently holds the
relevant relationship (or a Full-profile-access holder as backstop). A shared link never grants
write access.

FR-31: Joining, grade/position/department change, FTE-subcontractor transition, extended leave, and
mentorship start/end each write a career-timeline event automatically. Departure/dismissal is
explicitly excluded from the timeline — it lives exclusively in employment status.

FR-32: PP and UM can add, edit, or delete timeline entries for historical backfill or correcting a
wrongly-inferred system event.

FR-33: The department+position to CDS matrix-file mapping is a maintained dictionary keyed off the
Department entity (not a free-text string); updating the dictionary updates every affected profile
with no per-profile edit.

FR-34: Manager/PP can create CDS assessment records (date, assessor, result-file link, conclusion)
and create/update IDPs; the employee can mark their own IDP complete, recording a completion date.

FR-35: All Employees supports CDS-based filters: assessed-before/after/between X (and Y), a
distinct "never assessed" option, and "has an open IDP" (yes/no).

FR-36: An employee can flag themselves open to mentoring and see their own assigned mentor/
mentees.

FR-37: A manager/PP browses a company-wide mentor pool (identity-card data plus the open-to-
mentoring flag only, regardless of their own relationship to the person), but can only assign a
mentee from people they actually hold Manager or PP access over. The first pair's creation flips
the mentor's status to "mentor," a filterable field.

FR-38: Ending a mentorship pair requires a closure note — refused without one — stored as a field
on the pair record itself (not an S8 record), readable only by Reporting line/Project line/PP. If
the mentor has no other active mentees, their status reverts to "open to mentoring."

FR-39: A campaign creator builds/previews an audience via the filter engine or a saved view, can
add/remove individuals after resolution, and the list freezes on activation; available to PP/
managers by default and any role holding "create form campaigns."

FR-39a: A campaign author who otherwise holds only Colleague access over a recipient can still see
that recipient's name and completion status in their own campaign's table — nothing else, ending
the moment the campaign closes.

FR-40: The campaign sender's view shows a per-recipient completed/not-completed/overdue table
driven entirely by action-item completion — the system never reads the external form's contents.

FR-41: Managers/PP add S8 feedback records (subject, author, date, context, body) with a visibility
flag (management-only default, or shared-with-employee); joining-interview feedback is created as
an ordinary flagged S8 record, not a static always-readable S5 document. Records are listed
chronologically and filterable by period (no period-comparison view).

FR-42: Requesting feedback from named colleagues is implemented as a form campaign, not a separate
mechanism.

FR-43: Timetracker leave data (vacation/sick/parental/other, with dates) syncs into S10 per the
section's access rules; the colleague audience sees only the fact and dates of an absence, never
the type; leave balances are not displayed in-platform at all (links out to the timetracker).

FR-44: A new or ended project assignment (with its PM/DM) is an input to Manager-access
resolution; the change is reflected within 15 minutes under normal sync. If the timetracker sync
itself is failing, project-derived access is forcibly withdrawn within 4 hours regardless of
last-known state.

FR-45: Given a PeopleForce candidate ID, a UM can trigger a per-field-previewed, per-field-
confirmed prefill of the candidate-proposal record — never silently overwriting an already-filled
field. A fixed list (grade, seniority, employee type, department, manager, people partner, contract
data, employment status, risk) can never be prefilled from PeopleForce. The PeopleForce candidate
ID is stored unconditionally on every external candidate regardless of whether the prefill button
is implemented. No PeopleForce vacancy read or write path exists in either direction.

FR-46: Employment status (`active` / `dismissed`) is modeled as a time-bounded fact, the same way
as grade/position/department — never conflated with a risk record's `leaver` prediction.

FR-47: HR (holding the "record a departure" permission) records a departure with an effective date
and reason; recording is blocked while the person still manages anyone or is anyone's assigned
People Partner (the UI prompts re-parenting via FR-2a first). On the effective date: the profile
goes read-only; the person drops from the default All Employees list (still findable via explicit
filter); open action items close as `cancelled - departed`; active mentorship pairs auto-close with
a system-generated closure note; the account deactivates; every derived access the person held over
anyone else ends immediately. Departure is never a career-timeline event.

### NonFunctional Requirements

NFR-1 (Platform): Responsive web only for this iteration — usable at typical desktop and tablet
widths; no dedicated mobile app.

NFR-2 (Performance): The All Employees list responds within 2 seconds at 500+ records with
arbitrary filters and derived fields, including permission resolution — a hard release gate, not an
aspiration.

NFR-3 (Availability - Timetracker): A timetracker outage degrades to stale-but-labeled leave/
project data behind a visible "unable to refresh" banner; it must never take down profile access or
dashboard rendering; project-derived access is forcibly withdrawn no later than 4 hours into a
sustained outage (FR-44).

NFR-4 (Availability - PeopleForce): A PeopleForce outage or fallback-mode operation must not block
resourcing request creation, fulfilment, or DM review/approval for internal candidates — degrades
per-candidate (manual entry or external-link mode), never globally.

NFR-5 (Accessibility): WCAG 2.1 AA is the baseline reference standard — keyboard navigability for
every interactive element, semantic heading/landmark structure, and AA-conformant text/background
contrast, scoped down from a full audit (screen-reader walkthroughs, full automated+manual AA
conformance testing), which is explicitly out of scope this iteration.

NFR-6 (Access-control correctness): The primary quality attribute, constraining every feature in
the platform, not only role resolution and section access themselves.

NFR-7 (Privacy): Pseudonymised data only in every non-production environment, every log, and every
agent context — real structure/volume with fabricated identities; no compensation data is modeled
at all, removing an entire class of sensitive-data handling by design.

### Additional Requirements

- No starter/greenfield template is specified — services are built from scratch following the
  Architecture's Structural Seed: `services/frontend`, `services/bff`, `services/auth-service`,
  `services/authorization-service`, `services/people-service`, `services/work-management-service`,
  `services/resourcing-service`, `services/integration-timetracker`,
  `services/integration-peopleforce`, plus `libs/contracts`, `libs/config`, `infra/docker-compose.yml`.
  This affects Epic 1 Story 1 (repository/service skeleton setup).
- Bounded-context ownership (AD-1): People/Organization owns profiles, employment history, org
  structure, reporting lines, departments, projects, assignments, PP relationships, cross-system
  identity links, custom-field definitions/values, system dictionaries, and the career-timeline
  store. Work Management owns risks, action items, CDS, mentorship, campaigns, feedback. Resourcing
  owns requests, candidates, proposals, approvals, request history. Integration services own
  adapters and integration-owned normalized records only.
- Authorization is a separate, dedicated policy service (.NET) (AD-2) — no other service may
  hardcode a role-name check in place of calling it; it owns access-role resolution, functional
  permissions, and section/record/operation policy decisions.
- Authorization operates on a derived relationship projection, not synchronous People/Organization
  lookups (AD-3): People/Organization publishes relationship domain events through a transactional
  outbox over RabbitMQ; the Authorization consumer is idempotent and replay-safe, prioritizes
  revocation events with fail-closed handling while freshness is uncertain, and records applied
  source versions/watermarks; a synchronous People lookup is exceptional, not the default path.
- Persistence ownership is isolated per bounded context (AD-4): each service owns its own
  PostgreSQL database/schema, may share one physical instance initially, but never reads/writes
  another service's tables directly; each service runs its own migrations.
- The BFF is the sole browser boundary, not a domain owner (AD-5): it validates Keycloak-issued
  auth, adds correlation context, composes domain APIs, and returns consistent errors; it must not
  own authorization policy; restricted sections/fields are omitted server-side before reaching
  React.
- Cross-service messages are durable and replay-safe (AD-6): RabbitMQ carries versioned message
  contracts; consumers use independent queues, idempotent processing, retries, and dead-lettering;
  authoritative producers use transactional outboxes.
- CI quality gates protect the access model (AD-7): builds, unit/service-integration/API-contract/
  migration/focused-E2E tests; a machine-readable authorization coverage manifest must cover every
  section-matrix audience/relationship-path combination, every `-` cell, S7 flag-gating, the
  colleague whitelist, shared-link restrictions, and custom-field visibility, with CI failing on
  uncovered cells; revocation tests cover reporting-line and project-assignment endings, outbox
  atomicity, duplicate/reordered events, replay, and stale-projection denial; integration tests cover
  timeouts, 5xx, malformed payloads, stale-but-labeled data, and per-candidate PeopleForce fallback;
  the performance gate is p95 <= 2 seconds for 500+ employees with permission resolution.
- Shared profile views are Authorization-owned grants, not a BFF- or service-local concept (AD-8):
  a grant record identifies subject, recipient, allowed-section allowlist, creator, expiry,
  revocation state, and access log; S2/S5/S6/S8 excluded by default, S3/S7/S13 never shareable
  (S14 added by the PRD's v1.5 layer), every access logged, expiry/revocation enforced server-side,
  and a shared grant is always read-only.
- Cross-service contracts evolve compatibly (AD-9): shared API/message contracts are versioned and
  owned in `libs/contracts`; OpenAPI and message schemas use backward-compatible additive evolution
  within a version; breaking changes require a new version plus a migration plan; producers/
  consumers verify compatibility in CI.
- Visibility is enforced before query and composition on every surface (AD-10): every surface that
  can return or use profile data (list, export, search, notifications) obtains an Authorization
  decision before querying/composing that section/field; a denied section/field is absent from the
  response and from error/notification content.
- Stack (versions to be verified and pinned before implementation, not assumed): React (frontend),
  Node.js/TypeScript (core business services), .NET (Authorization Service), Keycloak (identity
  provider), PostgreSQL (primary store), RabbitMQ (message broker), Redis (cache, only where a
  measured need justifies it, never the system of record), Docker Compose (initial local
  orchestration).
- Local development and the first delivery scope target one shared Docker Compose platform with
  health/readiness checks, per-service migrations, structured correlation-aware logging, basic
  tracing where practical, and separate development/test profiles.

### UX Design Requirements

N/A for this pass — no UX design contract exists yet (prototyping is in progress in `prototypes/`).
By explicit agreement with the product owner, epics/stories proceed now from PRD + Architecture
only, on the grounds that Section 8 [NORMATIVE] treats "one workstream waiting on another" as a
process defect; UI-heavy stories will get a follow-up refinement pass once `bmad-ux` produces a
design contract, rather than blocking this breakdown on it.

### FR Coverage Map

FR-1: Epic 1 - Access-role resolution via transitive closure (reports-to, department management,
project assignment)
FR-2: Epic 1 - Access role un-derivation on relationship end (resolution logic; real 15-min sync
fulfilled by Epic 14)
FR-2a: Epic 1 - Organisational-relationship changes as a dedicated, journaled operation
FR-3: Epic 1 - Functional roles as runtime-editable data
FR-3a: Epic 1 - Full profile access as a separate, journaled grant
FR-4: Epic 1 - Server-assembled, section-gated profile response
FR-5: Epic 1 - S7 Management notes flag gating
FR-6: Epic 1 - Colleague view field whitelist
FR-6a: Epic 1 - Project line narrowing vs. Reporting line
FR-7: Epic 1 - Custom field visibility enforcement
FR-8: Epic 2 - Universal filter/column engine
FR-9: Epic 2 - Inline editing writes through, subject to access
FR-10: Epic 2 - Saved views
FR-11: Epic 2 - Export respects the exporter's access
FR-12: Epic 2 - Colleague mode on All Employees
FR-13: Epic 2 - Self-managed personal data (S2/S3, photo, certificates)
FR-14: Epic 2 - Self-read of managed data (S4/S9/S10/S11)
FR-15: Epic 2 (self-view/edit) / Epic 3 (self-complete action item) / Epic 9 (self-complete IDP) /
Epic 10 (self open-to-mentoring flag) - split four ways across owning domains; see FR Split
Registry below, closing verification story in Epic 10
FR-16: Epic 5 - Shared dashboard engine, per-audience configuration
FR-17: Epic 5 (headcount, risk counts, action-item counts, subordinates table, own action items) /
Epic 13 (resourcing-request count, open-campaign count) - UM dashboard, split by data-source
availability; see FR Split Registry below
FR-18: Epic 5 (per-project table, project selector, risk/leave status) / Epic 13 (Unassigned
bucket, DM visibility into PM-created requests) - DM/PM dashboard, split by data-source
availability; see FR Split Registry below
FR-19: Epic 5 - PP dashboard (no resourcing dependency by design; fully available early)
FR-20: Epic 3 - Manual action item creation, scoped to creator's access
FR-21: Epic 3 - Campaign-generated action items
FR-22: Epic 3 - Action item lifecycle and overdue display
FR-23: Epic 4 - Risk record with retained history
FR-24: Epic 4 - Risk Dashboard
FR-25: Epic 7 - Resourcing request creation (DM/PM)
FR-26: Epic 7 - Resourcing request fulfilment (UM)
FR-27: Epic 7 - Request review and decision (DM), using Epic 6's sharing engine
FR-28: Epic 7 - Request history (S15)
FR-28a: Epic 7 - Request closure requires explicit, permissioned DM action
FR-29: Epic 6 - Standing Manager/PP-only share creation, section-selectable and sensitivity-gated
FR-30: Epic 6 - Expiry, revocation, and access logging
FR-31: Epic 8 - Automatic career-timeline event generation
FR-32: Epic 8 - Manual timeline override by PP/UM
FR-33: Epic 9 - CDS matrix link resolution by department + position
FR-34: Epic 9 - Assessment log and IDP
FR-35: Epic 9 - CDS-based filtering on All Employees
FR-36: Epic 10 - Self-service mentorship status
FR-37: Epic 10 - Manager/PP pairing flow
FR-38: Epic 10 - Ending a mentorship pair
FR-39: Epic 11 - Campaign creation and audience resolution
FR-39a: Epic 11 - Campaign-author colleague exception
FR-40: Epic 11 - Completion tracking
FR-41: Epic 12 - Feedback record creation and visibility
FR-42: Epic 12 - Requesting feedback from named colleagues (via campaign)
FR-43: Epic 14 - Leave data sync into S10
FR-44: Epic 1 (resolution logic against a stubbed event contract) / Epic 14 (real timetracker
adapter fulfilling that contract) - Project/assignment sync feeding access resolution; see FR
Split Registry below, closing verification story in Epic 14
FR-45: Epic 15 - Candidate prefill by ID for resourcing
FR-46: Epic 16 - Employment status as a time-bounded fact
FR-47: Epic 16 - Departure recording and effects

### FR Split Registry

Requirements whose sub-clauses land in more than one epic, because a later epic's data source
(resourcing, campaigns, the real timetracker adapter) doesn't exist yet when the earlier epic
ships. Tracked here as a single grep-able table — not scattered prose in the coverage map above —
precisely so "is FR-15 done" has one place to check instead of three. Each row's last epic carries
a **closing verification story**: acceptance criteria that explicitly assert every sub-clause below
is covered, citing the story IDs that implemented each one. SM-1's "100% of FR coverage" claim is
only true if every row below is fully checked off, not just the FR number's first appearance.

| FR | Sub-clause | Owning epic | Status marker |
| --- | --- | --- | --- |
| FR-15 | Self-view/edit S2/S3, self-read S4/S9/S10/S11 | Epic 2 | pending |
| FR-15 | Self-complete action item | Epic 3 | pending |
| FR-15 | Self-complete IDP | Epic 9 | pending |
| FR-15 | Self open-to-mentoring flag | Epic 10 | pending — closing verification story here |
| FR-16..19 | Engine + UM early blocks (headcount/risk/action-item counts) + DM/PM project table + PP dashboard | Epic 5 | pending |
| FR-16..19 | UM resourcing/campaign counts + DM Unassigned bucket + PM-request visibility | Epic 13 | pending — closing verification story here |
| FR-44 | Resolution logic against a stubbed relationship-change event contract | Epic 1 | pending |
| FR-44 | Real timetracker adapter fulfilling that contract (replaces the stub) | Epic 14 | pending — closing verification story here |

## Epic List

### Epic 1: Access Control Foundation & Employee Profile
Every viewer (self, manager, PP, colleague) sees exactly the profile sections/fields they're
entitled to, correctly resolved from their real relationship to the subject; HR Admin manages
functional roles/permissions without a deploy; Full profile access is a separate, journaled grant.
The access-role-resolution engine consumes relationship-change events (including project-
assignment changes) through a stubbed contract, so it does not block on Epic 14's real timetracker
adapter.
**Exit criteria (gate before Epic 2+ builds on this):** Epic 1 is not done at "stories merged" —
it is done when the SM-1 automated coverage manifest is green for every section-matrix cell that
FR-1 through FR-7 govern (every audience x every relationship path x every section, including
every `-` cell, the S7 unflagged cases, and the narrowed Project-line cells). Every one of the
other fifteen epics builds directly or indirectly on this access model; an unverified cell here is
inherited by all of them, not just the next epic in sequence.
**FRs covered:** FR-1, FR-2, FR-2a, FR-3, FR-3a, FR-4, FR-5, FR-6, FR-6a, FR-7

### Epic 2: All Employees List & Self-Service
Employees manage their own contact/emergency data and read their own managed fields; managers/PP
browse, filter, save views, and export the org roster within their entitlements.
**FRs covered:** FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15 (self-view/edit portion only
— see FR Split Registry)

### Epic 3: Action Items & Tasks
Managers/PP create action items; assignees complete or the author cancels them; overdue items
surface everywhere they're shown.
**FRs covered:** FR-20, FR-21, FR-22, FR-15 (self-complete-action-item portion — see FR Split
Registry)

### Epic 4: Risks & Risk Dashboard
Managers/PP record and track an employee's risk level with correct severity/leaver semantics; a
dedicated dashboard surfaces who needs attention.
**FRs covered:** FR-23, FR-24

### Epic 5: Dashboard Framework & Early Blocks
UM, DM/PM, and PP each get a working dashboard on one shared engine as early as the data allows:
UM's headcount/risk/action-item counters and subordinates table, the DM/PM per-project table with
risk/leave status, and the PP dashboard in full (it never carries a resourcing block, so nothing
blocks it). Moved earlier in the sequence deliberately — this is the screen every persona actually
looks at first (UJ-2), and validating it early matters more given no UX design contract exists yet.
Resourcing-count, campaign-count, the Unassigned bucket, and DM visibility into PM-created requests
are explicitly deferred to Epic 13 once those data sources exist — see FR Split Registry.
**FRs covered:** FR-16, FR-17 (partial), FR-18 (partial), FR-19

### Epic 6: Profile Sharing
A manager/PP hands a named colleague a time-boxed, revocable, section-limited view into a profile
without granting standing access.
**FRs covered:** FR-29, FR-30

### Epic 7: Resourcing
DM/PM raise resourcing requests; UM proposes candidates; DM reviews/approves/rejects under a
dual-gated (access role + permission) check, using Epic 6's sharing engine for candidate review.
**FRs covered:** FR-25, FR-26, FR-27, FR-28, FR-28a

### Epic 8: Career Timeline
Automatic and manually-backfilled employment history events, correctly excluding departure.
**FRs covered:** FR-31, FR-32

### Epic 9: CDS (Career Development System)
Managers/PP log assessments and manage IDPs; employees track and complete their own IDP; All
Employees gains CDS-based filters.
**FRs covered:** FR-33, FR-34, FR-35, FR-15 (self-complete-IDP portion — see FR Split Registry)

### Epic 10: Mentorship Hub
Employees flag themselves open to mentoring; managers/PP browse a company-wide pool and pair
mentees within their own access scope; ending a pair requires a closure note.
**FRs covered:** FR-36, FR-37, FR-38, FR-15 (self-mentorship-flag portion — closing verification
story for the full FR-15 split lives here, since this is the last epic to touch it)

### Epic 11: Campaigns (Forms and Surveys as Tasks)
A PP/manager builds a filtered audience and broadcasts a form-backed task, tracked to completion
via the action items it generates.
**FRs covered:** FR-39, FR-39a, FR-40

### Epic 12: Feedback
Managers/PP record visibility-flagged feedback; requesting feedback from named colleagues reuses
the campaign mechanism.
**FRs covered:** FR-41, FR-42

### Epic 13: Dashboard Completion
Backfills the dashboard blocks that needed data sources built by later epics: UM's
resourcing-request and open-campaign counters, the DM/PM Unassigned-requests bucket, and DM
visibility into requests created by their PMs.
**FRs covered:** FR-17 (remaining portion), FR-18 (remaining portion) — closing verification story
for the full FR-16..19 split lives here, since this is the last epic to touch it

### Epic 14: Internal Timetracker Integration
The platform's one required integration: leave data and project/PM/DM assignment sync from the
real timetracker API, replacing the stubbed event contract Epic 1 built against.
**FRs covered:** FR-43, FR-44 (real-adapter portion) — closing verification story for the full
FR-44 split lives here, since this is the last epic to touch it

### Epic 15: PeopleForce Integration
A good-to-have candidate-prefill button on the resourcing flow, with an explicitly sanctioned
external-link fallback.
**FRs covered:** FR-45

### Epic 16: Employee Lifecycle & Departure
HR records a departure; the platform blocks it until dependent relationships are re-parented, then
cascades read-only status, action-item cancellation, mentorship auto-closure, and access revocation.
**FRs covered:** FR-46, FR-47
