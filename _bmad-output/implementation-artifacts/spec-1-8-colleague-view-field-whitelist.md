---
title: 'Story 1.8: Colleague view field whitelist'
type: 'feature'
created: '2026-09-02'
status: 'done'
review_loop_iteration: 1
baseline_commit: 'ddb4f64'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The profile endpoint returns only S1 (and S2 for qualified viewers). The section matrix requires colleagues to see exactly S1, S10 (dates only, no leave type), and S11 (project name only) — but no Leave or ProjectAssignment data model exists in `people-service` yet, so neither section can be returned, and the "exactly these keys" whitelist is unverifiable.

**Approach:** Add `Leave` and `PersonProjectAssignment` Prisma models, extend `ProfileResponse` with `s10` and `s11`, apply colleague-specific field restrictions server-side (dates only for S10, project name only for S11), and prove via a key-set assertion test that a colleague's response body contains no keys beyond `['s1', 's10', 's11']`.

## Boundaries & Constraints

**Always:** Implement as a whitelist — return `s10`/`s11` for every audience that has access; for the colleague path specifically, strip `leaveType` from S10 entries and strip `role`/`startDate`/`endDate` from S11 entries server-side before the response is serialised. Fail closed: an empty leave or project list → `s10: []` / `s11: []` (empty arrays, keys still present). The AC-service wire shape already carries S1–S16 in `managerSectionAccess`; extending the TS interface to expose `s10`/`s11` is purely additive — no AC-service changes are needed.

**Never:** Do not add the campaign-author S14 exception (epic-11, noted here only as an additive extension point). Do not implement timetracker sync (epic-14). Do not add Full-profile-access (Story 1.5). Do not implement S7 or any section beyond S10/S11 in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| COLLEAGUE | No qualifying line (resolver returns all-false) | `Object.keys(body).sort()` === `['s1', 's10', 's11']`; each S10 entry has `startDate`+`endDate` only (no `leaveType`); each S11 entry has `projectName` only (no `role`/dates) | N/A |
| MANAGER | Reporting-line or Project-line qualifies | S10 entries include `leaveType`; S11 entries include `role`, `startDate`, `endDate` | N/A |
| EMPTY_RECORDS | Subject has no leaves and no project assignments | `s10: []`, `s11: []` — both keys present, empty arrays | N/A |
| SELF | Viewer == subject (early-return path) | `s10` / `s11` present with full data (no field stripping) | N/A |

</frozen-after-approval>

## Code Map

- `services/people-service/prisma/schema.prisma:36-68` — add `Leave` model (`id`, `personId` FK, `startDate`, `endDate`, `leaveType`; `@@map("leaves")`); add `PersonProjectAssignment` model (`id`, `personId` FK, `projectName`, `role?`, `startDate?`, `endDate?`; `@@map("person_project_assignments")`); add `leaves` and `personProjectAssignments` inverse relations on `Person`
- `services/people-service/prisma/migrations/` — new migration produced by `npm run db:migrate` (name: `add_leave_person_project_assignment`)
- `services/people-service/src/modules/profile/profile.ports.ts:17-45` — extend `managerSectionAccess`/`peoplePartnerSectionAccess` objects to include `s10: SectionAccess; s11: SectionAccess`; add `S10Leave { startDate: Date; endDate: Date; leaveType?: string }` and `S11ProjectEntry { projectName: string; role?: string; startDate?: Date; endDate?: Date }` interfaces; extend `ProfileResponse` with `s10?: S10Leave[]; s11?: S11ProjectEntry[]`; update `NEITHER_LINE_RESOLUTION` comment to reflect that `s10`/`s11` are now part of the typed shape
- `services/people-service/src/modules/profile/profile.service.ts:74-` — extend the Prisma `include` in `getProfile`'s `findUniqueOrThrow` to join `leaves` and `personProjectAssignments`; extend `resolveAudience` return type to `{ s1, s2, s10, s11: SectionAccessLevel; isColleague: boolean }` and populate accordingly (self path: `s10:'ReadWrite', s11:'ReadWrite', isColleague:false`; colleague path: `s10:'Read', s11:'Read', isColleague:true`; manager/PP path: `s10: mostPermissive(...)`, `s11: mostPermissive(...)`, `isColleague:false`); add `private toS10(leaves): S10Leave[]` (full, includes `leaveType`); add `private toS10Colleague(leaves): S10Leave[]` (strips `leaveType`); add `private toS11(assignments): S11ProjectEntry[]` (full); add `private toS11Colleague(assignments): S11ProjectEntry[]` (strips `role`/dates); in `getProfile`, conditionally include `s10` and `s11` using `grantsAccess(audience.s10)` and dispatch to the right mapper via `audience.isColleague`
- `services/people-service/src/modules/profile/__tests__/profile.service.spec.ts:13-29` — extend `FULL_PERSON_ROW` with `leaves: [{ id, personId, startDate, endDate, leaveType:'vacation' }]` and `personProjectAssignments: [{ id, personId, projectName:'Project Alpha', role:'Member', startDate, endDate }]`; update Colleague test to assert `Object.keys(result).sort()` === `['s1','s10','s11']` and verify no `leaveType` / no role/dates in entries; add manager path assertion that `leaveType` and `role` ARE present
- `services/people-service/test/profile.e2e-spec.ts:136-167` — extend `seedSubject` helper to seed one `Leave` and one `PersonProjectAssignment` for the subject; update Colleague e2e test to assert `Object.keys(res.body).sort()` === `['s1','s10','s11']`, plus field-restriction spot-checks; existing self/manager e2e tests updated to assert `s10`/`s11` keys are also present

