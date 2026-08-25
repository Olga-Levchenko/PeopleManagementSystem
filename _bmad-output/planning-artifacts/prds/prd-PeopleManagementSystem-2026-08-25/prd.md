---
title: People Management Platform
status: final
created: 2026-08-25
updated: 2026-08-25
---

# PRD: People Management Platform
*Working title — confirm.*

## 0. Document Purpose

This PRD is for the four-person team building the platform, and for the downstream BMAD
workflows (`bmad-architecture`, `bmad-ux`, `bmad-create-epics-and-stories`) that consume it. It
builds on top of `docs/requirements/project-requirements.md` (the normative source — Sections 2
and 3 cannot be redesigned) rather than duplicating its full text: this document restates the
spec as product capabilities (Glossary-anchored, features grouped with FRs nested globally
FR-1..FR-N), and is where product framing, journeys, MVP cuts, and success metrics live that the
spec itself deliberately leaves open. Where a feature needs the spec's full normative detail
(exact hierarchy resolution rules, the full section matrix), it is cited by section number rather
than re-copied — `docs/access-control/section-matrix.md` is the living, authoritative copy of the
matrix. Assumptions inferred without user confirmation are tagged inline `[ASSUMPTION]` and
indexed in §9.

## 1. Vision

The People Management Platform is the internal system of record for an engineering organisation
of 500+ people, replacing the current internal system's two biggest failure modes: access is
effectively all-or-nothing today, and integrations with the tools that actually hold the data
(the internal timetracker, PeopleForce) don't exist, so the platform drifts out of sync with
reality. This iteration fixes both: every field on an employee profile is gated by an explicit,
server-enforced access rule tied to who the viewer actually is to that employee (their manager,
their people partner, a colleague, or nobody), and the platform pulls live project, leave, and
candidate data instead of asking someone to re-enter it.

For a Unit Manager, this means one dashboard that already knows who they're responsible for and
what needs attention today — risks, overdue action items, resourcing requests — without
assembling it from three other systems. For a Delivery Manager, it means seeing every person on
every project they run, grouped by project rather than by org chart, because that's how DMs
actually think about their work. For an ordinary employee, it means a single place to see and
manage their own data without filing a ticket to HR, and a firm guarantee that risk notes and
unflagged management notes about them stay invisible to them, by construction — not by
convention.

The platform is also, deliberately, a demonstration artifact: this iteration's primary objective
is proving out a clean spec-driven, parallel, AI-native build process (spec Section 1); a working
product is the load-bearing side effect, not the only goal. Where the two are in tension, this
PRD favors the interpretation that keeps the process demonstrably clean over the one that ships
one more feature.

## 2. Target User

### 2.1 Jobs To Be Done

- **As an Employee**, I need to manage my own contact details, see my own leave balance and
  projects, and complete my own tasks/IDP — without asking HR to do it for me.
- **As a Unit Manager**, I need one place that shows me who reports to me, their current risk
  status, and what I owe them (overdue action items), so nothing falls through the cracks.
- **As a Delivery Manager**, I need to see everyone on my projects regardless of their formal
  reporting line, and to review/approve resourcing candidates proposed for my projects, because
  project membership — not the org chart — is how my accountability actually works.
- **As a Project Manager**, I need the same project-grouped visibility as a DM, scoped to my own
  projects, plus the ability to raise a resourcing request without waiting on my DM to do it.
- **As a People Partner**, I need full HR visibility (profiles, CDS, feedback, risks) over the
  people I'm assigned to, without any resourcing clutter that isn't my job.
- **As an HR Admin**, I need to create and adjust functional roles and their permissions myself,
  when the org needs a new one (e.g. IT running its own security campaigns), without waiting on
  engineering to ship a code change.
- **As any manager or PP**, I need to hand a colleague (e.g. a DM evaluating a candidate I don't
  yet manage) a time-boxed, revocable view into specific sections of a profile, without granting
  them standing access.

### 2.2 Non-Users (v1)

- External candidates and PeopleForce users are data *subjects* pulled into the platform for
  resourcing, not platform users themselves in this iteration — they have no login or self-view.
- Timetracker users are a data source (leaves, project assignment), not a separate user
  population the platform manages accounts for.
- Compensation/payroll stakeholders — there is no compensation section on the profile (spec
  Section 10, explicitly out of scope).

### 2.3 Key User Journeys

`[ASSUMPTION]` The spec is exhaustive on data and access rules but does not narrate real usage
scenarios; the five journeys below are drafted from the role definitions in spec Section 2 and
flagged for correction against real scenarios if the team has them.

