---
title: 'Story 2.2: Inline editing writes through to the profile, subject to access'
type: 'feature'
created: '2026-09-10'
status: 'ready-for-dev'
review_loop_iteration: 2
baseline_commit: 'f8010b15137e5458e5d365f3b000adf078145c47'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-universal-filter-column-engine-over-profile-fields.md'
  - '{project-root}/services/people-service/CLAUDE.md'
  - '{project-root}/services/bff/CLAUDE.md'
  - '{project-root}/services/frontend/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 2.1 delivers read-only All Employees rows. Managers and PPs need to edit visible cells inline, but a write must fail server-side when the editor holds only Read access — including when a client bypasses the UI with a direct API call. Today `people-service` has no general profile-field write endpoint.

**Approach:** Add a server-enforced profile field write API in `people-service` (resolve access per subject+field, require `ReadWrite` on the backing section), expose **per-row** `editableFields` on list rows (S1 RW varies per subject relationship), proxy through BFF, and add inline edit cells on `AllEmployeesPage` that PATCH a single field and show `aria-live` confirmation. Reject self-edit on All Employees (403 until Story 2.6), organisational-relationship fields (manager, PP, department), and derived read-only fields. First editable stored S1 slice includes `fullName`, `position`, `countryCity`, and `startDate`.

## Boundaries & Constraints

**Always:** Server-side write gate on every patch — one `resolve` call per PATCH (acceptable; list already uses `resolveBatch` per page). Reject with **403** when `viewerPersonId === subjectPersonId` (self-edit on All Employees defers to Story 2.6). Check resolved `AccessRoleResolution` for the viewer/subject pair and require `ReadWrite` on the field's backing section: S1 for stored identity fields (`fullName`, `position`, `countryCity`, `startDate`); S16 for custom fields via new `resolveS16WriteAccess(resolution)` (`mostPermissive` across manager/PP/FPA `s16` levels — do **not** overload `deriveAudienceFromResolution`, which only exposes visibility tier). Use `grantsSectionWriteAccess(level)` (`ReadWrite` only) — same fail-closed posture as profile reads; **never** use `grantsSectionAccess` (Read or ReadWrite) for write or `editableFields` decisions. Direct API calls and UI submits must hit the same code path. **Per-row editability:** each list row carries `editableFields: string[]` (catalog keys the viewer may write for **that subject**); return **`editableFields: []`** when `viewerPersonId === person.id` (self-edit guard applies to list projection as well as PATCH — `deriveAudienceFromResolution` grants self S1 RW but All Employees must not offer edit affordances on the viewer's own row). The UI enables inline edit only when the column key is in that row's array — never rely on client-only disable or a viewer-global catalog flag. Custom fields require both S16 `ReadWrite` (from `resolveS16WriteAccess`) and `canSeeCustomField()` for the definition. Story 1.6 AC3: reject writes to manager, people partner, or department through this general write path (403, not silent ignore). Single-field PATCH body `{ fieldKey, value }` with catalog-key vocabulary (`countryCity`, `custom:{definitionId}`); `value` is typed `unknown` on the DTO and validated at runtime per resolved field key (see Design Notes). On success, persist to the same Prisma models `getProfile` reads; return **200** with `{ fieldKey, value }` echoing the persisted scalar (ISO `YYYY-MM-DD` for dates). Validation: `fullName` must be non-empty after trim; nullable stored strings (`position`, `countryCity`) accept `null` to clear; `startDate` accepts ISO date or `null`; custom values validated per `CustomFieldDataType` (see Design Notes).

**Ask First:** _(none — resolved in review loop 1)_

