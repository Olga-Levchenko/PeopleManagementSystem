# Access control invariants

Access control is the primary graded quality attribute (spec Section 7). These invariants come
directly from `docs/requirements/project-requirements.md` Sections 2 and 3, which are
[NORMATIVE] — do not redesign them. Any change touching profile sections, role resolution,
permission checks, or resourcing/profile-sharing flows must be checked against
`docs/access-control/section-matrix.md` and the rules below before it is considered done.

## Two independent dimensions — never collapse them

- **Access roles** (Employee, Manager, People Partner) answer "what data can this person see
  about that person." They are **derived from relationships**, never stored, never assigned.
- **Functional roles** (Unit Manager, DM, PM, PP, HR Admin, and any custom role created later)
  answer "what features does this person get." They are **assigned, stored data**, extensible at
  runtime by HR Admin with no deploy.
- A functional role never widens data access on its own. A DM sees people on their projects
  because of the Manager access role (2.1), not because "DM" is a functional role. If a feature
  needs data, it operates within the holder's existing access role.
- Never hardcode a role name (`"DM"`, `"UnitManager"`, …) as a permission check anywhere in
  application code. Access roles are resolved from relationships at request time; functional-role
  permissions are resolved from stored, runtime-editable grants.

## Access roles are computed per request, per relationship

- Manager access is the transitive closure of two relations: **reports-to** and **is assigned to
  a project managed by**. Both must feed the same resolution — a naive "manager_id column only"
  model will not satisfy this.
- The same person can be Manager with respect to profile A, People Partner with respect to
  profile B, and a plain colleague with respect to profile C, all within the same session. Do not
  cache or compute "the current user's role" as a single global value — resolve it per subject
  profile, per section, per request.
- When a project assignment ends, derived managerial access ends with it immediately. It is not
  sticky. If access is cached anywhere for performance, the cache must invalidate on relationship
  change (reporting-line edit, project assignment start/end) — a stale permission cache is a data
  leak (spec Section 6).
- The one documented exception to "a Manager sees everything": a PM is a flag-gated reader on S7
  management notes, not a full read-write holder like UM/DM/PP. See S7 rules below.

## Section-level access is enforced server-side, always

- The profile is decomposed into sections (S1–S16). There is no profile-level permission — every
  section is gated independently, per audience, per `docs/access-control/section-matrix.md`.
- A section the viewer has no access to must not reach them through **any** surface: not the API
  response, not an export, not a search result, not a notification, not an error message. Do not
  implement a `—` cell by hiding a field in the frontend — the API must never emit it.
- Access is evaluated server-side, per section, on every request, after resolving the requester's
  access role for that specific subject. The BFF/services must assemble each profile response
  from only the sections the requester is entitled to.

## Colleague view is a whitelist, not a blacklist

- A colleague (any authenticated employee holding none of Manager/PP/HR Admin re: this profile)
  sees exactly: S1 (Identity card), S10 (Leaves, including type), S11 (project name only).
  Everything else is absent — implement this as "return only these fields," not "hide the rest."
- The same whitelist discipline applies to the "shared link" audience and its `cfg`-gated
  sections (S1 default-on; others must be explicitly enabled per link at creation time).

## S7 Management notes — the one exception to worry about explicitly

- Every management note carries two independent flags, both **off by default**:
  `visible for employee` and `visible for PM`.
- UM, DM, and PP can always create/read/edit notes about people they're responsible for,
  regardless of flags.
- The employee sees only records flagged visible for them. A PM sees only records flagged
  visible for PM, read-only. Both defaults are closed — a note with no flags set must not appear
  to either audience.
- Any test suite touching S7 needs explicit negative tests: an unflagged note against the
  employee, and an unflagged note against a PM.

## Custom fields and filters must not leak

- Every custom field has its own visibility (`management` default, `employee`, or `colleague`).
- Filters and list columns on All Employees must respect field visibility — a user must not be
  able to infer a value they can't see by filtering on it (e.g. binary-searching a hidden number
  via range filters).

## Definition of done, for this specific concern

A change touching profile sections, role resolution, or permissions is not done until:

- it matches `docs/access-control/section-matrix.md` cell-for-cell for every audience it affects;
- it has negative tests for every `—` cell it touches, and for the S7 unflagged case against both
  employee and PM;
- functional-role permission checks read from stored/runtime-editable grants, not from a
  hardcoded role name;
- access-role resolution was re-run per subject profile, not reused from a prior profile in the
  same session.

## Related

- `docs/access-control/section-matrix.md` — the living matrix, source of truth for cell values.
- `docs/requirements/project-requirements.md` Sections 2–3 — normative text these invariants
  summarize; when in doubt, the spec wins over this file.
- `.claude/agents/access-control-reviewer.md` — subagent that reviews diffs against this file.
