---
title: 'Story 1.10: Custom field visibility enforcement'
type: 'feature'
created: '2026-09-03'
status: 'in-progress'
review_loop_iteration: 0
baseline_commit: 'da52e2f'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/access-control/section-matrix.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Custom fields (S16) have no data model in `people-service` and their per-field visibility (`management`/`employee`/`colleague`) is not enforced anywhere — a `management`-visibility field currently leaks to every audience equally.

**Approach:** Add `CustomFieldDefinition` and `CustomFieldValue` Prisma models, introduce a pure `canSeeCustomField` function as the single-call policy point for future surfaces (list, filter, export), extend `resolveAudience` with a `customFieldAudienceLevel` that maps viewer category to visibility level, always include `s16` in the profile response (filtered per audience), and update the existing colleague whitelist assertion to add `s16` to the expected key set.

## Boundaries & Constraints

**Always:** `s16` is included in the response for every audience — even a Colleague gets `s16: []` when no colleague-visibility fields exist (empty array, key present). `canSeeCustomField` is the single source of truth; never duplicate the visibility logic in other files. Fail closed: an unrecognised visibility value → treat as `management` (most restrictive). Filter inactive definitions out of the response silently (no error). `customFieldAudienceLevel` mapping: Self → `'employee'` (sees `employee` + `colleague` fields), Manager/PP → `'management'` (sees all), Colleague → `'colleague'` (sees only `colleague` fields). `value` is stored as a plain `String` — type coercion is not in scope for this story.

**Never:** Do not implement HR Admin CRUD for custom field definitions (Admin UI is a separate epic). Do not add filters, list columns, or export enforcement in this story — only `GET /api/v1/people/:id/profile`. Do not add a new HTTP endpoint to access-control-service; the visibility decision lives in people-service based on the already-resolved audience.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| MANAGEMENT_FIELD_COLLEAGUE | Viewer is Colleague; one `management`-visibility active field with a value | Field absent from `s16`; `s16: []` | N/A |
| MANAGEMENT_FIELD_SELF | Viewer is Self; one `management`-visibility field | Field absent from `s16`; `s16: []` | N/A |
| MANAGEMENT_FIELD_MANAGER | Viewer is Manager or PP; one `management`-visibility field | Field present in `s16` | N/A |
| EMPLOYEE_FIELD_COLLEAGUE | Viewer is Colleague; one `employee`-visibility field | Field absent from `s16`; `s16: []` | N/A |
| EMPLOYEE_FIELD_SELF | Viewer is Self; one `employee`-visibility field | Field present in `s16` | N/A |
| COLLEAGUE_FIELD_ALL | Any viewer; one `colleague`-visibility field | Field present in `s16` for all audiences | N/A |
| COLLEAGUE_WHITELIST_KEYS | Viewer is Colleague (no qualifying line) | `Object.keys(body).sort()` === `['s1', 's10', 's11', 's16']` — `s16` is now part of the key set | N/A |
| INACTIVE_DEFINITION | Active flag set to `false` on a definition | Field absent from response for all audiences | N/A |
| NO_VALUES | Subject has no custom field values | `s16: []` for all audiences | N/A |

</frozen-after-approval>

## Code Map

- `services/people-service/prisma/schema.prisma:36+` — add `CustomFieldVisibility` enum (`MANAGEMENT`, `EMPLOYEE`, `COLLEAGUE`); add `CustomFieldDefinition` model (`id`, `name`, `visibility`, `isActive: true default`, `values CustomFieldValue[]`; `@@map("custom_field_definitions")`); add `CustomFieldValue` model (`id`, `definitionId` FK, `personId` FK, `value String`, `@@unique([definitionId, personId])`, `@@map("custom_field_values")`); add `customFieldValues CustomFieldValue[]` inverse on `Person`
- `services/people-service/prisma/migrations/` — produced by `npm run db:migrate` (name: `add_custom_field_definition_value`)
- `services/people-service/src/modules/profile/profile.ports.ts:17-45` — extend `AccessRoleResolution`'s `managerSectionAccess`/`peoplePartnerSectionAccess` interfaces to include `s16: SectionAccess` (additive only; `parseSectionAccessGroup` gains one more `parseSectionAccess(o['s16'])` line); add `S16CustomField { fieldId: string; name: string; value: string }` interface; extend `ProfileResponse` with `s16?: S16CustomField[]`
- `services/people-service/src/modules/profile/profile.service.ts:64-170` — add `CustomFieldAudienceLevel = 'colleague' | 'employee' | 'management'` type and `CustomFieldValueRow` type; extend `PersonWithRelations` with `customFieldValues: { definition: { id, name, visibility, isActive }; value: string }[]`; extend `resolveAudience` return type to include `customFieldAudienceLevel: CustomFieldAudienceLevel` (self→`'employee'`, manager/PP→`'management'`, colleague→`'colleague'`); add `private canSeeCustomField(visibility: string, audienceLevel: CustomFieldAudienceLevel): boolean` (pure; `COLLEAGUE` → always true, `EMPLOYEE` → not colleague, `MANAGEMENT` → management only); extend Prisma `select` to include `customFieldValues: { select: { value: true, definition: { select: { id, name, visibility, isActive } } } }`; add `response.s16` assembly unconditionally in `getProfile` (always present, filtered by `canSeeCustomField` + `isActive`)
- `services/people-service/src/modules/profile/__tests__/profile.service.spec.ts:13-29` — extend `FULL_PERSON_ROW` with `customFieldValues: [...]` containing one entry per visibility level; update Colleague test: `Object.keys(result).sort()` → `['s1', 's10', 's11', 's16']`; assert management + employee fields absent from `s16`; assert colleague field present; add Self test verifying management field absent, employee + colleague present; add Manager test verifying all three fields present
- `services/people-service/test/profile.e2e-spec.ts:136-167` — extend `seedSubject` to seed two `CustomFieldDefinition` rows (one `MANAGEMENT`, one `COLLEAGUE`) and one `CustomFieldValue` per definition for the subject; update Colleague e2e: `Object.keys(res.body).sort()` → `['s1', 's10', 's11', 's16']`; assert management field absent, colleague field present; add Self e2e assertion that management field absent, colleague field present; existing Manager e2e updated to assert `s16` present with both fields

