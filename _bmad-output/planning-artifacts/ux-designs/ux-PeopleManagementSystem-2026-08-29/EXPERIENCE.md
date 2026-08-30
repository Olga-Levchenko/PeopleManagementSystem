---
name: People Management Platform
status: final
sources:
  - "{planning_artifacts}/prds/prd-PeopleManagementSystem-2026-08-25/prd.md"
  - "{planning_artifacts}/architecture/architecture-PeopleManagementSystem-2026-08-25/ARCHITECTURE-SPINE.md"
  - "{planning_artifacts}/epics.md"
  - "docs/requirements/project-requirements.md"
  - "docs/requirements/Spec_Changelog_v1.2_to_v1.5.md"
  - "imports/requirements-v1.5-full.md"
updated: 2026-08-29
---

# People Management Platform — Experience Spine

> DESIGN.md is the visual identity reference; this spine owns behavior, states, interactions,
> accessibility, and journeys. Both spines win on conflict with any mock, wireframe, or import —
> the four HTML mocks in `mockups/` illustrate, they do not amend, this contract.

## Foundation

Responsive web, single surface — no native app, no other platform. Desktop gets a collapsible
sidebar (in-flow, animates width); mobile (`< md`, Tailwind's 768px breakpoint, matching the
already-built `SideMenu`) gets an off-canvas drawer with a backdrop, triggered from the header.
Built on shadcn/ui (`radix-nova` style) on React 19 + Vite + Tailwind v4 — the component library
does most of the structural work; this spine specifies the product-specific behavioral layer on
top (severity, status, section-level access rendering, journal, shared links) that a generic
component library has no opinion about. `DESIGN.md` is the visual identity reference for every
token named here.

The frontend talks only to the BFF (per architecture AD-5) — it never calls a domain service
directly, and no domain rule is allowed to leak into this layer. That matters for this spine
specifically: a section the viewer can't access must never even be requested, let alone rendered
and hidden — the BFF simply doesn't return it.

No authentication exists in the current scaffold. Every journey below assumes it exists; wiring
it is out of this spine's scope (see `.claude/agents/identity-access-engineer.md` /
`ARCHITECTURE-SPINE.md` AD-5).

## Information Architecture

| Surface | Reached from | Purpose |
|---|---|---|
| Home | Sidebar (always first item) | Personalized landing: open action items, upcoming leave, nothing about anyone else. Currently a static placeholder — becoming personalized is in scope. |
| Employee Profile | Sidebar search / All Employees row click / dashboard links / "my profile" | The one profile page for everyone. Same component renders Self, Reporting-line, Project-line, PP, Colleague, Shared-link, and Full-access views — the *sections rendered* differ per resolved access role, not the page. |
| All Employees | Sidebar | Tabular list; manager mode (full filter/column set, saved views, export, inline edit) and colleague mode (whitelist columns only) are the same surface, not two pages. |
| Unit Manager Dashboard | Sidebar (UM only) | Grouped by people. Summary counters, team table, own action items. |
| Delivery/Project Manager Dashboard | Sidebar (DM/PM only) | Grouped by project, with an Unassigned bucket. Project selector filters the whole page and its counters. |
| People Partner Dashboard | Sidebar (PP only) | Same shape as UM/DM, groupable by department/project, no resourcing block. |
| Risk Dashboard | Sidebar (Manager-line/PP only) | Counts by severity, sortable/filterable table, drill-through to profile. Never reachable by an employee. |
| Resourcing | Sidebar (UM/DM/PM + granted roles) | Request list, request detail (creation, fulfilment, review/approve/reject, explicit close). |
| Shared-link evaluation view | External link (email/URL), not in the sidebar | A scoped, non-navigable render of one profile for a named authenticated recipient. Not the same component tree as the normal profile page — a strict subset, server-enforced. |
| Administration | Sidebar (HR Admin only) | Functional roles + permission grants + role assignment, custom field definitions, department management. Zero profile-data surfaces reachable from here. |
| Mentorship Hub (pool view) | Sidebar or dashboard link (Manager-line/PP with the assign-and-end-mentorships permission) | Company-wide pool of people flagged open-to-mentoring; not reachable by a plain colleague. |

