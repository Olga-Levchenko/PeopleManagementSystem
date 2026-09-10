---
title: 'Story 2.1: Universal filter/column engine over profile fields'
type: 'feature'
created: '2026-09-10'
status: 'in-progress'
review_loop_iteration: 0
baseline_commit: 'e0bdda9b6213e1e9d7399a6c21841c041c379c3'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/decisions/ADR-004-epic-2-open-decisions.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/services/people-service/CLAUDE.md'
  - '{project-root}/services/bff/CLAUDE.md'
  - '{project-root}/services/frontend/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Managers and PPs need an All Employees list where they can filter and choose columns over profile fields (stored, derived, and custom) without a deploy when HR Admin adds a custom field. Today there is no list surface, no field catalog, and no batch permission resolution wired to a paginated query. Story 1.10 requires invisible custom fields to be absent from filter/column pickers, not merely hidden in row values.

**Approach:** Add a server-assembled field catalog and paginated list API in `people-service` (one `resolveBatch` call per page), proxy through the BFF, and ship a frontend All Employees page with a column/filter picker driven by the catalog. Custom fields come from `CustomFieldDefinition` at request time; derived `yearsWithCompany` filters via inverted `startDate` range. Row values respect section-matrix audience per subject via shared `deriveAudienceFromResolution`.

## Boundaries & Constraints

**Always:** Server-side pagination (ADR-004 Decision 3). Exactly one `POST /api/v1/access-roles/resolve-batch` per list page — never N single-resolve calls. Custom-field visibility uses `canSeeCustomField()` with the viewer's resolved audience level — same rule as profile S16 and Story 1.10 AC (management/employee/colleague tiers; unknown visibility → management-only, fail-closed). Field catalog must be viewer-scoped: fields the viewer cannot see are not returned. Colleague audience on this story is out of scope (Story 2.5); initial list targets manager/PP entitlements only. List row values omit sections the viewer has no access to — never return then hide client-side. `pageSize` max 100; batch subject count per page ≤ 100 (well under O4-90's 500 cap). Reuse `profile-audience.util.ts` and `AccessRoleResolutionPort`; do not duplicate access-role logic in people-service.

**Ask First:** Splitting BFF/frontend into a follow-up PR if the user wants a backend-only first merge — default is one story, one cohesive deliverable.

**Never:** Inline editing (Story 2.2), saved views (2.3), export (2.4), colleague mode (2.5). Hardcoding functional-role names (`"DM"`, `"HRAdmin"`, …). Client-side-only permission filtering. Calling single-resolve in a loop for list rows.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| CUSTOM_FIELD_IN_CATALOG | Active custom field `visibility=management`; viewer has manager line to subjects | Field appears in catalog as filterable+columnable; row values shown when audience permits | N/A |
| CUSTOM_FIELD_HIDDEN | Custom field `visibility=management`; viewer is colleague (no line) | Field absent from catalog entirely | N/A |
| YEARS_FILTER_MIN | `yearsWithCompanyMin=3` | `startDate <= now - 3y` (non-null start dates) | N/A |
| YEARS_FILTER_RANGE | `yearsWithCompanyMin=2`, `yearsWithCompanyMax=5` | Intersected `startDate` window | N/A |
| BATCH_ONCE_PER_PAGE | Page of 50 subjects | One `resolveBatch` with 50 ids | N/A |
| NO_ACCESS_ROW | Viewer has no line to subject | Row returned with empty/minimal `values` (no S1 leak) | N/A |
| NEW_CUSTOM_FIELD_NO_DEPLOY | HR Admin creates definition after ship | Next catalog request includes it | N/A |

</frozen-after-approval>

## Code Map

- `services/people-service/src/modules/employees/employees.controller.ts` — `GET /api/v1/employees`, `GET /api/v1/employees/field-catalog` (WIP local)
- `services/people-service/src/modules/employees/employees.service.ts` — catalog, paginated list, `yearsWithCompany` derived filter; fix catalog to use viewer audience not hardcoded `'management'` (`:118-130`)
- `services/people-service/src/modules/profile/profile-audience.util.ts` — shared `deriveAudienceFromResolution`
- `services/people-service/src/modules/profile/profile.ports.ts:239-297` — `resolveBatch` adapter to O4-90 endpoint
- `services/people-service/src/modules/profile/profile.service.ts:135-150` — `canSeeCustomField` export
- `services/bff/src/modules/custom-field-definitions/` — proxy pattern to mirror for new `employees` module
- `services/frontend/src/router/index.tsx` — add `/all-employees` route
- `_bmad-output/planning-artifacts/ux-designs/.../key-all-employees.html` — column-manager UX reference
- `services/access-control-service/.../AccessRolesController.cs:102-132` — batch endpoint (done, read-only consumer)