## Tasks & Acceptance

**Execution:**
- [x] `services/people-service/prisma/schema.prisma` — add `CustomFieldVisibility` enum, `CustomFieldDefinition` model, `CustomFieldValue` model, inverse `customFieldValues` on `Person` — S16 backing data
- [x] `services/people-service/prisma/migrations/` — run `npm run db:migrate` (name: `add_custom_field_definition_value`) — schema DDL
- [x] `services/people-service/src/modules/profile/profile.ports.ts` — add `S16CustomField` type; extend `ProfileResponse` with `s16`; extend `managerSectionAccess`/`peoplePartnerSectionAccess` with `s16`; parse `s16` in `parseSectionAccessGroup` — additive interface extension
- [x] `services/people-service/src/modules/profile/profile.service.ts` — add `CustomFieldAudienceLevel` type; extend `PersonWithRelations` with `customFieldValues`; extend `resolveAudience` return; add `canSeeCustomField` pure function; extend Prisma select; assemble `s16` unconditionally in `getProfile` — core enforcement logic
- [x] `services/people-service/src/modules/profile/__tests__/profile.service.spec.ts` — update `FULL_PERSON_ROW`; add/update Colleague, Self, Manager S16 unit tests; update key-set assertion — verify per-visibility field restrictions
- [x] `services/people-service/test/profile.e2e-spec.ts` — extend `seedSubject`; update Colleague e2e; add Self/Manager S16 spot-checks — end-to-end visibility proof

**Acceptance Criteria:**
- Given a `management`-visibility active field, when a Colleague reads the subject's profile, then the field is absent from `s16` and `s16` is an empty array
- Given a `management`-visibility active field, when a Manager or PP reads the profile, then the field is present in `s16`
- Given an `employee`-visibility active field, when Self reads the profile, then the field is present in `s16`; when a Colleague reads it, the field is absent
- Given a `colleague`-visibility active field, when any viewer reads the profile, then the field is present in `s16`
- Given a Colleague viewer, when they read any profile, then `Object.keys(body).sort()` === `['s1', 's10', 's11', 's16']` — no keys outside that set
- Given an inactive custom field definition, when any viewer reads the profile, then the field is absent from `s16`

## Design Notes

`canSeeCustomField` is a pure function (no I/O, no class dependency) defined at module level in `profile.service.ts` — other Epic-2 surfaces (list engine, export) import and call it directly, satisfying the "single source of truth" AC without requiring an HTTP hop or a shared service injection.

`customFieldAudienceLevel: 'employee'` for Self (not `'management'`): S16's section-matrix "per field visibility" row for Self is read as "Self sees fields where visibility allows the employee themselves to view it" — management fields are explicitly for management audiences, not for the subject about themselves.

`s16` unconditionally present in `ProfileResponse`: unlike S2 (absent for Colleague), S16 uses per-field filtering rather than section-level gating. An empty array signals "no visible fields" without revealing whether invisible fields exist — consistent with S10/S11 empty-array behaviour from Story 1.8.

## Verification

**Commands:**
- `cd services/people-service && npm run db:migrate` — expected: migration applied, `custom_field_definitions` and `custom_field_values` tables created
- `cd services/people-service && npm run build` — expected: clean TypeScript build, zero errors
- `cd services/people-service && node node_modules/jest-cli/bin/jest.js "profile.service.spec" --no-coverage` — expected: all unit tests pass including new S16 visibility assertions and updated key-set check
- `cd services/people-service && node node_modules/jest-cli/bin/jest.js "profile.e2e-spec" --no-coverage` — expected: all e2e tests pass including colleague key-set and S16 field-restriction spot-checks
- `cd services/people-service && npm run lint` — expected: no lint errors
