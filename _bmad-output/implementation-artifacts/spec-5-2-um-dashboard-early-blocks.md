---
title: 'Story 5.2: UM Dashboard — Early Blocks'
type: 'feature'
created: '2026-09-14'
status: 'ready-for-dev'
review_loop_iteration: 0
baseline_commit: '3b4d7df901048fcac82fb1eaab1680232dbf6a36'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Unit Managers have no dashboard surface — they must navigate All Employees to check risk and leave status for their subordinates and have no single view for their own pending action items.

**Approach:** Add a UM dashboard page backed by a new BFF `um-dashboard` module that calls a new People Service internal metadata endpoint (subordinates list for the caller) and WMS (risk data + own action items), enforces `view-dashboard / dashboardType:unit-manager` permission AND Manager reporting-line access server-side, and returns a composed payload. The frontend page uses Story 5.1 shared components (`DashboardCountCard`, `DashboardTable`, `SeverityBadge`, `TrendIcon`) and a new SideMenu probe gates the link.

## Boundaries & Constraints

**Always:**
- BFF enforces `view-dashboard` with `scope: { dashboardType: 'unit-manager' }` functional permission AND Manager (reporting-line) access role before returning any data; 403 on either failure.
- Resolve actor identity from the verified auth principal (JWT sub → personId via session); never accept `actorPersonId` or viewer identity from the request body or query string.
- Resourcing-request count and campaign count are **absent** — not shown as zero. These are Epic 13 additions.
- Leave status (S10) is nullable; render "—" when absent without error.
- Use Story 5.1 shared components (`DashboardCountCard`, `DashboardTable`, `SeverityBadge`, `TrendIcon`) — do not duplicate counter/table/badge JSX.
- All user-visible strings use `useTranslation` with `dashboard.um.*` i18n namespace.
- `DashboardTable` columns use `sortable: false` — deferred aria-sort state management (Story 5.1 deferred-work).

**Ask First:**
- Adding transitive subordinate resolution beyond direct reports (`Person.managerId = callerPersonId`).
- Changing the People Service internal `um-dashboard/metadata` response shape.

**Never:**
- Add resourcing, campaign, or Epic 7/11/13 blocks.
- Accept caller-supplied actor or permission state from the browser.
- Render S6 risk data or allow risk append from this page.
- Add new WMS endpoints or data-model changes — reuse `GET /api/v1/risks/dashboard` and `GET /api/v1/action-items/mine`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| UM with subordinates | Authenticated UM, direct reports exist, WMS has risk rows, action items exist | Counter cards (headcount, per-severity risk counts, open/overdue AI counts); subordinates table rows; own action items sorted by `dueDate` asc, overdue rows highlighted | — |
| UM with no subordinates | Zero direct reports | All counters 0; empty subordinates table with `emptyMessage`; own action items list still renders | — |
| Subordinate has no risk record | Person in direct-reports list, no WMS risk row | Table row renders with severity cell "—" | — |
| Leave status absent | S10 not synced | Table row renders "—" in leave column | — |
| Not a UM / no permission | Viewer lacks `view-dashboard/unit-manager` or no reporting-line Manager role | BFF returns 403; SideMenu probe sees 403 → link absent; direct route navigation redirects to home | 403, no employee data leaked |
| Upstream unavailable | People Service or WMS 5xx | BFF fails closed; dashboard shows generic error state | Generic error, no partial data |

</frozen-after-approval>

## Code Map

