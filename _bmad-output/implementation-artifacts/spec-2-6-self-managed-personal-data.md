---
title: 'Story 2.6: Self-managed personal data (S2 self-edit MVP)'
type: 'feature'
created: '2026-09-11'
status: 'in-progress'
review_loop_iteration: 1
baseline_commit: '3ce0b66'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-inline-editing-writes-through-to-the-profile-subject-to-acce.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-8-management-list-row-navigation-to-employee-profile.md'
  - '{project-root}/services/people-service/CLAUDE.md'
  - '{project-root}/services/bff/CLAUDE.md'
  - '{project-root}/services/frontend/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.2 deliberately rejects all self-edits on `PATCH /people/:id/profile/fields` with 403 (`"Self-edit is not permitted on All Employees."`). Employees therefore cannot update their own S2 personal contacts on the Employee Profile even though the section matrix grants Employee **RW** on S2 toward self, and Story 2.8 shipped a read-only S2 block on `EmployeeProfilePage`.

**Approach:** Narrow the Story 2.2 self-edit gate so **only** `personalPhone`, `personalEmail`, and `residentialAddress` (the stored S2 slice in `Person` today) are writable when `viewerPersonId === subjectPersonId`, with `grantsSectionWriteAccess(audience.s2)` enforced server-side. Bypass `ColleagueBrowseGateService` on profile PATCH when viewer is subject so colleague-catalog employees are not blocked before the service layer. Expose a profile-scoped BFF PATCH route symmetric to profile GET, and add self-only inline edit affordances on the S2 section of `EmployeeProfilePage` when `auth.user.sub === personId`. Keep All Employees **list UI** non-editable on the viewer's own row (`editableFields: []` per Story 2.2); on the shared PATCH endpoint, self callers may write S2 keys only — S1/custom remain 403.

## Boundaries & Constraints

