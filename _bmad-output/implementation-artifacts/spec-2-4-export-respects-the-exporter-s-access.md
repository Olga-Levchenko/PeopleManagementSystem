---
title: "Story 2.4: Export respects the exporter's access"
type: 'feature'
created: '2026-09-10'
status: 'approved-for-implementation'
review_loop_iteration: 1
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

**Approach:** Add a server-generated `.xlsx` export endpoint in `people-service` that accepts the **current list configuration** (active filters + requested column keys), reuses the same list query and per-row entitlement projection as `listEmployees`, and **walks all matching rows server-side** (ADR-004 Decision 3). Proxy through BFF as a file download; add an **Export .xlsx** toolbar button on `AllEmployeesPage` that sends the active tab's filter/column state.

## Boundaries & Constraints

**Always:** Export is server-side only — never build the workbook in the browser. Reuse list filter/query helpers and `projectPeopleToListRows` entitlement projection; do not invent export-specific permission rules. Request carries the same filter query params as `GET /employees` plus a `columns` param (comma-separated catalog keys, same vocabulary as saved views / column picker). **Ignore client `page` and `pageSize`** — export always resolves the full matching row set with an internal `pageSize=100` batch size; a client-supplied page number must not limit export to one UI page.

**Column validation (catalog layer):** parse `columns` into ordered keys (trim segments; reject empty segments). Validate via the shared list-configuration validator: empty `columns` → 400; duplicate keys → 400; any key not in the viewer's **columnable** catalog set → 400 (`assertColumnKeysInCatalog` — same posture as saved views on write and list on read). There is **no silent column drop** at catalog validation — a tampered or unknown key is rejected, not omitted.

**Row projection (entitlement layer):** row values match live list semantics via `projectPeopleToListRows`. When the viewer lacks access to a field for a specific subject, that cell is **blank** (empty string / null rendered as empty); the column header remains because the key passed catalog validation. Never emit present-but-empty columns for catalog-invisible keys; never widen values beyond list projection. Strip list-only metadata (`editableFields`, etc.) from export rows.

**Filter validation:** reuse list read-path checks — `assertYearsFilterRange`, `assertCustomFieldFiltersInCatalog` / `assertCustomFieldFiltersAllowed`, and the same custom-field filter parsing as `GET /employees`. **Stale-filter parity (matches Story 2.3 list apply):** on export, omit a stored `departmentId` when the department no longer exists; omit inactive/unknown `custom:` filter keys rather than failing the whole export (same behavior as `resolveApplicableFilters` on saved-view read). Invalid inverted years range → 400.

**Fetch strategy:** do **not** naively call `listEmployees` in a per-page loop when custom-field filters are active — that path rescans all candidates and re-runs full batch resolution on every page. Extract or reuse a single-pass export fetch that shares `buildWhereClause`, custom-field audience filtering, and `projectPeopleToListRows`, then slice internally in `pageSize=100` batches for ACS `resolveBatch` (one batch per slice — same cap as list). Without custom-field filters, paginate at the Prisma layer identically to list. Accumulate projected rows in memory for v1.

Response `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` with `Content-Disposition: attachment; filename="employees-export.xlsx"`. **UI gate (interim, matches 2.1/2.3):** show Export only when `field-catalog.listAudienceLevel !== 'colleague'`; hide for colleague-tier catalog. Server APIs remain callable for any authenticated user until Story 2.5 — export **content** must still follow colleague whitelist projection when the viewer's resolved audience demands it.

**Ask First:** Hard cap on exported row count (e.g. 5k/10k) for timeout protection — default: no cap in v1 unless perf testing demands it. Bulk **export-selected-rows** (checkbox selection in mockup) — default out of scope for 2.4.

