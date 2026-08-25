# Section access matrix (living doc)

Source of truth: `docs/requirements/project-requirements.md` Section 3, which is [NORMATIVE] —
this doc must match it cell-for-cell. This is the *working* copy: as implementation and test
coverage land, update the **Test coverage** column here rather than tracking it separately. If
this doc and the spec ever disagree, the spec wins and this doc has a bug — fix it immediately,
don't let drift accumulate.

Consumers of this doc: `.claude/rules/access-control-invariants.md`,
`.claude/agents/access-control-reviewer.md`, `.claude/agents/test-automation-engineer.md`.

## Legend

- **RW** = read and write · **R** = read only · **—** = no access, section not rendered at all
  (must not reach the audience through any surface — API, export, search, notification, or
  error message)
- **cfg** = off by default in profile sharing (4.8), can be enabled per link
- Audiences: **Self** (the employee) · **Manager line** (Manager access role holders per 2.1:
  UM, the PM/DM of their projects, and everyone above any of those) · **PP** (assigned people
  partner and the HR line above them) · **Colleague** (authenticated employee holding none of the
  above re: this profile) · **Shared link** (viewer via a generated link, 4.8) · **HR Admin**
  (full access to everything — omitted as a column since it's uniformly RW everywhere)
- **Test coverage**: `not started` / `partial` / `full` — full means positive AND negative cases
  exist for every non-uniform cell in that row, per audience and per relationship path.

## Matrix

| # | Section | Contents | Self | Manager line | PP | Colleague | Shared link | Test coverage |
|---|---|---|---|---|---|---|---|---|
| S1 | Identity card | Full name, photo, position, department/unit, country/city, work email/phone, birthday (day+month), start date, manager, people partner, mentor, current project(s) | R (photo RW) | RW | RW | R | on by default | not started |
| S2 | Personal contacts | Personal phone/email, messengers, residential address, current place of stay | RW | R | RW | — | cfg | not started |
| S3 | Emergency contacts | Contact person, relationship, phone | RW | R | RW | — | — (never shareable) | not started |
| S4 | Employment | Employee type (FTE/Subcontractor), grade, seniority, position history, English level, probation status, employment status, contract type | R | RW | RW | — | cfg | not started |
| S5 | Documents | Contract, W8, cooperation form, Diia City, CV, joining interview feedback, certificates | R (own) + upload certificates | R | RW | — | cfg | not started |
| S6 | Risks | Current level, trend, description, details, date, full history | — | RW | RW | — | cfg | not started |
| S7 | Management notes | Free-form notes by managers and PP, per-record visibility flags | R — only records flagged visible for employee | RW; **PM exception**: R, only records flagged visible for PM | RW | — | — (never shareable) | not started |
| S8 | Feedbacks | Structured feedback records (4.15) | R — only records flagged shared with employee | RW | RW | — | cfg | not started |
| S9 | Career timeline | System-generated event log (4.9) | R | RW | RW | — | cfg | not started |
| S10 | Leaves and absences | Vacation, sick, parental, extended leave — dates and types | R | R | R | R, including type | cfg | not started |
| S11 | Projects | Project, PM, DM, period | R | R | R | R (project name only) | cfg | not started |
| S12 | CDS | Skills matrix link, assessment log, results, final conclusion, IDP | R (+ complete own IDP) | RW | RW | — | cfg | not started |
| S13 | Mentorship | Open-to-mentor flag, assigned mentor, assigned mentees, ended pairs | RW (own flag), R (pairs) | RW | RW | — | — (never shareable) | not started |
| S14 | Action items and tasks | Tasks assigned to the person, incl. form tasks (4.5) | R (own) + mark complete | RW | RW | — | — | not started |
| S15 | Request history | Resourcing requests proposed → approved/rejected, with feedback | — | R | R | — | cfg (DM sees own requests natively) | not started |
| S16 | Custom fields | Per-field visibility (4.1) | per field visibility | RW | RW | per field visibility | cfg | not started |

## Rules that follow from the matrix (3.3 — full text is normative, this is a recap)

- **Every cell is strict.** A `—` cell must not leak through the UI, the API, an export, a
  notification, a search result, or an error message, in any section. This applies to flag-gated
  records too. A leak here is a critical defect regardless of which section it happens in.
- **S7 defaults closed.** Both `visible for employee` and `visible for PM` default to off, per
  record. UM/DM/PP always have full RW on notes for people they're responsible for, regardless of
  flags. PM is the one documented exception to "Manager sees everything" (2.1): a flag-gated
  reader on S7 only, RW on every other section.
- **Colleague view is a whitelist, not a blacklist.** Exactly S1, S10 (incl. leave type), S11
  (project name only) — implement as "select these fields," never as "hide the rest" in the
  frontend. The API must not return the rest.
- **Access is evaluated server-side, per section, on every request**, after resolving the
  requester's access role per 2.1 for that specific subject profile.
- **Custom fields (S16) carry their own visibility**: `management` (default), `employee`, or
  `colleague`. Filters and list columns on All Employees must respect it — a filter must not let
  someone infer a value they can't see directly.

## Profile sharing (4.8) specifics, for the `cfg` / Shared link column

- Sensitive sections (S2, S5, S6, S8) are excluded by default even when shareable — must be
  explicitly enabled per link at creation time.
- S3, S7, S13 can **never** be shared, under any configuration.
- Shared links expire (default 24h, configurable), are revocable before expiry, are logged on
  every access (when, from where), and never grant write access.

## Related

- `docs/requirements/project-requirements.md` Sections 2–3 — normative source; consult directly
  for anything this doc's summary form loses precision on (e.g. exact hierarchy resolution
  rules in 2.1, which are described in prose, not as a table cell).
- `.claude/rules/access-control-invariants.md` — the invariant summary derived from this matrix.
- `.claude/agents/access-control-reviewer.md` — reviews diffs against this doc.
- `.claude/agents/test-automation-engineer.md` — owns closing the Test coverage column.