**Never:** Inline edit for manager, people partner, department, mentor, or project-assignment fields. Inline edit for derived `yearsWithCompany`. Self-edit on All Employees (viewer is subject). Saved views (2.3), export (2.4), colleague mode (2.5). Hardcoded functional-role names. Client-only write permission. Bulk/multi-field patch in this story. Other S1 fields not in the first slice (`workEmail`, `workPhone`, `birthday`, `photoUrl`) — profile-page edits only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| RW_STORED_FIELD | Viewer has S1 `ReadWrite` to subject; patch `countryCity` | 200 `{ fieldKey, value }`; value persisted; list/profile read shows new value | N/A |
| R_ONLY_STORED_FIELD | Viewer has S1 `Read` only to subject; patch `countryCity` | 403 Forbidden | Same for UI and direct API |
| PER_ROW_EDITABLE_MISMATCH | Viewer RW on subject A, Read-only on subject B; row B lists `countryCity` value but omits it from `editableFields` | UI does not offer edit on row B; direct PATCH for subject B returns 403 | No leak beyond list rules |
| NO_ACCESS_FIELD | Viewer colleague-tier; patch any stored field | 403 Forbidden | No leak of field existence beyond list rules |
| VIEWER_IS_SUBJECT | Viewer patches own `personId` via All Employees path | 403 Forbidden | Self-service list edits defer to Story 2.6 |
| VIEWER_IS_SUBJECT_LIST_ROW | Viewer appears in their own list row | Row `values` may include S1 fields; `editableFields` is `[]` | UI shows no edit affordance on own row |
| SUBJECT_NOT_FOUND | Unknown `subjectPersonId` | 404 Not Found | Distinct from 403 |
| CUSTOM_RW | Viewer S16 `ReadWrite` + visibility allows; patch `custom:{id}` | 200; `CustomFieldValue` upserted | N/A |
| CUSTOM_R_ONLY | Viewer S16 `Read`; patch `custom:{id}` | 403 Forbidden | N/A |
| INACTIVE_CUSTOM_FIELD | Patch `custom:{id}` for deactivated definition | 400 Bad Request | N/A |
| FPA_HOLDER_RW | Viewer holds Full profile access grant; patch allowed S1 field | 200; write succeeds via `fullProfileAccessSectionAccess` | N/A |
| ACS_DOWN | Access-control resolver unreachable | 403 Forbidden (adapter fail-closed to Colleague/Read) | Same as read path |
| ORG_RELATIONSHIP_KEY | Patch `departmentName` or blocked S1 relationship key | 403 with body `{ statusCode: 403, message: "…", error: "ORG_RELATIONSHIP_FIELD_NOT_EDITABLE" }` — not routed to org-relationship journal | N/A |
| DERIVED_FIELD | Patch `yearsWithCompany` | 400 Bad Request — not writable | N/A |
| UNKNOWN_FIELD_KEY_MALFORMED | `fieldKey` not matching catalog vocabulary (e.g. empty, bad `custom:` prefix) | 400 Bad Request | Malformed input |
| UNKNOWN_FIELD_KEY_NOT_WRITABLE | Well-formed key the viewer cannot write for this subject (blocklisted or no RW) | 403 Forbidden | Fail-closed; do not distinguish blocklist from no access |
| INVALID_VALUE | Wrong type for field `dataType` (e.g. text in NUMBER custom field) | 400 validation error with field key in message | N/A |
| EMPTY_FULL_NAME | Patch `fullName` to `""` or whitespace-only | 400 Bad Request | `fullName` is required on `Person` |
| PATCH_SAME_VALUE | Patch with value already stored | 200 idempotent; no error | N/A |

</frozen-after-approval>

## Code Map

- `services/people-service/src/modules/profile/profile.controller.ts` — add `PATCH :subjectPersonId/profile/fields` (profile module owns writes; not employees)
- `services/people-service/src/modules/profile/profile.service.ts` — `patchProfileField(viewer, subject, fieldKey, value)` with resolve, self-edit guard, per-field section write gate, org-relationship key blocklist, Prisma write for S1 stored + S16 custom values
- `services/people-service/src/modules/profile/profile-audience.util.ts` — add `grantsSectionWriteAccess(level)` (`ReadWrite` only) and `resolveS16WriteAccess(resolution)` (most-permissive `s16` across manager/PP/FPA paths)
- `services/people-service/src/modules/profile/profile.dto.ts` — `PatchProfileFieldDto`: `fieldKey: string` (class-validator `@IsString()`), `value: unknown` (no `@IsString()` — runtime validation in service after field-key resolution)
- `services/people-service/src/modules/employees/employees.service.ts` — per-row `editableFields` in list projection via `grantsSectionWriteAccess` (not `grantsSectionAccess`); extend catalog `dataType` mapping to all four `CustomFieldDataType` values; map catalog keys → section + blocked-key set; derived fields never editable
- `services/people-service/src/modules/employees/employees.dto.ts` — extend `EmployeeListRow` with `editableFields: string[]`
- `services/bff/src/modules/employees/employees.controller.ts` — proxy `PATCH /employees/:subjectPersonId/fields` to people-service profile endpoint
- `services/frontend/src/pages/AllEmployeesPage/AllEmployeesPage.tsx` — inline edit cells when column key ∈ row `editableFields`; `aria-live` status region; invalidate/refetch list query on success (not optimistic — derived `yearsWithCompany` must stay consistent when `startDate` changes)
- `services/frontend/src/api/employees.ts` + `useEmployees` hooks — `patchEmployeeField` mutation; extend `EmployeeListRow` with `editableFields`
- `docs/access-control/section-matrix.md` — trace negative tests for R-only and `—` cells touched

