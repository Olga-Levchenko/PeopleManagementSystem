---
title: "Story 2.4: Export respects the exporter's access"
type: 'feature'
created: '2026-09-10'
status: 'draft'
review_loop_iteration: 0
baseline_commit: 'f938f8be9afc59fbae112d00dd19255d3d4fa16f'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/docs/decisions/ADR-004-epic-2-open-decisions.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-universal-filter-column-engine-over-profile-fields.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-saved-views.md'
  - '{project-root}/services/people-service/CLAUDE.md'
  - '{project-root}/services/bff/CLAUDE.md'
  - '{project-root}/services/frontend/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Managers and PPs can filter and configure columns on All Employees (Stories 2.1–2.3) but cannot download an offline `.xlsx` copy. A naive client-side export would leak hidden columns or export only the currently loaded page.

**Approach:** Add a server-generated `.xlsx` export endpoint in `people-service` that accepts the **current list configuration** (active filters + requested `visibleColumnKeys`), reuses the same list query and per-row entitlement projection as `listEmployees`, and **walks all matching pages server-side** (ADR-004 Decision 3). Proxy through BFF as a file download; add an **Export .xlsx** toolbar button on `AllEmployeesPage` that sends the active tab's filter/column state.

## Boundaries & Constraints

**Always:** Export is server-side only — never build the workbook in the browser. Reuse `listEmployees` filter/query logic and `projectPeopleToListRows` entitlement projection; do not invent export-specific permission rules. Request carries the same filter query params as `GET /employees` plus a `columns` param (comma-separated catalog keys, same vocabulary as saved views / column picker). Validate `columns` against the viewer's field catalog: unknown keys → 400; empty `columns` → 400. **Column omission:** any column the exporter is not entitled to see is **absent from the file** (no header, no cells) — not present-but-empty. **Row values** match live list semantics (omit inaccessible field values per subject; do not widen beyond list projection). Internal pagination uses `pageSize=100` and loops until all `totalCount` rows are fetched — not limited to the UI's current page. One `resolveBatch` per internal page (same as list). Response `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` with `Content-Disposition: attachment; filename="employees-export.xlsx"`. **UI gate (interim, matches 2.1/2.3):** show Export only when `field-catalog.listAudienceLevel !== 'colleague'`; hide for colleague-tier catalog. Server APIs remain callable for any authenticated user until Story 2.5.

**Ask First:** Hard cap on exported row count (e.g. 5k/10k) for timeout protection — default: no cap in v1 unless perf testing demands it. Bulk **export-selected-rows** (checkbox selection in mockup) — default out of scope for 2.4.

