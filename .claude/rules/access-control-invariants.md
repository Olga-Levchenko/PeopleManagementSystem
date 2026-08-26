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
- **As of the v1.5 spec changelog, HR Admin is not a data-access role at all** — it is
  configuration-only (custom fields, dictionaries, departments, functional roles/permissions) with
  no standing read/write over any profile section. Full read/write over every section is a
  separate, journaled **Full profile access** grant (spec §2.4): only an existing holder can grant
  it, no self-assignment, first holder seeded at deployment, and the last holder can never be
  removed. Do not assume "HR Admin" implies data access anywhere in code or tests.
- **A write requires both dimensions to permit it (v1.5).** The section matrix says what an access
  role may read/write; a functional-role permission grant says who may perform a given action.
  Where an action is also permission-gated (e.g. approving a resourcing candidate, closing a
  request, recording a departure), both the access-role check and the permission check must pass —
  neither alone is sufficient.
- A functional role never widens data access on its own. A DM sees people on their projects
  because of the Manager access role (2.1), not because "DM" is a functional role. If a feature
  needs data, it operates within the holder's existing access role.
- Never hardcode a role name (`"DM"`, `"UnitManager"`, `"HRAdmin"`, …) as a permission check
  anywhere in application code. Access roles are resolved from relationships at request time;
  functional-role permissions are resolved from stored, runtime-editable grants.

## Access roles are computed per request, per relationship

- Manager access is the transitive closure of **three** relations as of v1.5: **reports-to**,
  **department management**, and **is assigned to a project managed by**. All three must feed the
  same resolution — a naive "manager_id column only" model will not satisfy this.
- Relationships from reports-to/department-management form the **Reporting line**; relationships
  from project assignment form the **Project line**. As of v1.5 these are no longer equivalent for
  data access — see the narrowing below and `docs/access-control/section-matrix.md`.
- The same person can be Manager with respect to profile A, People Partner with respect to
  profile B, and a plain colleague with respect to profile C, all within the same session. Do not
  cache or compute "the current user's role" as a single global value — resolve it per subject
  profile, per section, per request.
- **The "HR line" (v1.5)** is the people partner's own manager chain *inside HR*, recursive,
  without limit — not the subject employee's management chain. Resolving PP access by walking the
  employee's own reporting line instead is a distinct bug from a Manager-access miscalculation and
  will not be caught by the same tests.
- When a project assignment ends, derived managerial access ends with it immediately. It is not
  sticky. Revocation timing is split (v1.5): a platform-owned relationship edit (reporting line,
  department, PP assignment) takes effect on the *next request*; project-derived access changes
  within **15 minutes** as a stated access guarantee, degrading to a forced withdrawal within
  **4 hours** if the timetracker sync itself is failing. If access is cached anywhere for
  performance, the cache must invalidate within these bounds — a stale permission cache is a data
  leak (spec Section 6).
- **There are exactly two documented exceptions to "a Manager sees everything" as of v1.5** (was
  one): (1) a PM is a flag-gated reader on S7 management notes, not a full read-write holder like
  UM/DM/PP — see S7 rules below; (2) the **Project line is narrowed**: PM and DM reached via
  project assignment lose S2 and S3 entirely and get S5 as CV+certificates only, with everything
  else (including S6) identical to the Reporting line. The Reporting line itself is not narrowed.

## Organisational relationship changes are a distinct, journaled operation (v1.5)

- **A person's manager, their people partner, their department, and a department's manager are
  not writable through S1.** These four fields are access switches, not profile data — changing
  one is a dedicated operation with its own permission and its own screen, never a side effect of
  a general S1 edit.
- No self-assignment: the holder of a relationship-change permission cannot use it to reassign
  themselves.
- **A narrow journal exists** (spec §3.4) — not a general audit log. It records exactly six event
  types: manager changes, people-partner changes, department changes, department-manager changes,
  Full profile access grants, and shared-link accesses. Any code path that performs one of these
  six changes must write a journal entry as part of the same operation, not as a best-effort
  afterthought.

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

- A colleague (any authenticated employee holding none of Manager/PP/Full-profile-access re: this
  profile) sees exactly: S1 (Identity card), S10 (Leaves — **dates only, no type as of v1.5**),
  S11 (project name only). Everything else is absent — implement this as "return only these
  fields," not "hide the rest."
- **One exception (v1.5):** a campaign author sees name and completion status for their own
  campaign's recipients only (S14), nothing else, and only until the campaign closes. This does
  not widen the whitelist for any other purpose.
- The same whitelist discipline applies to the "shared link" audience and its `cfg`-gated
  sections (S1 default-on; others must be explicitly enabled per link at creation time). As of
  v1.5, shared links are **authenticated and named at creation — never anonymous** — and access is
  re-checked on every view, not just against the stated expiry: the link dies the moment the
  creator's underlying relationship to the subject ends.

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
  summarize; when in doubt, the spec (as amended) wins over this file.
- `docs/requirements/Spec_Changelog_v1.2_to_v1.5.md` — the amendment layer this file's v1.5-tagged
  invariants are drawn from; binding wherever it conflicts with the spec's v1.2 body text.
- `.claude/agents/access-control-reviewer.md` — subagent that reviews diffs against this file.