## Tasks & Acceptance

**Execution:**
- [ ] `profile-audience.util.ts` — `grantsSectionWriteAccess` + `resolveS16WriteAccess`; unit tests for Read vs ReadWrite and FPA/manager/PP S16 paths
- [ ] `profile.service.ts` — `patchProfileField` with self-edit 403, resolve, per-field section gate, org-relationship key blocklist, runtime `value` validation per field key, Prisma write for S1 stored + S16 custom values; org-relationship rejection throws `ForbiddenException` with `error: 'ORG_RELATIONSHIP_FIELD_NOT_EDITABLE'`
- [ ] `profile.controller.ts` — authenticated PATCH endpoint; ValidationPipe on DTO (`fieldKey` only — `value` validated in service); 200 response shape `{ fieldKey, value }`
- [ ] `employees.service.ts` — per-row `editableFields` via `grantsSectionWriteAccess` + `resolveS16WriteAccess` + blocklist; return `[]` when `viewerPersonId === person.id`; no editable derived fields
- [ ] `employees.service.ts` (catalog) — extend custom-field catalog `dataType` from Story 2.1's `number`/`string` to `string` | `number` | `date` | `boolean` aligned with Prisma `CustomFieldDataType`
- [ ] `bff/.../employees.controller.ts` + `employees.service.ts` — forward PATCH with auth headers
- [ ] `AllEmployeesPage` + hooks — inline edit UX (blur/confirm, Escape cancel, Enter save), refetch-on-success, `aria-live` confirmation/error
- [ ] `profile.service.spec.ts` + `employees.service.spec.ts` — self-edit 403, own-row `editableFields: []`, R-only 403, RW success, per-row editableFields variance, custom field paths, org-relationship rejection (`error` code), inactive custom field 400
- [ ] `profile.e2e-spec.ts` or `employees.e2e-spec.ts` — HTTP PATCH negative tests for R-only editor and viewer-is-subject

**Acceptance Criteria:**
- Given an editor who holds only Read access to a field for a subject, when they submit an inline edit to that field, then the edit is rejected server-side with 403 — direct API calls fail the same way as the UI
- Given an editor who holds ReadWrite access to a field for a subject, when they submit a valid inline edit, then the change writes through to the same underlying profile record the profile page reads and the API returns `{ fieldKey, value }`
- Given a list row where the viewer holds ReadWrite on subject A but only Read on subject B for the same column, when the list is returned, then subject A's row includes that field key in `editableFields` and subject B's row does not
- Given the viewer's own row in the All Employees list, when the list is returned, then `editableFields` is an empty array even though S1 values are present
- Given an editor patching their own `personId` through the All Employees write path, when the request is submitted, then it is rejected with 403 (self-service edits defer to Story 2.6)
- Given a patch to `departmentName`, `managerName`, `peoplePartnerName`, or another org-relationship display key, when submitted, then the server returns 403 with response body `error: "ORG_RELATIONSHIP_FIELD_NOT_EDITABLE"`
- Given a patch to `yearsWithCompany`, when submitted, then the server returns 400
- Given a viewer with S16 ReadWrite and visibility access to a custom field, when they patch `custom:{definitionId}` with a valid typed value, then the custom field value is upserted and visible on profile read
- Given a successful or failed inline edit in the UI, when the operation completes, then success or failure is announced in an `aria-live="polite"` region