- `services/bff/src/modules/risk-dashboard/risk-dashboard.service.ts` — reference: people-service metadata POST batch pattern (lines 82–101); WMS risk `GET /api/v1/risks/dashboard` call (line 39+); OidcService token resolution pattern
- `services/bff/src/modules/risk-dashboard/risk-dashboard.controller.ts` — reference: `OidcService.resolveAuthorization` usage for multi-audience token exchange (lines 1–40)
- `services/bff/src/modules/` — destination: new `um-dashboard/` module (controller + service + module)
- `services/bff/src/app.module.ts` — register `UMDashboardModule`
- `services/people-service/src/modules/employees/risk-dashboard-metadata.controller.ts` — reference: `POST /api/v1/internal/risk-dashboard/metadata` pattern; destination: sibling `um-dashboard-metadata.controller.ts`
- `services/people-service/src/modules/employees/employees.module.ts` — register new controller
- `services/frontend/src/components/DashboardCountCard/DashboardCountCard.tsx` — import; props: `label, count, emphasized?, active?, onClick?`
- `services/frontend/src/components/DashboardTable/DashboardTable.tsx` — import; `ColumnSpec<T>` + props: `columns, rows, getRowKey, onRowClick?, emptyMessage?`
- `services/frontend/src/components/SeverityBadge/SeverityBadge.tsx` — import; prop: `level: RiskSeverity`
- `services/frontend/src/components/SideMenu/hooks/useSideMenu.ts` — extend: add `canAccessUMDashboard` probe (lines 1–35 pattern)
- `services/frontend/src/components/SideMenu/SideMenu.tsx` — extend: conditional UM dashboard link (lines 61–88 pattern)
- `services/frontend/src/pages/RiskDashboardPage/RiskDashboardPage.tsx` — reference: `DashboardCountCard` usage (lines 88–103), `DashboardTable` columns array (lines 31–65), `DashboardTable` call (lines 157–163)
- `services/frontend/src/pages/RiskDashboardPage/hooks/useRiskDashboardPage.ts` — reference: hook return shape + `isUnauthorized` / `navigateToProfile` pattern (lines 1–71)
- `services/frontend/src/api/riskDashboard.ts` — reference: `getRiskDashboardApiCall` pattern for new `getUMDashboardApiCall`
- `services/frontend/src/router/index.tsx` — extend: add `um-dashboard` route alongside `risk-dashboard` (line ~48)
- `services/frontend/src/locales/en/translation.json` — extend: add `dashboard.um.*` keys

## Tasks & Acceptance

**Execution:**
- [ ] `services/people-service/src/modules/employees/um-dashboard-metadata.controller.ts` — create: `GET /api/v1/internal/um-dashboard/metadata`; resolve caller personId from auth principal; query `Person` where `managerId = callerPersonId`; return `{ people: [{ personId, fullName, department: {id,label}|null, projects: {id,label}[], leaveStatus: string|null }] }`; JWT-guarded (trusted internal caller)
- [ ] `services/people-service/src/modules/employees/um-dashboard-metadata.dto.ts` — create: `UMDashboardPersonDto` + `UMDashboardMetadataResponseDto`; mirror `RiskDashboardMetadataDto` naming convention
- [ ] `services/people-service/src/modules/employees/employees.module.ts` — register `UMDashboardMetadataController`
- [ ] `services/bff/src/modules/um-dashboard/um-dashboard.service.ts` — create: `getUMDashboard(authorization, peopleAuth, wmsAuth)`; check `view-dashboard / scope: { dashboardType: 'unit-manager' }` permission + Manager role (return 403 if either fails); `GET people-service/api/v1/internal/um-dashboard/metadata`; `GET wms/api/v1/risks/dashboard` (paginate, intersect with subordinate personIds); `GET wms/api/v1/action-items/mine`; compose `{ headcount, riskCounts, actionItemCounts, rows, ownActionItems }`
- [ ] `services/bff/src/modules/um-dashboard/um-dashboard.controller.ts` — create: `GET /api/v1/um-dashboard`; `OidcService.resolveAuthorization` for people-service and work-management-service tokens; delegate to service; propagate 403
- [ ] `services/bff/src/modules/um-dashboard/um-dashboard.module.ts` — create: NestJS module; import shared auth/OidcService modules following risk-dashboard.module.ts pattern
- [ ] `services/bff/src/app.module.ts` — import and register `UMDashboardModule`
- [ ] `services/frontend/src/api/umDashboard.ts` — create: `getUMDashboardApiCall(query?, signal?)` → `GET /api/v1/um-dashboard`; export types `UMDashboardRow`, `UMDashboardOwnActionItem`, `UMDashboardResponse`
- [ ] `services/frontend/src/components/SideMenu/hooks/useSideMenu.ts` — add `canAccessUMDashboard` probe: `getUMDashboardApiCall({ pageSize: 1 }, signal)` → true on success, false on error; return it alongside `canAccessRiskDashboard`
- [ ] `services/frontend/src/components/SideMenu/SideMenu.tsx` — conditionally render UM dashboard link when `canAccessUMDashboard` using the same `&&` JSX pattern as `canAccessRiskDashboard`
- [ ] `services/frontend/src/pages/UMDashboardPage/hooks/useUMDashboardPage.ts` — create: TanStack Query `useUMDashboard()`; extract `isUnauthorized` (403 guard), `navigateToProfile` (`/people/:personId`); return `{ data, isLoading, isError, isUnauthorized, navigateToProfile }`
- [ ] `services/frontend/src/pages/UMDashboardPage/UMDashboardPage.tsx` — create: counter cards row (`headcount`, per-severity risk counts, open/overdue AI counts via `DashboardCountCard`); subordinates `DashboardTable` with `columns: ColumnSpec<UMDashboardRow>[]` = [name→link, severity→`SeverityBadge`|"—", project→first project label|"—", leave→`leaveStatus`|"—"]; own action items section (sorted by `dueDate` asc, overdue rows highlighted); skeleton loading; unauthorized redirect to home
- [ ] `services/frontend/src/locales/en/translation.json` — add `dashboard.um.title`, `dashboard.um.headcount`, `dashboard.um.riskCounts.*` (per level), `dashboard.um.actionItemCounts.open/overdue`, `dashboard.um.columns.*` (name, severity, project, leave), `dashboard.um.ownActionItems.*`, `dashboard.um.empty.*`
- [ ] `services/frontend/src/router/index.tsx` — add `{ path: 'um-dashboard', element: <UMDashboardPage /> }` alongside `risk-dashboard` route
- [ ] `services/people-service/src/modules/employees/__tests__/um-dashboard-metadata.controller.spec.ts` — unit tests: happy path, zero direct reports, auth failure
- [ ] `services/bff/src/modules/um-dashboard/__tests__/um-dashboard.service.spec.ts` — unit tests: 403 on no permission, 403 on non-Manager, composed response, null leave status, WMS/People Service 5xx → fail closed
- [ ] `services/frontend/src/pages/UMDashboardPage/__tests__/UMDashboardPage.test.tsx` — unit tests: counter cards render, empty subordinates message, overdue row highlighting, unauthorized redirect

