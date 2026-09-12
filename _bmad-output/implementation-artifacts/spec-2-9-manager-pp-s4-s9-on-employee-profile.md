---
title: 'Story 2.9: Manager/PP read S4 and S9 on employee profile'
type: 'feature'
created: '2026-09-12'
status: 'ready-for-dev'
review_loop_iteration: 2
baseline_commit: '84233ec'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-7-self-read-of-managed-data-and-never-own-risk-level.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-8-management-list-row-navigation-to-employee-profile.md'
  - '{project-root}/services/people-service/CLAUDE.md'
  - '{project-root}/services/frontend/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.7 delivered self-read of S4 (employment snapshot) and S9 (career timeline) on own profile, but `deriveAudienceFromResolution` still spreads `NO_SECTION_ACCESS` for `s4`/`s9` on every non-self manager/PP path. A UM/DM/PM/PP who opens a report's profile via Story 2.8 therefore never receives `s4`/`s9` in the API response even though ACS `managerSectionAccess` / `peoplePartnerSectionAccess` already carry RW levels for those sections.

**Approach:** Wire `s4` and `s9` audience levels from ACS section-access groups using the same `mostPermissive(managerAccess, ppAccess)` pattern as `s1`/`s2`/`s10`/`s11`. Reuse existing `toS4`/`toS9` assembly and read-only Employment/Career UI from Story 2.7. Keep `s6: 'None'` until Epic 4 risk assembly exists. No new Prisma models — Story 2.7 read models are sufficient for manager **read**.

## Boundaries & Constraints

**Always:** Server-side section gating only — profile GET omits `s4`/`s9` keys when resolved level is `None`; never return null placeholders. Colleague path unchanged (`NO_SECTION_ACCESS` for s4/s9). Self overrides from Story 2.7 unchanged (`s4`/`s9` Read, `s6` None). FPA path unchanged (`profile.ports.ts` already parses `s4`/`s9`; no parser change in this story). Project-line-only narrowing affects S2/S3/S5 in ACS — **not** S4/S9 per `ManagerSectionAccessPolicy` and section matrix; manager viewers who qualify only via project line still receive RW on S4/S9 from ACS and must get read assembly when level is Read or ReadWrite. Manager/PP **write** of S4 fields remains out of scope (no PATCH path for employment columns in this story). **Management profile UI is read-only for S4/S9** — even when ACS grants Manager/PP ReadWrite, `EmployeeProfilePage` shows Employment/Career sections without inline edit affordances; employment writes are a future story. Negative tests for colleague and for manager paths where ACS returns `None` on s4/s9. Update Story 2.8 trace: management profile may include `s4`/`s9` when API returns them.

**Ask First:** _(none — resolved in review loop 2: read-only management UI for S4/S9)_

**Never:** Epic 4 `s6` assembly or manager risk read. Epic 8 timeline event writers. Epic 16 position history / employment-status facts. Changing ACS policies. Client-side section matrix. Weakening Story 2.7 self `s6` exclusion.

## Provenance

| Source | What this story closes |
|---|---|
| `deferred-work.md` (spec-2-7 code review, 2026-09-11) | Wire manager/PP S4/S9 from ACS instead of `NO_SECTION_ACCESS` hardcode |
| `spec-2-7` | Intentional MVP scope excluded manager paths |
| `spec-2-8` AC | Management profile sections `{ s1, s2, s10, s11, s16 }` — extend to include `s4`/`s9` when entitled |
| `section-matrix.md` S4/S9 | Reporting line, Project line, PP: RW (manager read at minimum) |

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| MANAGER_REPORT_S4_S9 | Viewer has reporting line; subject has S4 columns + timeline rows | 200; `s4` object; `s9` array (possibly empty); `isSelf: false` | N/A |
| PP_LINE_S4_S9 | Viewer has peoplePartnerLine only | 200; `s4`/`s9` per `peoplePartnerSectionAccess` levels | N/A |
| PROJECT_LINE_ONLY | `projectLine: true`, `reportingLine: false`; ACS S4/S9 RW | 200; `s4`/`s9` present (not narrowed away) | Regression vs Story 1.9 |
| BOTH_LINES_MOST_PERMISSIVE | Reporting + project line; different s4 levels | Uses `mostPermissive` across manager groups | N/A |
| COLLEAGUE_NO_S4_S9 | Neither manager nor PP line | `s4`/`s9` keys absent | Unchanged colleague rules |
| SELF_UNCHANGED | Viewer === subject | Story 2.7 self merge still applies | No regression |
| FPA_OTHER_SUBJECT | FPA holder viewing another person | FPA section access includes s4/s9 when entitled | Story 1.5 path |
| MANAGER_S4_PATCH | Manager PATCH subject `grade` | 403 (no write path) | Out of scope |
| PP_S4_PATCH | PP PATCH subject `grade` | 403 (no write path) | Out of scope; ACS may grant PP RW |

</frozen-after-approval>

## Code Map

- `services/people-service/src/modules/profile/profile-audience.util.ts` — replace `...NO_SECTION_ACCESS` on manager/PP branch with `s4`/`s9` from `mostPermissive(managerAccess?.s4?.level, ppAccess?.s4?.level)` and same for s9; keep `s6: 'None'` until Epic 4 (**no `profile.ports.ts` change** — `s4`/`s9` already parsed)
- `services/people-service/src/modules/profile/__tests__/profile-audience.util.spec.ts` — manager/PP/project-line-only/colleague rows
- `services/people-service/src/modules/profile/__tests__/profile.service.spec.ts` — manager GET includes `s4`/`s9`; colleague absent
- `services/people-service/test/profile.e2e-spec.ts` — integration with mocked ACS returning s4/s9 RW
- `services/frontend/e2e/all-employees-management-profile.spec.ts` — extend mock profile to include `s4`/`s9`; assert Employment/Career sections visible for management navigation
- `docs/access-control/section-matrix.md` — trace notes for manager S4/S9 read on profile GET

**Reuse:** `profile.service.ts` `toS4`/`toS9`; `EmployeeProfilePage` read-only sections (Story 2.7); ACS wire shape in `profile.ports.ts` (already parses s4/s9).

## Tasks & Acceptance

**Execution:**
- [ ] `profile-audience.util.ts` — wire manager/PP `s4`/`s9` levels; keep `s6` None
- [ ] Unit tests — audience util + profile.service manager/colleague/self regression
- [ ] E2E — manager profile includes s4/s9 when ACS grants access
- [ ] Playwright — management profile navigation shows Employment/Career when present
- [ ] `section-matrix.md` — coverage trace update

**Acceptance Criteria:**
- Given a manager or PP with Manager or PP access over a subject, when they GET that subject's profile, then `s4` and `s9` are present when ACS section levels are Read or ReadWrite
- Given a colleague viewer, when they GET another person's profile, then `s4` and `s9` are absent
- Given Story 2.7 self-view rules, when an employee views their own profile, then behavior is unchanged (self `s4`/`s9` read, no `s6`)
- Given a project-line-only manager (no reporting line), when ACS grants S4/S9 RW, then profile GET includes `s4`/`s9` (not narrowed to absent)
- Given a manager or PP viewing another person's profile with S4/S9 present, when they view Employment/Career sections, then the UI is read-only (no inline edit controls)

## Verification

- `npm test` in `services/people-service` (profile unit + e2e)
- `npm run test:e2e` in `services/frontend` for extended management profile spec
- `access-control-reviewer` on diff touching `profile-audience.util.ts`