**Never:** Client-only `.xlsx` generation. Exporting catalog-invisible columns (even as blank headers). A separate export permission matrix. Exporting only the currently loaded UI page. Hardcoded functional-role name checks. Colleague-mode export UX (Story 2.5). Per-page full rescans on the custom-field-filter export path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| EXPORT_HAPPY_PATH | Manager with filters + `columns=fullName,position` | `.xlsx` with header row + all matching rows across all pages | N/A |
| EXPORT_ALL_PAGES | 250 matching rows; UI on page 1 of 50 | File contains 250 data rows (server walked 3 internal batches of 100) | N/A |
| IGNORE_CLIENT_PAGE | Client sends `page=2` + `pageSize=25` with export | Full matching row set exported; client page params ignored | N/A |
| SAME_FILTERS_AS_LIST | Active tab filters applied | Export row set equals concatenation of all `listEmployees` pages with same filters and internal `pageSize=100` | N/A |
| CUSTOM_FIELD_FILTER_EXPORT | Custom-field filters matching 250 employees | Single-pass candidate resolution; ≤3 internal ACS batches; no per-page full rescan | N/A |
| PER_ROW_OMITTED_VALUE | Column entitled at catalog level; viewer lacks field access for subject A | Column header present; subject A's cell blank; other subjects show values when entitled | N/A |
| ZERO_ROWS | Filters match nobody | Valid `.xlsx` with headers only, zero data rows | N/A |
| EMPTY_COLUMNS | `columns` empty or whitespace-only | 400 Bad Request | N/A |
| UNKNOWN_COLUMN | `columns` contains key not in viewer's columnable catalog | 400 Bad Request | Same posture as saved-view validation |
| DUPLICATE_COLUMN_KEY | `columns=fullName,fullName` | 400 Bad Request | Reject duplicates |
| STALE_DEPARTMENT | Export request includes deleted `departmentId` | Omit department filter; export remaining filters | No 500 |
| STALE_CUSTOM_FIELD | Export request includes inactive `custom:` filter key | Omit that filter key; export with remaining filters | No 500 |
| COLLEAGUE_UI_HIDDEN | `listAudienceLevel=colleague` | Export button not rendered | API still reachable (interim) |
| COLLEAGUE_API_CONTENT | Colleague-tier viewer calls export API directly (interim) | File content follows colleague whitelist projection — same as list row values | N/A until Story 2.5 lockout |
| INVALID_YEARS_RANGE | `yearsWithCompanyMin > max` | 400 | Reuse list validation |
| INVALID_CUSTOM_FILTER_KEY | Unknown `custom:` filter key in query | 400 | Reuse list validation |

</frozen-after-approval>

## Code Map

- `services/people-service/src/modules/employees/employees.service.ts` — add `exportEmployeesToXlsx(...)` using shared list fetch/projection helpers; single-pass path when custom-field filters active; internal batching at 100 for ACS
- `services/people-service/src/modules/employees/employees.controller.ts` — `GET /employees/export` (filter query params mirror list + `columns`; ignore client page/pageSize); stream/buffer xlsx response
- `services/people-service/src/modules/employees/employees-export.util.ts` — build workbook from projected rows + catalog labels (new; use `exceljs` dependency)
- `services/people-service/src/modules/employees/employees-list-config.validator.ts` — reuse `assertVisibleColumnKeys`, `assertColumnKeysInCatalog`, filter validators, `resolveApplicableFilters` for stale filters on export read
- `services/people-service/src/modules/employees/employees-query.util.ts` — reuse `parseCustomFieldFilters`; add `parseExportColumnKeys` (trim, reject empty/duplicate)
- `services/people-service/src/modules/employees/__tests__/employees-export.service.spec.ts` — EXPORT_ALL_PAGES, CUSTOM_FIELD_FILTER_EXPORT (no repeated full scan), PER_ROW_OMITTED_VALUE, UNKNOWN_COLUMN, row-set parity with list
- `services/people-service/test/employees-export.e2e-spec.ts` — HTTP download smoke + UNKNOWN_COLUMN 400 + workbook read-back for headers/row count
- `services/bff/src/modules/employees/employees.controller.ts` — `GET /employees/export` proxy; forward auth; pass through binary body + headers; sufficient timeout for large exports
- `services/bff/src/modules/employees/employees.service.ts` — `exportEmployees(...)` upstream call
- `services/bff/src/modules/employees/__tests__/employees.service.spec.ts` — proxy smoke test for export URL/headers
- `services/frontend/src/api/employees.ts` — `exportEmployees(params)` returning blob
- `services/frontend/src/api/hooks/useEmployees.ts` — `useExportEmployees` mutation or imperative helper
- `services/frontend/src/pages/AllEmployeesPage/hooks/useAllEmployeesPage.ts` — wire export handler from current filter params + `uiState.visibleColumnKeys` (preserve picker order)
- `services/frontend/src/pages/AllEmployeesPage/AllEmployeesPage.tsx` — **Export .xlsx** button in toolbar (manager mode only); i18n key; `data-testid="export-xlsx"`; disable while export in flight
- `services/frontend/e2e/all-employees-export.spec.ts` — click export, assert download starts (Playwright)
- `_bmad-output/planning-artifacts/ux-designs/.../key-all-employees.html` — Export button placement reference

## Tasks & Acceptance