**Acceptance Criteria:**
- Given an authenticated UM with direct reports, when `/um-dashboard` loads, then counter cards show headcount, per-severity risk counts, and open/overdue AI counts; subordinates table lists each direct report with name, severity badge, primary project, and leave status; own action items appear sorted by due date with overdue rows visually distinct from non-overdue.
- Given a subordinate with no risk record or absent leave status, when the table renders, then their severity or leave cell shows "—" without an error.
- Given a viewer without `view-dashboard/unit-manager` permission or no reporting-line Manager role, when the BFF endpoint is called, then 403 is returned with no employee data in the body.
- Given the SideMenu probe receives 403, when it renders, then the UM Dashboard link is absent with no "you don't have permission" message shown.
- Given resourcing and campaign data are not yet available (pre-Epic 13), when the dashboard renders, then no resourcing-request count or campaign-count block appears anywhere on the page.

## Design Notes

Subordinates table column declaration (mirrors RiskDashboardPage lines 31–65):
```tsx
const columns: ColumnSpec<UMDashboardRow>[] = [
  { key: 'name',     header: t('dashboard.um.columns.name'),     sortable: false, render: row => row.fullName },
  { key: 'severity', header: t('dashboard.um.columns.severity'), sortable: false,
    render: row => row.severity ? <SeverityBadge level={row.severity} /> : '—' },
  { key: 'project',  header: t('dashboard.um.columns.project'),  sortable: false,
    render: row => row.projects[0]?.label ?? '—' },
  { key: 'leave',    header: t('dashboard.um.columns.leave'),    sortable: false,
    render: row => row.leaveStatus ?? '—' },
];
```
`sortable: false` avoids premature `aria-sort` state wiring deferred from Story 5.1 code review.

## Spec Change Log

## Verification

**Commands:**
- `cd services/people-service && npm test` — expected: `um-dashboard-metadata.controller.spec.ts` passes; existing tests unaffected
- `cd services/bff && npm test` — expected: `um-dashboard.service.spec.ts` passes; existing tests unaffected
- `cd services/frontend && npm test` — expected: `UMDashboardPage.test.tsx` passes; existing tests unaffected
- `cd services/frontend && npm run lint` — expected: no lint errors
- `cd services/frontend && npm run build` — expected: type-safe build succeeds

**Manual checks:**
- Log in as a seeded UM; confirm UM Dashboard link appears in SideMenu and page loads with correct counts, table rows, and own action items
- Log in as a non-UM; confirm UM Dashboard link is absent from SideMenu