**Never:** Client-only `.xlsx` generation. Exporting columns the viewer cannot see (even as blank columns). A separate export permission matrix. Exporting only the currently loaded UI page. Hardcoded functional-role name checks. Colleague-mode export UX (Story 2.5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| EXPORT_HAPPY_PATH | Manager with filters + `columns=fullName,position` | `.xlsx` with header row + all matching rows across all pages | N/A |
| EXPORT_ALL_PAGES | 250 matching rows; UI on page 1 of 50 | File contains 250 data rows (server walked 3 internal pages) | N/A |
| COLUMN_ABSENT_NO_ENTITLEMENT | Request includes a catalog key viewer cannot see | That column omitted entirely from workbook | N/A |
| SAME_FILTERS_AS_LIST | Active tab filters applied | Export row set matches sequential `listEmployees` pages with same params | N/A |
| ZERO_ROWS | Filters match nobody | Valid `.xlsx` with headers only, zero data rows | N/A |
| EMPTY_COLUMNS | `columns` empty or whitespace | 400 Bad Request | N/A |
| UNKNOWN_COLUMN | `columns` contains key not in viewer catalog | 400 Bad Request | Same posture as list/saved-view validation |
| COLLEAGUE_UI_HIDDEN | `listAudienceLevel=colleague` | Export button not rendered | API still reachable (interim) |
| INVALID_YEARS_RANGE | `yearsWithCompanyMin > max` | 400 | Reuse list validation |

</frozen-after-approval>

## Code Map

- `services/people-service/src/modules/employees/employees.service.ts` — extract or reuse list paging loop; add `exportEmployeesToXlsx(viewerPersonId, query, customFieldFilters, columnKeys)` calling existing `listEmployees` internally page-by-page
- `services/people-service/src/modules/employees/employees.controller.ts` — `GET /employees/export` (query params mirror list + `columns`); stream/buffer xlsx response
- `services/people-service/src/modules/employees/employees-export.util.ts` — build workbook from row batches + catalog labels (new; use `exceljs` dependency)
- `services/people-service/src/modules/employees/employees-list-config.validator.ts` — reuse `assertVisibleColumnKeys`, `assertColumnKeysInCatalog` for export `columns`
- `services/people-service/src/modules/employees/employees-query.util.ts` — reuse `parseCustomFieldFilters`
- `services/people-service/src/modules/employees/__tests__/employees-export.service.spec.ts` — column omission, all-pages walk, zero rows
- `services/people-service/test/employees-export.e2e-spec.ts` — HTTP download smoke + entitlement-negative column case
- `services/bff/src/modules/employees/employees.controller.ts` — `GET /employees/export` proxy; forward auth; pass through binary body + headers
- `services/bff/src/modules/employees/employees.service.ts` — `exportEmployees(...)` upstream call
- `services/bff/src/modules/employees/__tests__/employees.service.spec.ts` — proxy smoke test for export URL/headers
- `services/frontend/src/api/employees.ts` — `exportEmployees(params)` returning blob
- `services/frontend/src/api/hooks/useEmployees.ts` — `useExportEmployees` mutation or imperative helper
- `services/frontend/src/pages/AllEmployeesPage/hooks/useAllEmployeesPage.ts` — wire export handler from current `listParams` + `visibleColumns`
- `services/frontend/src/pages/AllEmployeesPage/AllEmployeesPage.tsx` — **Export .xlsx** button in toolbar (manager mode only); `data-testid="export-xlsx"`
- `services/frontend/e2e/all-employees-export.spec.ts` — click export, assert download starts (Playwright)
- `_bmad-output/planning-artifacts/ux-designs/.../key-all-employees.html` — Export button placement reference

## Tasks & Acceptance

**Execution:**
- [ ] `employees.service.ts` — paginated export loop reusing `listEmployees`; intersect requested columns with viewer catalog
- [ ] `employees-export.util.ts` + `exceljs` in `package.json` — assemble xlsx with catalog labels as headers
- [ ] `employees.controller.ts` — `GET /employees/export` with validation and file response
- [ ] `employees-export.service.spec.ts` + `employees-export.e2e-spec.ts` — EXPORT_ALL_PAGES, COLUMN_ABSENT_NO_ENTITLEMENT, UNKNOWN_COLUMN
- [ ] `bff/.../employees` — proxy export endpoint; preserve `Content-Disposition`
- [ ] `frontend` API + `AllEmployeesPage` — Export button; pass active filters/columns; trigger browser download
- [ ] `all-employees-export.spec.ts` — Playwright export smoke

**Acceptance Criteria:**
- Given a manager or PP with a specific set of visible columns on their current list view, when they export to `.xlsx`, then the export contains exactly those columns — the same entitlement check as the live list view, not a separate export-specific rule
- Given a column the exporter cannot see, when they export, then that column is absent from the file, not present-but-empty
- Given filters that match more rows than the current UI page shows, when they export, then all matching rows are included (ADR-004 server-side full export)
- Given a viewer whose field catalog is colleague-tier only, when they open All Employees, then the Export button is not shown (interim UI gate; server lockout deferred to Story 2.5)
- Given unknown or empty `columns`, when export is requested, then the API returns 400 with the same validation posture as list/saved views

## Design Notes

**`columns` param:** comma-separated catalog keys (`fullName`, `custom:{definitionId}`). Order in the param defines column order in the spreadsheet. Headers use `EmployeeFieldCatalogEntry.label` from the viewer-scoped catalog.

**Reuse over fork:** prefer calling `listEmployees` in a `for` loop (`page = 1..ceil(totalCount/100)`) rather than duplicating Prisma/ACS logic. Accumulate rows in memory for v1; streaming workbook write is optional optimization if memory becomes an issue.

## Verification

**Commands:**
- `cd services/people-service && npm run lint && npm test` — export unit tests green
- `cd services/people-service && node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --testPathPatterns=employees-export` — e2e green
- `cd services/bff && npm run lint && npm test` — export proxy test green
- `cd services/frontend && npm run lint && npx tsc -b --noEmit` — clean
- `cd services/frontend && npx playwright test e2e/all-employees-export.spec.ts` — download smoke green

## Spec Change Log

- **2026-09-10 (draft):** Initial spec from `bmad-build` kickoff on `feature/2-4-export-respects-the-exporter-s-access`; Jira O4-38 → In Progress.
