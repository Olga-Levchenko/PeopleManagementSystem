---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-02-party-mode-revision", "step-03-create-stories", "step-04-final-validation"]
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
FR-15: Epic 2 (self can never read own S6 risk level) / Epic 3 (self-complete action item) / Epic 9
(self-complete IDP) / Epic 10 (self open-to-mentoring flag) - split four ways across owning
domains; see FR Split Registry below, closing verification story in Epic 10
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
| FR-15 | Self can never read own S6 risk level (negative clause, alongside FR-13/14's self-view rules) | Epic 2 | pending |
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
**FRs covered:** FR-1, FR-2, FR-2a, FR-3, FR-3a, FR-4, FR-5, FR-6, FR-6a, FR-7, FR-44 (resolution-logic
portion only — see FR Split Registry)

### Epic 2: All Employees List & Self-Service
Employees manage their own contact/emergency data and read their own managed fields; managers/PP
browse, filter, save views, and export the org roster within their entitlements.
**FRs covered:** FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15 (self-can-never-read-own-risk
portion only — see FR Split Registry)

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

---

## Epic 1: Access Control Foundation & Employee Profile

Every viewer (self, manager, PP, colleague) sees exactly the profile sections/fields they're
entitled to, correctly resolved from their real relationship to the subject; HR Admin manages
functional roles/permissions without a deploy; Full profile access is a separate, journaled grant.

**Exit criteria (gate before Epic 2+ builds on this):** the SM-1 automated coverage manifest is
green for every section-matrix cell FR-1 through FR-7 govern before any other epic is considered
safe to build on top of this one.

### Story 1.1: Two-dimensional access-role resolution

As an authenticated employee,
I want my access role toward any colleague's profile resolved from my real reporting,
department-management, and project-assignment relationships,
So that every other feature can trust an accurate Reporting-line/Project-line determination
instead of a stored role flag.

**Acceptance Criteria:**

**Given** a viewer who reports, directly or transitively, to a subject's manager
**When** the system resolves the viewer's access role toward that subject
**Then** the viewer resolves as Manager (Reporting line), with no explicit grant required, at any
reporting depth

**Given** a viewer who manages the department a subject belongs to, or manages a parent of that
department
**When** the system resolves the viewer's access role toward that subject
**Then** the viewer resolves as Manager (Reporting line) without needing to also be in the direct
reports-to chain

**Given** a DM who runs a project the subject is assigned to
**When** the system resolves the DM's access role toward that subject
**Then** the DM resolves as Manager (Project line), at the same level as the subject's own
department manager, carrying the Project line's narrowed section set (Story 1.9)

**Given** a PM on the subject's project, and the DM above that PM in the same project chain
**When** the system resolves both viewers' access roles toward the subject
**Then** both resolve as Manager (Project line) for the same person

**Given** the same requester resolving access toward two different subjects in the same
request batch
**And** the requester is Manager toward one subject and a plain Colleague toward the other
**When** each resolution runs
**Then** each subject gets its own independently correct result — no single cached
"current user's role" value is reused across subjects

### Story 1.2: Access role un-derives when a relationship ends

As an authenticated employee,
I want an ended reporting, department-management, or project-assignment relationship to remove the
access it granted,
So that nobody retains standing access to my profile after the relationship that justified it is
gone.

**Acceptance Criteria:**

**Given** a platform-owned relationship edit (manager, PP, department, or department-manager
change, made via Story 1.3's screen)
**When** the change is saved
**Then** the resulting Manager/PP access change is reflected on the very next request — no
propagation delay, no cache lag

**Given** a person who was resolved as Manager for a subject via reports-to
**When** that reporting relationship ends via a platform-owned edit
**Then** the person does not resolve as Manager for that subject on the next request after the
edit

**Given** a stubbed project-assignment-ended event (the real timetracker adapter lands in Epic 14;
this story consumes the same event contract against a test/fake producer)
**When** the resolution engine processes the event
**Then** Project-line access derived solely from that assignment is absent from the next
resolution for that (viewer, subject) pair

**Given** any cache backing access-role resolution
**When** a relationship-ending event or edit is processed
**Then** the cache does not serve the now-stale access on any subsequent read — cache
invalidation is proven by test, not assumed from TTL alone

### Story 1.3: Organisational-relationship changes as a dedicated, journaled operation

As an HR Admin or manager holding the relationship-change permission,
I want to change a person's manager, people partner, or department — or a department's manager —
through a dedicated screen rather than a general profile edit,
So that these access-switching fields can never be changed as a side effect of an ordinary S1 edit.

**Acceptance Criteria:**

**Given** a user without the "change organisational relationships" permission
**When** they attempt to change a manager/PP/department/department-manager field via a general S1
profile edit request
**Then** the request is rejected server-side, regardless of what access role they hold over the
subject

**Given** a user with the "change organisational relationships" permission
**When** they submit a change through the dedicated relationship-change screen
**Then** the change is applied and a journal entry is written recording who changed what, from
what, to what, and when

**Given** a user with the permission
**When** they attempt to set themselves as someone's manager or PP, or assign themselves to a
department they don't already belong to
**Then** the self-assignment attempt is rejected server-side

### Story 1.4: Functional roles and permissions as runtime-editable data

As an HR Admin,
I want to create functional roles and grant them permissions without a deploy,
So that the organisation can stand up a new role (e.g. "Security Campaign Owner") the moment it's
needed.

**Acceptance Criteria:**

**Given** an HR Admin in role/permission administration
**When** they create a new functional role and grant it any subset of the independently-grantable
permissions
**Then** the role exists and is assignable immediately, with no deploy or schema change

**Given** a person newly assigned to a functional role, or a permission newly revoked from a role
**When** that person's next request is made
**Then** the effect (grant or revocation) is already live — no stale cached grant

**Given** an HR Admin's own functional-role grant
**When** their standing profile data access is evaluated
**Then** it is config-only (custom fields, system dictionaries, departments, functional-role and
permission management) — no standing read/write over any profile section

**Given** a functional role (e.g. Security Campaign Owner) granted a feature permission but no
Manager/PP relationship over a given audience
**When** a holder of that role acts on that audience
**Then** they see that audience only through whatever access role (if any) they independently
hold — the permission never widens data access on its own

**Given** an HR Admin managing a system dictionary (e.g. leave types, the department+position CDS
mapping)
**When** they edit a dictionary entry
**Then** the change applies platform-wide through the same no-deploy, runtime-editable path as
functional roles

### Story 1.5: Full profile access as a separate, journaled grant

As an existing Full-profile-access holder,
I want to grant or remove that access for someone else, under strict safeguards,
So that full read/write over every profile is never self-assignable and never accidentally
reduced to zero holders.

**Acceptance Criteria:**

**Given** a platform at deployment
**When** it starts up
**Then** exactly one Full-profile-access holder is already seeded — zero holders at launch is
treated as a setup bug, not a valid state

**Given** a user who does not currently hold Full profile access
**When** they attempt to grant it to themselves, or to anyone else, through any UI other than the
grant flow available only to existing holders
**Then** the attempt is rejected

**Given** an existing Full-profile-access holder
**When** they grant it to another person
**Then** the grant takes effect and a journal entry is written

**Given** the platform currently has exactly one Full-profile-access holder
**When** an attempt is made to remove that holder's access
**Then** the removal is rejected server-side, the same way any other invalid-state-producing write
is rejected

**Given** a Full-profile-access holder viewing any profile
**When** they request any section
**Then** they get RW on every section, matching the matrix's RW-everywhere row

### Story 1.6: Server-assembled, section-gated profile response

As any authenticated viewer,
I want the profile API to return only the sections I'm entitled to for a given subject,
So that a section I have no access to never reaches me through the response, not even as a hint.

**Acceptance Criteria:**

**Given** a viewer/subject/section combination marked `—` in the section matrix
**When** the viewer requests that subject's profile
**Then** the API response contains no trace of that section — not the field, not an empty
placeholder revealing its existence

**Given** any audience that can see S1 for a subject
**When** they view that subject's profile
**Then** the profile header shows manager, people partner, and mentor, read-only through this
surface

**Given** a request that attempts to change the manager, people-partner, or department value
through a normal S1 write
**When** the write is submitted
**Then** it is rejected server-side — those three fields are only changeable through Story 1.3's
dedicated screen

**Given** the current `[ASSUMPTION, see Open Question 5]` reading that mentor-in-header visibility
follows the broader S1 rule
**When** any audience that can see S1 at all, including Colleague, views the header
**Then** the mentor field is present — this assumption is flagged in the story so it's trivial to
flip if the spec owner resolves Open Question 5 the other way

### Story 1.7: S7 Management notes flag gating

As a UM, DM, or PP,
I want to control per-note whether an employee or a PM can see it,
So that sensitive management notes stay invisible by default and visible only when I deliberately
choose to share them.

**Acceptance Criteria:**

**Given** a newly created management note with no flags explicitly set
**When** it is persisted
**Then** both `visible for employee` and `visible for PM` are false — verified as an actual
non-nullable, server-defaulted-false column, not merely asserted by a test that always sets the
flags explicitly

**Given** a note with both flags unset
**When** the employee it's about, or a PM in the project chain, reads S7
**Then** the note is absent from what they see

**Given** a UM, DM, or PP responsible for the subject
**When** they read or write S7 notes about that subject
**Then** they get full read/write regardless of flag state

**Given** a viewer who is specifically a PM (not simply Project line generally — a DM keeps full
RW despite Project-line narrowing elsewhere)
**When** they read S7
**Then** they see only notes flagged `visible for PM`, read-only

**Given** a viewer who reaches the same subject through more than one relationship path at once
(e.g. PM on one project, DM on another)
**When** any one of those paths grants full UM/DM/PP-style RW
**Then** the viewer gets that full access for S7, even though a less-permissive path also applies

**Given** an existing note with `visible for employee` set to false
**When** it is changed to true
**Then** the note appears in that employee's next S7 read, with no other change to the record

### Story 1.8: Colleague view field whitelist

As a colleague of an employee,
I want to see only the whitelisted fields about them,
So that I never see anything beyond the deliberate colleague-level whitelist.

**Acceptance Criteria:**

**Given** a viewer who holds none of Manager/People Partner/Full profile access over a subject
**When** they read that subject's profile
**Then** the response body contains exactly S1, S10 (dates only, no leave type), and S11 (project
name only) — verified by asserting no keys exist outside that set, not by asserting UI elements
are hidden

**Given** this whitelist enforcement point
**When** Epic 11 (Campaigns) later needs to add the campaign-author S14 exception (FR-39a)
**Then** that exception is additive here without changing this story's baseline whitelist —
noted as an extension point, not built in this story

### Story 1.9: Project line narrowing vs. Reporting line

As a subject of a profile,
I want someone who only manages my project — not my actual reporting line — to see less about me
than my real manager does,
So that project-based access doesn't quietly become equivalent to full managerial access.

**Acceptance Criteria:**

**Given** a viewer resolved as Manager solely via project assignment (Project line)
**When** they read the subject's profile
**Then** S2 and S3 are `—` (enforced identically to any other `—` cell) and S5 is R-only, limited
to CV and certificates

**Given** the same Project-line-only viewer
**When** they read any other section, including S6
**Then** it matches what a Reporting-line viewer would see — only S2/S3/S5 are narrowed

**Given** a viewer who is simultaneously Reporting line (e.g. the subject's actual department
manager) and Project line (e.g. also the subject's PM) for the same subject
**When** they read the subject's profile
**Then** they get the Reporting line's unnarrowed access — the most-permissive path wins, the same
principle Story 1.7 applies to S7

### Story 1.10: Custom field visibility enforcement

As an HR Admin or manager defining a custom field,
I want its visibility level (management/employee/colleague) enforced on every read,
So that a field I've restricted never leaks to an audience it wasn't meant for.

**Acceptance Criteria:**

**Given** a custom field flagged `management`
**When** a colleague or the employee themself reads the profile
**Then** the field is absent from the response unless its visibility is `colleague` or `employee`
respectively

**Given** a custom field visibility decision
**When** any other surface (list columns, filters, exports, search — built in later epics)
**needs** to render or offer that field
**Then** the same authorization decision this story exposes is the one they must call — this story
is the single source of truth for that decision, not a profile-page-only rule

**Given** a requester who cannot see a given custom field
**When** they attempt to use it as a filter
**Then** it is not offered as a filter option at all — it must not be possible to infer a hidden
value by filtering on it

---

## Epic 2: All Employees List & Self-Service

Employees manage their own contact/emergency data and read their own managed fields; managers/PP
browse, filter, save views, and export the org roster within their entitlements.

**Parallelization note:** Stories 2.1-2.5 extend the same List/filter engine and are best done in
sequence by one developer (or pair) to avoid merge conflicts on the same component; Stories 2.6-2.7
are a separate self-service surface and can be built in parallel by a second developer, since both
chains only depend on Epic 1 already having cleared its exit gate.

### Story 2.1: Universal filter/column engine over profile fields

As a manager or PP browsing All Employees,
I want to filter and add columns for any profile field, including custom fields created after this
feature ships,
So that I can build the view I need without waiting on a code change.

**Acceptance Criteria:**

**Given** a custom field created after this feature has shipped
**When** a manager or PP opens the column or filter picker
**Then** the new field is available as both a filter and a column, with no code change required

**Given** "years with company," a value derived from a stored join date rather than stored itself
**When** a manager or PP filters on it
**Then** it is filterable as a numeric range like any stored field

**Given** a custom field the requester cannot see (Story 1.10's visibility decision)
**When** they open the filter or column picker
**Then** that field is not offered as an option

**Given** 500+ employee records and an arbitrary combination of filters and derived fields
**When** the list is requested, including permission resolution
**Then** the response returns within 2 seconds (NFR-2/SM-4) — this is a hard release gate for this
story, not an aspiration

### Story 2.2: Inline editing writes through to the profile, subject to access

As a manager or PP editing a row on All Employees,
I want my edit to be checked against my real access before it's saved,
So that I can't write a field I only have read access to, even if the UI briefly let me try.

**Acceptance Criteria:**

**Given** an editor who holds only R access to a field
**When** they submit an inline edit to that field
**Then** the edit is rejected server-side — not merely disabled in the UI, so a direct API call is
rejected the same way a UI click would be

**Given** an editor who holds RW access to a field
**When** they submit a valid inline edit
**Then** the change writes through to the same underlying profile record the profile page reads

### Story 2.3: Saved views

As a manager or PP,
I want to save a filter-and-column configuration and reuse or share it,
So that I don't have to rebuild the same view every time I open All Employees.

**Acceptance Criteria:**

**Given** a manager or PP with a configured filter and column set
**When** they save it as a named view
**Then** the view persists under their identity as its creator and appears as its own tab

**Given** a saved view owned by one manager
**When** they share it with another manager
**Then** the recipient can select and use that view without being able to silently overwrite the
original creator's copy

**Given** a user with multiple saved views
**When** they open All Employees
**Then** all of their views (own and shared-with-them) coexist as separate, independently
selectable tabs

### Story 2.4: Export respects the exporter's access

As a manager or PP,
I want to export the current list view to `.xlsx`,
So that I have an offline copy that still only contains what I'm entitled to see.

**Acceptance Criteria:**

**Given** a manager or PP with a specific set of visible columns on their current list view
**When** they export to `.xlsx`
**Then** the export contains exactly those columns — the same entitlement check as the live list
view, not a separate export-specific rule

**Given** a column the exporter cannot see
**When** they export
**Then** that column is absent from the file, not present-but-empty

### Story 2.5: Colleague mode on All Employees

As a colleague browsing All Employees,
I want to see only the whitelist columns for everyone else,
So that I never get a wider view than the profile-level colleague whitelist already allows.

**Acceptance Criteria:**

**Given** a viewer who is a Colleague (per Story 1.8's whitelist) to every row on the list
**When** they open All Employees
**Then** only whitelist columns (S1, S10 dates-only, S11 project-name-only) are available as
columns or filters

**Given** that same colleague viewer
**When** they click a row
**Then** it opens the limited profile view directly — never the full profile with columns hidden
client-side

### Story 2.6: Self-managed personal data

As an employee,
I want to view and edit my own contact and emergency information without asking anyone,
So that I can keep my own data current myself.

**Acceptance Criteria:**

**Given** an employee viewing their own profile
**When** they edit their own S2 (personal contacts, residential address, place of stay) or S3
(emergency contacts)
**Then** the write succeeds with no manager or PP action required

**Given** an employee on their own profile
**When** they upload a photo or a certificate
**Then** the upload is accepted and attached to their own record

### Story 2.7: Self-read of managed data, and never own risk level

As an employee,
I want to read the fields a manager or PP maintains about me, while being certain my own risk
level is never shown to me,
So that I have visibility into my own record without ever seeing the one section deliberately kept
from me.

**Acceptance Criteria:**

**Given** an employee viewing their own profile
**When** they read S4 (grade, position, seniority, employment type, English level), S9 (career
timeline), S10 (leaves, linked to the timetracker), or S11 (projects)
**Then** the read succeeds — these fields remain read-only to the employee; a write attempt on S4
requires Manager/PP access instead

**Given** an employee viewing their own profile
**When** the response is assembled, under any access role the employee might otherwise hold for
someone else
**Then** their own S6 risk level is never included — enforced the same way as any other `—` cell
(Story 1.6), with no self-view exception

---

## Epic 3: Action Items & Tasks

Managers/PP create action items; assignees complete or the author cancels them; overdue items
surface everywhere they're shown.

### Story 3.1: Manual action item creation, scoped to creator's access

As a UM, DM, PM, or PP (or any functional role holding the "create action items" permission),
I want to create an action item for someone I hold Manager or PP access over,
So that I can track a concrete next step for that person.

**Acceptance Criteria:**

**Given** a UM/DM/PM/PP, or a role holding "create action items"
**When** they create an action item for a person they hold Manager or PP access over
**Then** the action item is created and assigned to that person

**Given** the same creator
**When** they attempt to create an action item for a person outside their access scope
**Then** the request is rejected server-side

**Given** a functional role holding "create action items" but no Manager/PP relationship over a
given person
**When** they attempt to create an action item for that person
**Then** the request is rejected — the permission never widens access beyond the holder's access
role (Story 1.4)

### Story 3.2: Campaign-generated action items

As a campaign creator,
I want activating a campaign to generate exactly one action item per resolved recipient,
So that every recipient gets a trackable task tied to the campaign.

**Acceptance Criteria:**

**Given** a campaign-activation event (consumed here against a stubbed contract; the real
Campaigns feature is Epic 11)
**When** the campaign activates
**Then** exactly one action item is generated per resolved recipient, carrying the campaign's link
and due date

**Given** the resolved recipient list at activation time
**When** someone joins the matching audience population after activation
**Then** they do not retroactively receive an action item — the list is frozen at activation

### Story 3.3: Action item lifecycle and overdue display

As the assignee of an action item,
I want to mark it complete, and my author to be able to cancel it,
So that its state accurately reflects reality.

**Acceptance Criteria:**

**Given** an open action item
**When** the assignee completes it
**Then** a completion date is recorded

**Given** an open action item
**When** the author cancels it
**Then** a reason is required, and the item moves to cancelled

**Given** an action item whose due date has passed
**When** it is displayed anywhere (profile, dashboard, self-service)
**Then** it renders as overdue

### Story 3.4: Self-complete action item

As an employee,
I want to mark my own action items complete,
So that I don't need a manager to close out my own tasks.

**Acceptance Criteria:**

**Given** an employee viewing their own action items
**When** they mark one complete
**Then** it behaves identically to Story 3.3's completion flow, available without any manager/PP
action

**Given** an employee attempting to complete an action item assigned to someone else
**When** they attempt it
**Then** the request is rejected — self-completion is scoped strictly to the employee's own items

---

## Epic 4: Risks & Risk Dashboard

Managers/PP record and track an employee's risk level with correct severity/leaver semantics; a
dedicated dashboard surfaces who needs attention.

### Story 4.1: Risk record with retained history

As a UM, DM, or PP,
I want to record and track an employee's risk level over time,
So that I have accurate current-state and historical trend for the people I'm responsible for.

**Acceptance Criteria:**

**Given** a person's existing risk records
**When** a manager/PP reads risk history
**Then** the current level is the most recent record, and full history is retained and readable by
Reporting line/Project line/PP

**Given** the fixed severity order (low < need attention < medium < high < leaver)
**When** a new record is created at any level
**Then** the transition to any other level is allowed, including back down to low — there is no
resolved/closed state

**Given** a risk record at level `leaver`
**When** it is interpreted anywhere in the system
**Then** it is treated strictly as a prediction, never as the fact of departure (Epic 16's
employment status is the fact)

**Given** counters/filters/dashboards that report "active" risk counts
**When** a person's current level is `low`
**Then** they are excluded from that count

**Given** two consecutive risk records for the same person
**When** the level is unchanged between them
**Then** no trend arrow is shown; a trend arrow appears only when the level differs from the
immediately preceding record

### Story 4.2: Risk Dashboard

As a UM, DM, or PP,
I want a dashboard that surfaces risk counts and a filterable table,
So that I can see who needs attention without checking every profile individually.

**Acceptance Criteria:**

**Given** a viewer with Manager (Reporting or Project line) or PP access over some people
**When** they open the Risk Dashboard
**Then** they see counts by level (medium/high/leaver visually emphasised, active counts excluding
low), a table sorted by severity then date with trend arrows, filterable by unit/department/
project/PP/manager

**Given** a count on the dashboard
**When** the viewer clicks through it
**Then** it drills through to the filtered table, and from a row to the profile

**Given** the employee themself
**When** they view any dashboard
**Then** their own risk data is never rendered there, under any access role they might otherwise
hold for someone else

---

## Epic 5: Dashboard Framework & Early Blocks

UM, DM/PM, and PP each get a working dashboard on one shared engine as early as the data allows,
deliberately sequenced ahead of Resourcing/Campaigns so the screen every persona sees first (UJ-2)
gets validated well before week two — with no UX design contract yet, that early feedback matters
more, not less.

### Story 5.1: Shared dashboard engine, per-audience configuration

As any of UM/DM/PM/PP,
I want my dashboard built on one shared engine,
So that a fifth audience-scoped dashboard would only need a new configuration, not a new page.

**Acceptance Criteria:**

**Given** the dashboard engine's shared components (counters, tables, action-item lists)
**When** a new audience-scoped dashboard is added
**Then** it is expressed as a new configuration of existing components, not new page-level code

**Given** any of the four existing dashboards
**When** their underlying shared components are updated
**Then** all four dashboards reflect the update consistently

### Story 5.2: UM dashboard — early blocks

As a UM,
I want a dashboard showing my subordinates' status and my own action items,
So that nothing about the people I manage falls through the cracks.

**Acceptance Criteria:**

**Given** a UM viewing their dashboard
**When** it loads
**Then** it shows subordinate headcount, risk counts by level, open/overdue action item counts, a
subordinates table with risk/project/leave status, and the UM's own action items sorted by due
date with overdue highlighted

**Given** this story ships before Epic 7 (Resourcing) and Epic 11 (Campaigns) exist
**When** the dashboard renders
**Then** the resourcing-request count and open-campaign count are explicitly omitted rather than
shown as a stubbed zero that looks like a real count — Epic 13 backfills them

### Story 5.3: DM/PM dashboard — early blocks

As a DM or PM,
I want a dashboard grouped by project with risk/leave status,
So that I can see everyone on my projects regardless of the org chart.

**Acceptance Criteria:**

**Given** a DM/PM viewing their dashboard
**When** it loads
**Then** it shows one table per project they're responsible for, each listing that project's
people with risk/leave status, and a project selector defaulting to "All projects" that
recalculates every counter when a specific project is chosen or cleared

**Given** this story ships before Epic 7 (Resourcing) exists
**When** the dashboard renders
**Then** the Unassigned-requests bucket and the DM's visibility into PM-created requests are
explicitly omitted — Epic 13 backfills them

### Story 5.4: PP dashboard

As a PP,
I want a dashboard scoped to my assigned people with no resourcing clutter,
So that I see only what's relevant to my HR role.

**Acceptance Criteria:**

**Given** a PP viewing their dashboard
**When** it loads
**Then** it uses the same building blocks as the other dashboards, scoped to the PP's assigned
people, groupable by department or project

**Given** the PP dashboard
**When** it renders
**Then** the resourcing block is absent entirely, not merely empty — this dashboard is complete as
shipped in this story, with no dependency on Epic 7 or Epic 13

---

## Epic 6: Profile Sharing

A manager/PP hands a named colleague a time-boxed, revocable, section-limited view into a profile
without granting standing access.

### Story 6.1: Standing Manager/PP-only share creation, section-selectable and sensitivity-gated

As a Manager or PP,
I want to create a time-boxed, section-selectable share for someone without standing access,
So that I can hand them exactly the visibility they need without granting a permanent
relationship.

**Acceptance Criteria:**

**Given** a requester who holds Manager or PP access role over a subject at creation time
**When** they create a share
**Then** it succeeds; a requester who is only a Colleague or holds no access role over the subject
is rejected server-side, independent of and before any section-selection check

**Given** a share being created
**When** the recipient is specified
**Then** it must be an authenticated, explicitly named person — a link with no bound recipient
identity is not created

**Given** the default section configuration
**When** a share is created with no further configuration
**Then** only S1 is on by default — every other `cfg` section, including the sensitive
S2/S5/S6/S8 set, is off by default and must be explicitly enabled

**Given** the never-share set (S3, S7, S13, S14)
**When** a share is configured
**Then** none of those four sections can be included under any configuration

### Story 6.2: Expiry, revocation, and access logging

As the creator or current relationship-holder of a share,
I want it to expire, be revocable, and log every access,
So that shared access can't outlive the relationship that justified it or go unaudited.

**Acceptance Criteria:**

**Given** a newly created share with no custom expiry
**When** it is checked
**Then** its default expiry is 24 hours, configurable at creation

**Given** any access via the shared link
**When** it occurs
**Then** it is logged to the journal with timestamp and origin

**Given** a share whose creator's underlying Manager/PP relationship to the subject has ended
**When** the recipient attempts to view it, even before the stated expiry
**Then** the view is denied — the creator's access is re-checked on every view, not just against
expiry

**Given** a share whose original creator no longer holds the relevant relationship
**When** someone needs to revoke it
**Then** whoever currently holds the relevant Manager/PP relationship (or a Full-profile-access
holder as backstop) can revoke it

**Given** any shared link
**When** any section is included
**Then** it never grants write access, regardless of which sections are included

---

## Epic 7: Resourcing

DM/PM raise resourcing requests; UM proposes candidates; DM reviews/approves/rejects under a
dual-gated (access role + permission) check, using Epic 6's sharing engine for candidate review.

### Story 7.1: Request creation (DM/PM)

As a DM or PM,
I want to create a resourcing request, optionally unattached to a project,
So that I can start filling a role even before or without a specific project.

**Acceptance Criteria:**

**Given** a DM/PM, or a role holding "create resourcing requests" (scoped to that role's own
access)
**When** they create a request
**Then** it carries a department (routing to the responsible UM), a headcount defaulting to 1, and
may exist unattached to a project

**Given** an unattached request
**When** it's created
**Then** it surfaces in the dashboard's Unassigned bucket (Epic 13)

**Given** a request's expected compensation level
**When** anyone other than the request's author, the routed UM, or the reviewing DM views the
request, a profile, a shared link, or an export
**Then** that field is never visible to them — not even to the PP

### Story 7.2: Request fulfilment (UM)

As a UM,
I want to propose internal specialists or external candidates against a request assigned to me,
So that I can move it toward a decision.

**Acceptance Criteria:**

**Given** a UM viewing requests assigned to them
**When** they propose one or more internal specialists from their unit and/or attach an external
PeopleForce candidate
**Then** the set is submitted for DM approval

**Given** an external candidate being proposed
**When** the proposal is submitted
**Then** the PeopleForce candidate ID is stored on the proposal unconditionally, whether or not
the prefill integration (Epic 15) is live in this environment

### Story 7.3: Request review and decision (DM)

As a DM,
I want to review and decide on each proposed candidate under a dual-gated check,
So that only someone with both the right access and the right permission can approve or reject.

**Acceptance Criteria:**

**Given** an internal candidate the reviewing DM doesn't yet hold access over
**When** the DM opens the candidate's profile link
**Then** a narrower auto-generated share is created (S1, S4, S11, S12, S5 as CV+certificates, S6
optional; never S2/S3/S7/S8), naming the DM, valid until the request is decided — built on Epic
6's sharing engine, not FR-29's general defaults

**Given** a candidate decision
**When** the DM approves or rejects with a reason
**Then** it succeeds only if the DM holds both the Manager access role and the "approve or reject
candidates" permission — either alone is insufficient

**Given** an approved candidate
**When** the decision is recorded
**Then** one headcount slot on the request is filled; the request does not auto-close even if
headcount reaches zero

### Story 7.4: Request history (S15)

As anyone reviewing a resourcing request or a candidate's profile,
I want every proposal attempt visible in both places,
So that the history is traceable from either direction.

**Acceptance Criteria:**

**Given** a proposal attempt (proposed → approved/rejected, with feedback)
**When** it happens
**Then** it appears in both Resourcing → Requests and the candidate's own profile S15

**Given** an approved candidate
**When** approval is recorded
**Then** no project record is created on the profile yet — the project appears only after the next
timetracker sync (Epic 14) reflects the assignment

### Story 7.5: Request closure requires explicit, permissioned DM action

As a DM,
I want a request to stay open until I explicitly close it,
So that filling headcount doesn't silently end a request I might still want open.

**Acceptance Criteria:**

**Given** a request with all headcount slots filled
**When** no explicit close action has been taken
**Then** the request remains open

**Given** a DM (or a role holding "close resourcing requests," scoped to its own access)
**When** they explicitly close a request
**Then** it moves to closed and is no longer eligible for new candidate proposals — existing S15
history on already-decided candidates is unaffected

---

## Epic 8: Career Timeline

Automatic and manually-backfilled employment history events, correctly excluding departure.

### Story 8.1: Automatic event generation

As anyone with visibility into a person's career timeline,
I want system-tracked events to write themselves automatically,
So that the timeline stays accurate without manual upkeep.

**Acceptance Criteria:**

**Given** joining, a grade/position/department change, an FTE-subcontractor transition, extended
leave, or a mentorship pair start/end
**When** the underlying change occurs
**Then** a timeline event is written automatically, with no manual step required

**Given** a departure/dismissal
**When** it is recorded (Epic 16)
**Then** no career-timeline event is written for it — this exclusion is enforced explicitly, even
though it resembles the other five event types

### Story 8.2: Manual override by PP/UM

As a PP or UM,
I want to add, edit, or delete timeline entries,
So that I can backfill history or correct a wrongly-inferred system event.

**Acceptance Criteria:**

**Given** a PP or UM viewing a person's timeline
**When** they add, edit, or delete an entry
**Then** the change is saved and reflected in that person's timeline immediately

---

## Epic 9: CDS (Career Development System)

Managers/PP log assessments and manage IDPs; employees track and complete their own IDP; All
Employees gains CDS-based filters.

### Story 9.1: Matrix link resolution by department + position

As an HR Admin,
I want the department+position → CDS matrix file mapping maintained as a dictionary,
So that updating one dictionary entry updates every affected profile without per-profile edits.

**Acceptance Criteria:**

**Given** the department+position → matrix file dictionary, keyed off the Department entity
**When** an HR Admin updates a mapping entry
**Then** every profile whose department+position matches reflects the new link immediately, with
no per-profile edit

**Given** a department rename
**When** it occurs
**Then** the mapping is not silently orphaned — because it's keyed off the Department entity, not
a free-text string

### Story 9.2: Assessment log and IDP creation by Manager/PP

As a Manager or PP,
I want to log CDS assessments and manage IDPs for people I'm responsible for,
So that development plans and their history are tracked in one place.

**Acceptance Criteria:**

**Given** a Manager or PP on a person's CDS section
**When** they create an assessment record (date, assessor, result-file link, conclusion text)
**Then** it is saved and visible in that person's CDS history

**Given** a Manager or PP
**When** they create or update an IDP (description, deadline, external link)
**Then** it is saved against the person's CDS section

### Story 9.3: CDS-based filtering on All Employees

As a manager or PP,
I want to filter All Employees by CDS assessment status,
So that I can find who's overdue for review.

**Acceptance Criteria:**

**Given** the CDS-based filters
**When** a manager or PP applies "assessed before X," "assessed after X," "assessed between X and
Y," or "never assessed"
**Then** each option returns the correct, distinct result set — "never assessed" is a distinct
filter value, not indistinguishable from an empty/null result

**Given** the "has an open IDP" filter
**When** applied
**Then** it correctly returns yes/no results

### Story 9.4: Self-complete IDP

As an employee,
I want to mark my own IDP complete,
So that I can track my own development progress without a manager doing it for me.

**Acceptance Criteria:**

**Given** an employee viewing their own CDS section
**When** they mark their own IDP complete
**Then** a completion date is recorded, displayed alongside the deadline

**Given** an IDP with no completion date
**When** it is displayed anywhere
**Then** it is treated as open

---

## Epic 10: Mentorship Hub

Employees flag themselves open to mentoring; managers/PP browse a company-wide pool and pair
mentees within their own access scope; ending a pair requires a closure note.

### Story 10.1: Self-service mentorship status

As an employee,
I want to flag myself open to mentoring and see my own mentor/mentees,
So that I can participate in mentorship without a manager setting it up for me.

**Acceptance Criteria:**

**Given** an employee on their own profile
**When** they flag themselves open to mentoring
**Then** the flag is saved and they can see their own assigned mentor/mentees

### Story 10.2: Manager/PP pairing flow

As a Manager or PP,
I want to browse a company-wide mentor pool and pair a mentee from my own people,
So that I can set up mentorship without being limited to people I already manage when browsing
mentors.

**Acceptance Criteria:**

**Given** a Manager or PP browsing the mentor pool
**When** they view it
**Then** it is company-wide — identity-card data plus the open-to-mentoring flag for everyone
who's set it, regardless of the browsing manager's own relationship to them, exposing nobody's
S13 detail beyond the flag itself

**Given** the same Manager or PP assigning a mentee
**When** they attempt the assignment
**Then** they can only assign a mentee from people they actually hold Manager or PP access over —
even though they could see the wider pool

**Given** a mentor's first pair being created
**When** it's created
**Then** the mentor's status changes from "open to mentoring" to "mentor," a filterable field on
All Employees

### Story 10.3: Ending a pair

As a Manager, PP, or the mentor/mentee themself initiating the end,
I want ending a pair to require a closure note,
So that pair history always carries a reason, never a silent disappearance.

**Acceptance Criteria:**

**Given** an attempt to end a mentorship pair with no closure note
**When** submitted
**Then** it is refused

**Given** a pair ended with a closure note
**When** it's recorded
**Then** the note is stored as a field on the pair record itself (not an S8 Feedback record),
readable only by Reporting line, Project line, and PP — never the mentor/mentee's ordinary S8
audience — and an end event is written to the career timeline (Epic 8)

**Given** a mentor with no other active mentees after a pair ends
**When** the pair closes
**Then** their status reverts to "open to mentoring"

### Story 10.4: Self-managed mentorship open-to flag

As an employee,
I want to clear my own open-to-mentoring flag even while holding an active mentee,
So that I control my own future availability without affecting my current pairs.

**Acceptance Criteria:**

**Given** an employee with an active mentee
**When** they clear their own open-to-mentoring flag
**Then** the flag clears and their existing pair(s) are untouched by the change

### Story 10.5: FR-15 closing verification (cross-epic)

As the team verifying Definition of Done for FR-15,
I want one story that asserts every sub-clause of the FR-15 split is actually covered,
So that "FR-15 is done" is a checked fact, not an assumption spread across four epics.

**Acceptance Criteria:**

**Given** the FR Split Registry's four FR-15 rows (Epic 2's self-risk-view exclusion, Epic 3's
self-complete-action-item, Epic 9's self-complete-IDP, Epic 10's self-mentorship-flag)
**When** this story's verification suite runs
**Then** it asserts, by citing each owning story's own tests (Stories 2.7, 3.4, 9.4, 10.4), that
all four sub-clauses have real, passing, API-level test coverage — not merely that each story was
marked "done" individually

**Given** any one of the four sub-clauses lacking coverage
**When** this verification runs
**Then** it fails loudly, naming exactly which sub-clause is missing

---

## Epic 11: Campaigns (Forms and Surveys as Tasks)

A PP/manager builds a filtered audience and broadcasts a form-backed task, tracked to completion
via the action items it generates.

### Story 11.1: Campaign creation and audience resolution

As a PP/manager (or a role holding "create form campaigns"),
I want to build and preview an audience via the filter engine or a saved view before launching,
So that I know exactly who'll receive the campaign before it's irreversible.

**Acceptance Criteria:**

**Given** a campaign creator building an audience via the All Employees filter engine (Epic 2) or
a saved view
**When** they preview it
**Then** they can add/remove individuals after resolution, before activation

**Given** an activated campaign
**When** activation occurs
**Then** the audience list freezes — this triggers Epic 3's Story 3.2 action-item generation

**Given** a functional role holding "create form campaigns," scoped to that role's own access
**When** they create a campaign
**Then** their audience is limited to what their own access role allows them to see (Story 1.4's
permission-never-widens-access rule)

### Story 11.2: Campaign-author colleague exception

As a campaign author,
I want to see name and completion status for my own campaign's recipients, even ones I'm only a
Colleague to,
So that I can track my own campaign without needing standing access to every recipient.

**Acceptance Criteria:**

**Given** a campaign author who otherwise holds only Colleague access over a recipient
**When** they view their own campaign's per-recipient table
**Then** they see that recipient's name and completion status — nothing else, no other S14 field,
no other section

**Given** a campaign that has since closed
**When** the same author views past recipients afterward
**Then** the exception no longer applies — they revert to ordinary colleague-level visibility

### Story 11.3: Completion tracking

As a campaign author,
I want a per-recipient completed/not-completed/overdue table,
So that I can see progress without the system ever reading the external form's contents.

**Acceptance Criteria:**

**Given** a campaign's generated action items (Epic 3)
**When** the sender views their campaign
**Then** the per-recipient table's status is driven entirely by each recipient's action-item
completion — the system never reads or verifies the external form's actual contents

---

## Epic 12: Feedback

Managers/PP record visibility-flagged feedback; requesting feedback from named colleagues reuses
the campaign mechanism.

### Story 12.1: Feedback record creation and visibility

As a Manager or PP,
I want to record feedback about an employee with a visibility flag,
So that I control whether the employee sees it immediately or only later.

**Acceptance Criteria:**

**Given** a Manager or PP creating a feedback record (subject, author, date, context, body)
**When** they set the visibility flag
**Then** management-only is the default, or shared-with-employee if explicitly chosen; the
employee's S8 read reflects only shared-with-employee records

**Given** joining-interview feedback
**When** it's created
**Then** it is an ordinary flagged S8 record, not a static always-readable S5 document

**Given** a set of feedback records for a person
**When** they're listed
**Then** they appear chronologically and are filterable by period — no period-over-period
comparison view is built

### Story 12.2: Requesting feedback from named colleagues

As a Manager or PP,
I want to request feedback from specific named colleagues,
So that I can gather input without a separate mechanism from campaigns.

**Acceptance Criteria:**

**Given** a feedback request targeted at specific named individuals
**When** it's created
**Then** it is implemented as a form campaign (Epic 11), not a separate mechanism

---

## Epic 13: Dashboard Completion

Backfills the dashboard blocks that needed data sources built by later epics: UM's
resourcing-request and open-campaign counters, the DM/PM Unassigned-requests bucket, and DM
visibility into requests created by their PMs.

### Story 13.1: UM dashboard resourcing + campaign counters backfill

As a UM,
I want my dashboard to also show my active resourcing request count and open campaign count,
So that my dashboard is complete once those data sources exist.

**Acceptance Criteria:**

**Given** Epic 7 (Resourcing) and Epic 11 (Campaigns) now built
**When** a UM views their dashboard (Story 5.2's shell)
**Then** it now also shows active resourcing request count and open campaign count, completing
FR-17

### Story 13.2: DM/PM Unassigned bucket + PM-request visibility backfill

As a DM,
I want to see unattached requests and requests created by my PMs,
So that my dashboard reflects the full picture of my responsibility.

**Acceptance Criteria:**

**Given** unattached (no-project) resourcing requests
**When** a DM/PM views their dashboard (Story 5.3's shell)
**Then** a dedicated Unassigned bucket appears alongside the per-project tables, included in the
all-projects counters

**Given** requests created by the PMs of a DM's own projects
**When** the DM views their dashboard
**Then** those requests are shown in addition to the DM's own, completing FR-18

### Story 13.3: FR-16..19 closing verification (cross-epic)

As the team verifying Definition of Done for the dashboard FRs,
I want one story that confirms the early and completion halves together satisfy FR-16 through
FR-19 in full,
So that "dashboards are done" is a checked fact spanning Epic 5 and Epic 13, not just Epic 5's
shell.

**Acceptance Criteria:**

**Given** the FR Split Registry's FR-16..19 rows (Epic 5's engine/early-blocks, Epic 13's
resourcing/campaign/Unassigned backfill)
**When** this story's verification suite runs
**Then** it asserts, citing Stories 5.1-5.4 and 13.1-13.2, that every consequence listed under
FR-16 through FR-19 in the PRD has real, passing, API-level test coverage

---

## Epic 14: Internal Timetracker Integration

The platform's one required integration: leave data and project/PM/DM assignment sync from the
real timetracker API, replacing the stubbed event contract Epic 1 built against.

### Story 14.1: Leave data sync into S10

As an employee or anyone entitled to see S10,
I want leave data synced from the real timetracker,
So that leave information on the profile reflects reality.

**Acceptance Criteria:**

**Given** the timetracker's leave data for a person
**When** it syncs into S10
**Then** vacation/sick/parental/other leave types and dates surface per the section's access rules

**Given** a colleague-audience viewer
**When** they read S10
**Then** they see only the fact and dates of an absence, never the leave type; Self, Reporting
line, Project line, and PP still see the type

**Given** leave balances
**When** S10 is rendered
**Then** balances are not displayed in-platform at all — self-service links out to the timetracker
instead

### Story 14.2: Real timetracker adapter fulfilling the project-assignment event contract

As the access-resolution engine (Epic 1, Stories 1.1/1.2),
I want the real timetracker API to produce the same project-assignment event contract the stub
used,
So that Project-line access resolution works against real data instead of a fake producer.

**Acceptance Criteria:**

**Given** a real project assignment created or ended in the timetracker
**When** the integration adapter processes it
**Then** it publishes the same event shape Epic 1's Story 1.2 already consumes, requiring no
changes to the resolution engine itself

**Given** normal sync conditions
**When** a project assignment changes
**Then** the change is reflected in access resolution within 15 minutes, as an explicit access
guarantee

**Given** the timetracker sync itself failing (not just one assignment change, but the feed being
down)
**When** the outage persists
**Then** project-derived access is forcibly withdrawn within 4 hours regardless of last-known
state, and the UI shows a visible "unable to refresh" banner for stale-but-labeled leave/project
data — this must never take down profile access or dashboard rendering

### Story 14.3: FR-44 closing verification (cross-epic)

As the team verifying Definition of Done for FR-44,
I want one story confirming the stub-based resolution logic and the real adapter agree,
So that "FR-44 is done" means the real integration, not just the stub.

**Acceptance Criteria:**

**Given** Story 1.2's stub-based resolution logic and Story 14.2's real adapter
**When** this story's verification suite runs against the real timetracker test environment
**Then** it asserts the same 15-minute/4-hour access guarantees hold end-to-end, not only against
the stub

---

## Epic 15: PeopleForce Integration

A good-to-have candidate-prefill button on the resourcing flow, with an explicitly sanctioned
external-link fallback.

### Story 15.1: Candidate prefill by ID for resourcing

As a UM,
I want to prefill a candidate-proposal record from a PeopleForce candidate ID, with per-field
confirmation,
So that I don't have to retype what PeopleForce already has, without risking an unwanted
overwrite.

**Acceptance Criteria:**

**Given** a PeopleForce candidate ID
**When** a UM triggers a prefill
**Then** each field is previewed and requires per-field confirmation — a prefill never silently
overwrites a field the user has already filled in

**Given** the fixed never-prefill list (grade, seniority, employee type, department, manager,
people partner, contract data, employment status, risk)
**When** a prefill runs
**Then** none of those fields are ever populated from PeopleForce, regardless of what the API
returns

**Given** every external candidate, whether or not this prefill button is implemented in a given
environment
**When** the candidate is proposed (Epic 7, Story 7.2)
**Then** their PeopleForce candidate ID is stored unconditionally

**Given** the prefill button not implemented in time
**When** a UM needs candidate data
**Then** the fallback is an external link to the candidate in PeopleForce — an explicitly
spec-sanctioned degraded mode, logged to `docs/integrations/peopleforce.md` as a deliberate,
recorded decision

**Given** a PeopleForce outage or fallback-mode operation
**When** it occurs
**Then** it never blocks request creation, fulfilment, or DM review/approval for internal
candidates — degrading per-candidate, never globally

---

## Epic 16: Employee Lifecycle & Departure

HR records a departure; the platform blocks it until dependent relationships are re-parented, then
cascades read-only status, action-item cancellation, mentorship auto-closure, and access
revocation.

### Story 16.1: Employment status as a time-bounded fact

As anyone querying a person's employment history,
I want employment status modeled as a time-bounded fact,
So that "was this person active on date X" has a real answer.

**Acceptance Criteria:**

**Given** a profile's employment status
**When** queried for any date, past or present
**Then** it returns the correct active/dismissed value for that date, modeled the same way as
grade/position/department (Epic 8)

**Given** a risk record at level `leaver` and an employment status of `dismissed`
**When** either is displayed anywhere, in code, copy, or a dashboard
**Then** they are never conflated — a `leaver` risk level does not imply `dismissed` status and
vice versa

### Story 16.2: Departure recording and effects

As HR holding the "record a departure" permission,
I want to record a departure and have its effects cascade correctly,
So that a departing employee's data and access are handled completely and consistently.

**Acceptance Criteria:**

**Given** a person who still manages anyone or is anyone's assigned People Partner
**When** HR attempts to record their departure
**Then** the attempt is blocked with a specific reason naming what needs re-parenting first (Epic
1, Story 1.3) — not a generic permission error

**Given** a departure recorded with an effective date and reason, once re-parenting is complete
**When** the effective date arrives
**Then**, together: the profile becomes read-only; the person drops from the default All Employees
list but remains findable via explicit filter; every open action item they're assigned closes as
`cancelled — departed`; every active mentorship pair involving them auto-closes with a
system-generated closure note bypassing Epic 10's ordinary closure-note requirement; their account
deactivates; and every derived access they held over anyone else ends immediately

**Given** a departure
**When** it is recorded
**Then** no career-timeline event is written for it (Epic 8) — it is visible exclusively through
employment status

**Given** any future Analytics feature
**When** it needs a joiner/leaver figure
**Then** it must derive from employment status rather than maintaining its own parallel
definition