**Always:** Server-side write gate on every PATCH — same `patchProfileField` code path for list and profile BFF callers; authorization is field-key + audience based, not client route based. **`profile.controller` PATCH:** when `actorId === subjectPersonId`, skip `ColleagueBrowseGateService.assertManagementBrowseAllowed` so colleague-catalog employees can self-service S2; the gate remains for all non-self PATCH callers (Story 2.5 management browse lockout unchanged for others' profiles). Self may write **only** keys in `EDITABLE_S2_FIELD_KEYS` (`personalPhone`, `personalEmail`, `residentialAddress`). Self-edit of S1, S16/custom, org-relationship, or derived fields remains **403** with message `"Self-edit is not permitted on All Employees."` (plain `ForbiddenException` body today — no structured `error` code on this path). Manager/PP editing another person's S2 through this endpoint remains **out of scope** — only the self S2 branch is added; non-self patches continue to accept only `EDITABLE_S1_FIELD_KEYS` as today. Require `grantsSectionWriteAccess(audience.s2)` for self S2 writes (self audience is `ReadWrite` per `profile-audience.util.ts`; self branch in `deriveAudienceFromResolution` does not call ACS — document fail-closed only for non-self paths). S2 value validation mirrors nullable S1 strings (`position`/`countryCity`): `null` clears the field; non-null must be `string` (empty string stored as-is, not coerced). `personalEmail` is a nullable string with **no** email-format validation in this story. Profile page enables edit UI **only** when viewer is subject (`user.sub === personId`, after `useAuth` `loading === false`); viewing another person's profile stays read-only for S2. Reuse Story 2.2 inline-edit interaction (click-to-edit, blur commit, `aria-live` success/error). Invalidate/refetch profile query after successful PATCH. Unit tests in `profile.service.spec.ts`, `profile.controller.spec.ts`, and e2e in `profile.e2e-spec.ts` for colleague-catalog self S2 happy path + self S1 still 403. Playwright smoke: authenticated user opens own profile, edits an S2 field, sees persisted value.

**Ask First:** _(none — resolved in review loop 1)_

**Never:** S3 emergency contacts (no schema/API today). Photo upload (`photoUrl` is read-only storage; no upload pipeline). Certificate upload/attachment. **Place of stay** and **messengers** until `Person` model and profile assembly expose them (matrix mentions them; only three S2 columns exist in Prisma). Inline edit affordance on the viewer's own All Employees list row (Story 2.2 `editableFields: []` preserved). Client-side permission matrix — edit affordance is a UX hint only; server is authoritative. Manager editing someone else's S2 via profile page in this story. Expanding `ProfileResponse` beyond current S2 shape. Weakening Story 2.5 colleague browse gate for non-self PATCH callers.

## Provenance

| Source | What it deferred or excluded |
|---|---|
| `epics.md` Story 2.6 AC | Full epic AC includes S3 writes, photo upload, certificate upload — **MVP narrows to S2 self-edit only** per human scope |
| `spec-2-2` | Self-edit 403 on All Employees path until Story 2.6 |
| `spec-2-8` | Read-only profile shell; self-service writes explicitly owned by 2.6–2.7 |
| `deferred-work.md` (this spec) | S3 self-edit, photo upload, certificate upload carved to follow-up entries |

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| SELF_S2_PHONE | Viewer === subject; `fieldKey: personalPhone`, string value | 200; `Person.personalPhone` updated; echoed in response | 400 on non-string |
| SELF_S2_NULLABLE | Viewer === subject; `fieldKey: personalEmail`, `value: null` | 200; field cleared | 400 on wrong type |
| SELF_S2_EMPTY_STRING | Viewer === subject; `fieldKey: residentialAddress`, `value: ""` | 200; empty string persisted | 400 on wrong type |
| SELF_S2_COLLEAGUE_CATALOG | `listAudienceLevel=colleague`; viewer === subject; valid S2 key | 200; colleague browse gate bypassed; service enforces S2 allowlist | Must not return `COLLEAGUE_BROWSE_RESTRICTED` |
| SELF_S1_BLOCKED | Viewer === subject; `fieldKey: countryCity` | 403; message `"Self-edit is not permitted on All Employees."` | No DB change |
| SELF_S2_CUSTOM_BLOCKED | Viewer === subject; `fieldKey: custom:…` | 403; same deferral message as S1 self-edit | No DB change |
| SELF_S2_UNKNOWN_KEY | Viewer === subject; well-formed but non-allowlisted key (e.g. future `messengers`) | 403 | No DB change |
| OTHER_S2_BLOCKED | Manager patches subject's `personalPhone` | 403 (S2 not in manager patch path yet) | No DB change |
| OTHER_S1_UNCHANGED | Manager patches subject's `countryCity` with S1 RW | 200 (existing 2.2 behavior) | Unchanged |
| SUBJECT_NOT_FOUND | Viewer patches unknown `subjectPersonId` | 404 Not Found | Distinct from 403 |
| PATCH_SAME_VALUE | Viewer === subject; S2 patch with value already stored | 200 idempotent | No error |
| UNKNOWN_FIELD_KEY_MALFORMED | Empty or malformed `fieldKey` | 400 Bad Request | Before self/S2 branch |
| LIST_SELF_S1_BLOCKED | Employee patches own `countryCity` via `/employees/:id/fields` (shared upstream) | 403; deferral message | Story 2.2 S1 self-edit guard preserved |
| LIST_SELF_S2_ALLOWED | Employee patches own `personalPhone` via `/employees/:id/fields` (shared upstream) | 200; same as profile path | No S2 columns on list today — no UI affordance |
| LIST_ROW_UI_UNCHANGED | Viewer appears in own list row | `editableFields: []`; no inline edit on any column | Story 2.2 list projection preserved |
| PROFILE_UI_SELF | `user.sub === personId`; `s2` key present; auth loaded | S2 fields show inline edit affordance | Read-only while `loading` or when not self |
| PROFILE_UI_OTHER | Viewer opens another person's profile with `s2` | S2 read-only | N/A |

</frozen-after-approval>

## Code Map

- `services/people-service/src/modules/profile/profile-field-keys.util.ts` — add `EDITABLE_S2_FIELD_KEYS` set (`personalPhone`, `personalEmail`, `residentialAddress`)
- `services/people-service/src/modules/profile/profile.service.ts:266-341` — replace blanket self 403 with: self + S2 key → S2 write branch; self + non-S2 → keep 403; add `patchStoredS2Field` (nullable string fields, mirror `countryCity` validation)
- `services/people-service/src/modules/profile/profile.controller.ts:33` — on PATCH, skip `colleagueBrowseGate.assertManagementBrowseAllowed` when `actorId === subjectPersonId`; gate unchanged for non-self callers
- `services/people-service/src/modules/profile/__tests__/profile.controller.spec.ts` — self PATCH bypasses gate (colleague catalog); non-self PATCH still gated
- `services/people-service/src/modules/profile/__tests__/profile.service.spec.ts:940` — update `rejects self-edit` to specify S1 key; add self S2 success + self S1 still 403
- `services/people-service/test/profile.e2e-spec.ts:637` — replace gate-blocked self PATCH expectation: S1 still 403 with deferral message; add colleague-catalog self S2 persist test
- `docs/access-control/section-matrix.md` — trace negative test: manager PATCH another person's S2 → 403 (Manager column S2 is R, not RW)
- `services/bff/src/modules/employees/people.controller.ts` — add `PATCH :subjectPersonId/profile/fields` forwarding to `EmployeesService.patchField` (same upstream as employees controller)
- `services/bff/src/modules/employees/__tests__/people.controller.spec.ts` — PATCH proxy test
- `services/frontend/src/api/profile.ts` — `patchProfileFieldApiCall`; optional `usePatchProfileField` mutation hook
- `services/frontend/src/pages/EmployeeProfilePage/EmployeeProfilePage.tsx:117-148` — self-only editable S2 cells; `useAuth` for `user.sub === personId`
- `services/frontend/src/locales/en/translation.json` — save/error strings for profile field edit if missing
- `services/frontend/e2e/employee-profile-self-edit.spec.ts` — new Playwright: mock or seed own profile, edit S2 field, assert UI + PATCH

**Reuse:** `EmployeesService.patchField` upstream proxy; `InlineEditableCell` interaction pattern from `AllEmployeesPage/InlineEditableCell.tsx` (may adapt props — catalog entry not required for three fixed S2 fields); `deriveAudienceFromResolution` / `resolveAudience` for self `s2: ReadWrite`.

**Read-only evidence:** `prisma/schema.prisma` `Person` has only three S2 columns; no S3 model; `photoUrl` without upload API; `profile.service.ts:272-276` current blanket self 403.

## Tasks & Acceptance

**Execution:**
- [x] `profile-field-keys.util.ts` — define `EDITABLE_S2_FIELD_KEYS` — central allowlist for self S2 writes
- [x] `profile.controller.ts` — bypass colleague browse gate when `actorId === subjectPersonId` on PATCH
- [x] `profile.service.ts` — S2 self-write branch + `patchStoredS2Field`; preserve self 403 for non-S2 keys
- [x] `profile.controller.spec.ts` + `profile.service.spec.ts` + `profile.e2e-spec.ts` — colleague-catalog self S2 happy path; gate still blocks non-self colleague PATCH; self S1/custom 403; manager S2 patch still 403
- [x] `people.controller.ts` (BFF) + test — `PATCH /people/:id/profile/fields` proxy
- [x] `profile.ts` + hook — frontend PATCH client for profile path
- [x] `EmployeeProfilePage.tsx` — self-only inline S2 edit with aria-live feedback and query invalidation
- [x] `employee-profile-self-edit.spec.ts` — Playwright smoke for own-profile S2 edit

**Acceptance Criteria:**
- Given an employee viewing their own profile at `/people/:personId` where `personId` matches their authenticated `sub`, when the API returns `s2`, then `personalPhone`, `personalEmail`, and `residentialAddress` are inline-editable and PATCH persists on blur/commit
- Given a colleague-catalog employee (`listAudienceLevel=colleague`) PATCHing their own `personalPhone` via `PATCH /people/:id/profile/fields`, when the request is valid, then the server returns 200 (colleague browse gate bypassed) with persisted value and profile GET reflects the change
- Given an employee PATCHing their own `countryCity` or any S1/custom field via the same endpoint, when the request is submitted, then the server returns 403 and Story 2.2 All Employees deferral behavior is preserved
- Given a manager PATCHing another person's `personalPhone`, when the request is submitted, then the server returns 403 (S2 manager writes not in this story)
- Given a viewer on another person's profile, when S2 is present, then all S2 fields are read-only regardless of client manipulation
- Given Playwright `employee-profile-self-edit.spec.ts`, when run, then own-profile S2 edit flow passes

## Design Notes

### Why one PATCH endpoint, not two

List and profile BFF routes both proxy to `PATCH /people/:id/profile/fields` in people-service. The Story 2.2 **list UI** rule is preserved by per-row `editableFields: []` on the viewer's own row — no inline edit affordance on All Employees. On the shared API, **field-key allowlists** gate writes: self callers may pass S2 keys only (S1/custom → 403); non-self callers may pass S1 keys only (today). A direct API call to `/employees/:id/fields` with an S2 key therefore succeeds for self — acceptable because S2 is not on the list catalog and the matrix grants self RW on S2. No separate people-service URL is required; the BFF adds `PATCH /people/:id/profile/fields` for frontend clarity.

### Colleague browse gate vs. self-service

Story 2.5 placed `ColleagueBrowseGateService` on profile PATCH to block colleague-catalog viewers from management write paths. Self S2 edit is an explicit exception: when `viewerPersonId === subjectPersonId`, skip the gate so employees can PATCH their own S2 without holding management catalog audience. Non-self PATCH (including colleague viewing another person's profile via API) remains gate-blocked.

### S2 field scope vs. matrix wording

Section matrix S2 lists messengers and place of stay; the implemented `Person` model and `toS2()` mapper expose three fields only. This story ships self-edit for **implemented** fields; matrix-complete S2 requires schema/API follow-up (see deferred-work).

### Relationship to Story 2.7

2.7 adds self **read** of manager-maintained sections and S6 exclusion. 2.6 is **write** for S2 only on the same `EmployeeProfilePage` route.

## Verification

**Commands:**
- `cd services/people-service && npm test -- profile.service.spec` — expected: self S2 tests pass
- `cd services/people-service && npm run test:e2e -- profile.e2e-spec` — expected: self S2 e2e pass
- `cd services/bff && npm test -- people.controller` — expected: PATCH proxy test pass
- `cd services/frontend && npm run typecheck && npm run lint && npm test` — expected: clean
- `cd services/frontend && npx playwright test employee-profile-self-edit.spec.ts` — expected: smoke pass

**Manual checks (if no CLI):**
- Log in as employee, navigate to own `/people/:id`, edit personal email, refresh — value persists; open a colleague's profile — S2 fields not editable.

## Review history

- **2026-09-11 (review loop 1):** Added `ColleagueBrowseGateService` bypass for self PATCH. Resolved `LIST_SELF_UNCHANGED` vs shared-endpoint contradiction (list UI `editableFields: []` + API allowlist split). Pinned 403 deferral message, S2 validation (`null`/string), `personalEmail` no format check, BFF `PeopleController` PATCH default. Expanded I/O matrix; fixed `profile.controller.ts` code map; added controller spec and section-matrix trace tasks.
