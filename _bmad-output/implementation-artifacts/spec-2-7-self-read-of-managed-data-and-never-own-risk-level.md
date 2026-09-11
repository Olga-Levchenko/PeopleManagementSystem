---
title: 'Story 2.7: Self-read of managed data, and never own risk level (S4/S9 + S6 exclusion MVP)'
type: 'feature'
created: '2026-09-11'
status: 'in-progress'
review_loop_iteration: 2
baseline_commit: '1392ff4a7481b778d898e815c9aa1ce5dd39a094'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-6-self-managed-personal-data.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-8-management-list-row-navigation-to-employee-profile.md'
  - '{project-root}/services/people-service/CLAUDE.md'
  - '{project-root}/services/frontend/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Employees cannot read manager-maintained employment (S4) or career-timeline (S9) data on their own profile, even though the section matrix grants Self **R** on both. S10/S11 self-read already works via Story 1.8. There is no enforcement story yet for the hard rule that Self must **never** receive S6 — including when the viewer holds Manager or Full profile access toward others.

**Approach:** Add minimal S4/S9 read models in `people-service`, extend profile audience + assembly so Self gets read-only `s4`/`s9` on own profile GET, and hard-exclude `s6` for Self via merged self overrides (not a global FPA reorder — FPA-first for S16 management-tier custom fields on own profile is preserved from Story 1.6). Render read-only Employment and Career sections on `EmployeeProfilePage`. Do not rework S10/S11 (baseline only).

## Boundaries & Constraints

**Always:** Keep **FPA-first** in `deriveAudienceFromResolution` so FPA holders viewing their own profile retain `'management'` `customFieldAudienceLevel` and management-tier S16 (Story 1.6 fix — do not regress). When `viewerPersonId === subjectPersonId`, **merge self overrides** into the resolved audience regardless of FPA/manager paths: `s4: 'Read'`, `s9: 'Read'`, `s6: 'None'`; preserve FPA-derived levels for all other sections (`s1`/`s2`/`s10`/`s11`/S16 audience). `getProfile` never attaches an `s6` key when viewer is subject — defense in depth, same omission rule as Story 1.6 (`—` cells). S4/S9 sections absent from response when level is `None`; never `s4: null`. S4 MVP fields on `Person`: `employmentType`, `grade`, `seniority`, `englishLevel` (all nullable strings). Current `position` stays in S1 only (not duplicated in `s4`). S9 MVP: `CareerTimelineEvent` model (`personId` FK with `onDelete: Cascade`, `occurredAt`, `eventType`, `summary`; index on `[personId, occurredAt]`) — empty array is valid (`s9: []`). Self PATCH of any S4 column key (`employmentType`, `grade`, `seniority`, `englishLevel`) returns **403** (not in `EDITABLE_S2_FIELD_KEYS`; no S4 write path). Reuse `profile.isSelf` on the profile page; no inline edit on S4/S9. Negative tests: `Object.keys(response)` has no `s6` for self; self viewer who is UM/FPA toward others still no `s6` on own profile; FPA self-view still includes management-tier S16.

**Ask First:** Adding enums for `employmentType`/`eventType` instead of nullable strings.

**Never:** Epic 4 risk CRUD or `s6` manager read assembly. Epic 8 automatic timeline generation or manual PP/UM override UI. Full S4 matrix (position history, probation, employment status, contract type — Epic 16). Manager/PP S4 write. Client-side S6 denylist tabs. Re-implementing S10/S11 self-read (already delivered). Global reorder that puts Self before FPA (breaks FPA self-view S16).

## Provenance

| Source | What is deferred |
|---|---|
| `epics.md` Story 2.7 AC | Full S4 field list and timetracker-linked S10 — MVP uses stored snapshot + local timeline table; epic AC lists **position** under S4 self-read — **`position` remains S1-only** until Epic 16 position history |
| Epic 4 | Risk record storage and manager `s6` read |
| Epic 8 | Auto/manual career-timeline writers |
| Epic 16 | Time-bounded employment status; position history |
| Stories 1.8 / 2.6 | S10/S11/S2 self-service — **baseline, no rework** |

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| SELF_S4_READ | Viewer === subject; Person has S4 columns populated | 200; `s4` object with four fields | N/A |
| SELF_S9_READ | Viewer === subject; zero timeline rows | 200; `s9: []` | N/A |
| SELF_S9_EVENTS | Viewer === subject; seeded events | 200; `s9` ordered by `occurredAt` desc | N/A |
| SELF_NO_S6 | Viewer === subject; viewer also reporting-line manager toward others | 200; no `s6` key | Must not leak when Epic 4 adds assembly |
| FPA_SELF_NO_S6 | Viewer === subject; `fullProfileAccessLine` true | 200; `s4` object present; `s9` array present (possibly empty); no `s6` key; management-tier S16 still present | FPA-first preserved; self overrides merged at function exit after FPA branch |
| SELF_S4_PATCH | Viewer === subject; PATCH `employmentType`/`grade`/`seniority`/`englishLevel` | 403 | No DB change |
| OTHER_S4_ABSENT | Colleague viewer | `s4` key absent | Unchanged colleague rules |
| OTHER_S9_ABSENT | Colleague viewer | `s9` key absent | Unchanged colleague rules |
| S10_S11_BASELINE | Viewer === subject | `s10`/`s11` unchanged from 1.8 | Regression test only |