Every surface above is reached differently for different audiences, but none of them special-cases
identity in the frontend — access role resolution happens server-side, per request, per section, so
the same route can legitimately render different section sets for two different people without the
frontend knowing why.

## Voice and Tone

(Brand voice lives in DESIGN.md → Brand & Style; this section is the behavioral application of it
to copy.)

- Direct, factual labels — "Risk level: High," not "⚠️ Uh-oh, this person might be a flight risk!"
  Even at the most severe level, copy stays clinical, because this is describing a real person's
  situation to the people responsible for them.
- No urgency-manufacturing language ("Act now!", countdown framing) anywhere, including overdue
  action items — "Overdue by 3 days" states a fact; it doesn't perform alarm.
- Empty states describe what's true, rather than apologizing for what's missing — "No risk records
  for this person" rather than "Oops, nothing here yet!"
- Confirmation copy for irreversible or access-changing actions (recording a departure, revoking a
  shared link, changing a manager) states the consequence plainly: "This ends their access
  immediately and cannot be undone from here," not a generic "Are you sure?"

## Component Patterns

(Visual specs live in DESIGN.md → Components; this section is the behavioral delta.)

- **SeverityBadge** — display-only, never itself interactive (clicking it doesn't open anything;
  the row it's in does). Trend arrow renders only when the current record's level differs from the
  immediately preceding one — no arrow on a first record or an unchanged level, per spec.
- **StatusPill** — display-only. The *overdue* variant is computed client-side from a due date vs.
  now, not a stored status value, so it stays correct without a write.
- **FlagIndicator** — editable only by holders of RW on that S7 record (reporting line, DM, PP);
  read-only display for a PM who can see the record at all (the one case where "can see" and "can
  edit" genuinely diverge on the same component). Accessible name states the flag itself —
  "Visible for employee: Off" — never a bare toggle with no textual state; this gates real
  access-control information, so a screen-reader user losing the visual color/position signal must
  not also lose which flag is which.
- **Button** — stock shadcn, no behavioral delta from the library defaults.
- **Section omission** — the universal pattern underlying every profile render: a section the
  viewer has no access to is not present in the DOM, not disabled, not blurred, not behind a lock
  icon. The layout itself reflows around its absence. This is the single most load-bearing
  behavioral rule in the whole spine — every other access-control requirement is a variation on it.
  Same mechanic as State Patterns' "Permission-adjacent absence," below, applied specifically to
  profile sections rather than filters/features generally.
  Mockup: [`mockups/key-employee-profile.html`](mockups/key-employee-profile.html) — same profile,
  same URL, Self vs Colleague side by side.

## State Patterns

- **Empty** — "no risk records," "no open action items," "no one on this team flagged open to
  mentoring." Stated factually per Voice and Tone above.
- **Cold-load** — skeleton rows on the dashboards and All Employees (data-dense, worth a proper
  loading skeleton over a spinner); a profile page cold-loads section-by-section since sections can
  resolve at different speeds server-side.
- **Stale-integration banner** — when the timetracker sync is degraded, a visible (not decorative)
  banner states the data isn't fresh, per the spec's explicit requirement that this can't be a
  quiet failure. Escalates in tone once the 4-hour forced-withdrawal threshold is crossed and
  project-derived access actually starts being pulled.
- **Focus / keyboard** — every interactive element has a visible focus ring using the `ring` token;
  the sidebar toggle, mobile hamburger, and filter builder are all keyboard-operable, not
  mouse-only.
- **Permission-adjacent absence** — deliberately *not* an error state. A missing mentor-pool filter
  in colleague mode, a missing S6 section on a colleague's profile — these render as if the
  capability simply doesn't exist, because for that viewer it doesn't. No "you don't have
  permission" message anywhere in the product; that message would itself leak that the section
  exists. Same mechanic as Component Patterns' "Section omission," above — this is that pattern's
  general form, covering filters and features as well as profile sections.
- **Offline / request failure** — a failed write (e.g., approving a candidate) surfaces inline at
  the point of action, not a global toast that loses context.
- **Dark mode** — CSS variables exist and are correct (see DESIGN.md), but no toggle is wired yet.
  Not a state this pass designs interaction for; noted so it isn't silently forgotten.

## Interaction Primitives

- **Sidebar**: desktop collapse/expand (persisted to localStorage), mobile off-canvas drawer with
  backdrop-dismiss. Already built.
- **Inline editing** (All Employees): a cell writes through to the profile field on blur/confirm,
  subject to the same section access rules as the profile page itself. Manager, PP, and department
  fields are never inline-editable anywhere — they only ever change through the dedicated
  organizational-relationship screen (2.1), never as a side effect of a general edit. The write
  confirmation is announced via an `aria-live` region, not a purely visual checkmark/flash — a
  screen-reader user editing a cell needs the same "it saved" signal a sighted user gets from the
  flash.
- **Sortable columns** (All Employees, Risk Dashboard): sort state is exposed via `aria-sort` on
  the column header, not just a visual arrow glyph.
- **Filter builder** (All Employees + campaign audience selection): build → preview resulting count
  → confirm. The exact same builder both surfaces use, since 4.12 explicitly reuses the All
  Employees filter engine for campaign audiences rather than inventing a second one.
  Custom-field-backed filters respect that field's own visibility — a filter option a viewer
  couldn't otherwise see the value of is not offered, closing the range-search inference gap the
  spec calls out explicitly.
- **Saved views**: named tab, owned by creator, optionally shared to other managers.
  Filter+column configuration only — not a separate access grant.
- **Approve / Reject** (resourcing): reject requires a written reason (spec: "rejects it with a
  written reason"); approve does not fill and auto-close the request — closing is always a
  separate, explicit action.
- **Re-parent flow** (departure recording, when the departing person manages others): a blocking
  step before departure can proceed, one-click default (their own manager) per report, with the
  ability to override any individual report to a different manager before confirming.
- **Flag toggles** (S7): two independent, separately-labeled toggles, both defaulting off,
  requiring no confirmation to flip (they're not destructive — but see Voice and Tone for
  departure/revocation actions, which do require confirmation).

## Accessibility Floor

- Color is never the only signal — severity and status always pair a token color with a text
  label (see DESIGN.md).
- Icon-only controls (sidebar toggle, mobile hamburger, "mark complete" checkmark) carry an
  accessible name via `aria-label`, not just a Lucide icon.
- Full keyboard operability for every primitive above — no mouse-only interaction anywhere,
  including the filter builder and re-parent flow.
- Focus is never trapped except intentionally in modals (re-parent flow, confirmation dialogs),
  and always returns to the triggering element on close.
- Functional motion (sidebar width transition, mobile drawer slide-in) collapses to instant or
  near-instant under `prefers-reduced-motion: reduce`. DESIGN.md's ban on *decorative* motion is a
  separate claim from respecting this — both apply.
- Contrast: `severity-attention` and `severity-medium` (the two lightest ramp steps) need an
  explicit AA contrast check against `background` once implemented — light-on-light is the most
  likely accessibility miss in a green-through-purple ramp built for both light and dark mode.
- Translation-key discipline (i18next, English-only today) is itself an accessibility/i18n-readiness
  concern: no hardcoded user-facing string anywhere, so a future locale is an addition, not a
  rewrite.

## Responsive & Platform

Two breakpoints in practice: mobile (`< md`, drawer navigation, dashboards stack to single-column
tables) and desktop (`>= md`, persistent sidebar, dashboards can show side-by-side counters). No
tablet-specific layout — it inherits whichever breakpoint it falls into. Dense tables (All
Employees, Risk Dashboard) are the layout's hardest case on mobile; they get horizontal scroll
within their own container rather than forcing the whole page to scroll sideways, matching the
platform's existing container-scroll discipline elsewhere.

## Key Flows

### 1. Employee self-service — Chidi

Protagonist: **Chidi**, .NET Developer, distributed team (Tbilisi).

1. Opens the app before standup. Home shows their actual day — 2 open action items (one overdue),
   upcoming leave — not a static welcome message.
2. Completes an IT-sent security-training campaign task, marks the action item done.
3. Just moved apartments — updates personal contacts (S2) and emergency contact (S3) directly on
   their own profile, same page as anyone's, elevated write rights because it's theirs.
4. Checks CDS/IDP (S12): deadline in 3 days, genuinely not done. Reviews the linked external doc
   but doesn't falsely tick complete.
5. Glances at leaves (S10, read-only, links out to the timetracker).
6. **Climax:** flips their own "open to mentoring" flag on (S13) — a real decision, made
   unprompted, that quietly adds them to a company-wide pool a manager or PP will discover later.

**Failure path**: if the security-training link is broken or the external form fails to load, the
action item stays open and overdue — the platform never marks it complete on Chidi's behalf, since
completion is an explicit user signal, not an inferred one.

Mockup: [`mockups/key-employee-profile.html`](mockups/key-employee-profile.html) (left pane, Self view).

### 2. Unit Manager fulfilling a resourcing request — Olena

Protagonist: **Olena**, Unit Manager, Engineering management.

1. Opens her UM dashboard, sees 1 unfulfilled request routed to her department.
2. Reviews her own department's people (cannot borrow from another unit) and proposes an internal
   specialist.
3. Submits the candidate for DM approval.
4. **Climax, invisible to her:** submitting silently generates a shared link scoped to the
   evaluation view (S1, S4, S11, S12, S5-CV/certs-only — never S2, S3, S7, S8), naming the
   reviewing DM, because that DM has no other access path to this person. The link's lifetime is
   bound to the request, not a fixed clock.

**Failure path**: if Olena tries to propose someone outside her department, the fulfilment UI
doesn't offer them as a candidate at all — this isn't a validation error to recover from, it's a
scope the UI never presents.

### 3. Delivery Manager reviewing and closing — Diana

Protagonist: **Diana**, Delivery Manager, the request's original creator.

1. Sees her request's state change to "candidate proposed."
2. Opens it — renders the shared-link evaluation view, not the normal profile, since she has no
   other access to this person yet.
3. **Climax:** reaches for a risk indicator out of habit and it's simply absent — Olena's call
   whether to enable S6 on this link, not hers; the empty state here needs deliberate design, not
   an accidental "looks broken" gap.
4. Approves — fills 1/1 headcount, does not auto-close.
5. Explicitly closes the request as its own action — that's what writes the S15 history entry on
   both sides and kills the shared link immediately.

**Failure path**: if Diana rejects instead, she must supply a written reason before the rejection
submits — there's no reject-with-no-reason path.

Mockup: [`mockups/key-dm-dashboard.html`](mockups/key-dm-dashboard.html) — project selector,
per-project tables, Unassigned bucket with this exact request in "pending review" state.

### 4. People Partner offboarding — Oleh

Protagonist: **Oleh**, Developer by title, People Partner by assigned functional role — the two are
independent.

1. Opens his PP dashboard (same shape as UM/DM, no resourcing block).
2. Adds a feedback record about an exit conversation.
3. Attempts to record a departure.
4. **Climax:** blocked — the departing person manages 3 direct reports, and departure can't
   proceed until they're re-parented. Accepts the one-click default (the departing manager's own
   manager) for two, manually overrides the third to a different lead.
5. Resubmits. The departure cascades automatically: profile read-only, drops from the default list
   (stays filterable), open action items cancel as "departed," an active mentorship pair auto-ends
   with a system-generated closure note bypassing the normal mandatory-note gate, account
   deactivates, all access ends immediately.
6. It's already in the relationship journal without Oleh doing anything extra.

**Failure path**: attempting to record the departure without resolving the re-parent step re-blocks
with the same prompt — there's no partial/silent departure state.

### 5. HR Admin standing up an extensible role — Anton

Protagonist: **Anton**, Head of IT, holds HR Admin (administration only, zero data access on its
own).

1. Opens Administration → Functional roles.
2. Creates a new functional role, "IT Campaign Creator."
3. Grants it exactly one permission: create form campaigns.
4. **Climax:** almost also grants "view resourcing dashboard" out of habit, catches himself, and
   unchecks it — a new role must never widen data access, only unlock a feature.
5. Assigns a colleague to the role (no deploy). That colleague can now create campaigns but still
   sees recipients only through the plain colleague view, except their own campaign's status once
   it's live.
6. Verifies HR Admin grants him nothing either — opens a colleague's profile, gets the plain
   colleague view, same as anyone.
7. Defines a custom field ("GitHub handle") that's immediately usable as a filter/column, no
   migration.

**Failure path**: if Anton tries to grant a data-access-adjacent permission that doesn't exist in
the fixed permission list (2.3's enumerated set), the UI simply doesn't offer it — the permission
catalog is closed, not free text.

### 6. Risk and management notes — Viktor, then Dmytro

Protagonist A: **Viktor**, Engineering Director, reporting line, multi-level (sees this person via
transitive closure, no explicit grant). Protagonist B: **Dmytro**, Project Manager, project line on
the same project.

1. Viktor opens the Risk Dashboard, sees a risk move medium → high, adds the record.
2. Writes a management note flagged visible-for-PM but not visible-for-employee.
3. **Climax:** almost flags it visible-for-employee too, out of a transparency instinct, then
   stops — the note is raw and premature to surface before an actual conversation, and both flags
   default closed for exactly this reason.
4. Later, Dmytro opens the same profile: S6 risk stays fully RW for him (project line only narrows
   S2/S3/S5-CV, never S6) — he sees the *high* flag.
5. S7 is where he actually differs from a DM: read-only, and only the note flagged visible-for-PM.
6. The employee sees neither the risk nor the note.

**Failure path**: if Viktor sets neither S7 flag, the note is invisible to both the employee and
any PM — silence is the safe default, not an oversight to correct.

Mockup: [`mockups/key-risk-dashboard.html`](mockups/key-risk-dashboard.html) — SeverityBadge in
context, trend arrows, severity-emphasized counters.

### 7. Colleague browsing — Vagif

Protagonist: **Vagif**, plain colleague to almost everyone.

1. Wants a mentor, tries to filter All Employees by "open to mentoring."
2. **Climax:** the filter isn't there — not disabled, genuinely absent, because S13 is fully closed
   to colleagues (4.11 gates the mentor pool behind a manager-line/PP permission). His real next
   step is asking his PP.
3. Browses colleague-mode All Employees instead (whitelist columns: S1, leave dates with no type,
   project name).
4. Opens Chidi's profile from Flow 1 — sees exactly the whitelist: "away Aug 12–19" with no leave
   type visible anywhere, project name only, nothing else rendered because nothing else is in the
   response.

**Failure path**: none distinct from the base case — the absence of the mentorship filter *is* the
correct behavior, not an error state to design around.

Mockup: [`mockups/key-all-employees.html`](mockups/key-all-employees.html) — manager mode vs
colleague mode, same page, different column/filter sets.

Mockup: [`mockups/key-all-employees.html`](mockups/key-all-employees.html) — manager mode vs
colleague mode, same page, different column/filter sets.
