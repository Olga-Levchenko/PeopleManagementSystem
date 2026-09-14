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
- `services/bff/src/modules/functional-roles/functional-roles.service.ts` — reference: ACS permission-check call pattern; the BFF's `FunctionalRolesService.request()` (private, line 150+) calls `ACCESS_CONTROL_SERVICE_BASE_URL/api/v1{path}` — the ACS endpoint for functional permission checks is `POST /api/v1/permissions/check` (body: `{ permissionKey, scope? }`, response: `{ granted: boolean }`) — see `services/access-control-service/src/AccessControlService.Api/Controllers/FunctionalRolesController.cs` line 291
- `services/bff/src/modules/management-notes/management-notes.controller.ts` — reference: session bearer-token forwarding pattern for WMS calls (`resolveAuthorization`, lines 99–113); `wmsAuth` for action-items must follow this same pattern (session/incoming bearer token forwarded unchanged, no audience exchange)
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
- `services/frontend/src/pages/RiskDashboardPage/hooks/useRiskDashboardPage.ts` — reference: hook return shape + `isUnauthorized` / `navigateToProfile` pattern (lines 1–71); the page component calls `navigate('/')` in a `useEffect` when `isUnauthorized` is true — use the same pattern for `UMDashboardPage`
- `services/frontend/src/api/riskDashboard.ts` — reference: `getRiskDashboardApiCall` pattern for new `getUMDashboardApiCall`
- `services/frontend/src/router/index.tsx` — extend: add `um-dashboard` route alongside `risk-dashboard` (line ~48)
- `services/frontend/src/locales/en/translation.json` — extend: add `dashboard.um.*` keys and `sidebar.umDashboard` key

## Tasks & Acceptance