## Design Notes

**First editable stored S1 slice:** `fullName`, `position`, `countryCity`, `startDate` — all require S1 `ReadWrite` for the viewer/subject pair. `custom:{definitionId}` requires S16 `ReadWrite` (via `resolveS16WriteAccess`) plus `canSeeCustomField()` visibility. **Blocklist (never editable via this API):** `departmentName`, `managerName`, `peoplePartnerName`, `mentorName`, `projectName`, `yearsWithCompany`, and any key added solely for org-relationship display.

**Per-row `editableFields`:** computed during `projectPeopleToListRows` using the same per-subject resolution as row values. Use `grantsSectionWriteAccess(audience.s1)` for stored S1 keys and `grantsSectionWriteAccess(resolveS16WriteAccess(resolution))` plus `canSeeCustomField()` for custom keys — **not** `grantsSectionAccess` (which treats Read as sufficient for display only). When `viewerPersonId === person.id`, return `editableFields: []` before any write-access computation.

**`PatchProfileFieldDto.value`:** typed `unknown` on the DTO; `ValidationPipe` whitelists `fieldKey` + `value` but does not coerce `value`. `patchProfileField` resolves the field key, then validates `value` at runtime: stored strings accept `string | null`; `startDate` accepts ISO `YYYY-MM-DD` string or `null`; custom fields per `dataType` below.

**Forbidden error shape (org-relationship blocklist):** throw `new ForbiddenException({ message: 'Organisational relationship fields cannot be edited through this endpoint.', error: 'ORG_RELATIONSHIP_FIELD_NOT_EDITABLE' })` — Nest serializes this as `{ statusCode: 403, message: '…', error: 'ORG_RELATIONSHIP_FIELD_NOT_EDITABLE' }`. Tests assert on `response.body.error`.

**Custom field `dataType` validation** (aligned with Prisma `CustomFieldDataType`):
- `TEXT` — string; trim; empty string stored as `""`
- `NUMBER` — JSON number or numeric string parseable to finite number
- `DATE` — ISO `YYYY-MM-DD` or `null` to clear
- `BOOLEAN` — `true` / `false` (reject other strings)

**Catalog `dataType` mapping** (Story 2.1 delta, required by 2.2): `TEXT` → `'string'`, `NUMBER` → `'number'`, `DATE` → `'date'`, `BOOLEAN` → `'boolean'` in `EmployeeFieldCatalogEntry.dataType` (extend frontend `EmployeeFieldDataType` union likewise).

**PATCH response:** `200 OK` body `{ "fieldKey": "<key>", "value": <scalar|null> }` — dates as `YYYY-MM-DD` strings, numbers as JSON numbers, booleans as JSON booleans.

**Write confirmation (UX):** per EXPERIENCE.md — announce success/failure in an `aria-live="polite"` region; do not rely on visual flash alone.

## Verification

**Commands:**
- `cd services/people-service && npm run lint && npm test` — expected: profile + employees specs green, new patch tests pass
- `cd services/bff && npm run lint && npm test` — expected: employees proxy PATCH test passes
- `cd services/frontend && npm run lint && npx tsc -b --noEmit` — expected: clean
- `cd services/people-service && node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --testPathPatterns=employees|profile` — expected: patch e2e passes

## Spec Change Log

- **2026-09-10 (review loop 1):** Resolved Ask First (include `fullName`/`position`; reject self-edit 403 until 2.6). Added `resolveS16WriteAccess`, per-row `editableFields`, expanded I/O matrix, eight acceptance criteria, PATCH response contract, validation rules, custom field type mapping, fixed `UNKNOWN_FIELD_KEY` to 400 (malformed) vs 403 (not writable).
- **2026-09-10 (review loop 2):** Pinned self-edit guard on `editableFields`, mandated `grantsSectionWriteAccess` over `grantsSectionAccess`, defined Nest `ForbiddenException` error body shape, specified `PatchProfileFieldDto.value` as `unknown` with runtime validation, added explicit catalog `dataType` task. Status → `approved`.
