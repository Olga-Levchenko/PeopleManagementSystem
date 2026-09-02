# Section access matrix (living doc)

Source of truth: `docs/requirements/project-requirements.md` Section 3 (v1.2 body text) **as
amended by** `docs/requirements/Spec_Changelog_v1.2_to_v1.5.md` (v1.5) — this doc must match the
combined v1.2+changelog reading cell-for-cell. This is the *working* copy: as implementation and
test coverage land, update the **Test coverage** column here rather than tracking it separately.
If this doc and the spec+changelog ever disagree, the spec+changelog wins and this doc has a bug —
fix it immediately, don't let drift accumulate.

Consumers of this doc: `.claude/rules/access-control-invariants.md`,
`.claude/agents/access-control-reviewer.md`, `.claude/agents/test-automation-engineer.md`.

## Legend

- **RW** = read and write · **R** = read only · **—** = no access, section not rendered at all
  (must not reach the audience through any surface — API, export, search, notification, or
  error message)
- **cfg** = off by default in profile sharing (4.8), can be enabled per link
- Audiences: **Self** (the employee) · **Reporting line** (Manager access role holders via
  reports-to or department management per 2.1: the person's UM/department manager, and everyone
  above any of those) · **Project line** (Manager access role holders via project assignment per
  2.1: the PM/DM of the person's project(s), and everyone above them in that chain) · **PP**
  (assigned people partner and the HR line above them — **the "HR line" is the PP's own manager
  chain *inside HR*, recursive, without limit; it is not the subject employee's reporting chain**,
  per v1.5 §2.1) · **Colleague** (authenticated employee holding none of the above re: this
  profile) · **Shared link** (viewer via a generated link, 4.8)
- **HR Admin is not a data-access audience.** As of v1.5 it is a configuration-only functional
  role (custom fields, dictionaries, departments, functional roles/permissions) with no standing
  data access, and is omitted from this matrix for that reason — the opposite reason it was
  omitted before. Full read/write over every section is now a *separate*, journaled **Full profile
  access** grant (2.4) — non-self-assignable, first holder seeded at deployment, revocation blocked
  while it would leave zero holders. A holder of that grant reads/writes every cell in this matrix
  as RW; it isn't given its own column below because, like the old HR Admin assumption, it's
  uniform.
- **Test coverage**: `not started` / `partial` / `full` — full means positive AND negative cases
  exist for every non-uniform cell in that row, per audience and per relationship path.

## Matrix

| # | Section | Contents | Self | Reporting line | Project line | PP | Colleague | Shared link | Test coverage |
|---|---|---|---|---|---|---|---|---|---|
| S1 | Identity card | Full name, photo, position, department/unit, country/city, work email/phone, birthday (day+month), start date, manager, people partner, mentor, current project(s) | R (photo RW) | RW¹ | RW¹ | RW¹ | R | on by default | partial |
| S2 | Personal contacts | Personal phone/email, messengers, residential address, current place of stay | RW | R | **—** | RW | — | cfg | partial |
| S3 | Emergency contacts | Contact person, relationship, phone | RW | R | **—** | RW | — | — (never shareable) | partial |
| S4 | Employment | Employee type (FTE/Subcontractor), grade, seniority, position history, English level, probation status, employment status, contract type | R | RW | RW | RW | — | cfg | partial |
| S5 | Documents | Contract, W8, cooperation form, Diia City, CV, certificates | R (own) + upload certificates | R | **R, CV + certificates only** | RW | — | cfg | partial |
| S6 | Risks | Current level, trend, description, details, date, full history — no closed/terminal state (4.6) | — | RW | RW | RW | — | cfg | partial |
| S7 | Management notes | Free-form notes by managers and PP, per-record visibility flags | R — only records flagged visible for employee | RW | RW; **PM exception**: R, only records flagged visible for PM² | RW | — | — (never shareable) | partial |
| S8 | Feedbacks | Structured feedback records (4.15), including joining-interview feedback (moved here from S5 in v1.5) | R — only records flagged shared with employee | RW | RW | RW | — | cfg | partial |
| S9 | Career timeline | System-generated event log (4.9); includes department change; departure/dismissal is explicitly NOT a timeline event (v1.5) — see S4 employment status instead | R | RW | RW | RW | — | cfg | partial |
| S10 | Leaves and absences | Vacation, sick, parental, extended leave — dates and types | R | R | R | R | **R, dates only — type hidden (v1.5)** | cfg | partial |
| S11 | Projects | Project, PM, DM, period | R | R | R | R | R (project name only) | cfg | partial |
| S12 | CDS | Skills matrix link (keyed off the department entity, v1.5), assessment log, results, final conclusion, IDP | R (+ complete own IDP) | RW | RW | RW | — | cfg | partial |
| S13 | Mentorship | Open-to-mentor flag, assigned mentor, assigned mentees, ended pairs, closure note (v1.5: a field on the pair record, readable by reporting line/project line/PP only) | RW (own flag), R (pairs) | RW | RW | RW | — | — (never shareable) | partial |
| S14 | Action items and tasks | Tasks assigned to the person, incl. form tasks (4.5) | R (own) + mark complete | RW | RW | RW | — | — (never shareable — added to the never-share set in v1.5) | partial |
| S15 | Request history | Resourcing requests proposed → approved/rejected, with feedback | — | R | R | R | — | cfg (DM sees own requests natively) | partial |
| S16 | Custom fields | Per-field visibility (4.1) | per field visibility | RW | RW | RW | per field visibility | cfg | partial |

¹ **Manager, people partner, and department are not writable through S1 as of v1.5.** They are
access-switch fields behind a dedicated, journaled, non-self-assignable screen with its own
permission ("change organisational relationships") — not part of ordinary S1 edit access. The RW
shown here covers the rest of S1's fields (photo, position, country/city, etc.), not these three.

² S7's PM exception is tied to the specific PM functional role, not to "Project line" broadly — a
DM reached via project assignment still gets full RW on S7 like reporting line/PP. This is one of
the **two** documented exceptions to "Manager sees everything" as of v1.5 (the other is the
Project line's narrowed S2/S3/S5 above) — see Rules below.

**Test coverage note (Story 1.9, extended by spec-1-6b):** every row's `partial` status above
reflects `ManagerSectionAccessPolicyTests` and the `/api/v1/access-roles/resolve` HTTP composition
tests (`AccessRoleResolverCompositionTests`) — positive and negative section-access-level coverage
for the **Reporting line, Project line, and PP columns**, across all 16 sections, including the
Reporting-line-only, Project-line-only, both-Manager-lines-qualify (most-permissive-path-wins)
cases, plus (spec-1-6b) direct-PP-match, transitive-HR-line-match, PP-line-absent-when-subject-has-
no-PP, and PP-line-isolated-from-Reporting-line (no cross-contamination either direction) cases —
`AccessRoleResolverTests` (Domain, fake repository), `EfRelationshipRepositoryTests`
(Infrastructure, real Postgres `GetPeoplePartnerIdAsync`), and `AccessRoleResolverCompositionTests`
(Api, real DI-composed HTTP endpoint against the `HrDirectorId`/`HrPartnerId` fixture chain). PP's
per-section access (`peoplePartnerSectionAccess`, computed by a dedicated
`ManagerSectionAccessPolicy.ResolveForPeoplePartner()`) is asserted against all 16 sections
individually — it matches the unnarrowed Reporting-line view for 13 sections but is ReadWrite on
S2/S3/S5, where even an unnarrowed Reporting-line viewer is only Read (this matrix's own PP column,
above); an earlier draft of spec-1-6b assumed the two were cell-for-cell identical and was
corrected during review — see that spec's Change Log.
It does **not** cover Self/Colleague/Shared-link (still `not started` in substance, tracked under
the `partial` label until those audiences get their own rows of coverage), nor any actual profile
field data or the S1 write-restriction/S7 PM-flag/S16 per-field nuances footnoted above — those
remain Story 1.6/1.7/1.10's jobs respectively.

## Rules that follow from the matrix (3.3 — full text is normative, this is a recap)

- **Every cell is strict.** A `—` cell must not leak through the UI, the API, an export, a
  notification, a search result, or an error message, in any section. This applies to flag-gated
  records too. A leak here is a critical defect regardless of which section it happens in.
- **Two dimensions must both permit an operation (v1.5).** This matrix says which sections an
  audience may read/write; the functional-role × permission grant says which people hold which
  permissions. A write succeeds only where both allow it — access role alone is necessary but not
  sufficient wherever a permission also gates the action (e.g. creating a resourcing request).
- **There are exactly two documented exceptions to "Manager sees everything" (v1.5, was one):**
  the Project line's narrowed S2/S3/S5, and the PM's flag-gated S7 read. Both are footnoted above.
- **S7 defaults closed.** Both `visible for employee` and `visible for PM` default to off, per
  record. UM/DM/PP always have full RW on notes for people they're responsible for, regardless of
  flags.
- **Colleague view is a whitelist, not a blacklist.** Exactly S1, S10 (dates only, no type as of
  v1.5), S11 (project name only) — implement as "select these fields," never as "hide the rest" in
  the frontend. The API must not return the rest.
  - **One exception (v1.5):** a campaign author sees name and completion status for their own
    campaign's recipients only — from S14, nothing else, and only for that campaign's audience.
    This ends when the campaign closes.
- **Access is evaluated server-side, per section, on every request**, after resolving the
  requester's access role per 2.1 for that specific subject profile.
- **Custom fields (S16) carry their own visibility**: `management` (default), `employee`, or
  `colleague`. Filters and list columns on All Employees must respect it — a filter must not let
  someone infer a value they can't see directly.
- **A narrow journal (v1.5, §3.4) exists** — not a general audit log. It records: manager/people
  partner/department changes, department-manager changes, Full profile access grants, and every
  shared-link access. `access-control-reviewer` should check that anything touching these six
  event types actually writes a journal entry, not just performs the change.

## Resolved: multi-path precedence between Reporting line and Project line (Story 1.9)

- **Most-permissive-path-wins generalizes to S2/S3/S5, same as S7.** Resolved by Story 1.9's own
  AC and implemented in `ManagerSectionAccessPolicy`
  (`services/access-control-service/src/AccessControlService.Domain/ManagerSectionAccessPolicy.cs`):
  whenever a viewer qualifies for Reporting line at all, they get the full, unnarrowed
  Reporting-line view for every section — including S2/S3/S5 — regardless of whether they *also*
  qualify for Project line toward the same subject. The Project-line narrowing (S2/S3 → `—`, S5 →
  R/CV+certificates-only) applies only when Project line is the viewer's *sole* qualifying line.
  This was previously an open question (S7's footnote ² precedent was the candidate answer, not a
  stated fact) — it is no longer open as of Story 1.9.

## Profile sharing (4.8) specifics, for the `cfg` / Shared link column

- Shared links are **authenticated and explicitly named at creation** (v1.5) — there is no
  anonymous "anyone with the link" mode.
- Sensitive sections (S2, S5, S6, S8) are excluded by default even when shareable — must be
  explicitly enabled per link at creation time. Only S1 is on by default; every other `cfg` section
  starts off (v1.5 makes this explicit for all of them, not just the "sensitive" subset).
- **Never-share set (v1.5): S3, S7, S13, S14** — these can never be shared, under any
  configuration. (S14 is newly added to this set; it was already `—` in practice but is now an
  explicit hard rule, not just an unlisted default.)
- The career timeline (S9) is shareable but off by default.
- Shared links expire (default 24h, configurable), are revocable before expiry, are logged on
  every access (when, from where — the journal, per above), and never grant write access.
- **The creator's access is re-checked on every view (v1.5)** — a link dies the moment the
  creator's own Manager/PP relationship to the subject ends, not just at its stated expiry.
- **Revocation and journal rights follow the current holder of the relationship, not the creator**
  (v1.5) — if the creator's access lapses, whoever now holds the relationship (or a Full profile
  access holder as backstop) can still revoke. There must never be a link nobody can revoke.
- **Resourcing has its own, narrower evaluation-view section set** (4.7/4.8, v1.5) distinct from
  the general share defaults above: a resourcing candidate share auto-generated on request
  submission is S1, S4, S11, S12, and S5 as CV+certificates; S6 optional; **never** S2, S3, S7, S8.
  This is a deliberate resourcing-specific sub-case, not a contradiction of the general share rule.

## Related

- `docs/requirements/project-requirements.md` Sections 2–3 — normative source; consult directly
  for anything this doc's summary form loses precision on (e.g. exact hierarchy resolution
  rules in 2.1, which are described in prose, not as a table cell).
- `docs/requirements/Spec_Changelog_v1.2_to_v1.5.md` — the amendment this doc's v1.5-tagged cells
  are drawn from; binding wherever it conflicts with the spec's v1.2 body text.
- `.claude/rules/access-control-invariants.md` — the invariant summary derived from this matrix.
- `.claude/agents/access-control-reviewer.md` — reviews diffs against this doc.
- `.claude/agents/test-automation-engineer.md` — owns closing the Test coverage column.
