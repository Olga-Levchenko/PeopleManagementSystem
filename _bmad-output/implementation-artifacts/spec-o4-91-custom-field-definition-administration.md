---
title: 'O4-91: Custom field definition administration'
type: 'feature'
created: '2026-09-05'
status: 'done'
review_loop_iteration: 0
baseline_commit: '00bd0090445be1224b6ad5e76c6caaf6493770b1'
context:
  - '{project-root}/services/people-service/CLAUDE.md'
  - '{project-root}/services/bff/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `CustomFieldDefinition` exists in the people-service schema (name, visibility, isActive) but has no `dataType` column and no HR Admin CRUD surface. Story 1.10's visibility filter and Story 2.1's filter engine both assume definitions already exist — no story anywhere creates them.

**Approach:** Add a `dataType` column (`TEXT|NUMBER|DATE|BOOLEAN`) to `CustomFieldDefinition` via migration; expose HR Admin CRUD (`POST/PATCH/DELETE`) in people-service; proxy from BFF; add a "Custom Field Definitions" section to the frontend Administration page alongside Functional Roles.

## Boundaries & Constraints

**Always:** Soft-delete only — "delete" sets `isActive = false`; hard-delete is forbidden because `CustomFieldValue` rows reference the definition. `dataType` is immutable after creation — a PATCH carrying `dataType` must be rejected with 400. `name` must be unique across active definitions (case-insensitive). `visibility` is one of `MANAGEMENT|EMPLOYEE|COLLEAGUE` (maps to the existing `CustomFieldVisibility` enum). `dataType` is one of `TEXT|NUMBER|DATE|BOOLEAN`. `GET /api/v1/custom-field-definitions` is readable by any authenticated user (what the caller can see in profiles is already filtered by `canSeeCustomField()` in Story 1.10). Write operations (`POST`, `PATCH`, `DELETE`) require HR Admin functional-role permission. Fail-closed on any permission-check failure (treat 5xx from access-control-service as 403).