</frozen-after-approval>

## Code Map

- `services/people-service/prisma/schema.prisma:53-95` — add S4 columns on `Person`; new `CareerTimelineEvent` model (`personId` FK `onDelete: Cascade`, `occurredAt`, `eventType`, `summary`, `@@index([personId, occurredAt])`) + relation
- `services/people-service/src/modules/profile/profile.ports.ts:48-54` — extend `fullProfileAccessSectionAccess` with `s4`/`s9`/`s6` when Epic 4/FPA wire shape grows; update MAINTENANCE comment
- `services/people-service/src/modules/profile/profile-audience.util.ts:36-95` — extend `ResolvedProfileAudience` with `s4`/`s9`/`s6`; **keep FPA-first**; merge self overrides (`s4`/`s9` Read, `s6` None) at **function exit** when `viewer === subject` (including after FPA early return)
- `services/people-service/src/modules/profile/profile.service.ts:190-268` — extend Prisma `findUnique` select with S4 columns + `careerTimelineEvents` ordered `occurredAt desc`; `S4Employment`, `S9TimelineEntry`, `ProfileResponse.s4?`/`s9?`; `toS4`/`toS9`; assembly gates; self `s6` omission guard in `getProfile`
- `services/people-service/src/modules/profile/profile.service.ts:271+` — self PATCH of S4 keys → 403 (not in `EDITABLE_S2_FIELD_KEYS`)
- `services/people-service/src/modules/profile/__tests__/profile-audience.util.spec.ts` — FPA-first preserved; self merge sets `s4`/`s9` Read and `s6` None; FPA+self merge keeps `customFieldAudienceLevel: 'management'`
- `services/people-service/src/modules/profile/__tests__/profile.service.spec.ts` — self `s4`/`s9` present; `Object.keys` no `s6`; **update existing FPA self-view test** (`Object.keys` includes `s4`/`s9`, still excludes `s6`, management S16 field still visible — Story 1.6 regression)
- `services/people-service/test/profile.e2e-spec.ts` — Postgres self S4/S9 persist read (direct Prisma seed in test setup); assert no `s6` key; FPA+self no-`s6` case
- `services/frontend/src/api/profile.ts` — add `S4Employment`, `S9TimelineEntry`; extend `EmployeeProfileResponse` with `s4?`/`s9?`
- `services/frontend/src/pages/EmployeeProfilePage/EmployeeProfilePage.tsx` — read-only Employment + Career sections when `s4`/`s9` present (no `ProfileInlineEditableField`)
- `services/frontend/src/locales/en/translation.json` — section labels/fields
- `docs/access-control/section-matrix.md` — trace Self/S4 R, Self/S9 R, Self/S6 `—` negative tests