## Tasks & Acceptance

**Execution:**
- [x] `services/people-service/src/modules/employees/employees.service.ts` — viewer-scoped field catalog (resolve viewer audience once; filter stored/derived/custom entries); extend stored field set per UX mockup where data exists on `Person`
- [x] `services/people-service/src/modules/employees/employees.controller.ts` — pass `viewerPersonId` from auth context to catalog + list
- [x] `services/people-service/src/modules/employees/__tests__/employees.service.spec.ts` — catalog visibility tiers, years filter, single batch call
- [x] `services/bff/src/modules/employees/` — proxy `GET /employees`, `GET /employees/field-catalog` with session token forwarding
- [x] `services/frontend/src/pages/AllEmployeesPage/` — table, filter bar, column picker from catalog API; TanStack Query hooks
- [x] `services/people-service/test/employees.e2e-spec.ts` or perf test — 500+ seeded rows, list+catalog+batch resolve ≤ 2s (NFR-2/SM-4 gate)

**Acceptance Criteria:**
- Given a custom field created after this feature ships, when a manager or PP opens the column or filter picker, then the new field is available as both filter and column with no code change
- Given "years with company" derived from join date, when a manager or PP filters on a numeric range, then results match the inverted `startDate` window
- Given a custom field the requester cannot see (Story 1.10 visibility), when they open the filter or column picker, then that field is not offered
- Given 500+ employee records and arbitrary filters including permission resolution, when the list is requested, then the response returns within 2 seconds (hard release gate)

## Design Notes

**Catalog keys:** stored fields use plain keys (`countryCity`, `departmentName`); custom fields use `custom:{definitionId}`; derived `yearsWithCompany` is filter-only via query params, column via computed value from `startDate`.

**Manager/PP gate:** functional permission for "browse All Employees" resolves from stored grants in a later story if needed. **Code review decision (2026-09-10):** for 2.1, any authenticated user may call the API and see the nav entry; server-side catalog/row projection stays audience-scoped (colleague whitelist where applicable). Explicit browse entitlement gate and colleague-mode UX ship in Story 2.5.

## Verification

**Commands:**
- `cd services/people-service && npm test` — expected: all unit tests pass including employees + batch adapter specs
- `cd services/people-service && npm run lint` — expected: clean
- `cd services/bff && npm test && npm run lint` — expected: green
- `cd services/frontend && npm test && npm run lint` — expected: green
- Perf gate command TBD in e2e/perf test file — expected: p95 ≤ 2s for 500+ rows with batch resolve

### Review Findings

- [x] [Review][Decision] All Employees browse gate for colleague-only users — **Resolved (2026-09-10): ship open until Story 2.5.** Any authenticated user may reach API/BFF/UI; row values and catalog remain audience-scoped server-side. Colleague-mode UX and explicit entitlement gate deferred to 2.5.

- [x] [Review][Patch] Full Profile Access dropped on batch list path [`services/people-service/src/modules/profile/profile.ports.ts:145-156`] — `batchItemToAccessRoleResolution` hardcodes `fullProfileAccessLine: false` and ACS `ResolveBatch` omits FPA fields in batch items. FPA holders lose management-tier rows/custom fields vs single-resolve profile.

- [x] [Review][Patch] Field-catalog management tier inferred from Prisma, not ACS [`services/people-service/src/modules/employees/employees.service.ts:291-327`] — Project-line-only PM/DM managers miss management-visible custom fields in catalog; violates access-role-from-relationships invariant.

- [x] [Review][Patch] Custom field filtering not implemented — Catalog marks custom fields `filterable: true` but `ListEmployeesQueryDto` has no custom-field filter params and `AllEmployeesPage` only filters `countryCity` / years. AC1 (“available as both filter and column”) is incomplete.

- [x] [Review][Patch] Missing negative tests for S16 redaction in list [`services/people-service/src/modules/employees/__tests__/employees.service.spec.ts`] — No test that `listEmployees` omits `custom:{id}` when batch resolution is colleague-tier and visibility is `MANAGEMENT`.

- [x] [Review][Patch] S1 gating uses `!== 'None'` instead of profile `grantsAccess()` [`services/people-service/src/modules/employees/employees.service.ts:211`] — Align with fail-closed profile pattern.