- **UJ-1. Priti checks her own profile and closes out an overdue task.**
  - **Persona + context:** Priti, a mid-level engineer, gets a Monday-morning nudge that she has
    an overdue action item.
  - **Entry state:** Authenticated as herself, lands on her own profile via a notification link
    (or the dashboard if notifications aren't built this iteration).
  - **Path:** Opens her profile → sees S14 Action Items with the overdue item highlighted →
    opens the linked form campaign task, fills the external form → returns and marks the item
    complete → checks her S10 leave balance while she's there and confirms an upcoming vacation
    request status.
  - **Climax:** The action item flips to completed, with a completion date recorded and the
    overdue flag gone.
  - **Resolution:** Her profile shows no open overdue items; her manager's dashboard counter
    (which had counted this item) decrements on next load.
  - **Edge case:** If she tries to mark it complete a second time, the system treats it as a
    no-op, not an error.

- **UJ-2. Marcus (Unit Manager) responds to a risk flag on his dashboard.**
  - **Persona + context:** Marcus manages 12 people; one report's risk level was just escalated
    from "need attention" to "high" by their PP after a 1:1.
  - **Entry state:** Authenticated as Marcus, on his UM dashboard (4.4.1).
  - **Path:** Sees the risk counter tick up and the trend arrow on the subordinates table →
    clicks through to the person's profile, S6 Risks → reads the risk description and history →
    creates an action item for himself to schedule a follow-up conversation, due in 3 days.
  - **Climax:** The action item appears on his own dashboard's "my action items" list, sorted by
    due date.
  - **Resolution:** He has a concrete, dated next step instead of a mental note.
  - **Edge case:** If the report is also on a DM's project, Marcus's action item creation must
    still succeed — Manager access via reports-to is independent of the project-assignment path.

- **UJ-3. Lena (DM) reviews a proposed resourcing candidate she doesn't yet manage.**
  - **Persona + context:** Lena's UM proposed an internal engineer for Lena's project; Lena has
    no existing Manager/PP relationship with that engineer yet.
  - **Entry state:** Authenticated as Lena, on Resourcing → her request's detail view.
  - **Path:** Sees the proposed candidate with a "shared view" link (since she lacks standing
    access) → opens it, sees the sections the UM chose to share (S1, S4, S9, S11 — not S2/S5/S6/
    S8, which are excluded by default) → reviews and approves the assignment.
  - **Climax:** The approval is recorded; the candidate's S15 request history updates to
    "approved."
  - **Resolution:** Standing Manager access doesn't yet exist for Lena over this person — it will
    arise once the project assignment actually starts, per 2.1's derivation rule, not from the
    approval action itself.
  - **Edge case:** If Lena instead rejects with a reason, the candidate's S15 shows
    "rejected — {reason}" and the UM can propose someone else.

- **UJ-4. Diane (HR Admin) stands up a new functional role for IT's security campaigns.**
  - **Persona + context:** IT wants to run quarterly security-awareness campaigns without any of
    its members becoming managers or people partners.
  - **Entry state:** Authenticated as Diane, in role/permission administration.
  - **Path:** Creates a new functional role "Security Campaign Owner" → grants exactly the
    "create form campaigns" permission (spec §2.3) → assigns two IT staff to the role.
  - **Climax:** Those two IT staff can now build a campaign audience via the All Employees filter
    engine and launch a campaign — scoped to the colleague view, since they hold no Manager/PP
    relationship over the audience.
  - **Resolution:** No deploy happened; no one on IT can see risk levels, management notes, or
    any section outside the colleague whitelist for the people they're campaigning to.
  - **Edge case:** If Diane later revokes the permission, both users lose campaign-creation
    ability immediately, per the 2.3 requirement that removal takes effect immediately.

- **UJ-5. Farah (PM) opens a management note about her own report and hits the S7 exception.**
  - **Persona + context:** Farah is a PM on a project; one of her people has a management note on
    file from their PP.
  - **Entry state:** Authenticated as Farah, viewing the person's profile as their Manager (via
    project assignment).
  - **Path:** Every other section (S1, S4, S9, S11, etc.) is fully RW/R per the Manager line row
    → she opens S7 and sees only the notes flagged `visible for PM`, read-only; an unflagged note
    from the PP is simply not present in the list.
  - **Climax:** She correctly infers she's missing context, without ever seeing what she's
    missing.
  - **Resolution:** She escalates a general concern to the PP directly rather than acting on
    information she was never shown.
  - **Edge case:** If Farah is later promoted to DM over the same person, her S7 access changes
    from flag-gated read to full read/write regardless of flags — the spec's flag-gated exception
    names only "a PM," and groups DM with UM/PP as full RW (spec §3.3). The restriction is tied to the
    PM role specifically, not to "being a project-chain manager" generally.

- **UJ-6. Chidi (People Partner) runs a CDS check-in and logs feedback after it.**
  - **Persona + context:** Chidi is assigned as People Partner to a department; one of his people
    is due for a CDS assessment and recently got informal feedback from a project lead.
  - **Entry state:** Authenticated as Chidi, on the PP dashboard, filtered to "upcoming CDS
    assessments."
  - **Path:** Opens the flagged person's profile → S12 CDS: confirms the skills-matrix link still
    resolves to the right department+position file, logs the completed assessment (date, himself
    as assessor, a link to the result file, a short conclusion) → creates or updates the person's
    IDP with a deadline → separately opens S8 Feedback and adds a new record from the project
    lead's verbal input, dated, with context, defaulting to management-only visibility.
  - **Climax:** The CDS assessment log and the feedback record both save; the IDP now has a
    tracked deadline the employee can see and mark complete themselves.
  - **Resolution:** Chidi's PP dashboard's "upcoming CDS assessments" count decrements; the
    feedback record is queryable later for a period-over-period comparison.
  - **Edge case:** If Chidi later decides the feedback should be visible to the employee, flipping
    the visibility flag makes it appear in the employee's own S8 read on their next visit — no
    separate notification mechanism this iteration (Notifications is out of MVP, §6.2).

## 3. Glossary

*Citations below are to the source spec (`docs/requirements/project-requirements.md`), written
as `spec §X.Y` to avoid colliding with this PRD's own §4.1–§4.16 feature numbering.*

- **Employee** — Any person with a profile in the system. Everyone is at minimum a Self and a
  Colleague to everyone else.
- **Access role** — One of Employee (Self), Manager, People Partner, or HR Admin. Derived from
  relationships (spec §2.1), never stored or assigned. Evaluated per viewer, per subject profile,
  per request.
- **Functional role** — A named, assigned bundle of feature permissions (e.g. Unit Manager,
  Delivery Manager, or a custom role like Security Campaign Owner). Stored data, runtime-editable
  by HR Admin (spec §2.3). Grants features, never data access on its own.
- **Manager line** — The audience made up of everyone holding the Manager access role with
  respect to a given profile: the person's UM, the PM/DM of their project(s), and everyone above
  any of those in either the reporting or project-management chain.
- **Colleague** — Any authenticated Employee holding none of Manager/People Partner/HR Admin with
  respect to a given profile. Sees the whitelist view only.
- **Section** — One of the 16 named partitions of a profile (S1 Identity card through S16 Custom
  fields), each independently access-gated per `docs/access-control/section-matrix.md`.
- **Shared link** — A time-boxed, revocable, read-only view into a subset of a profile's
  sections, generated by a Manager for someone without standing access (spec §4.8; this PRD's
  §4.9).