**Baseline (no code changes unless regression fails):** `profile.service.ts` S10/S11 assembly; `EmployeeProfilePage` leaves/projects sections; existing FPA self-view S16 test in `profile.service.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `schema.prisma` + migration — S4 columns + `CareerTimelineEvent` — minimal read models
- [x] `profile.ports.ts` — extend FPA section-access type with `s4`/`s9`/`s6` placeholders
- [x] `profile-audience.util.ts` — FPA-first preserved; self merge for `s4`/`s9`/`s6` — access foundation
- [x] `profile.service.ts` — Prisma select, S4/S9 types, mappers, GET assembly; self `s6` omission guard — core read path
- [x] `profile-audience.util.spec.ts` + `profile.service.spec.ts` — matrix rows + **FPA+self: `s4`/`s9` present, no `s6`, management S16**; update existing FPA self-view test `Object.keys` expectations
- [x] `profile.e2e-spec.ts` — self S4/S9 integration; no `s6` key assertion
- [x] `profile.ts` (frontend) + `EmployeeProfilePage.tsx` + `translation.json` — types and read-only UI sections
- [x] `section-matrix.md` — test-coverage note for Self S4/S9/S6

**Acceptance Criteria:**
- Given an employee viewing their own profile (`profile.isSelf === true`), when GET profile returns, then `s4` includes `employmentType`, `grade`, `seniority`, `englishLevel` (read-only) and `s9` is an array (possibly empty)
- Given an employee who is also a manager or FPA holder viewing **their own** profile, when the response is assembled, then the body has **no** `s6` key under any condition
- Given an FPA holder viewing their own profile, when GET profile returns, then `s4` and `s9` are present, management-tier S16 custom fields remain visible, and no `s6` key is included (Story 1.6 S16 behavior preserved)
- Given an employee PATCHing an S4 field key (`employmentType`, `grade`, `seniority`, or `englishLevel`) on their own profile, when the request is submitted, then the server returns 403
- Given S10/S11 on own profile, when compared to pre-2.7 behavior, then leaves and projects sections remain present and unchanged (regression)
- Given manual check on own profile, when Employment and Career sections render, then no edit affordance appears on S4/S9 fields

## Design Notes

### Self overrides without FPA reorder

`deriveAudienceFromResolution` **keeps FPA-first** (Story 1.6): an FPA holder viewing their own profile must receive `'management'` `customFieldAudienceLevel`, not the default `'employee'` from a naive self short-circuit. The Epic 4 risk is **`s6` leaking via FPA or manager payloads when `viewer === subject`**, not FPA ordering itself.

When `viewerPersonId === subjectPersonId`, merge self-only overrides at **function exit** into whatever audience FPA/manager/PP/colleague resolution produced (the FPA branch returns before the self short-circuit — merge must not live only on the self branch):

- `s4: 'Read'`, `s9: 'Read'`, `s6: 'None'` — always, regardless of FPA
- All other section levels and S16 audience tier come from the underlying resolution (FPA wins for S16 management tier on self-view)

In `getProfile`, never attach `s6` when `isSelf === true` (defense in depth before Epic 4 adds risk assembly).

### Dependency on Story 2.6

Start 2.7 after Story 2.6 lands `ProfileResponse.isSelf` on profile GET, or ship both on the same branch. `EmployeeProfilePage` S4/S9 read-only sections and S2 inline edit both key off `profile.isSelf` — not Keycloak `sub`.

### S9 without Epic 8

Epic 8 owns event generation and PP/UM edits. This story only adds the **read model** and profile assembly so Self can see seeded or manually inserted rows in tests; production may return `s9: []` until Epic 8 lands.

## Verification

**Commands:**
- `cd services/people-service && npm test -- profile-audience.util.spec profile.service.spec` — expected: self S4/S9 + no-s6 + FPA+self S16 regression tests pass
- `cd services/people-service && npm run test:e2e -- profile.e2e-spec` — expected: self S4/S9 e2e pass
- `cd services/frontend && npm run typecheck && npm run lint && npm test` — expected: clean

**Manual checks (if no CLI):**
- Open own `/people/:id` — Employment and Career sections visible read-only; no Risks section.

## Spec Change Log

- **2026-09-11 (review loop 1):** Replaced Self-before-FPA reorder with merged self overrides for `s4`/`s9`/`s6` while preserving FPA-first for S16 on own profile. Added `profile.ports.ts`, frontend `profile.ts`, Prisma select, `CareerTimelineEvent` schema detail, S4 PATCH key list, FPA+self no-`s6` + S16 regression I/O row and tests, epic AC position deferral note, and AC for FPA self-view S16 preservation.
- **2026-09-11 (review loop 2):** FPA self I/O asserts `s4`/`s9` present; task to update existing FPA self-view test keys; `onDelete: Cascade` on `CareerTimelineEvent`; Story 2.6 `isSelf` dependency note; merge-at-function-exit clarified in Design Notes and Code Map.

### Review Findings

- [x] [Review][Patch] Stage untracked Prisma migration and story spec before PR [`services/people-service/prisma/migrations/20260911150000_add_s4_s9_read_models/`, `_bmad-output/implementation-artifacts/spec-2-7-self-read-of-managed-data-and-never-own-risk-level.md`]
- [x] [Review][Patch] Fix stale `http-access-role-resolution.adapter.spec` — add `s4`/`s6`/`s9` to `managerSectionAccess` expectation [`services/people-service/src/modules/profile/__tests__/http-access-role-resolution.adapter.spec.ts:58`]
- [x] [Review][Patch] Add self-view test for empty `s9: []` (SELF_S9_READ I/O row) [`services/people-service/src/modules/profile/__tests__/profile.service.spec.ts`]
- [x] [Review][Patch] Add self+manager scenario test: reporting-line manager viewing own profile still excludes `s6` (SELF_NO_S6) [`profile.service.spec.ts` or `profile-audience.util.spec.ts`]
- [x] [Review][Patch] Add Playwright coverage for read-only Employment/Career sections when API returns `s4`/`s9` [`services/frontend/e2e/employee-profile-self-edit.spec.ts`]
- [x] [Review][Defer] Wire manager/PP S4/S9 from ACS `managerSectionAccess` — deferred, intentional 2.7 scope (Epic 16 / future manager read story)