- [x] [Review][Defer] Perf e2e uses mocked `AccessRoleResolutionPort` [`services/people-service/test/employees.e2e-spec.ts`] — Proves DB pagination latency only; does not verify real ACS batch resolve at 500+ subjects within 2s. Follow-up integration perf test needed before production sign-off.

- [x] [Review][Patch] ValidationPipe blocks `custom:*` HTTP query params [`services/people-service/src/modules/employees/employees.controller.ts:23-31`] — Global `forbidNonWhitelisted: true` rejects non-DTO query keys before `parseCustomFieldFilters` runs; custom-field filters work in unit tests but fail over HTTP.

- [x] [Review][Patch] Custom-field filter path unbounded `resolveBatch` [`services/people-service/src/modules/employees/employees.service.ts:249-259`] — Loads all Prisma matches into memory and calls `resolveBatch` once with no 500-subject chunking; violates batch cap and risks AC4 under load.

- [x] [Review][Patch] Project-line catalog sampling gap [`services/people-service/src/modules/employees/employees.service.ts:523-555`] — Candidate IDs omit project assignments; project-line-only PM/DM may miss management custom fields in catalog.

- [x] [Review][Patch] Years filter min>max not validated [`services/people-service/src/modules/employees/employees.dto.ts:31-47`] — Inverted range silently returns zero rows with no 400.

- [x] [Review][Patch] `parseCustomFieldFilters` untested at HTTP boundary [`services/people-service/src/modules/employees/employees-query.util.ts`] — No unit/e2e test; array-valued duplicate keys silently ignored.

- [x] [Review][Patch] BFF proxy tests omit `custom:*` and years params [`services/bff/src/modules/employees/__tests__/employees.service.spec.ts`] — Forwarding only tested for `page`, `pageSize`, `countryCity`.

- [x] [Review][Patch] Years filter unit test too weak [`services/people-service/src/modules/employees/__tests__/employees.service.spec.ts:193-213`] — Asserts `Date` instance only, not inverted window boundaries or range intersection.

- [x] [Review][Patch] Inline fallback resolution object [`services/people-service/src/modules/employees/employees.service.ts:295-310`] — Duplicates `NEITHER_LINE_RESOLUTION` shape instead of reusing shared constant.

- [x] [Review][Patch] Frontend years inputs can send NaN [`services/frontend/src/pages/AllEmployeesPage/hooks/useAllEmployeesPage.ts:22-24`] — `Number('')` / invalid text not guarded before API call.

- [x] [Review][Patch] Catalog error state not surfaced [`services/frontend/src/pages/AllEmployeesPage/AllEmployeesPage.tsx`] — List can render while field-catalog fails; custom filters/column picker missing with no error banner.

- [x] [Review][Defer] Playwright e2e for `/all-employees` — No browser test for catalog-driven column/filter picker.

- [x] [Review][Defer] Stored field catalog incomplete vs UX mockup [`services/people-service/src/modules/employees/employees.service.ts:44-85`] — `workEmail`, `workPhone`, manager/PP names, project name not cataloged.

- [x] [Review][Defer] Custom-field typed filter operators — Exact string match only; `NUMBER`/`DATE`/`BOOLEAN` lack type-appropriate operators.

- [x] [Review][Defer] Triple ACS round trips on page load — Catalog + list each call ACS; no caching.

- [x] [Review][Defer] `libs/contracts` DTO duplication [`services/frontend/src/api/employees.ts`] — API types not shared across BFF boundary.

- [x] [Review][Defer] Frontend filter Apply button redundant with live queryKey refetch [`useAllEmployeesPage.ts`] — UX inconsistency.

- [x] [Review][Defer] `departmentId` filter has no UI [`ListEmployeesQueryDto`] — Dead API surface for 2.1.

- [x] [Review][Defer] No profile navigation from list rows [`AllEmployeesPage.tsx`] — Browse-to-profile journey incomplete.

- [x] [Review][Defer] Column picker state not persisted — Resets on page refresh.

- [x] [Review][Defer] Employees module missing Swagger composite decorators — OpenAPI incomplete vs sibling modules.

- [x] [Review][Defer] FPA batch HTTP composition test missing — Domain test exists; no API-level batch FPA assertion.

- [x] [Review][Defer] `profile-audience.util.ts` dedicated unit tests — Covered indirectly via profile tests only.

- [x] [Review][Defer] Cross-service ACS integration test for list/catalog FPA fields — Adapter e2e against real ACS not present.