**Execution:**
- [ ] `employees.service.ts` — export fetch reusing list query/projection helpers; single-pass custom-field-filter path; internal batch size 100
- [ ] `employees-export.util.ts` + `exceljs` in `package.json` — assemble xlsx with catalog labels as headers; typed cells where practical (ISO date strings for dates, numbers for numeric fields)
- [ ] `employees.controller.ts` — `GET /employees/export` with full validation and file response
- [ ] `employees-export.service.spec.ts` + `employees-export.e2e-spec.ts` — EXPORT_ALL_PAGES, CUSTOM_FIELD_FILTER_EXPORT, PER_ROW_OMITTED_VALUE, UNKNOWN_COLUMN, SAME_FILTERS_AS_LIST parity
- [ ] `bff/.../employees` — proxy export endpoint; preserve `Content-Disposition`
- [ ] `frontend` API + `AllEmployeesPage` — Export button; pass active filters + `visibleColumnKeys`; trigger browser download
- [ ] `all-employees-export.spec.ts` — Playwright export smoke

**Acceptance Criteria:**
- Given a manager or PP with a specific set of visible columns on their current list view, when they export to `.xlsx`, then the file contains exactly those catalog-validated column keys in the same order — with headers from the viewer-scoped catalog and row values from the same entitlement projection as the live list, not a separate export-specific rule
- Given a `columns` key not in the viewer's columnable catalog, when export is requested, then the API returns 400 (no silent column drop)
- Given a catalog-valid column and a subject the viewer cannot see that field for, when they export, then the column header is present and that subject's cell is blank — not a catalog-invisible column and not a widened value
- Given filters that match more rows than the current UI page shows, when they export, then all matching rows are included and the row set matches all `listEmployees` pages with the same filters and internal page size 100 (ADR-004 server-side full export)
- Given a client-supplied `page` or UI `pageSize`, when export is requested, then the full filtered row set is exported regardless of those params
- Given custom-field filters, when export runs, then completion does not re-run a full candidate scan and full batch resolution on every internal page slice
- Given a viewer whose field catalog is colleague-tier only, when they open All Employees, then the Export button is not shown (interim UI gate; server lockout deferred to Story 2.5)
- Given a colleague-tier viewer who calls the export API directly (interim), when the file is generated, then row values follow the colleague whitelist projection identical to list semantics
- Given unknown, empty, or duplicate `columns`, when export is requested, then the API returns 400 with the same validation posture as list/saved views

## Design Notes

**`columns` param:** comma-separated catalog keys (`fullName`, `custom:{definitionId}`). Order in the param defines column order in the spreadsheet. Headers use `EmployeeFieldCatalogEntry.label` from the viewer-scoped catalog. Frontend must send `uiState.visibleColumnKeys` order, not the filtered `visibleColumns` catalog object order.

**Reuse over fork:** share `buildWhereClause`, custom-field audience filtering, and `projectPeopleToListRows` with list — extract an export-oriented fetch if needed so custom-field-filter exports resolve candidates once, then batch-project rows. For plain list queries, Prisma pagination with `pageSize=100` is sufficient. Accumulate projected rows in memory for v1; streaming workbook write is optional optimization if memory becomes an issue.

**Cell values:** mirror list `values` map — dates as `YYYY-MM-DD` strings; numbers as numeric cells; booleans as boolean cells; missing/omitted entitlement values as empty cells.

**Mid-export consistency:** v1 accepts read-your-writes across batches within one export request (no snapshot isolation); document if org data changes mid-export, row order/count may reflect interleaved mutations — acceptable for v1.

## Verification

**Commands:**
- `cd services/people-service && npm run lint && npm test` — export unit tests green
- `cd services/people-service && node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --testPathPatterns=employees-export` — e2e green
- `cd services/bff && npm run lint && npm test` — export proxy test green
- `cd services/frontend && npm run lint && npx tsc -b --noEmit` — clean
- `cd services/frontend && npx playwright test e2e/all-employees-export.spec.ts` — download smoke green

## Spec Change Log

- **2026-09-11 (approved):** Human approval of review loop 1 after planning-gap audit (`PROCEED WITH CONDITIONS`); status → `approved-for-implementation`.
- **2026-09-11 (review loop 1):** Advanced-elicitation critical review — resolved catalog vs row entitlement contradiction; documented single-pass custom-field-filter export path; added stale-filter parity, client page ignore, duplicate column rejection, row-set parity ACs, and expanded test/code-map expectations.
- **2026-09-10 (draft):** Initial spec from `bmad-build` kickoff on `feature/2-4-export-respects-the-exporter-s-access`; Jira O4-38 → In Progress.
