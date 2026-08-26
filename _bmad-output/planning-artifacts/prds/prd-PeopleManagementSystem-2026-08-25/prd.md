---
title: People Management Platform
status: final
created: 2026-08-25
updated: 2026-08-26
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

**2026-08-26 update:** the source spec moved from v1.2 to v1.5 via
`docs/requirements/Spec_Changelog_v1.2_to_v1.5.md`, with breaking changes to Sections 2 and 3. This
revision updates every FR, journey, and open question the changelog touches; edits are made in
place rather than tracked with inline diff markers, since the changelog itself is the record of
what changed and why — this document now simply states the current (v1.5) truth. Where the
changelog resolved a prior `[ASSUMPTION]` or Open Question outright, it's removed rather than kept
as a stale marker; §8 and §9 note what was resolved, narrowed, or left open.

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
  - **Entry state:** Authenticated as Marcus, on his UM dashboard (spec §4.4.1).
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
    project assignment — Project line, `[v1.5]`).
  - **Path:** Most sections (S1, S4, S9, S11, etc.) are fully RW/R per Project line — `[v1.5,
    corrected]` **except** S2 and S3, which are `—` for her (Project-line narrowing, FR-6a), and
    S5, where she sees CV+certificates only, not the full document set a Reporting-line viewer
    would → she opens S7 and sees only the notes flagged `visible for PM`, read-only (this
    flag-gating is tied to the PM role specifically, not to the Project-line narrowing above —
    they're two independent exceptions stacking on the same viewer); an unflagged note from the PP
    is simply not present in the list.
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
    feedback record is queryable later, listed chronologically and filterable by period. `[v1.5,
    corrected]` Not "for a period-over-period comparison" as this journey originally said — that
    view is explicitly removed as of v1.5 (spec §4.15); the record is simply retained and
    filterable.
  - **Edge case:** If Chidi later decides the feedback should be visible to the employee, flipping
    the visibility flag makes it appear in the employee's own S8 read on their next visit — no
    separate notification mechanism this iteration (Notifications is out of MVP, §6.2).

- **UJ-7. Priya (HR) records a departure that's blocked, resolves it, and completes it.**
  `[v1.5, new — exercises the entirely new Employee Lifecycle feature, §4.17]`
  - **Persona + context:** Priya holds the "record a departure" permission. An employee is leaving
    at the end of the week; that employee currently manages two direct reports and is the assigned
    People Partner for a third person.
  - **Entry state:** Authenticated as Priya, on the departing employee's profile.
  - **Path:** Attempts to record the departure with an effective date and reason → the system
    blocks the attempt because the person still manages two reports and partners a third → Priya
    re-parents the two reports to an interim manager and reassigns the PP relationship (FR-2a,
    journaled) → retries the departure, which now succeeds.
  - **Climax:** On the effective date, the profile goes read-only, the person drops out of the
    default All Employees list (still findable by explicit filter), their two open action items
    close as `cancelled — departed`, their one active mentorship pair auto-closes with a
    system-generated closure note, and every derived access they held over anyone else ends
    immediately.
  - **Resolution:** The employment-status fact (`dismissed`) is the platform's only record of the
    departure — no career-timeline event was written, and no risk record was touched (a prior
    `leaver` prediction on this person, if any, is left as history, not silently resolved by the
    departure).
  - **Edge case:** If Priya had tried to record the departure without first re-parenting, the
    server rejects the write with a specific reason (still-active management/PP relationships),
    not a generic permission error — the UI surfaces exactly what needs re-parenting first.

## 3. Glossary

*Citations below are to the source spec (`docs/requirements/project-requirements.md`), written
as `spec §X.Y` to avoid colliding with this PRD's own §4.1–§4.16 feature numbering.*

- **Employee** — Any person with a profile in the system. Everyone is at minimum a Self and a
  Colleague to everyone else.
- **Access role** — One of exactly three: Employee (Self), Manager, or People Partner. Derived
  from relationships (spec §2.1), never stored or assigned. Evaluated per viewer, per subject
  profile, per request. `[v1.5]` **Full profile access** (below) behaves like a fourth,
  uniform-RW access level in practice, but is technically a separate, journaled *grant* (spec
  §2.4), not one of the three derived access roles — HR Admin itself grants no data access at all
  as of v1.5.
- **Functional role** — A named, assigned bundle of feature permissions (e.g. Unit Manager,
  Delivery Manager, or a custom role like Security Campaign Owner). Stored data, runtime-editable
  by HR Admin (spec §2.3). Grants features, never data access on its own. `[v1.5]` A write now
  requires **both** dimensions to permit it where a permission also applies: the access role must
  allow the section, and the actor must hold the specific permission for actions the spec gates
  that way (approve/reject a candidate, close a request, edit the career timeline, record a
  departure, and others — spec §2.3).
- **HR Admin** — `[v1.5, changed]` No longer a data-access role. A configuration-only functional
  role: custom fields, system dictionaries, departments, and functional-role/permission
  management. Holding HR Admin implies **no** standing read/write over any profile section — that
  used to be bundled in (v1.2: "everything a PP has, plus..."); as of v1.5 it must be granted
  separately as Full profile access if a given HR Admin also needs it.
- **Full profile access** — `[v1.5, new]` A separate, journaled grant (spec §2.4) giving its
  holder RW on every section for every profile — the closest equivalent to what "HR Admin" used to
  imply. Only an existing holder can grant it to someone else; no self-assignment; the first holder
  is seeded at deployment; the last remaining holder can never be removed (a platform with zero
  full-access holders is an invalid state, blocked at the removal attempt).
- **Reporting line** — `[v1.5, replaces "Manager line" for this half]` The audience made up of
  everyone holding the Manager access role with respect to a given profile via **reports-to** or
  **department management**: the person's department manager (UM), and everyone above them in
  either chain. Full, unnarrowed section access (subject to the S7 rule).
- **Project line** — `[v1.5, replaces "Manager line" for this half]` The audience made up of
  everyone holding the Manager access role via **project assignment**: the PM/DM of the person's
  project(s), and everyone above them in that management chain. `[v1.5]` **Narrower than Reporting
  line**: loses S2 and S3 entirely, and gets S5 as CV+certificates only; every other section
  (including S6) matches Reporting line. This narrowing, plus the pre-existing PM/S7 flag-gating,
  are the platform's two documented exceptions to "a Manager sees everything" (spec §3.3).
- **Department** — `[v1.5, new]` A new, nestable organisational entity; every employee belongs to
  exactly one. Replaces the informal "unit" concept — *Unit Manager* is now defined as the
  functional-role name for whoever manages an employee's department, not a separate entity. A
  department's manager relationship is one of the three relations feeding Manager access
  resolution (alongside reports-to and project assignment).
- **Journal** — `[v1.5, new]` A narrow, purpose-built log (spec §3.4) — not a general audit trail.
  Records exactly: manager changes, people-partner changes, department changes, department-manager
  changes, Full profile access grants, and shared-link accesses.
- **Colleague** — Any authenticated Employee holding none of Manager/People Partner/Full profile
  access with respect to a given profile. Sees the whitelist view only. `[v1.5]` One narrow
  exception: a campaign author sees name and completion status for their own campaign's recipients
  (S14 only), ending when the campaign closes.
- **Section** — One of the 16 named partitions of a profile (S1 Identity card through S16 Custom
  fields), each independently access-gated per `docs/access-control/section-matrix.md`.
- **Shared link** — A time-boxed, revocable, read-only view into a subset of a profile's
  sections, generated by a Manager for someone without standing access (spec §4.8; this PRD's
  §4.9). `[v1.5, changed]` Goes to an **authenticated, explicitly named recipient at creation** —
  no anonymous "anyone with the link" mode. The creator's access is re-checked on every view, so
  the link dies the moment the creator's own relationship to the subject ends, not just at its
  stated expiry. Revocation and journal rights follow whoever *currently* holds the relationship
  (Full profile access holders as backstop), not necessarily the original creator.
- **Functional role permission** — A single independently-grantable capability (e.g. "create
  resourcing requests," "maintain CDS records") bound to a functional role.
- **Action item** — The single task entity in the system; created manually or generated by a form
  campaign; lifecycle open → completed, or cancelled with a reason (spec §4.5; this PRD's §4.6).
- **Risk record** — A dated record of an employee's risk level with description and details;
  history retained; current level is the latest record (spec §4.6; this PRD's §4.7). `[v1.5]`
  Fixed severity order `low` < `need attention` < `medium` < `high` < `leaver`, with `leaver` at
  the top of the same scale, not a terminal state — the level can move from any state to any other,
  including back down to `low`. There is no "resolved"/"closed" state. `leaver` is a *prediction*,
  never the fact of departure — the fact is the employment-status value `dismissed` (see Employment
  status); the two must never be conflated. "Active" for counters/dashboards excludes `low`.
- **Management note** — A free-form S7 record with two independent visibility flags (`visible for
  employee`, `visible for PM`), both off by default.
- **Feedback record** — An S8 record with a visibility flag (management only / shared with
  employee) authored by a manager or PP about an employee (spec §4.15; this PRD's §4.14). `[v1.5]`
  Joining-interview feedback is now itself an S8 feedback record gated by this same flag — it moved
  off S5, where it used to be a document the employee could always read. Records are listed
  chronologically and filterable by period; the v1.2 "comparison between periods" view is removed.
- **Career timeline event** — A system-generated (or manually backfilled) entry in an employee's
  S9 event log: joining, grade/position/department change, FTE↔subcontractor transition, extended
  leave, mentorship start/end (spec §4.9; this PRD's §4.10). `[v1.5]` Explicitly **not** a career-
  timeline event: departure/dismissal — that lives in Employment status only (see above), never
  duplicated here.
- **CDS (Career Development System)** — The S12 registry of a skills-matrix link, an assessment
  log, and an IDP per employee. The system does not perform assessments (spec §4.10; this PRD's
  §4.11). `[v1.5]` The department+position → matrix-file mapping keys off the **Department
  entity**, not a free-text department string.
- **IDP (Individual Development Plan)** — A single record (description, deadline, external link,
  complete checkbox) within CDS.
- **Mentorship pair** — A mentor–mentee relationship with a start date, and an end date + required
  closure note once ended (spec §4.11; this PRD's §4.12). `[v1.5, changed]` The closure note is a
  **field on the pair record itself**, not a Feedback record (S8) — readable by Reporting line,
  Project line, and PP only, never the mentor/mentee's ordinary S8 audience. The candidate/mentor
  pool for browsing is company-wide (identity-card data + the open-to-mentoring flag, never S13
  detail), but assigning a mentee stays scoped to the assigning manager/PP's own people. A person
  may clear their own open-to-mentoring flag while still holding an active mentee — existing pairs
  are untouched by that.
- **Resourcing request** — A vacancy-shaped record created by a DM/PM, optionally tied to a
  project, that specialists or external candidates are proposed against (spec §4.7; this PRD's
  §4.8). `[v1.5]` The vacancy **is** the request — it lives entirely in the platform, never in
  PeopleForce in either direction. Carries a **headcount** field (default 1; approving a candidate
  fills a slot) and a **department** (routes it to the responsible unit manager). Only the DM's
  explicit action closes a request — there is no auto-close on headcount reaching zero. An
  unattached (no project) request is normal and surfaces in an **Unassigned** bucket on the
  dashboard, included in all-projects counters. Carries an **expected compensation level**,
  visible only to the request's author, the routed UM, and the reviewing DM — never the PP, never
  on a profile, in a shared link, or in an export.
- **Employment status** — `[v1.5, new]` A time-bounded fact on the profile, values `active` /
  `dismissed`. A departure is recorded by HR with an effective date and reason; on that date the
  profile goes read-only (still filterable, dropped from the default list), open action items
  close as `cancelled — departed`, mentorship pairs auto-close with a system note bypassing the
  closure-note requirement, the account deactivates, and every derived access that person held
  ends immediately. Departure is blocked while the person still manages or partners anyone (the UI
  must prompt re-parenting first). Departure is **not** a career-timeline event — it lives in
  employment status only, and it is the platform's single definition of "departed" (analytics
  defines nothing of its own).
- **Candidate** — A person proposed for a resourcing request: either an internal Employee or an
  external PeopleForce candidate. Where the candidate is later hired, how their PeopleForce
  identity links to their resulting Employee record is an open cross-system identity-resolution
  question (spec §6; see Integration and Dependencies, Open Question 4).
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
of reports-to, department management, and project-assignment-to-PM/DM (`[v1.5]` three relations,
was two), distinguishing the resulting **Reporting line** from **Project line** since v1.5 narrows
the latter, and (b) the requester's functional-role permissions from stored, runtime-editable
grants — `[v1.5]` a write succeeds only where **both** the access role and, where applicable, a
specific stored permission grant allow it. No other feature may hardcode a role-name check in
place of calling this resolution. Realizes UJ-2, UJ-3, UJ-4, UJ-5, UJ-7.

**Functional Requirements:**

#### FR-1: Access-role resolution via transitive closure
The system can, for any (viewer, subject) pair, resolve the viewer's access role by computing the
transitive closure of "reports to," "manages the department the subject belongs to" `[v1.5, new
relation]`, and "is assigned to a project managed by." The first two form the **Reporting line**;
the third forms the **Project line**.

**Consequences (testable):**
- A manager two or more reporting levels above a subject is resolved as Manager (Reporting line),
  with no explicit grant required.
- A department manager is resolved as Manager (Reporting line) for everyone in that department and
  every sub-department beneath it, without needing to also be in the direct reports-to chain.
  `[v1.5]`
- A DM is resolved as Manager (Project line), at the same level as the subject's own department
  manager, for every person on any project the DM runs — but with the **narrowed** Project-line
  section set (§4.2, FR-6a), not the Reporting line's full set. `[v1.5]`
- A PM is resolved as Manager (Project line) for people on their own projects; the DM above them
  in the same project chain is also resolved as Manager (Project line) for the same people.
- The same requester resolves to different access roles — and, since v1.5, potentially different
  *lines* — for different subjects within the same session/request batch.

#### FR-2: Access role un-derives when the underlying relationship ends
**Consequences (testable):**
- `[v1.5, resolves prior Open Question 1]` When a project assignment end-dates in the timetracker
  feed, Manager (Project line) access derived solely from that assignment is not present in the
  next resolution no later than **15 minutes** after the change — an explicit access guarantee, not
  a best-effort target — degrading to a forced withdrawal within **4 hours** if the timetracker
  sync itself is failing (see FR-44). Any cache backing this resolution must invalidate within
  whichever bound applies.
- When an organisational-relationship edit happens inside the platform itself — a person's
  manager, people partner, department, or a department's manager (the four fields covered by the
  dedicated relationship-change screen, FR-2a) — the resulting Manager/PP-access change is
  reflected on the *very next request*. This is first-party data with no external-sync excuse for
  latency, so it does not share the timetracker-sync bounds above. A person who is no longer
  someone's manager must not resolve as Manager for them on the next request after the edit.

#### FR-2a: Organisational-relationship changes are a distinct, journaled operation `[v1.5, new]`
**Consequences (testable):**
- Changing a person's manager, people partner, or department, or changing a department's manager,
  is **not** an ordinary S1 field edit — it requires the dedicated "change organisational
  relationships" permission and goes through its own screen, distinct from general S1 write access.
- No self-assignment: a user cannot set themself as someone's manager/PP, nor assign themself to a
  department they don't already belong to, through this screen.
- Every such change writes a journal entry (who changed what, from what, to what, when) — this is
  one of the journal's six named event types (§3.4; see also FR-30a).

#### FR-3: Functional roles are runtime-editable data
**Consequences (testable):**
- HR Admin can create a new functional role, name it, and grant it any subset of the
  independently-grantable permissions without a deploy or schema change. `[v1.5]` The
  independently-grantable set has grown: create form campaigns, create action items, create/edit
  risks, create resourcing requests, fulfil resourcing requests, approve/reject resourcing
  candidates, close resourcing requests, assign mentors, maintain CDS records, edit the career
  timeline, create feedback, record a departure, manage departments, manage custom fields, change
  organisational relationships, view a given dashboard — all named explicitly in the changelog
  (§2.3). `[ASSUMPTION]` "Manage system dictionaries" is added to this set by analogy to HR
  Admin's config-only scope (§2.2); the changelog's explicit permission-growth list does not name
  it, so treat it as inferred, not confirmed, until the PO signs off. `[ASSUMPTION]` Default
  grants per role for the *new* permissions in this list are drafted by the team and pending PO
  confirmation before the roles screen ships (spec §2.3) — logged as a new item in §8.
- Assigning a person to a functional role, and revoking a permission from a role, both take
  effect for that person immediately — no caching of stale grants.
- HR Admin manages system dictionaries — reference data used across the platform rather than
  per-profile data (e.g. the department+position → CDS matrix-file mapping in FR-33; leave types;
  other lookup tables the team identifies during build) — through the same no-deploy,
  runtime-editable path as functional roles and custom field definitions.
- `[v1.5, changed — corrects a v1.2-era error]` HR Admin's grant is **config-only**: custom fields,
  system dictionaries, departments, and functional-role/permission management. It no longer
  includes "everything a PP has" — that bundling was true under v1.2 and is now false. An HR Admin
  who also needs standing profile data access must be separately granted **Full profile access**
  (FR-3a) — the two are independent as of v1.5.
- A functional role granted a permission never gains data access beyond what the holder's
  existing access role allows for a given subject (e.g. a Security Campaign Owner with no
  Manager/PP relationship over an audience still only sees that audience through the colleague
  view).

#### FR-3a: Full profile access is a separate, journaled grant `[v1.5, new]`
**Consequences (testable):**
- Only an existing Full-profile-access holder can grant it to someone else — no self-grant, and no
  granting it via the ordinary functional-role/permission UI.
- The first holder is seeded at deployment (a platform with zero holders at launch is a setup bug,
  not a valid state).
- An attempt to remove the last remaining holder is rejected server-side, the same way any other
  invalid-state-producing write is.
- Every grant (and, implicitly, every removal that isn't the blocked last-holder case) writes a
  journal entry.
- A Full-profile-access holder reads/writes every section for every profile, same as the matrix's
  RW-everywhere row — this is the mechanism, HR Admin is not.

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
  see S1. `[v1.5]` The manager, people-partner, and department *values* shown here are read-only
  through this surface — changing any of them is FR-2a's dedicated, journaled, permissioned
  operation, not an ordinary S1 write; a normal S1 edit request touching these three fields must be
  rejected server-side. `[ASSUMPTION, sharpened by v1.5 — see Open Question 5]` This still follows
  the broader S1-based reading of the matrix rather than spec §4.11's narrower "visible to manager
  line and PP" wording for mentor specifically. v1.5 makes the contradiction harder to resolve by
  implication, not easier: "manager line" as a single concept no longer exists (it's split into
  Reporting line and Project line), so whoever owns the spec needs to say whether mentor-in-header
  visibility follows Reporting line only, Project line only, both, or (this FR's current reading)
  every audience that can see S1 at all, including Colleague.

#### FR-5: S7 Management notes flag gating
**Consequences (testable):**
- A newly created management note has both `visible for employee` and `visible for PM` false
  unless explicitly set otherwise at creation — this must be verified as an actual default (e.g.
  a non-nullable, server-defaulted-false column), not merely asserted by tests that always set the
  flags explicitly and never exercise the true default.
- A note with both flags unset is invisible to the employee and to a PM in the project chain.
- UM, DM, and PP always have full read/write on notes for people they're responsible for,
  regardless of flag state. `[v1.5]` This is tied specifically to the **PM functional role**, not
  to "Project line" as a whole — a DM (also Project line) is unaffected by S7 flag-gating and keeps
  full RW like Reporting line/PP, even though DM's *other* sections are narrowed relative to
  Reporting line (FR-6a). Implement as "is specifically a PM," not "is Project line."
- Setting `visible for employee` on an existing note makes it appear in that employee's next S7
  read, with no other change to the record.
- Where a viewer reaches the same subject through more than one relationship path at once (e.g.
  they are PM on one of the subject's projects and simultaneously DM on another), the
  most-permissive resolved access wins for S7: if any path grants full UM/DM/PP-style RW, the
  viewer gets that, even though a different, less-permissive path (plain PM) also applies. S7
  access is never computed from an arbitrarily-chosen single path when multiple paths exist.
- `[v1.5]` This is one of **two** documented exceptions to "a Manager sees everything" (was one) —
  the other is FR-6a's Project-line narrowing below.

#### FR-6: Colleague view is a field whitelist
**Consequences (testable):**
- A colleague's profile read returns exactly S1, S10 (`[v1.5]` dates only — leave type is no
  longer colleague-visible), and S11 (project name only) — verified by asserting the response body
  has no keys outside that set, not by asserting UI elements are hidden.
- `[v1.5, new — see also FR-39a]` One narrow exception: a campaign author's read of their own
  campaign's recipient list carries name and completion status (from S14) for those recipients
  only — nothing else, and it ends the moment the campaign closes. Does not generalize to any other
  colleague-audience read.

#### FR-6a: Project line is narrower than Reporting line `[v1.5, new]`
**Consequences (testable):**
- A viewer resolved as Manager solely via project assignment (Project line: PM/DM of the subject's
  project, or above them in that management chain) gets `—` on S2 and S3 — enforced identically to
  any other `—` cell (FR-4) — and R-only on S5 limited to CV and certificates, not the full document
  set Reporting line sees.
- Every other section, including S6, is identical between Reporting line and Project line.
- A viewer who is simultaneously Reporting line (e.g. the subject's actual department manager) and
  Project line (e.g. also that subject's PM) for the same subject gets the Reporting line's
  unnarrowed access — the same most-permissive-path-wins principle FR-5 applies to S7.
  `[ASSUMPTION, new open question — §8]` The changelog states this precedent for S7 explicitly but
  doesn't say it generalizes to S2/S3/S5; a narrower-wins reading would mean a person's own
  hierarchical manager sees *less* about them for also being on their project, which would
  contradict the "Manager sees everything" default, so this FR assumes most-permissive-wins here
  too pending spec-owner confirmation.

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
  `[v1.5]` Clearing the open-to-mentoring flag is allowed even while holding an active mentee —
  existing pairs are untouched by that change.
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
- `[v1.5]` Unattached (no-project) requests surface in a dedicated **Unassigned** bucket alongside
  the per-project tables, and are included in the all-projects counters at the top of the page.

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
- Current level is the most recent record; full history is retained and readable by Reporting
  line/Project line/PP.
- `[v1.5]` Fixed severity order: `low` < `need attention` < `medium` < `high` < `leaver`, with
  `leaver` at the top of the same ordered scale, not a separate terminal/closed state — the level
  can move from any state to any other state, including back down to `low`. There is no way to
  "close" or "resolve" a risk record; a return to `low` is just another record.
  - `leaver` is a **prediction** the risk record makes, never the fact of departure — the fact is
    the employment-status value `dismissed` (new Employee Lifecycle feature, §4.17). The two must
    never be conflated in code, copy, or dashboards.
- `[v1.5]` "Active" for counters/filters/dashboards excludes `low` — a `low` risk record does not
  count toward any "active risks" figure.
- A trend arrow appears only when the level differs from the immediately preceding record; no
  arrow on the first record or an unchanged level.

#### FR-24: Risk Dashboard
**Consequences (testable):**
- Counts by level (medium/high/leaver visually emphasised; `[v1.5]` "active" counts exclude `low`);
  a table sorted by severity then date with trend arrows; filterable by unit/department/project/
  PP/manager; drill-through from a count to the filtered table and from a row to the profile.
- Scoped to people the viewer holds Manager (Reporting or Project line) or PP access over; never
  rendered for the employee themselves, under any access role the employee might otherwise hold
  for someone else.

---

### 4.8 Resourcing
**Description:** Request creation, fulfilment, and review across UM/DM/PM, plus PeopleForce
candidates. Realizes UJ-3. `[v1.5]` The vacancy **is** the resourcing request — it lives entirely
in the platform; there is no PeopleForce vacancy sync in either direction, reducing the PeopleForce
integration surface to a single candidate-prefill button (§4.16).

**Functional Requirements:**

#### FR-25: Request creation (DM/PM)
**Consequences (testable):**
- A request may exist unattached to a project — `[v1.5]` it then surfaces in the dashboard's
  Unassigned bucket (FR-18) — and carries a **department** field that routes it to the responsible
  unit manager, and a **headcount** (default 1). A DM's request list includes requests created by
  the PMs of their own projects.
- `[v1.5]` Carries an **expected compensation level**, visible only to the request's author, the
  routed UM, and the reviewing DM — never the PP, and never surfaced on a profile, in a shared
  link, or in an export, regardless of who could otherwise see compensation-adjacent fields.
- Available to DM/PM, and to any functional role granted the "create resourcing requests"
  permission (spec §2.3), scoped to that role's own access — same extensibility pattern as
  FR-20 (action items) and FR-39 (campaigns). A permission check here reads the requester's
  stored, runtime-editable grant, never a hardcoded "role == DM/PM" comparison.

#### FR-26: Request fulfilment (UM)
**Consequences (testable):**
- A UM sees requests assigned to them, can propose one or more internal specialists from their
  unit and/or attach an external PeopleForce candidate, and submits the set for DM approval.
- `[v1.5]` Every external candidate gets the PeopleForce candidate ID stored on the proposal
  unconditionally, whether or not the prefill/pull integration is live for this environment.
- Available to UM, and to any functional role granted the "fulfil resourcing requests" permission
  (spec §2.3), scoped to that role's own access — same extensibility pattern as FR-25.

#### FR-27: Request review and decision (DM)
**Consequences (testable):**
- For an internal candidate the DM doesn't yet hold access over, the profile link triggers a
  share — `[v1.5, changed]` but **not** the general FR-29/FR-30 share default. Resourcing
  auto-generates this share on request submission, naming the reviewing DM as recipient, valid
  until the request is decided, with its **own** evaluation-view section set: S1, S4, S11, S12, and
  S5 as CV+certificates; S6 optional; **never** S2, S3, S7, S8. This is a deliberate, narrower
  sub-case of profile sharing, not a contradiction of FR-29's general defaults — don't reuse FR-29's
  default-excluded-sections list here.
- For an external candidate, the link goes to pulled PeopleForce data (the single prefill-by-ID
  surface, §4.16), or — where that integration isn't complete — to an external PeopleForce link
  (spec-sanctioned fallback, spec §5.2).
- Each candidate decision (approve / reject-with-reason) is recorded, and requires the requester to
  hold the "approve or reject candidates" permission (spec §2.3) in addition to their Manager
  access role — `[v1.5]` a dual-gate check, per FR-3's two-dimension rule.
- `[v1.5]` Approving a candidate fills one headcount slot on the request; **only the DM's explicit
  close action ends a request** — there is no auto-close when headcount reaches zero.

#### FR-28: Request history (S15)
**Consequences (testable):**
- Every proposal attempt (proposed → approved/rejected, with feedback) appears both in
  Resourcing → Requests and in the candidate's own profile S15.
- Approval does not itself create a project record on the profile; the project appears on the
  profile only after the next timetracker sync reflects the assignment made there.

#### FR-28a: Request closure requires an explicit, permissioned DM action `[v1.5, new]`
**Consequences (testable):**
- A request stays open regardless of how many headcount slots are filled; it only moves to closed
  when a DM (or a functional role holding the new "close resourcing requests" permission, scoped to
  its own access) explicitly closes it.
- A closed request is no longer eligible for new candidate proposals; existing S15 history on
  already-decided candidates is unaffected.

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
- `[v1.5]` The recipient must be an **authenticated, explicitly named person at creation** — there
  is no anonymous "anyone with the link" mode. A link with no bound recipient identity is not a
  valid share.
- `[v1.5]` Every `cfg` section is off by default, not only the "sensitive" subset — S1 is the only
  section on by default. Sensitive sections (S2, S5, S6, S8) are still called out specifically
  since they require explicit per-share enabling even under a broader initial audience selection.
- `[v1.5]` **Never-share set: S3, S7, S13, S14** — none of these four can be included under any
  configuration (S14 is newly added to this hard list as of v1.5).

#### FR-30: Expiry, revocation, and access logging
**Consequences (testable):**
- Default expiry is 24 hours, configurable at creation; every access via the link is logged with
  timestamp and origin to the journal (§3.4).
- `[v1.5, changed]` The creator's own access is **re-checked on every view**, not just against the
  stated expiry — the link stops working the moment the creator's underlying Manager/PP
  relationship to the subject ends, even if the stated expiry hasn't passed yet.
- `[v1.5, changed]` Revocation rights follow **whoever currently holds** the relevant Manager/PP
  relationship to the subject, not necessarily the original creator — if the creator's own access
  has lapsed, the current relationship holder (or a Full-profile-access holder as backstop) can
  still revoke. A link must never exist that nobody currently has the rights to revoke.
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
  occurs — no separate manual step required for these six event types. `[v1.5]` Department change
  is explicit here as its own tracked change, not folded silently into "position change."
- `[v1.5, new — explicit exclusion]` **Departure/dismissal is not a career-timeline event.** It is
  recorded exclusively in employment status (§4.17); a departure must never also write a timeline
  entry, even though it's exactly the kind of state change the other five event types capture.

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
  edit required. `[v1.5]` The mapping keys off the **Department entity** (§4.17/Glossary), not a
  free-text department string — a department rename must not silently orphan the mapping the way a
  string-keyed lookup would.

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
- `[v1.5]` The mentor pool a manager/PP browses is **company-wide** — identity-card data plus the
  open-to-mentoring flag for everyone who's set it, regardless of the browsing manager's own
  Manager/PP relationship to them — and exposes nobody's S13 detail beyond the flag itself.
  **Mentee assignment stays scoped**: a manager/PP can only assign a mentee from people they
  actually hold Manager or PP access over, even though they can *see* the wider mentor pool.
- On the first pair's creation, the mentor's status changes from "open to mentoring" to
  "mentor" — a filterable field on All Employees.

#### FR-38: Ending a pair
**Consequences (testable):**
- `[v1.5, changed]` Ending a pair requires a **closure note** and is refused without it. The
  closure note is a **field on the pair record itself, not an S8 Feedback record** — readable by
  Reporting line, Project line, and PP only (never a general S8 audience). The end date is
  recorded, an end event is written to the career timeline, and the pair remains visible in history
  on both profiles.
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

#### FR-39a: Campaign-author colleague exception `[v1.5, new]`
**Consequences (testable):**
- A campaign author who otherwise holds only Colleague access over a recipient can still see that
  recipient's **name and completion status** in their own campaign's per-recipient table (FR-40) —
  the one documented exception to the colleague whitelist (§4.2, FR-6).
- Nothing else about that recipient is exposed through this path: no other S14 fields, no other
  section. The exception ends the moment the campaign closes — a closed campaign's author reverts
  to ordinary colleague-level visibility over past recipients.

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
- `[v1.5, changed]` Joining-interview feedback is created as an ordinary S8 feedback record gated
  by this same flag — it is no longer a static S5 document the employee could always read
  regardless of flag state (v1.2 behavior).
- `[v1.5]` Records are listed chronologically and are filterable by period; the v1.2
  "comparison between periods" view is removed and must not be built.

#### FR-42: Requesting feedback from named colleagues
**Consequences (testable):**
- A feedback request targeted at specific named individuals is implemented as a form campaign
  (§4.13) rather than a separate mechanism.

---

### 4.15 Internal Timetracker Integration
**Description:** Pulls leaves and project/PM/DM assignment; the latter is a direct input to
access-role resolution (§4.1), not just display. `[v1.5]` **This is now the only required
integration** — PeopleForce is good-to-have (§4.16). See `docs/integrations/timetracker.md` for
the research-in-progress record of API specifics.

**Functional Requirements:**

#### FR-43: Leave data sync into S10
**Consequences (testable):**
- Vacation/sick/parental/other leave types and dates surface on S10 per the section's access
  rules. `[v1.5, changed]` The **colleague** audience no longer sees the leave type — only the
  fact and dates of an absence; Self, Reporting line, Project line, and PP are unaffected and still
  see the type. `[v1.5]` Leave *balances* are removed from the platform entirely — self-service
  links out to the timetracker for balance information rather than displaying it here.

#### FR-44: Project/assignment sync feeding access resolution
**Consequences (testable):**
- A new project assignment (with its PM/DM) becomes an input to Manager-access resolution (§4.1).
  `[v1.5, resolves prior Open Question 1]` The sync-latency bound is no longer open: the change
  must be reflected within **15 minutes** under normal sync, stated as an explicit access
  guarantee, not a best-effort target.
- An ended assignment removes the derived access no later than that same 15-minute bound under
  normal sync; a stale sync must never leave ended access active past it (cross-references the
  cache-invalidation invariant in `.claude/rules/access-control-invariants.md`).
- `[v1.5, new]` If the timetracker sync itself is failing (not just a single assignment change, but
  the feed being down), project-derived access must be **forcibly withdrawn within 4 hours**
  regardless of last-known state — fail closed past that bound rather than leaving stale access
  active indefinitely behind the outage banner below.
- `[ASSUMPTION, still open]` Whether the Projects and people API delivers **events** (assignment
  created/ended) or only **state at sync time** (requiring the platform to diff snapshots itself)
  is not settled by the changelog — it explicitly calls this out as still-to-establish from the
  API documentation. This affects whether the 15-minute bound is achievable by polling alone.
  Tracked in `docs/integrations/timetracker.md`.

**Feature-specific NFRs:**
- `[v1.5, was open, now concrete]` A timetracker outage degrades to stale-but-labeled leave/project
  data behind a visible "unable to refresh" banner — it must never take down profile access or
  dashboard rendering (spec Section 7) — and, per FR-44, project-derived access is forcibly
  withdrawn no later than 4 hours into the outage regardless of what the last-known state showed.

---

### 4.16 PeopleForce Integration
**Description:** `[v1.5, changed]` **Good-to-have, not required** — the timetracker is the only
required integration (§4.15). Reduced from a general candidate/vacancy sync to a single feature:
a prefill-by-candidate-ID button on the resourcing candidate-proposal flow. **PeopleForce is no
longer the source of truth for vacancies at all** — the vacancy/resourcing-request entity lives
entirely in the platform (§4.8). See `docs/integrations/peopleforce.md` for the
research-in-progress record.

**Functional Requirements:**

#### FR-45: Candidate prefill by ID for resourcing `[v1.5, re-scoped]`
**Consequences (testable):**
- Given a PeopleForce candidate ID, a UM can trigger a prefill of the internal candidate-proposal
  record's fields from that candidate's PeopleForce data, with a **per-field preview and per-field
  confirmation** — a prefill never silently overwrites a field the user has already filled in.
- `[v1.5]` A fixed list of fields can **never** be prefilled from PeopleForce regardless of what
  the API returns: grade, seniority, employee type, department, manager, people partner, contract
  data, employment status, risk. These are either access-sensitive or platform-owned facts that
  must not be populated from a less-trusted external source.
- `[v1.5]` The PeopleForce candidate ID is stored on every external candidate **unconditionally**,
  whether or not this prefill button is implemented in a given environment — it's the anchor for
  whatever cross-system identity resolution gets decided later (§8, Open Question 4).
- Where the prefill button isn't implemented in time, the fallback is an external link to the
  candidate in PeopleForce — this is an explicitly spec-sanctioned degraded mode, not a defect,
  provided it's a deliberate, recorded decision (log to `docs/integrations/peopleforce.md`).
- `[v1.5]` No PeopleForce vacancy read or write path exists in either direction — do not build one.

**Feature-specific NFRs:**
- A PeopleForce outage or fallback-mode operation must not block request creation, fulfilment, or
  DM review/approval for internal candidates — the resourcing flow degrades per-candidate, not
  globally. `[v1.5]` Given the reduced scope (one button, good-to-have), a PeopleForce outage
  should never be able to block resourcing at all — worst case is the prefill button being
  temporarily unavailable, falling back to manual entry or the external-link mode.

---

### 4.17 Employee Lifecycle and Departure `[v1.5, entirely new feature — not in v1.2]`
**Description:** Employment status as a time-bounded fact on the profile, and the departure flow
that transitions it. This is net-new scope introduced by the v1.5 changelog, not a v1.2 feature
being amended — it did not exist in this PRD before this revision. Realizes UJ-7.

**Functional Requirements:**

#### FR-46: Employment status is a time-bounded fact
**Consequences (testable):**
- Every profile carries an employment status (`active` / `dismissed`) as a time-bounded record,
  modeled the same way as grade/position/department (§4.10 Notes) — a query for "was this person
  active on date X" needs a real answer, not a replay of a change log.
- `leaver` (a risk-record prediction, FR-23) and `dismissed` (this fact) are never conflated in
  code, copy, or any dashboard — a `leaver` risk level does not imply `dismissed` status and vice
  versa.

#### FR-47: Departure recording and effects
**Consequences (testable):**
- HR (holding the "record a departure" permission, spec §2.3) records a departure with an
  effective date and a reason.
- Departure is **blocked** while the person still manages anyone or is anyone's assigned People
  Partner — the UI prompts re-parenting those relationships (FR-2a) before the departure can be
  recorded, rather than silently orphaning reports/partnered people.
- On the effective date, all of the following happen together: the profile becomes read-only;
  the person drops out of the default All Employees list but remains findable via an explicit
  filter; every open action item they're assigned closes as `cancelled — departed`; every active
  mentorship pair involving them auto-closes with a system-generated closure note, bypassing the
  ordinary closure-note requirement (FR-38); their account deactivates; and **every derived access
  they held over anyone else ends immediately** (this is the same immediate-revocation guarantee
  FR-2's platform-owned-relationship case already requires, applied to the departing person's own
  held access rather than access over them).
- Departure is **not** a career-timeline event (FR-31) — it is visible exclusively through
  employment status.
- This is the platform's single definition of "departed" — Analytics (§4.14, if built) must derive
  its own joiner/leaver figures from employment status rather than maintaining a parallel
  definition.

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
- `[v1.5]` No SSO, no Active Directory integration, and no employee-creation/provisioning flow —
  authentication is a first-party implementation over a seeded population delivered 2026-08-26
  (see `docs/integrations/timetracker.md`). This sharpens, not contradicts, the existing
  pre-onboarding non-goal above: there is no path for creating a person in this system at all this
  iteration, before or after their first day.

## 6. MVP Scope

**Target delivery: 2026-09-08** — the full platform described in this PRD is scoped to a 2-week
build window. This date is the constraint behind every cut in §6.2 and behind R-1 in the Risk
Register; if it slips, the cut order in R-1 (DESIGN FREEDOM scope first, NORMATIVE scope never)
still applies.

### 6.1 In Scope

- Everything in §4.1 through §4.14 (two-dimensional role resolution through Feedback), plus the
  entirely new `[v1.5]` **§4.17 Employee Lifecycle and Departure** — these correspond to spec
  sections marked [NORMATIVE] or [DESIGN FREEDOM], none of which are optional for this iteration.
- `[v1.5, re-scoped]` §4.15 Internal Timetracker Integration is **required** — it's the platform's
  only mandatory external integration now, run against the seeded population's test environment.
  §4.16 PeopleForce Integration is **good-to-have**, reduced to the single prefill-by-ID button —
  the external-link fallback (FR-45) is an acceptable in-scope outcome, not a cut feature, if even
  that button isn't ready in time. This is a genuine scope *reduction* from v1.2, not an addition.
- Automated access-control test coverage per audience/relationship-path/section (spec §9 DoD) —
  `[v1.5]` now explicitly including negative tests for the narrowed Project-line cells, journaled
  organisational-relationship changes, and named-recipient share revocation (the changelog's own
  DoD additions) — this is in scope as a deliverable in its own right, not incidental to feature
  work.

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
  relationship path × every section, including every `—` cell, S7 unflagged cases, the narrowed
  Project-line cells, and the colleague whitelist) have an automated test asserting the API-level
  behavior, per spec §9 DoD. `[v1.5]` Now also covers: dual-gate (access-role + permission) tests
  for permission-scoped actions; journaled organisational-relationship changes; named-recipient
  share revocation and re-check-on-view. Validates FR-1 through FR-7, FR-2a, FR-6a, FR-16 through
  FR-19, FR-29–30, FR-39a.
- **SM-2**: Real integration — `[v1.5, re-scoped]` the timetracker integration runs against the
  real test-environment API over the seeded population by delivery (the platform's only *required*
  integration as of v1.5). PeopleForce's prefill button runs against the real API if time allows,
  or an explicitly recorded and justified fallback to the external-link mode — no longer a
  co-equal requirement with the timetracker. Validates FR-43–45.
- **SM-3**: Process quality — the intelligent repository (specs, decisions, rules, skills) stays
  in sync with shipped behavior at delivery, and the team demonstrably worked in parallel across
  the 2-week window without a documented blocking dependency (spec §1, §8).

**Secondary**
- **SM-4**: All Employees list performance — p95 response time ≤ 2 seconds at 500+ records with
  an arbitrary filter/derived-field combination, including permission resolution (spec §7).
  Validates FR-8, feature-specific NFR under §4.3.
- **SM-5**: Resourcing cycle time — median time from request creation to a candidate decision
  (approve/reject), tracked from delivery onward as a baseline rather than a v1 target (no prior
  baseline exists to compare against). Validates FR-25–28, FR-28a.

**Counter-metrics (do not optimize)**
- **SM-C1**: Test-count vanity — counterbalances SM-1. A high count of access-control tests that
  don't actually assert API response shape (i.e., only assert UI hiding) does not count toward
  SM-1; `access-control-reviewer` explicitly checks for this failure mode.
- **SM-C2**: Feature velocity at the expense of process — counterbalances any temptation to treat
  SM-3 as secondary to shipped feature count, per spec §1's explicit priority order (process wins
  where the two conflict).

## 8. Open Questions

1. ~~What is the acceptable sync-latency bound between a timetracker project-assignment change and
   that change being reflected in access resolution?~~ **RESOLVED by the v1.5 changelog**: 15
   minutes under normal sync, forced withdrawal within 4 hours if sync itself is failing (FR-2,
   FR-44). Number kept as item 1, marked resolved rather than deleted, so cross-references elsewhere
   in this document ("Open Question 1") stay valid.
2. ~~Decision-logging approach for Teams calls (ADR-in-repo vs. Jira vs. both)~~ **RESOLVED**:
   both. Every decision still gets a `docs/decisions/` ADR (the repo-native record SM-3's
   "process quality" evidence is graded against), and is also logged/linked in the team's Jira
   project for day-to-day visibility — see `.claude/agents/meeting-notes-specialist.md`. **Still
   open**: the specific Jira site/project this points to hasn't been confirmed yet; until it is,
   the Jira half of a decision record stays a `pending` placeholder rather than a real link.
   Unaffected by the v1.5 changelog.
3. Real pain points with the current internal system being replaced are not yet known firsthand —
   the problem framing in §1 Vision is derived from the spec's stated functional gaps rather than
   direct user complaints. Worth a short conversation with actual HR/manager users if time
   allows, to sharpen §1 and the dashboard "what matters most" prioritization within the
   [DESIGN FREEDOM] widget list. Unaffected by the v1.5 changelog.
4. `[v1.5, narrowed]` How is identity resolved across PeopleForce candidate, employee, and
   timetracker user records (spec §6)? Email alone is spec-flagged as insufficient. **Partially
   answered**: the PeopleForce candidate ID is now stored on every external candidate
   unconditionally (FR-45/FR-26), giving a concrete anchor for the candidate side. **Still open**:
   how a hired candidate's stored PeopleForce ID links forward to their eventual employee record,
   and how an employee identity maps to their timetracker user. Pending research in
   `docs/integrations/timetracker.md` and `docs/integrations/peopleforce.md`.
5. `[v1.5, sharpened, not resolved]` **Mentor visibility to Colleagues — spec self-contradiction,
   now harder to resolve.** Spec §3.2/§3.3 (the S1 row and the "a colleague sees exactly S1..."
   rule) implies a Colleague sees the mentor, since mentor is listed as S1 content and Colleague is
   R on the whole section. But spec §4.11 separately states the mentor is "visible to manager line
   and PP" in the profile header — narrower, excluding Colleague. FR-4 currently follows the
   broader (S1) reading: `[ASSUMPTION]` flagged there and in §9. The v1.5 changelog doesn't touch
   this contradiction directly, but it retires "manager line" as a single concept (splitting it into
   Reporting line/Project line) — so whoever owns the spec now needs to say not just "S1 or §4.11,"
   but, if §4.11's narrower intent wins, *which* line(s) plus PP get to see the mentor.
6. `[v1.5, new]` **Reporting-line vs. Project-line precedence when both apply (FR-6a).** S7 has an
   explicit most-permissive-path-wins rule for a viewer who reaches a subject through more than one
   relationship. The changelog doesn't say whether the same rule generalizes to the Project line's
   *other* narrowed sections (S2/S3/S5) — e.g. does a person's actual department manager who is
   also a PM on one of their projects get the Reporting line's full view, or does the narrower path
   somehow apply? FR-6a currently assumes most-permissive-wins by analogy to S7; needs spec-owner
   confirmation.
7. `[v1.5, new]` **Events vs. state-at-sync-time for the timetracker Projects API (FR-44).** The
   changelog explicitly flags this as still-to-establish from the API documentation — it determines
   whether the 15-minute revocation guarantee is achievable by polling alone or needs a push/event
   feed. Tracked in `docs/integrations/timetracker.md`.
8. `[v1.5, new]` **Default permission grants for the expanded permission list (FR-3).** The
   changelog states defaults are "drafted by each team and confirmed by the PO" before the roles
   screen ships — this is a pending team/PO decision, not a spec ambiguity, but it blocks FR-3's
   roles screen from being considered done until confirmed.

## 9. Assumptions Index

- §2.3 UJ-1 through UJ-7 — drafted from role definitions, not confirmed real scenarios.
- ~~§4.1 FR-2 — cache/sync invalidation bound left unspecified~~ **RESOLVED (v1.5)**: 15
  min/4h bounds are now spec fact, not an assumption; removed from this index.
- §4.2 FR-4 — mentor visible to Colleague per the broader S1 reading, conflicting with spec
  §4.11's narrower wording; logged as Open Question 5 (`[v1.5]` sharpened, not resolved).
- §4.2 FR-6a — most-permissive-path-wins assumed to generalize from S7 to the Project line's
  S2/S3/S5 narrowing when Reporting line and Project line both apply to the same subject; logged
  as Open Question 6. `[v1.5, new]`
- ~~§4.15 FR-44 — sync latency bound for project-assignment access resolution~~ **RESOLVED (v1.5)**,
  see above; the one still-genuinely-open sub-question (events vs. state-at-sync-time for the
  Projects API) is Open Question 7, not an assumption this PRD is making.
- §4.1 FR-3 — default permission grants for the v1.5-expanded permission list are drafted pending
  PO confirmation, logged as Open Question 8. `[v1.5, new]`
- Cross-Cutting NFRs, Accessibility — WCAG 2.1 AA assumed as the reference standard since the spec
  names no specific level. Untouched by the v1.5 changelog.
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
- **R-2: Real integration risk (PeopleForce).** `[v1.5, downgraded]` API auth/rate-limit/data-shape
  unknowns could still consume time, but the changelog's scope reduction (good-to-have, one
  prefill-by-ID button, no vacancy sync) shrinks this risk's ceiling substantially compared to the
  v1.2 general-candidate-sync scope. *Mitigation:* the spec explicitly sanctions the external-link
  fallback (FR-45) — timebox investigation and fall back deliberately rather than late; given the
  reduced scope, this should rarely need to consume the full timebox.
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
- **Availability:** External integration failures degrade gracefully and never take down the
  application (spec §7) — see feature-specific NFRs under §4.15–4.16 for what "degrade gracefully"
  means per integration. `[v1.5]` The timetracker is the required integration and carries the
  concrete 15-min/4h access-timing bounds (FR-44); PeopleForce is good-to-have and, given its
  reduced one-button scope, should never be able to block resourcing at all (FR-45).
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
  dependency (see FR-44, R-3). `[v1.5]` This is now the platform's **only required** integration,
  run against the seeded population's test environment. Tracked in
  `docs/integrations/timetracker.md`.
- **PeopleForce** — `[v1.5, changed]` candidate data for a single resourcing prefill button; **no
  longer a source of vacancy data in any direction** (the vacancy/resourcing-request entity lives
  entirely in the platform, §4.8). Good-to-have, not required. Tracked in
  `docs/integrations/peopleforce.md`; external-link fallback explicitly sanctioned if even the
  prefill button isn't ready (R-2).
- **The journal** — `[v1.5, new]` a narrow, purpose-built log (spec §3.4), not an external
  dependency but load-bearing infrastructure most other features now write to: organisational
  relationship changes, Full profile access grants, and shared-link accesses. Any feature touching
  those six event types depends on this existing and being written to correctly.
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
This is why §4.1/§4.2 (access resolution) and §4.15 (the real, required timetracker integration)
are treated as equally load-bearing as any user-facing feature in this PRD, not as backend
plumbing beneath the "real" product. `[v1.5]` §4.16 PeopleForce no longer carries that same weight
— its scope reduction to a single good-to-have button reflects the spec owner's own judgment that
it isn't where this iteration's real risk lives; the timetracker is.