- **Functional role permission** — A single independently-grantable capability (e.g. "create
  resourcing requests," "maintain CDS records") bound to a functional role.
- **Action item** — The single task entity in the system; created manually or generated by a form
  campaign; lifecycle open → completed, or cancelled with a reason (spec §4.5; this PRD's §4.6).
- **Risk record** — A dated record of an employee's risk level (low / need attention / medium /
  high / leaver) with description and details; history retained; current level is the latest
  record (spec §4.6; this PRD's §4.7).
- **Management note** — A free-form S7 record with two independent visibility flags (`visible for
  employee`, `visible for PM`), both off by default.
- **Feedback record** — An S8 record with a visibility flag (management only / shared with
  employee) authored by a manager or PP about an employee (spec §4.15; this PRD's §4.14).
- **Career timeline event** — A system-generated (or manually backfilled) entry in an employee's
  S9 event log: joining, grade/position/department change, FTE↔subcontractor transition, extended
  leave, mentorship start/end (spec §4.9; this PRD's §4.10).
- **CDS (Career Development System)** — The S12 registry of a skills-matrix link, an assessment
  log, and an IDP per employee. The system does not perform assessments (spec §4.10; this PRD's
  §4.11).
- **IDP (Individual Development Plan)** — A single record (description, deadline, external link,
  complete checkbox) within CDS.
- **Mentorship pair** — A mentor–mentee relationship with a start date, and an end date + required
  final feedback once ended (spec §4.11; this PRD's §4.12).
- **Resourcing request** — A vacancy-shaped record created by a DM/PM, optionally tied to a
  project, that specialists or external candidates are proposed against (spec §4.7; this PRD's
  §4.8).
- **Candidate** — A person proposed for a resourcing request: either an internal Employee or an
  external PeopleForce candidate. Where the candidate is later hired, how their PeopleForce
  identity links to their resulting Employee record is an open cross-system identity-resolution
  question (spec §6; see Integration and Dependencies, Open Question 5).
- **Form campaign** — A PP/manager-created task broadcast to a filtered audience, backed by an
  external form; generates one action item per recipient on activation (spec §4.12; this PRD's
  §4.13).
- **Saved view** — A named, reusable filter + column configuration on All Employees, owned by its
  creator, optionally shared (spec §4.1; this PRD's §4.3).
- **Custom field** — A field defined at runtime (by HR Admin or a manager) on the employee
  profile, with its own visibility level (management/employee/colleague) (spec §4.1, §3.3).
- **Dashboard** — One of four audience-scoped views (UM/DM/PM/PP) built on one shared dashboard
  engine, differing in grouping (by person vs. by project) and which blocks appear (spec §4.4;
  this PRD's §4.5).

## 4. Features

### 4.1 Two-Dimensional Role Resolution
**Description:** The engine underneath every other feature. Resolves, per request and per subject
profile, (a) the requester's access role with respect to that profile via the transitive closure
of reports-to and project-assignment-to-PM/DM, and (b) the requester's functional-role
permissions from stored, runtime-editable grants. No other feature may hardcode a role-name check
in place of calling this resolution. Realizes UJ-2, UJ-3, UJ-4, UJ-5.

**Functional Requirements:**

#### FR-1: Access-role resolution via transitive closure
The system can, for any (viewer, subject) pair, resolve the viewer's access role by computing the
transitive closure of "reports to" and "is assigned to a project managed by."

**Consequences (testable):**
- A manager two or more reporting levels above a subject is resolved as Manager, with no
  explicit grant required.
- A DM is resolved as Manager, at the same level as the subject's own unit manager, for every
  person on any project the DM runs.
- A PM is resolved as Manager for people on their own projects; the DM above them in the same
  project chain is also resolved as Manager for the same people.
- The same requester resolves to different access roles for different subjects within the same
  session/request batch.

#### FR-2: Access role un-derives when the underlying relationship ends
**Consequences (testable):**
- When a project assignment end-dates in the timetracker feed, Manager access derived solely
  from that assignment is not present in the next resolution after the end date — it is not
  sticky, and any cache backing this resolution invalidates within [`[ASSUMPTION]` a bound to be
  set by the team — logged as an open question, §8] of the assignment change.
- When a reporting-line edit happens inside the platform itself (e.g. HR Admin reassigns someone's
  manager), the resulting Manager-access change is reflected on the *next* request — this is
  first-party data with no external-sync excuse for latency, so it does not share FR-44's
  timetracker-sync bound. A person who is no longer someone's manager must not resolve as Manager
  for them on the very next request after the edit.

#### FR-3: Functional roles are runtime-editable data
**Consequences (testable):**
- HR Admin can create a new functional role, name it, and grant it any subset of the
  independently-grantable permissions (spec §2.3: create form campaigns, create action items,
  create/edit risks, create resourcing requests, fulfil resourcing requests, assign mentors,
  maintain CDS records, manage custom fields, view a given dashboard) without a deploy or schema
  change.
- Assigning a person to a functional role, and revoking a permission from a role, both take
  effect for that person immediately — no caching of stale grants.
- HR Admin manages system dictionaries — reference data used across the platform rather than
  per-profile data (e.g. the department+position → CDS matrix-file mapping in FR-33; leave types;
  other lookup tables the team identifies during build) — through the same no-deploy,
  runtime-editable path as functional roles and custom field definitions. This is HR Admin's full
  grant per spec 2.2: custom fields, system dictionaries, and functional-role/permission
  management, on top of everything a PP has.
- A functional role granted a permission never gains data access beyond what the holder's
  existing access role allows for a given subject (e.g. a Security Campaign Owner with no
  Manager/PP relationship over an audience still only sees that audience through the colleague
  view).

**Feature-specific NFRs:**
- Access-role and functional-role resolution together must not push the All Employees list (500+
  records, arbitrary filters) past the 2-second response budget (cross-cutting NFR, §7).

---

### 4.2 Employee Profile & Section-Level Access
**Description:** The profile detail page, assembled server-side from exactly the sections
(S1–S16) the resolved viewer is entitled to, per `docs/access-control/section-matrix.md`. A
section with no access is absent from the response entirely — not hidden client-side. Realizes
UJ-1, UJ-3, UJ-5.

**Functional Requirements:**

#### FR-4: Server-assembled, section-gated profile response
**Consequences (testable):**
- For any viewer/subject/section combination marked `—` in the matrix, the profile API response
  contains no trace of that section's data (not the field, not an empty placeholder revealing its
  existence). Per spec 3.3, this must hold across every surface the platform has, not just the
  profile response: the UI, exports, search results, notifications, and error messages must never
  reveal a `—` section either — e.g. a search that matches on a hidden field must not return a
  result the requester couldn't otherwise see, and a permission-denied error must not disclose
  the value it's denying access to.
- The profile header always shows manager, people partner, and mentor, to any audience that can
  see S1. `[ASSUMPTION]` This follows the broader S1-based reading of the matrix rather than spec
  §4.11's narrower "visible to manager line and PP" wording for mentor specifically — the two spec
  passages conflict; see Open Question 5.

#### FR-5: S7 Management notes flag gating
**Consequences (testable):**
- A newly created management note has both `visible for employee` and `visible for PM` false
  unless explicitly set otherwise at creation — this must be verified as an actual default (e.g.
  a non-nullable, server-defaulted-false column), not merely asserted by tests that always set the
  flags explicitly and never exercise the true default.
- A note with both flags unset is invisible to the employee and to a PM in the project chain.
- UM, DM, and PP always have full read/write on notes for people they're responsible for,
  regardless of flag state.
- Setting `visible for employee` on an existing note makes it appear in that employee's next S7
  read, with no other change to the record.
- Where a viewer reaches the same subject through more than one relationship path at once (e.g.
  they are PM on one of the subject's projects and simultaneously DM on another), the
  most-permissive resolved access wins for S7: if any path grants full UM/DM/PP-style RW, the
  viewer gets that, even though a different, less-permissive path (plain PM) also applies. S7
  access is never computed from an arbitrarily-chosen single path when multiple paths exist.

#### FR-6: Colleague view is a field whitelist
**Consequences (testable):**
- A colleague's profile read returns exactly S1, S10 (including leave type), and S11 (project
  name only) — verified by asserting the response body has no keys outside that set, not by
  asserting UI elements are hidden.

#### FR-7: Custom field visibility (S16)
**Consequences (testable):**
- A custom field flagged `management` never appears in a colleague's or the employee's own read
  unless its visibility is `employee` or `colleague` respectively — including as a rendered
  column value in the live, on-screen All Employees list, not only on the profile page. Column
  visibility on the list view is the same enforcement as profile-field visibility, not a separate
  rule that could be independently missed.
- A filter built against a custom field the requester cannot see returns no usable signal (the
  field is not offered as a filter option to that requester at all).

---

### 4.3 All Employees / Our Team
**Description:** One list page serving every audience; what differs is the data entitlement, not
the page. Sortable, filterable (including on custom and derived fields), with saved views and
export. Realizes JTBDs for all manager/PP personas.

**Functional Requirements:**

#### FR-8: Universal filter/column engine over profile fields
**Consequences (testable):**
- Any existing field, including custom fields created after this feature ships, is usable as
  both a filter and a column without a code change.
- "Years with company" is filterable as a numeric range despite being derived from a stored join
  date, not stored itself.

#### FR-9: Inline editing writes through to the profile, subject to access
**Consequences (testable):**
- An inline edit attempt on a field the editor holds only R access to is rejected server-side,
  not merely disabled in the UI.

#### FR-10: Saved views
**Consequences (testable):**
- A saved view (filter + columns) persists under its creator, can be shared with other managers,
  and multiple views coexist as separate tabs.

#### FR-11: Export respects the exporter's access
**Consequences (testable):**
- An `.xlsx` export contains only the columns the exporter is entitled to see — the same
  entitlement check as the live list view, not a separate export-specific rule.

#### FR-12: Colleague mode
**Consequences (testable):**
- A colleague viewing All Employees sees only whitelist columns (§4.2); clicking a row opens the
  limited profile view, not the full profile with client-side hiding.

**Feature-specific NFRs:**
- Responds within 2 seconds at 500+ records with arbitrary filters, including permission
  resolution (spec Section 7, cross-referenced here since this is the feature it binds hardest
  to).

---

### 4.4 Self-Service
**Description:** The employee's own view and edit surface over their own data. Realizes UJ-1.

**Functional Requirements:**

#### FR-13: Self-managed personal data
**Consequences (testable):**
- An employee can view/edit their own S2 (personal contacts, residential address, place of stay)
  and S3 (emergency contacts) without any manager/PP action.
- An employee can upload their own photo and certificates.

#### FR-14: Self-read of managed data
**Consequences (testable):**
- An employee can read their own grade, position, seniority, employment type, English level
  (S4, R only — write requires Manager/PP), career timeline (S9), leaves (S10, with a link to the
  timetracker), and projects (S11).

#### FR-15: Self-managed CDS, mentorship, and action items
**Consequences (testable):**
- An employee can read their CDS section and mark their own IDP complete (recording a completion
  date), manage their own mentorship open-to flag, and mark their own action items complete.
- An employee cannot read their own S6 risk level under any condition — this is enforced the same
  way as any other `—` cell (§4.2), not as a special case.

---

### 4.5 Dashboards
**Description:** One dashboard engine, four audience-scoped configurations differing in grouping
(by person for UM/PP, by project for DM/PM) and which functional blocks appear. Realizes UJ-2.

**Functional Requirements:**

#### FR-16: Shared dashboard engine, per-audience configuration
**Consequences (testable):**
- UM, DM, PM, and PP dashboards share underlying components (counters, tables, action-item
  lists); building a fifth audience-scoped dashboard should not require a new page, only a new
  configuration of the same engine.

#### FR-17: UM dashboard — grouped by person
**Consequences (testable):**
- Shows headcount of subordinates, risk counts by level, open/overdue action item counts, active
  resourcing request count, open campaign count; a subordinates table with risk/project/leave
  status; the UM's own action items sorted by due date with overdue highlighted.

#### FR-18: DM/PM dashboard — grouped by project
**Consequences (testable):**
- One table per project the DM/PM is responsible for, each listing that project's people with
  risk/leave status; a project selector defaulting to "All projects" that filters the whole page
  and recalculates every counter when a specific project is chosen, and returns to the
  all-projects view when cleared; counters computed across all the manager's projects when no
  project is selected.
- The DM's page additionally shows requests created by the PMs of their projects, not just their
  own.

#### FR-19: PP dashboard — scoped, no resourcing block
**Consequences (testable):**
- Same building blocks, scoped to the PP's assigned people, groupable by department or project;
  the resourcing block is absent entirely, not merely empty.

---

### 4.6 Action Items and Tasks
**Description:** The single task entity, surfaced on profiles, self-service, and dashboards.
Realizes UJ-1, UJ-2.

**Functional Requirements:**

#### FR-20: Manual creation, scoped to the creator's access
**Consequences (testable):**
- A UM/DM/PM/PP, or any functional role holding the "create action items" permission, can create
  an action item for any person they hold Manager or PP access over (or, for a granted role,
  within that role's own access scope) — never for a person outside that scope.

#### FR-21: Campaign-generated action items
**Consequences (testable):**
- Activating a form campaign generates exactly one action item per resolved recipient, carrying
  the campaign's link and due date, and the resolved recipient list is frozen at activation —
  someone who joins the audience-matching population later does not retroactively get one.

#### FR-22: Lifecycle and overdue display
**Consequences (testable):**
- The assignee completing an item records a completion date; the author can cancel with a
  required reason; any item past due date renders as overdue everywhere it's shown (profile,
  dashboard, self-service).

---

### 4.7 Risks and Risk Dashboard
**Description:** Per-employee risk records with trend and history, plus a scoped dashboard.
Realizes UJ-2.

**Functional Requirements:**

#### FR-23: Risk record with retained history
**Consequences (testable):**
- Current level is the most recent record; full history is retained and readable by Manager
  line/PP.
- A trend arrow appears only when the level differs from the immediately preceding record; no
  arrow on the first record or an unchanged level.

#### FR-24: Risk Dashboard
**Consequences (testable):**
- Counts by level (medium/high/leaver visually emphasised); a table sorted by severity then date
  with trend arrows; filterable by unit/department/project/PP/manager; drill-through from a count
  to the filtered table and from a row to the profile.
- Scoped to people the viewer holds Manager or PP access over; never rendered for the employee
  themselves, under any access role the employee might otherwise hold for someone else.

---

### 4.8 Resourcing
**Description:** Request creation, fulfilment, and review across UM/DM/PM, plus PeopleForce
candidates. Realizes UJ-3.

**Functional Requirements:**

#### FR-25: Request creation (DM/PM)
**Consequences (testable):**
- A request may exist unattached to a project; a DM's request list includes requests created by
  the PMs of their own projects.
- Available to DM/PM, and to any functional role granted the "create resourcing requests"
  permission (spec §2.3), scoped to that role's own access — same extensibility pattern as
  FR-20 (action items) and FR-39 (campaigns). A permission check here reads the requester's
  stored, runtime-editable grant, never a hardcoded "role == DM/PM" comparison.

#### FR-26: Request fulfilment (UM)
**Consequences (testable):**
- A UM sees requests assigned to them, can propose one or more internal specialists from their
  unit and/or attach an external PeopleForce candidate, and submits the set for DM approval.
- Available to UM, and to any functional role granted the "fulfil resourcing requests" permission
  (spec §2.3), scoped to that role's own access — same extensibility pattern as FR-25.

#### FR-27: Request review and decision (DM)
**Consequences (testable):**
- For an internal candidate the DM doesn't yet hold access over, the profile link triggers
  profile sharing (§4.9) — specifically the same FR-29/FR-30-governed mechanism (same
  default-excluded sections, same expiry/revocation/logging, same no-write guarantee), not a
  separate lighter-weight preview path built just for this workflow.
- For an external candidate, the link goes to pulled PeopleForce data, or — where that
  integration isn't complete — to an external PeopleForce link (spec-sanctioned fallback, spec
  §5.2).
- Each candidate decision (approve / reject-with-reason) is recorded.

#### FR-28: Request history (S15)
**Consequences (testable):**
- Every proposal attempt (proposed → approved/rejected, with feedback) appears both in
  Resourcing → Requests and in the candidate's own profile S15.
- Approval does not itself create a project record on the profile; the project appears on the
  profile only after the next timetracker sync reflects the assignment made there.

---

### 4.9 Profile Sharing
**Description:** Time-boxed, revocable, section-selectable read views for viewers without
standing access. Realizes UJ-3.

**Functional Requirements:**

#### FR-29: Only a standing Manager/PP may create a share, section-selectable and sensitivity-gated
**Consequences (testable):**
- Creating a share for a given subject requires the requester to hold the Manager or People
  Partner access role over that subject at creation time (spec §4.8: "a manager generates a
  shareable view... for someone who does not hold Manager or People Partner access over that
  person" — the *sharer* must hold it, the recipient must not). A request to create a share from a
  requester who is only a Colleague (or holds no access role at all) over the subject is rejected
  server-side, the same way any other unauthorized write is — this is checked independently of,
  and before, which sections the request asks to include.
- Sensitive sections (S2, S5, S6, S8) are excluded by default and require explicit per-share
  enabling.
- S3, S7, and S13 cannot be included in a shared link under any configuration.

#### FR-30: Expiry, revocation, and access logging
**Consequences (testable):**
- Default expiry is 24 hours, configurable at creation; a manager can revoke before expiry; every
  access via the link is logged with timestamp and origin.
- A shared link never grants write access to any section, regardless of which sections are
  included.

---

### 4.10 Career Timeline
**Description:** System-generated event log with manual override for backfill/correction.
Realizes background for UJ-3, UJ-4.

**Functional Requirements:**

#### FR-31: Automatic event generation
**Consequences (testable):**
- Joining, grade/position/department change, FTE↔subcontractor transition, extended leave, and
  mentorship pair start/end each write a timeline event automatically when the underlying change
  occurs — no separate manual step required for these six event types.

#### FR-32: Manual override by PP/UM
**Consequences (testable):**
- PP and UM can add, edit, or delete timeline entries, for historical backfill or correcting a
  wrongly-inferred system event.

**Notes:**
- Data-modeling constraint carried forward from spec §6: grade, position, department, and
  employment type must be modeled as time-bounded records (each with an effective period), not as
  scalar fields plus a bolted-on audit log. FR-31's "full history retained" requirement is not
  satisfiable on a scalar-plus-audit-log model — a query for "what was this person's grade on
  date X" needs a real answer, not just a change log to replay. This is architecture-relevant, not
  a PRD implementation detail, but it's flagged here because getting it wrong blocks FR-31/32
  outright rather than degrading gracefully.

---

### 4.11 CDS (Career Development System)
**Description:** A registry and hub — links to external skills matrices, an assessment log, and
IDPs. Assessment itself happens outside the system. Realizes UJ-1, UJ-6.

**Functional Requirements:**

#### FR-33: Matrix link resolution by department + position
**Consequences (testable):**
- The department+position → matrix file mapping is maintained as a dictionary; updating the
  dictionary entry updates what every affected profile's CDS section links to, with no per-profile
  edit required.

#### FR-34: Assessment log and IDP
**Consequences (testable):**
- Manager/PP can create assessment records (date, assessor, result-file link, conclusion text)
  and create/update IDPs (description, deadline, external link).
- The employee can mark their own IDP complete, which records a completion date displayed
  alongside the deadline; an IDP with no completion date is treated as open.

#### FR-35: CDS-based filtering on All Employees
**Consequences (testable):**
- "Assessed before X," "assessed after X," "assessed between X and Y," and a distinct
  "never assessed" option are all selectable — the never-assessed case is not indistinguishable
  from an empty/null filter result.
- "Has an open IDP" (yes/no) is filterable.

---

### 4.12 Mentorship Hub
**Description:** Self-flagging, pairing, and pair lifecycle management. Realizes background for
UJ-1.

**Functional Requirements:**

#### FR-36: Self-service mentorship status
**Consequences (testable):**
- An employee can flag themselves open to mentoring and see their own assigned mentor/mentees.

#### FR-37: Manager/PP pairing flow
**Consequences (testable):**
- A manager/PP sees everyone flagged open to mentoring, and can assign a mentee (from people
  available to that manager) to a willing mentor.
- On the first pair's creation, the mentor's status changes from "open to mentoring" to
  "mentor" — a filterable field on All Employees.

#### FR-38: Ending a pair
**Consequences (testable):**
- Ending a pair requires final feedback and is refused without it; the end date is recorded, an
  end event is written to the career timeline, and the pair remains visible in history on both
  profiles.
- If the mentor has no other active mentees after the end, their status reverts to "open to
  mentoring."

---

### 4.13 Forms and Surveys as Tasks (Campaigns)
**Description:** Filtered-audience task broadcast backed by an externally-hosted form. Realizes
UJ-4.

**Functional Requirements:**

#### FR-39: Campaign creation and audience resolution
**Consequences (testable):**
- Creator builds/previews an audience via the All Employees filter engine (or a saved view),
  can add/remove individuals after resolution, and the list freezes on activation.
- Creation is available to PP/managers by default, and to any functional role granted the
  "create form campaigns" permission (spec §2.3), scoped to that role's own access.

#### FR-40: Completion tracking
**Consequences (testable):**
- The sender's campaign view shows a per-recipient completed/not-completed/overdue table, driven
  entirely by each recipient's action-item completion — the system never reads or verifies the
  external form's contents.

---

### 4.14 Feedback
**Description:** Structured, visibility-flagged feedback records with a targeted-request flow
built on campaigns. Realizes UJ-6.

**Functional Requirements:**

#### FR-41: Feedback record creation and visibility
**Consequences (testable):**
- Managers/PP add a record (subject, author, date, context, body) with a visibility flag
  (management-only default, or shared-with-employee); the employee's S8 read reflects only
  shared-with-employee records.

#### FR-42: Requesting feedback from named colleagues
**Consequences (testable):**
- A feedback request targeted at specific named individuals is implemented as a form campaign
  (§4.13) rather than a separate mechanism.

---

### 4.15 Internal Timetracker Integration
**Description:** Pulls leaves and project/PM/DM assignment; the latter is a direct input to
access-role resolution (§4.1), not just display. See `docs/integrations/timetracker.md` for the
research-in-progress record of API specifics.

**Functional Requirements:**

#### FR-43: Leave data sync into S10
**Consequences (testable):**
- Vacation/sick/parental/other leave types and dates surface on S10 per the section's access
  rules, including the colleague-visible leave type.

#### FR-44: Project/assignment sync feeding access resolution
**Consequences (testable):**
- A new project assignment (with its PM/DM) becomes an input to Manager-access resolution (§4.1)
  within a bounded sync latency `[ASSUMPTION]` — exact bound is an open question (§8) pending the
  API's push/pull characteristics, to be recorded in `docs/integrations/timetracker.md`.
- An ended assignment removes the derived access no later than that same bound; a stale sync must
  never leave ended access active past it (cross-references the cache-invalidation invariant in
  `.claude/rules/access-control-invariants.md`).

**Feature-specific NFRs:**
- A timetracker outage degrades to stale-but-labeled leave/project data, or a visible "unable to
  refresh" state — it must never take down profile access or dashboard rendering (spec Section
  7).

---

### 4.16 PeopleForce Integration
**Description:** Pulls external candidate data for resourcing (§4.8); source of truth for
vacancies. See `docs/integrations/peopleforce.md` for the research-in-progress record.

**Functional Requirements:**

#### FR-45: Candidate data pull for resourcing
**Consequences (testable):**
- A UM attaching an external candidate to a resourcing proposal can pull that candidate's
  PeopleForce data for the DM's review (§4.8, FR-27).
- Where the pull isn't implemented in time, the fallback is an external link to the candidate in
  PeopleForce — this is an explicitly spec-sanctioned degraded mode, not a defect, provided it's
  a deliberate, recorded decision (log to `docs/integrations/peopleforce.md`).

**Feature-specific NFRs:**
- A PeopleForce outage or fallback-mode operation must not block request creation, fulfilment, or
  DM review/approval for internal candidates — the resourcing flow degrades per-candidate, not
  globally.

## 5. Non-Goals (Explicit)

- Compensation and salary data — no such section exists on the profile (spec §10).
- Pre-onboarding: creating a person before their first day, or pulling from PeopleForce on offer
  acceptance — deferred to a later iteration (spec §10).
- Email template management (an eSender replacement) — deferred (spec §10).
- Performing competency assessments inside the system — CDS is a registry/hub only; assessment
  happens externally (spec §4.10, §10).
- Learning management (LMS) functionality — a separate track, not duplicated here (spec §10).
- Mentorship goals, session logs, and progress tracking — pairing/ending/visibility only (spec
  §10).
- Project allocation percentages / workload distribution modeling — projects are shown, workload
  isn't modeled (spec §10).
- Rollout/change-management and data migration planning for replacing the actual current internal
  system — out of scope for this bootcamp iteration; this PRD covers the platform being built,
  not an organisational cutover plan.

## 6. MVP Scope

**Target delivery: 2026-09-08** — the full platform described in this PRD is scoped to a 2-week
build window. This date is the constraint behind every cut in §6.2 and behind R-1 in the Risk
Register; if it slips, the cut order in R-1 (DESIGN FREEDOM scope first, NORMATIVE scope never)
still applies.

### 6.1 In Scope

- Everything in §4.1 through §4.14 (two-dimensional role resolution through Feedback) — these
  correspond to spec sections marked [NORMATIVE] or [DESIGN FREEDOM], none of which are optional
  for this iteration.
- §4.15 Internal Timetracker Integration and §4.16 PeopleForce Integration, per spec §5's
  requirement that mock data is no longer acceptable — with the PeopleForce external-link
  fallback (FR-45) treated as an acceptable in-scope outcome, not a cut feature, if the full pull
  isn't ready in time.
- Automated access-control test coverage per audience/relationship-path/section (spec §9 DoD) —
  this is in scope as a deliverable in its own right, not incidental to feature work.

### 6.2 Out of Scope for MVP

- **Notifications** (spec §4.13) — explicitly [GOOD TO HAVE], not required this iteration.
  `[ASSUMPTION]` Deferred to v2 given the 2-week window; revisit if time permits, since it's
  emotionally load-bearing for the "communication is captured" spirit of the project even though
  not formally required. `[NOTE FOR PM]`
- **Analytics and Reports** (spec §4.14) — explicitly [GOOD TO HAVE]. Deferred to v2.
  `[ASSUMPTION]`
- Accessibility work beyond the baseline responsive/keyboard-navigable NFR — a dedicated
  accessibility audit pass is not scheduled within the 2-week window. `[ASSUMPTION]` — flagged as
  a risk (§ Risk register) rather than silently dropped, since accessibility is a stated NFR
  (spec §7).
- Any HR-specific dashboard widget beyond the minimum PP dashboard blocks (incomplete-profile
  flags, upcoming CDS assessments, IDP deadlines, campaign completion, joiners/leavers) — spec
  §4.4.4 marks these [DESIGN FREEDOM] and explicitly optional; ship the minimum, add more only if
  the 2-week timeline allows. `[ASSUMPTION]`

## 7. Success Metrics

**Primary**
- **SM-1**: Access-control correctness — 100% of section-matrix cells (every audience × every
  relationship path × every section, including every `—` cell, S7 unflagged cases, and the
  colleague whitelist) have an automated test asserting the API-level behavior, per spec §9 DoD.
  Validates FR-1 through FR-7, FR-16 through FR-19, FR-29–30.
- **SM-2**: Real integrations — both the timetracker and PeopleForce integrations run against
  real (not mocked) APIs by delivery, or, for PeopleForce, an explicitly recorded and justified
  fallback to the external-link mode. Validates FR-43–45.
- **SM-3**: Process quality — the intelligent repository (specs, decisions, rules, skills) stays
  in sync with shipped behavior at delivery, and the team demonstrably worked in parallel across
  the 2-week window without a documented blocking dependency (spec §1, §8).

**Secondary**
- **SM-4**: All Employees list performance — p95 response time ≤ 2 seconds at 500+ records with
  an arbitrary filter/derived-field combination, including permission resolution (spec §7).
  Validates FR-8, feature-specific NFR under §4.3.
- **SM-5**: Resourcing cycle time — median time from request creation to a candidate decision
  (approve/reject), tracked from delivery onward as a baseline rather than a v1 target (no prior
  baseline exists to compare against). Validates FR-25–28.

**Counter-metrics (do not optimize)**
- **SM-C1**: Test-count vanity — counterbalances SM-1. A high count of access-control tests that
  don't actually assert API response shape (i.e., only assert UI hiding) does not count toward
  SM-1; `access-control-reviewer` explicitly checks for this failure mode.
- **SM-C2**: Feature velocity at the expense of process — counterbalances any temptation to treat
  SM-3 as secondary to shipped feature count, per spec §1's explicit priority order (process wins
  where the two conflict).

## 8. Open Questions

1. What is the acceptable sync-latency bound between a timetracker project-assignment change and
   that change being reflected in access resolution (FR-2, FR-44)? Affects whether polling or
   webhooks are required from the timetracker API — pending research in
   `docs/integrations/timetracker.md`.
2. Decision-logging approach for Teams calls (ADR-in-repo vs. Jira vs. both) — proposed as
   `docs/decisions/` ADRs, not yet confirmed; affects where SM-3's "process quality" evidence
   actually lives.
3. Real pain points with the current internal system being replaced are not yet known firsthand —
   the problem framing in §1 Vision is derived from the spec's stated functional gaps rather than
   direct user complaints. Worth a short conversation with actual HR/manager users if time
   allows, to sharpen §1 and the dashboard "what matters most" prioritization within the
   [DESIGN FREEDOM] widget list.
4. How is identity resolved across PeopleForce candidate, employee, and timetracker user records
   (spec §6)? Email alone is spec-flagged as insufficient. Pending research in
   `docs/integrations/timetracker.md` and `docs/integrations/peopleforce.md`.
5. **Mentor visibility to Colleagues — spec self-contradiction.** Spec §3.2/§3.3 (the S1 row and
   the "a colleague sees exactly S1..." rule) implies a Colleague sees the mentor, since mentor is
   listed as S1 content and Colleague is R on the whole section. But spec §4.11 separately states
   the mentor is "visible to manager line and PP" in the profile header — narrower, excluding
   Colleague. FR-4 currently follows the broader (S1) reading: `[ASSUMPTION]` flagged there and
   in §9, pending a decision from whoever owns the spec on which reading is correct. If §4.11's
   narrower intent wins, FR-4 needs a carve-out excluding mentor specifically from the
   Colleague-visible fields within S1's header display.

## 9. Assumptions Index

- §2.3 UJ-1 through UJ-6 — drafted from role definitions, not confirmed real scenarios.
- §4.1 FR-2 — cache/sync invalidation bound left unspecified, logged as Open Question 1.
- §4.2 FR-4 — mentor visible to Colleague per the broader S1 reading, conflicting with spec
  §4.11's narrower wording; logged as Open Question 5.
- §4.15 FR-44 — sync latency bound for project-assignment access resolution, logged as Open
  Question 1.
- Cross-Cutting NFRs, Accessibility — WCAG 2.1 AA assumed as the reference standard since the spec
  names no specific level.
- §6.2 — Notifications and Analytics/Reports deferred to v2 given the 2-week window; both are
  spec-marked [GOOD TO HAVE] so this tracks the spec's own priority, but the *deferral itself* for
  this specific timeline wasn't separately confirmed.
- §6.2 — Accessibility audit pass deferred/reduced to baseline responsive support within the
  2-week window; flagged as a risk rather than confirmed acceptable.
- §6.2 — PP dashboard widgets scoped to the minimum spec-required set, with [DESIGN FREEDOM]
  extras treated as stretch, not confirmed.

## Risk Register

*(Adapt-In: Enterprise initiative — Risk and Mitigations, warranted given the 2-week/4-person
delivery window against a normative, access-control-heavy spec.)*

- **R-1: 2-week timeline vs. spec breadth.** The full spec (16 sections, 4 dashboards, 2 real
  integrations, extensible role admin) is large for 2 weeks at 4 people. *Mitigation:* the MVP
  cuts in §6.2 are the first release valve; if still at risk, the next cut should come from
  [DESIGN FREEDOM]-marked scope (dashboard widget richness) before touching anything
  [NORMATIVE], since Section 2/3 correctness is graded directly and non-negotiable per spec.
- **R-2: Real integration risk (PeopleForce).** API auth/rate-limit/data-shape unknowns could
  consume disproportionate time. *Mitigation:* the spec explicitly sanctions the external-link
  fallback (FR-45) — timebox investigation and fall back deliberately rather than late.
- **R-3: Access-control regression risk.** The single largest way this project fails gradingwise.
  *Mitigation:* `access-control-reviewer` subagent gates any diff touching profile
  sections/role resolution; `test-automation-engineer` owns closing
  `docs/access-control/section-matrix.md`'s Test coverage column before any such diff is
  considered done.
- **R-4: Parallel-work bottleneck on shared contracts.** `libs/contracts` and the section matrix
  doc are the two places one contributor's slow change blocks three others.
  *Mitigation:* per `.claude/rules/parallel-work-boundaries.md`, land shared-seam changes small
  and fast, stub against contracts that don't exist yet rather than waiting.

## Cross-Cutting NFRs

*(Adapt-In: system-wide quality attributes not tied to one feature.)*

- **Platform:** Responsive web only for this iteration — no dedicated mobile app. All list,
  profile, and dashboard pages must be usable at typical desktop and tablet widths (spec §7's
  accessibility/responsive-layout NFR).
- **Performance:** All Employees list responds within 2 seconds at 500+ records with arbitrary
  filters and derived fields, including permission resolution (spec §7). This is the one NFR with
  a hard numeric target; treat it as a release gate, not an aspiration.
- **Availability:** External integration (timetracker, PeopleForce) failures degrade gracefully
  and never take down the application (spec §7) — see feature-specific NFRs under §4.15–4.16 for
  what "degrade gracefully" means per integration.
- **Accessibility:** Responsive layout and accessibility for list, profile, and dashboard pages
  (spec §7). `[ASSUMPTION]` Baseline target for this iteration: WCAG 2.1 AA is the reference
  standard (the spec names no specific level), scoped down to keyboard navigability for every
  interactive element, semantic heading/landmark structure, and text/background contrast ratios
  meeting AA — explicitly not including a full audit (screen-reader walkthroughs, automated +
  manual AA conformance testing across every page) within the 2-week window. See R-1/R-3 in the
  Risk Register for why the full audit isn't scheduled, and revisit if timeline allows.
- **Access-control correctness** is the primary quality attribute (spec §7) — restated here as an
  NFR rather than only a feature concern, since it constrains every feature in §4, not just §4.1
  and §4.2.

## Constraints and Guardrails

*(Adapt-In: Privacy is a real, spec-mandated concern; Safety/Cost are not distinct concerns here
beyond what's already covered.)*

- **Privacy:** The system holds real personal data. Pseudonymised data only in every non-
  production environment, every log, and every agent context — real structure/volume, fabricated
  identities (spec §7; `.claude/rules/pseudonymized-data-only.md`). No compensation data is
  modeled at all (spec §10), which removes an entire class of sensitive-data handling by design.
  Retention/data-residency policy is not specified in the spec and is not assumed here — logged
  implicitly via Open Question territory if it becomes load-bearing later.

## Integration and Dependencies

*(Adapt-In: Enterprise initiative — the two external integrations plus the identity provider are
real, load-bearing dependencies.)*

- **Internal timetracker** — leaves, and project/people/PM/DM assignment. The latter is a direct
  input to access-role resolution, making this the platform's most safety-critical external
  dependency (see FR-44, R-3). Tracked in `docs/integrations/timetracker.md`.
- **PeopleForce** — candidate and vacancy data for resourcing. Tracked in
  `docs/integrations/peopleforce.md`; external-link fallback explicitly sanctioned if the full
  integration isn't ready (R-2).
- **Keycloak (identity provider)** — authenticates users and carries stable identity claims; does
  **not** carry access-role or functional-role decisions (see `.claude/agents/
  identity-access-engineer.md` for the enforced boundary). Not a data source for profile content,
  only for "who is this."
- **Cross-system identity resolution** (spec §6) — a real person exists as up to three separate
  identities: a PeopleForce candidate, an employee in this platform, and a timetracker user.
  Email alone is spec-flagged as insufficient to match them. This platform is the joining point:
  it must decide and record how a candidate's PeopleForce identity links (or doesn't, pending
  hire) to their eventual employee record, and how an employee identity maps to their timetracker
  user — both are open per-integration decisions, not yet made (see Open Question below and the
  identity-resolution subsections already scaffolded in `docs/integrations/timetracker.md` and
  `docs/integrations/peopleforce.md`).

## Why Now

*(Adapt-In: timing is genuinely load-bearing — this is a versioned iteration superseding a prior
one for stated reasons, not an arbitrary restart.)*

Iteration 1 explicitly allowed mock/seed data and treated access control as unspecified. Iteration
2 exists because both of those became untenable for a system meant to eventually replace the real
internal platform: an access model with no enforcement can't hold real personal data safely, and
a platform that doesn't sync with the timetracker/PeopleForce drifts out of truth immediately.
This is why §4.1/§4.2 (access resolution) and §4.15/§4.16 (real integrations) are treated as
equally load-bearing as any user-facing feature in this PRD, not as backend plumbing beneath the
"real" product.