**Execution:**
- [ ] `services/people-service/src/modules/employees/um-dashboard-metadata.controller.ts` — create: `GET /api/v1/internal/um-dashboard/metadata`; resolve caller personId from auth principal using `RequestActorContext` / `IdentityResolutionService.resolveActorId(sub)` (pattern from `modules/organisational-relationships/request-actor.context.ts` and the `IdentityResolutionService` used in existing People Service controllers — do not use `request.user.sub` directly as a platform personId); query `Person` where `managerId = callerPersonId` via `EmployeesService.getUMDashboardMetadata(callerPersonId)`; return `{ people: [{ personId, fullName, department: {id,label}|null, projects: {id,label}[], leaveStatus: string|null }] }`; JWT-guarded (trusted internal caller)
- [ ] `services/people-service/src/modules/employees/employees.service.ts` — add `getUMDashboardMetadata(callerPersonId: string)` method: query `prisma.person.findMany({ where: { managerId: callerPersonId } })` with includes for department, projects, and leaveStatus; return the DTO shape `{ people: UMDashboardPersonDto[] }` matching `UMDashboardMetadataResponseDto`
- [ ] `services/people-service/src/modules/employees/um-dashboard-metadata.dto.ts` — create: `UMDashboardPersonDto` + `UMDashboardMetadataResponseDto`; mirror `RiskDashboardMetadataDto` naming convention
- [ ] `services/people-service/src/modules/employees/employees.module.ts` — register `UMDashboardMetadataController`
- [ ] `services/bff/src/modules/um-dashboard/um-dashboard.service.ts` — create: `getUMDashboard(authorization, peopleAuth, wmsAuth)`; perform two guard steps before fetching any data: (1) call ACS `POST /api/v1/permissions/check` (body: `{ permissionKey: 'view-dashboard', scope: { dashboardType: 'unit-manager' } }`) with the caller's audience-exchanged token — return 403 if `granted` is false or ACS is unavailable; (2) call `GET people-service/api/v1/internal/um-dashboard/metadata` with `peopleAuth`; if `peopleMetadata.people.length === 0`, return 403 (zero direct reports definitively means no UM reporting-line relationship — no separate ACS access-role call is needed); then proceed to fetch WMS data: `GET wms/api/v1/risks/dashboard` (paginate, collect all risk rows); `GET wms/api/v1/action-items/mine`; compose response: `headcount` = `peopleMetadata.people.length` (total direct reports, before any WMS intersection — not the count of rows after risk-data filtering); build `rows` from `peopleMetadata.people` (all direct reports) — for each person, attach the matching WMS risk row if one exists (`severity`, `trendDirection`, `recordedAt`), otherwise set `severity: null, trendDirection: 'none', recordedAt: null`; subordinates without a risk row always appear in the table; compute `actionItemCounts: { open: number, overdue: number }` where `open` = count of action items where `status !== 'completed'` and `overdue` = count of action items where `isOverdue === true`; return `{ headcount, riskCounts, actionItemCounts, rows, ownActionItems }`
- [ ] `services/bff/src/modules/um-dashboard/um-dashboard.controller.ts` — create: `GET /api/v1/um-dashboard`; `OidcService.resolveAuthorization` for people-service and access-control-service tokens; for the WMS `action-items/mine` call, `wmsAuth` uses the session bearer token directly (forwarded unchanged, not audience-exchanged) — same pattern as `ManagementNotesController.resolveAuthorization` (work-management-service's `JwtStrategy` still validates the plain `bff-confidential` audience, no dedicated WMS audience client scope exists yet); delegate to service; propagate 403
- [ ] `services/bff/src/modules/um-dashboard/um-dashboard.module.ts` — create: NestJS module; import shared auth/OidcService modules following risk-dashboard.module.ts pattern
- [ ] `services/bff/src/app.module.ts` — import and register `UMDashboardModule`
- [ ] `services/frontend/src/api/umDashboard.ts` — create: `getUMDashboardApiCall(query?, signal?)` → `GET /api/v1/um-dashboard`; export types `UMDashboardRow`, `UMDashboardOwnActionItem`, `UMDashboardResponse`; define `UMDashboardOwnActionItem` as `{ id: string, title: string, dueDate: string, status: string, isOverdue: boolean }` — `isOverdue` is provided directly by WMS (it computes and returns this field); define `actionItemCounts: { open: number, overdue: number }` in `UMDashboardResponse` where `open` = count of items where `status !== 'completed'` and `overdue` = count of items where `isOverdue === true`
- [ ] `services/frontend/src/components/SideMenu/hooks/useSideMenu.ts` — add `canAccessUMDashboard` probe: `getUMDashboardApiCall({ pageSize: 1 }, signal)` → true on success, false on error; return it alongside `canAccessRiskDashboard`
- [ ] `services/frontend/src/components/SideMenu/SideMenu.tsx` — conditionally render UM dashboard link when `canAccessUMDashboard` using the same `&&` JSX pattern as `canAccessRiskDashboard`
- [ ] `services/frontend/src/pages/UMDashboardPage/hooks/useUMDashboardPage.ts` — create: TanStack Query `useUMDashboard()`; extract `isUnauthorized` (403 guard), `navigateToProfile` (`/people/:personId`); return `{ data, isLoading, isError, isUnauthorized, navigateToProfile }`; do not call `navigate('/')` from within the hook — expose `isUnauthorized` and let the page component handle the redirect
- [ ] `services/frontend/src/pages/UMDashboardPage/UMDashboardPage.tsx` — create: call `navigate('/')` in a `useEffect` when `isUnauthorized` is true (same pattern as `useRiskDashboardPage` — the page component owns the redirect, not the hook); counter cards row (`headcount`, per-severity risk counts, open/overdue AI counts via `DashboardCountCard`); subordinates `DashboardTable` with `columns: ColumnSpec<UMDashboardRow>[]` = [name→link, severity→`SeverityBadge`|"—", project→first project label|"—", leave→`leaveStatus`|"—"]; own action items section (sorted by `dueDate` asc, overdue rows highlighted); skeleton loading; unauthorized redirect to home
- [ ] `services/frontend/src/locales/en/translation.json` — add `dashboard.um.title`, `dashboard.um.headcount`, `dashboard.um.riskCounts.*` (per level), `dashboard.um.actionItemCounts.open/overdue`, `dashboard.um.columns.*` (name, severity, project, leave), `dashboard.um.ownActionItems.*`, `dashboard.um.empty.*`; also add `sidebar.umDashboard` key for the SideMenu link label
- [ ] `services/frontend/src/router/index.tsx` — add `{ path: 'um-dashboard', element: <UMDashboardPage /> }` alongside `risk-dashboard` route
- [ ] `services/people-service/src/modules/employees/__tests__/um-dashboard-metadata.controller.spec.ts` — unit tests: happy path, zero direct reports, auth failure
- [ ] `services/bff/src/modules/um-dashboard/__tests__/um-dashboard.service.spec.ts` — unit tests: 403 on no permission (ACS returns `granted: false`), 403 on non-Manager (zero direct reports), composed response, null leave status, People Service 5xx → fail closed, WMS risks 5xx → fail closed, WMS action-items 5xx → fail closed (distinct path from risks 5xx)
- [ ] `services/frontend/src/components/SideMenu/hooks/__tests__/useSideMenu.test.ts` — extend existing test file: add cases for `canAccessUMDashboard`: true on 200, false on 403, false on network error
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

- 2026-09-14 (post-review): Applied D1-A, D2-A, D3-A decisions and P1–P9 patches from review loop iteration 0.
  - D1-A: Added two explicit BFF guard steps to `um-dashboard.service.ts` task (ACS `POST /api/v1/permissions/check` call for functional permission; zero-subordinates check from People Service metadata for Manager-role gate). Added ACS endpoint reference and `management-notes` session-token forwarding reference to Code Map.
  - D2-A: Added note to `um-dashboard.controller.ts` task: `wmsAuth` for action-items call uses session bearer token directly (management-notes forwarding pattern), not audience-exchanged token.
  - D3-A: Added `UMDashboardOwnActionItem` field list `{ id, title, dueDate, status, isOverdue }` to `umDashboard.ts` task; `isOverdue` from WMS. Added `actionItemCounts: { open, overdue }` definition.
  - P1: Added `RequestActorContext` / `IdentityResolutionService.resolveActorId(sub)` instruction to People Service controller task.
  - P2: Added new `employees.service.ts` task for `getUMDashboardMetadata(callerPersonId)` method.
  - P3: Clarified BFF compose: rows built from `peopleMetadata.people` (all direct reports); WMS risk row attached if present, else `severity: null, trendDirection: 'none', recordedAt: null`.
  - P4: Defined `actionItemCounts` shape in BFF service task compose step.
  - P5: Added explicit statement: `headcount = peopleMetadata.people.length` (before WMS intersection).
  - P6: Added `sidebar.umDashboard` key to translation.json task and Code Map entry.
  - P7: Added `useSideMenu.test.ts` task to test `canAccessUMDashboard` (true/false/network-error cases).
  - P8: Added distinct WMS action-items 5xx test case to BFF service test task.
  - P9: Clarified `isUnauthorized` handling: page calls `navigate('/')` in `useEffect`; hook exposes flag only.

## Review Findings

- [x] [Review][Decision] BFF permission-check and Manager-role-check mechanism unspecified — **Resolved D1-A**: Two explicit guard steps added to BFF service task. (1) ACS `POST /api/v1/permissions/check` with `{ permissionKey: 'view-dashboard', scope: { dashboardType: 'unit-manager' } }` for functional-permission gate. (2) Zero-direct-reports check from People Service metadata response for Manager-role gate (no separate ACS call needed — zero subordinates definitively means no UM relationship). ACS endpoint reference added to Code Map.
- [x] [Review][Decision] `GET /api/v1/action-items/mine` caller identity — **Resolved D2-A**: `wmsAuth` for the action-items call uses the session bearer token forwarded unchanged (same as management-notes module pattern). Note added to BFF controller task with explicit reference to `ManagementNotesController.resolveAuthorization`.
- [x] [Review][Decision] `UMDashboardOwnActionItem` shape and `isOverdue` definition — **Resolved D3-A**: `UMDashboardOwnActionItem` defined as `{ id: string, title: string, dueDate: string, status: string, isOverdue: boolean }`; `isOverdue` comes from WMS. `actionItemCounts: { open: number, overdue: number }` added with explicit definitions.
- [x] [Review][Patch] People Service `resolveActorId` mechanism missing — **Resolved P1**: Controller task now specifies `RequestActorContext` / `IdentityResolutionService.resolveActorId(sub)` with reference to the organisational-relationships pattern.
- [x] [Review][Patch] People Service metadata — missing `employees.service.ts` method task — **Resolved P2**: New task added for `getUMDashboardMetadata(callerPersonId: string)` in `employees.service.ts`.
- [x] [Review][Patch] Missing sidebar i18n key — **Resolved P6**: `sidebar.umDashboard` added to translation.json task and Code Map entry.
- [x] [Review][Patch] `useSideMenu.test.ts` missing from test tasks — **Resolved P7**: Task added to extend `useSideMenu.test.ts` with `canAccessUMDashboard` true/false/network-error cases.
- [x] [Review][Patch] Headcount calculation ambiguity — **Resolved P5**: BFF service task now explicitly states `headcount = peopleMetadata.people.length` (all direct reports, before WMS intersection).
- [x] [Review][Patch] `actionItemCounts` shape undefined — **Resolved P4**: `actionItemCounts: { open: number, overdue: number }` defined in BFF service task compose step with explicit predicates.
- [x] [Review][Patch] Subordinates-without-risk-rows must appear in table — **Resolved P3**: BFF service task now explicitly states rows are built from `peopleMetadata.people` (not from WMS rows); WMS risk data attached per person if present, else nulled fields.
- [x] [Review][Patch] BFF service test missing action-items 5xx case — **Resolved P8**: Distinct WMS action-items 5xx test case added to BFF service test task.
- [x] [Review][Patch] `useUMDashboardPage` unauthorized redirect — **Resolved P9**: Hook task specifies it exposes `isUnauthorized` only (no `navigate` call); page task specifies `navigate('/')` in `useEffect` when `isUnauthorized` is true, matching `useRiskDashboardPage` pattern.

## Verification

**Commands:**
- `cd services/people-service && npm test` — expected: `um-dashboard-metadata.controller.spec.ts` passes; existing tests unaffected
- `cd services/bff && npm test` — expected: `um-dashboard.service.spec.ts` passes; existing tests unaffected
- `cd services/frontend && npm test` — expected: `UMDashboardPage.test.tsx` and `useSideMenu.test.ts` pass; existing tests unaffected
- `cd services/frontend && npm run lint` — expected: no lint errors
- `cd services/frontend && npm run build` — expected: type-safe build succeeds

**Manual checks:**
- Log in as a seeded UM; confirm UM Dashboard link appears in SideMenu and page loads with correct counts, table rows, and own action items
- Log in as a non-UM; confirm UM Dashboard link is absent from SideMenu