## Tasks & Acceptance

**Execution:**
- [x] `services/people-service/prisma/schema.prisma` -- add `Leave` and `PersonProjectAssignment` models with FK to `Person`; add inverse relations on `Person` -- S10/S11 backing data
- [x] `services/people-service/prisma/migrations/` -- run `npm run db:migrate` (name: `add_leave_person_project_assignment`) -- schema DDL
- [x] `services/people-service/src/modules/profile/profile.ports.ts` -- add `S10Leave`/`S11ProjectEntry` types; extend `ProfileResponse`; expose `s10`/`s11` in `managerSectionAccess`/`peoplePartnerSectionAccess` shapes -- additive interface extension
- [x] `services/people-service/src/modules/profile/profile.service.ts` -- extend Prisma query; extend `resolveAudience` return; add `toS10`/`toS10Colleague`/`toS11`/`toS11Colleague` mappers; wire into `getProfile` -- core whitelist logic
- [x] `services/people-service/src/modules/profile/__tests__/profile.service.spec.ts` -- update `FULL_PERSON_ROW`; add/update Colleague and Manager S10/S11 unit tests -- verify field restrictions and key-set
- [x] `services/people-service/test/profile.e2e-spec.ts` -- extend `seedSubject`; update Colleague e2e; spot-check self/manager -- end-to-end whitelist proof

**Acceptance Criteria:**
- Given a viewer with no qualifying line, when they read the subject's profile, then `Object.keys(body).sort()` equals `['s1', 's10', 's11']` — no extra keys
- Given a colleague request with leave records present, when the response is returned, then each S10 entry has `startDate` and `endDate` but no `leaveType` property
- Given a colleague request with project assignments present, when the response is returned, then each S11 entry has `projectName` but no `role`, `startDate`, or `endDate` properties
- Given a subject with no leaves and no project assignments, when a colleague reads their profile, then `s10` and `s11` are both present as empty arrays

## Design Notes

`isColleague` flag on `resolveAudience`'s return rather than checking `s2 === 'None'`: a narrowed Project-line-only viewer also has `s2 === 'None'` per the section matrix but is entitled to full (unrestricted) S10/S11 data — the flag makes the distinction unambiguous.

`managerSectionAccess`/`peoplePartnerSectionAccess` TS extension: the comment in `profile.ports.ts` line 13 already documents that "the wire shape carries S1-S16; extra keys are simply ignored by JSON parsing." Adding `s10`/`s11` to the interface surfaces what the HTTP response already provides — the adapter cast `(await response.json()) as AccessRoleResolution` requires no code change.

## Verification

**Commands:**
- `cd services/people-service && npm run db:migrate` -- expected: migration applied, new `leaves` and `person_project_assignments` tables created
- `cd services/people-service && npm run build` -- expected: clean TypeScript build, zero errors
- `cd services/people-service && node node_modules/jest-cli/bin/jest.js "profile.service.spec" --no-coverage` -- expected: all unit tests pass including new S10/S11 and whitelist-key assertions
- `cd services/people-service && node node_modules/jest-cli/bin/jest.js "profile.e2e-spec" --no-coverage` -- expected: all e2e tests pass including colleague key-set and field-restriction spot-checks
- `cd services/people-service && npm run lint` -- expected: no lint errors

### Review Findings

- [x] [Review][Patch] Adapter test `toEqual(body)` fails after `parseAccessRoleResolution` normalizes response with extra fields [http-access-role-resolution.adapter.spec.ts:44]
- [x] [Review][Patch] `toS11` full mapper uses truthiness check `a.role ?` — strips empty-string role; use `a.role !== null` [profile.service.ts]
- [x] [Review][Patch] Missing `toS11` test variants for `startDate: null` with non-null `endDate` and vice versa [profile.service.spec.ts]
- [x] [Review][Defer] `PersonProjectAssignment` table has no writer — S11 returns empty arrays in production until epic-14 populates the table — deferred, pre-existing
- [x] [Review][Defer] `orderBy: { startDate: 'asc' }` on nullable `PersonProjectAssignment.startDate` — PostgreSQL nulls-last by default, ordering semantics undocumented — deferred, pre-existing
