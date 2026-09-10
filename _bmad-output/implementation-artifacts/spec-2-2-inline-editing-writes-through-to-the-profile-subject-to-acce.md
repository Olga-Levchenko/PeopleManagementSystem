---
title: 'Story 2.2: Inline editing writes through to the profile, subject to access'
type: 'feature'
created: '2026-09-10'
status: 'draft'
review_loop_iteration: 0
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

**Approach:** Add a server-enforced profile field write API in `people-service` (resolve access per subject+field, require `ReadWrite` on the backing section), expose `editable` in the field catalog, proxy through BFF, and add inline edit cells on `AllEmployeesPage` that PATCH a single field and show `aria-live` confirmation. Reject organisational-relationship fields (manager, PP, department) and derived read-only fields.

## Boundaries & Constraints

**Always:** Server-side write gate on every patch — check resolved `AccessRoleResolution` for the viewer/subject pair and require `ReadWrite` on the field's backing section (S1 for stored identity fields, S16 for custom fields). Use shared `deriveAudienceFromResolution` / new `grantsSectionWriteAccess(level)` helper — same fail-closed posture as profile reads. Direct API calls and UI submits must hit the same code path. Catalog `editable` must be viewer-scoped: only fields the editor may write appear editable; never rely on client-only disable. Custom fields require both S16 `ReadWrite` and `canSeeCustomField()` for the definition. Story 1.6 AC3: reject writes to manager, people partner, or department through this general write path (403, not silent ignore). Single-field PATCH body `{ fieldKey, value }` with catalog-key vocabulary (`countryCity`, `custom:{definitionId}`). On success, persist to the same Prisma models `getProfile` reads.

**Ask First:** Whether `fullName` and `position` are in the first editable slice or deferred — default include both when S1 is `ReadWrite`. Whether self-edit on All Employees (viewer is subject) is in scope — default manager/PP editing **other** subjects only; self-service list edits defer to Story 2.6.

**Never:** Inline edit for manager, people partner, department, mentor, or project-assignment fields. Inline edit for derived `yearsWithCompany`. Saved views (2.3), export (2.4), colleague mode (2.5). Hardcoded functional-role names. Client-only write permission. Bulk/multi-field patch in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| RW_STORED_FIELD | Viewer has S1 `ReadWrite`; patch `countryCity` | 200; value persisted; list/profile read shows new value | N/A |
| R_ONLY_STORED_FIELD | Viewer has S1 `Read` only; patch `countryCity` | 403 Forbidden | Same for UI and direct API |
| NO_ACCESS_FIELD | Viewer colleague-tier; patch any stored field | 403 Forbidden | No leak of field existence beyond list rules |
| CUSTOM_RW | Viewer S16 `ReadWrite` + visibility allows; patch `custom:{id}` | 200; `CustomFieldValue` upserted | N/A |
| CUSTOM_R_ONLY | Viewer S16 `Read`; patch `custom:{id}` | 403 Forbidden | N/A |
| ORG_RELATIONSHIP_KEY | Patch `departmentName` or blocked S1 relationship key | 403 with stable error — not routed to org-relationship journal | N/A |
| DERIVED_FIELD | Patch `yearsWithCompany` | 400 Bad Request — not writable | N/A |
| UNKNOWN_FIELD_KEY | Patch key not in catalog for viewer | 400 or 403 fail-closed | N/A |
| INVALID_VALUE | Wrong type for field dataType | 400 validation error | N/A |

</frozen-after-approval>

## Code Map

- `services/people-service/src/modules/profile/profile.controller.ts` — add `PATCH :subjectPersonId/profile/fields` (or dedicated write controller delegating to service)
- `services/people-service/src/modules/profile/profile.service.ts` — `patchProfileField(viewer, subject, fieldKey, value)` with resolve + section write gate + Prisma update
- `services/people-service/src/modules/profile/profile-audience.util.ts` — add `grantsSectionWriteAccess(level)` (`ReadWrite` only)
- `services/people-service/src/modules/employees/employees.service.ts` — extend catalog entries with `editable`; map catalog keys → section + blocked-key set
- `services/people-service/src/modules/employees/employees.dto.ts` — patch DTO if routed via employees module (prefer profile ownership)
- `services/bff/src/modules/employees/employees.controller.ts` — proxy `PATCH` to people-service
- `services/frontend/src/pages/AllEmployeesPage/AllEmployeesPage.tsx` — inline edit cells for `editable` columns; `aria-live` status region
- `services/frontend/src/api/employees.ts` + `useEmployees` hooks — `patchEmployeeField` mutation
- `docs/access-control/section-matrix.md` — trace negative tests for R-only and `—` cells touched

## Tasks & Acceptance

**Execution:**
- [ ] `profile-audience.util.ts` — `grantsSectionWriteAccess`; unit tests for Read vs ReadWrite
- [ ] `profile.service.ts` — `patchProfileField` with resolve, per-field section gate, org-relationship key blocklist, Prisma write for S1 stored + S16 custom values
- [ ] `profile.controller.ts` — authenticated PATCH endpoint; ValidationPipe on DTO
- [ ] `employees.service.ts` — catalog `editable` flag from viewer's resolved access + blocklist; no editable derived fields
- [ ] `bff/.../employees.controller.ts` + `employees.service.ts` — forward PATCH with auth headers
- [ ] `AllEmployeesPage` + hooks — inline edit UX (blur/confirm), optimistic or refetch-on-success, `aria-live` confirmation/error
- [ ] `profile.service.spec.ts` + `employees.service.spec.ts` — R-only 403, RW success, custom field paths, org-relationship rejection
- [ ] `profile.e2e-spec.ts` or `employees.e2e-spec.ts` — HTTP PATCH negative test for R-only editor

**Acceptance Criteria:**
- Given an editor who holds only Read access to a field, when they submit an inline edit to that field, then the edit is rejected server-side with 403 — direct API calls fail the same way as the UI
- Given an editor who holds ReadWrite access to a field, when they submit a valid inline edit, then the change writes through to the same underlying profile record the profile page reads

## Design Notes

**Catalog keys → sections:** stored S1 keys (`countryCity`, `position`, `startDate`, `fullName`) require S1 `ReadWrite`. `custom:{definitionId}` requires S16 `ReadWrite` plus visibility. **Blocklist (never editable via this API):** `departmentName`, `managerName`, `peoplePartnerName`, `mentorName`, `projectName`, `yearsWithCompany`, and any key added solely for org-relationship display.

**Write confirmation (UX):** per EXPERIENCE.md — announce success/failure in an `aria-live="polite"` region; do not rely on visual flash alone.

## Verification

**Commands:**
- `cd services/people-service && npm run lint && npm test` — expected: profile + employees specs green, new patch tests pass
- `cd services/bff && npm run lint && npm test` — expected: employees proxy PATCH test passes
- `cd services/frontend && npm run lint && npx tsc -b --noEmit` — expected: clean
- `cd services/people-service && node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --testPathPatterns=employees|profile` — expected: patch e2e passes

## Spec Change Log