**Ask First:** Where does the write-permission check live — in people-service (calling access-control-service's resolve endpoint per request) or at the BFF layer (BFF validates permission, then forwards to people-service via `InternalServiceAuthGuard`)? The former is architecturally cleaner (AD-5 says BFF must not own authorization policy); the latter avoids adding an HTTP call to people-service's hot path. Halt and confirm before wiring up auth.

**Never:** Hard-deleting a definition that has `CustomFieldValue` rows. Allowing `dataType` mutation on an existing definition. Enforcing write permissions in the frontend only. Building Story 2.1's filter/column engine here (that story wires the definitions into its query surface).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| CREATE_HAPPY | `POST {name, dataType, visibility}` (HR Admin) | 201 `{id, name, dataType, visibility, isActive: true}` | N/A |
| CREATE_DUPLICATE_NAME | `POST` with name matching an existing active definition | 409 Conflict | `{ error: "A custom field with this name already exists." }` |
| CREATE_INVALID_TYPE | `POST {dataType: "TIMESTAMP"}` | 400 Bad Request | validation error naming valid values |
| GET_ALL | `GET /api/v1/custom-field-definitions` (any authenticated caller) | 200 array of all definitions (including inactive) | N/A |
| UPDATE_HAPPY | `PATCH /:id {name?, visibility?}` (HR Admin) | 200 updated definition | N/A |
| UPDATE_DATA_TYPE | `PATCH /:id {dataType: "NUMBER"}` | 400 Bad Request | `{ error: "dataType cannot be changed after creation." }` |
| DEACTIVATE | `DELETE /:id` (HR Admin) | 200 `{...definition, isActive: false}` | N/A |
| DEACTIVATE_ALREADY_INACTIVE | `DELETE /:id` where `isActive` already false | 200 `{...definition, isActive: false}` (idempotent) | N/A |
| UNAUTHORIZED_WRITE | `POST/PATCH/DELETE` without HR Admin permission | 403 Forbidden | N/A |
| NOT_FOUND | `PATCH/DELETE` with unknown id | 404 Not Found | N/A |

</frozen-after-approval>

## Code Map

**People-service — data layer:**
- `services/people-service/prisma/schema.prisma:187–195` — `CustomFieldDefinition` model; add `dataType CustomFieldDataType` field; add `enum CustomFieldDataType { TEXT NUMBER DATE BOOLEAN }` alongside existing `CustomFieldVisibility` enum (lines 181–185)
- `services/people-service/prisma/migrations/` — new migration `add_custom_field_data_type`; `ALTER TABLE custom_field_definitions ADD COLUMN data_type TEXT NOT NULL DEFAULT 'TEXT'`; also create the enum type if Postgres-backed (Prisma uses `@db.Text` for string-backed enums — verify)
- `services/people-service/src/app.module.ts` — register `CustomFieldDefinitionsModule`

**People-service — new module (`src/modules/custom-field-definitions/`):**
- `custom-field-definitions.controller.ts` — `GET /api/v1/custom-field-definitions`, `POST`, `PATCH /:id`, `DELETE /:id`; thin controller delegating to service; global `JwtAuthGuard` already applies; write operations guarded by HR Admin permission check (pattern TBD per Ask First)
- `custom-field-definitions.service.ts` — CRUD logic using `PrismaService` (already global); unique-name check; immutable-dataType guard on PATCH; soft-delete on DELETE; `NotFoundException`/`ConflictException` where appropriate
- `custom-field-definitions.dto.ts` — `CreateCustomFieldDefinitionDto` (name, dataType, visibility), `UpdateCustomFieldDefinitionDto` (name?, visibility?; dataType explicitly excluded)
- `custom-field-definitions.module.ts` — registers controller + service

**BFF — proxy module (`src/modules/custom-field-definitions/`):**
- `custom-field-definitions.controller.ts` — mirrors people-service routes; extracts `ProxyContext` (auth, correlationId)
- `custom-field-definitions.service.ts` — `fetch` to `${PEOPLE_SERVICE_URL}/api/v1/custom-field-definitions`; forwards unchanged (same pattern as `organisational-relationships.service.ts:74`)
- `custom-field-definitions.module.ts` — registers controller + service
- `services/bff/src/app.module.ts` — register new module
- `services/bff/src/config/env.validation.ts:9` — `PEOPLE_SERVICE_URL` already defined; no new env var needed

**Frontend:**
- `services/frontend/src/api/customFieldDefinitions.ts` — typed fetch wrappers mirroring `functionalRoles.ts` pattern; `listDefinitions()`, `createDefinition()`, `updateDefinition()`, `deactivateDefinition()`
- `services/frontend/src/pages/AdministrationPage/AdministrationPage.tsx` — add "Custom Field Definitions" section after Functional Roles; form fields: name (text), dataType (select: TEXT/NUMBER/DATE/BOOLEAN), visibility (select: MANAGEMENT/EMPLOYEE/COLLEAGUE); list with edit/deactivate actions
- `services/frontend/src/pages/AdministrationPage/hooks/useCustomFieldDefinitions.ts` — state + mutation hook (mirrors `useFunctionalRoles.ts`)

**Story 1.10 integration (read-only, no change needed):**
- `services/people-service/src/modules/profile/profile.service.ts:380–395` — `toS16()` already reads `definition.isActive` and `definition.visibility`; adding `dataType` to the definition does not require changes here (S16 response shape already carries `fieldId`, `name`, `value` only)

## Tasks & Acceptance

**Execution:**
- [x] `services/people-service/prisma/schema.prisma` — add `CustomFieldDataType` enum (`TEXT NUMBER DATE BOOLEAN`) and `dataType` field to `CustomFieldDefinition`; run `npx prisma migrate dev --name add_custom_field_data_type`
- [x] `services/people-service/src/modules/custom-field-definitions/custom-field-definitions.dto.ts` — `CreateCustomFieldDefinitionDto` and `UpdateCustomFieldDefinitionDto` with class-validator decorators; `dataType` absent from Update DTO
- [x] `services/people-service/src/modules/custom-field-definitions/custom-field-definitions.service.ts` — CRUD service: unique-name check on create/rename; dataType-immutability guard on PATCH; soft-delete; `PrismaService` injected
- [x] `services/people-service/src/modules/custom-field-definitions/custom-field-definitions.controller.ts` — four routes; HR Admin permission guard (wired after Ask First resolved); module + app.module registration
- [x] `services/people-service/src/modules/custom-field-definitions/custom-field-definitions.module.ts` — module wiring; register in `app.module.ts`
- [x] `services/bff/src/modules/custom-field-definitions/` — proxy controller + service + module; register in bff `app.module.ts`
- [x] `services/frontend/src/api/customFieldDefinitions.ts` — typed API client
- [x] `services/frontend/src/pages/AdministrationPage/hooks/useCustomFieldDefinitions.ts` — state + mutations hook
- [x] `services/frontend/src/pages/AdministrationPage/AdministrationPage.tsx` — Custom Field Definitions UI section
- [x] `services/people-service/src/modules/custom-field-definitions/` — unit tests for service (unique-name conflict, dataType-immutability, soft-delete idempotency); controller integration tests for 400/403/404/409 paths

**Acceptance Criteria:**
- Given an HR Admin user, when `POST /api/v1/custom-field-definitions` is called with `{name: "Level", dataType: "TEXT", visibility: "MANAGEMENT"}`, then the response is 201 with `{id, name: "Level", dataType: "TEXT", visibility: "MANAGEMENT", isActive: true}`
- Given an existing active definition named "Level", when `POST` is called again with the same name, then the response is 409
- Given an existing definition, when `PATCH /:id` is called with `{dataType: "NUMBER"}` in the body, then the response is 400
- Given an existing active definition, when `DELETE /:id` is called, then the response is 200 with `isActive: false`; calling `DELETE` again returns 200 (idempotent)
- Given a non-HR-Admin authenticated user, when `POST/PATCH/DELETE` is called, then the response is 403
- Given any authenticated user, when `GET /api/v1/custom-field-definitions` is called, then all definitions (including inactive) are returned with 200
- Given a definition with `dataType: "NUMBER"`, when `GET profile` is called by a management-level viewer, the field appears in `s16` with its `value` string; Story 1.10's `toS16()` is unchanged

## Design Notes

**Soft-delete rationale:** `CustomFieldValue` rows reference `CustomFieldDefinitionId` with `onDelete: Cascade` in Prisma. Hard-deleting a definition permanently destroys all employee values for that field. Soft-delete (`isActive = false`) preserves historical values and lets `toS16()` filter them out using its existing `cfv.definition.isActive` check — zero code change to the read path.

**`dataType` immutability:** changing `NUMBER` to `TEXT` on a field with existing values would silently corrupt any downstream consumer (filter engine, export) that expects numeric values. The value column is `String` in both Prisma schema and DB; type semantics are entirely at the application layer (parse on read). Blocking the mutation is safer than silent misinterpretation.

**`GET` open to all authenticated users:** the list of *definitions* (name, dataType, visibility label) is configuration metadata, not personal data. Story 2.1's filter engine needs it to populate filter options. Restricting reads to HR Admin would require 2.1 to use an elevated-privilege service call instead of a user-level call.

## Verification

**Commands:**
- `cd services/people-service && npx prisma migrate dev --name add_custom_field_data_type` — expected: migration applied, no errors
- `cd services/people-service && npm test` — expected: all unit + integration tests green, including new custom-field-definition service tests
- `cd services/bff && npm test` — expected: all tests green
- `cd services/people-service && npm run build && cd ../bff && npm run build` — expected: zero TypeScript errors

## Suggested Review Order

**Schema & migration**

- `CustomFieldDataType` enum added; `dataType` column NOT NULL DEFAULT TEXT — existing rows silently become TEXT
  [`schema.prisma:187`](../../services/people-service/prisma/schema.prisma#L187)

- Migration SQL: enum creation then ALTER TABLE; applies cleanly to empty or populated tables
  [`migration.sql:1`](../../services/people-service/prisma/migrations/20260905120000_add_custom_field_data_type/migration.sql#L1)

**Permission architecture (fail-closed hexagonal port)**

- `HrAdminPermissionPort` interface + `UnavailableHrAdminPermissionAdapter` — always rejects (403), same pattern as relationship permission adapter; real ACS wiring deferred pending Ask First
  [`custom-field-definitions.ports.ts:1`](../../services/people-service/src/modules/custom-field-definitions/custom-field-definitions.ports.ts#L1)

- Module wiring: string token `HrAdminPermissionPort` bound to `useExisting` Unavailable adapter
  [`custom-field-definitions.module.ts:1`](../../services/people-service/src/modules/custom-field-definitions/custom-field-definitions.module.ts#L1)

**Business logic**

- Service: permission check → unique-name check (case-insensitive, active-only) → Prisma op; soft-delete idempotent; `assertDataTypeNotPresent` exported as standalone guard
  [`custom-field-definitions.service.ts:1`](../../services/people-service/src/modules/custom-field-definitions/custom-field-definitions.service.ts#L1)

- DTOs: `dataType` absent from `UpdateCustomFieldDefinitionDto` by design; both `name` fields carry `@Matches(/\S/)` to reject whitespace-only values
  [`custom-field-definitions.dto.ts:1`](../../services/people-service/src/modules/custom-field-definitions/custom-field-definitions.dto.ts#L1)

**API boundary (people-service controller)**

- PATCH calls `assertDataTypeNotPresent(rawBody)` before service delegation; DELETE uses `ParseUUIDPipe`
  [`custom-field-definitions.controller.ts:39`](../../services/people-service/src/modules/custom-field-definitions/custom-field-definitions.controller.ts#L39)

**BFF proxy**

- BFF service: transparent proxy with `safeErrorStatus` (5xx → 503, 4xx pass-through); `readBody` handles 204 / non-JSON / JSON
  [`custom-field-definitions.service.ts:1`](../../services/bff/src/modules/custom-field-definitions/custom-field-definitions.service.ts#L1)

- BFF controller: `forward()` propagates upstream status to Express response; context extracts auth + correlationId
  [`custom-field-definitions.controller.ts:76`](../../services/bff/src/modules/custom-field-definitions/custom-field-definitions.controller.ts#L76)

**Frontend**

- Hook: AbortController on initial load; `runMutation` pattern mirrors `useFunctionalRoles`; edit form stays open on mutation error
  [`useCustomFieldDefinitions.ts:1`](../../services/frontend/src/pages/AdministrationPage/hooks/useCustomFieldDefinitions.ts#L1)

- Administration page: create form (all three fields) + list with inline edit (name/visibility only) + deactivate confirm
  [`AdministrationPage.tsx:432`](../../services/frontend/src/pages/AdministrationPage/AdministrationPage.tsx#L432)

- Typed API client: `getCustomFieldDefinitionError` maps HTTP status to typed error strings
  [`customFieldDefinitions.ts:1`](../../services/frontend/src/api/customFieldDefinitions.ts#L1)

**Tests & supporting**

- Service spec: 14 tests covering happy paths, 409 conflict, 403 permission denied, 404 not found, idempotent deactivate, standalone `assertDataTypeNotPresent`
  [`custom-field-definitions.service.spec.ts:1`](../../services/people-service/src/modules/custom-field-definitions/__tests__/custom-field-definitions.service.spec.ts#L1)

- Controller spec: verifies controller wires `assertDataTypeNotPresent` — service mock not called when dataType present
  [`custom-field-definitions.controller.spec.ts:1`](../../services/people-service/src/modules/custom-field-definitions/__tests__/custom-field-definitions.controller.spec.ts#L1)

- BFF controller spec: verifies `forward()` propagates non-200 status codes (incl. 201 for create)
  [`custom-field-definitions.controller.spec.ts:1`](../../services/bff/src/modules/custom-field-definitions/__tests__/custom-field-definitions.controller.spec.ts#L1)

- i18n: `customFields.*` keys; `actions.edit` and `actions.cancel` added alongside `actions.save`
  [`translation.json:82`](../../services/frontend/src/locales/en/translation.json#L82)
