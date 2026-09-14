---
title: 'Story 5.3: DM/PM Dashboard — Early Blocks'
type: 'feature'
created: '2026-09-14'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'e2ea19eeeae8c4c283155e34a6d30303678e3129'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Delivery Managers and Project Managers have no dashboard surface to monitor their project teams — they must navigate All Employees and cannot see risk, leave, or action-item status grouped by project.

**Approach:** Add a combined DM/PM dashboard page backed by a new BFF `dm-pm-dashboard` module: checks `view-dashboard/delivery-manager` OR `view-dashboard/project-manager` ACS permissions, calls a new People Service internal endpoint returning projects where the caller is DM or PM with their active members, fetches WMS risk and own action-item data, and composes a project-grouped response. Frontend page uses Story 5.1 shared components and a client-side project selector (defaults to "All projects").

## Boundaries & Constraints

**Always:**
- BFF fires two parallel ACS `POST /api/v1/permissions/check` calls (`dashboardType: 'delivery-manager'` and `dashboardType: 'project-manager'`); grants access if EITHER returns `granted: true`; 403 on both deny or ACS unavailable.
- Resolve caller identity from the JWT principal via session; never accept `actorPersonId` from the request.
- People Service endpoint queries `PersonProjectAssignment` where `personId = callerPersonId`, `role IN ['DeliveryManager', 'ProjectManager']`, active (endDate null or future). Returns `{ projects: [] }` when none; BFF returns 403 on empty.
- Project selector defaults to "All projects"; counters and table recalculate client-side on change — no refetch per selection.
- Resourcing-count and campaign-count blocks are **absent** (Epic 13).
- Leave status nullable → render "—" without error.
- Use Story 5.1 shared components (`DashboardCountCard`, `DashboardTable`, `SeverityBadge`, `TrendIcon`). All strings via `useTranslation`, `dashboard.dmpm.*` namespace.
- WMS `action-items/mine` uses session bearer token forwarded unchanged (same management-notes pattern as Story 5.2).

**Ask First:**
- Splitting DM and PM into separate endpoints or pages.
- Adding transitive project resolution beyond direct DM/PM assignment.

**Never:**
- Add resourcing, campaign, or Epic 7/11/13 blocks.
- Accept caller-supplied actor or permission state from the browser.
- Add new WMS endpoints — reuse `GET /api/v1/risks/dashboard` and `GET /api/v1/action-items/mine`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| DM/PM with managed projects | ≥1 active DM or PM assignment; WMS has risk rows and action items | Counter cards (total people, per-severity risk, open/overdue AI) across all projects; project selector; per-project table; own action items | — |
| Project filter applied | Viewer selects single project | Counters and rows update to selected project only; no network request | — |
| No managed projects (after permission grant) | ACS grants but People Service returns empty projects | 403; SideMenu probe → link absent | 403, no data |
| Both ACS checks deny | `granted: false` from both checks | 403 | 403, no data |
| Person has no risk record or absent leave | WMS row missing; S10 not synced | Severity cell "—"; leave cell "—" | — |
| Upstream unavailable | People Service or WMS 5xx | Fail closed; generic error state | No partial data |

</frozen-after-approval>

## Code Map

- `services/bff/src/modules/um-dashboard/um-dashboard.service.ts` — reference: ACS permission-check call pattern, WMS pagination loop (max 50-page guard), compose logic
- `services/bff/src/modules/management-notes/management-notes.controller.ts` — reference: session bearer-token forwarding for WMS (lines 99–113)
- `services/bff/src/modules/functional-roles/functional-roles.service.ts` — reference: ACS `POST /api/v1/permissions/check` endpoint (`{ permissionKey, scope? }` → `{ granted: boolean }`)
- `services/bff/src/modules/` — destination: new `dm-pm-dashboard/` (controller + service + module)
- `services/bff/src/app.module.ts` — register `DMPMDashboardModule`
- `services/people-service/src/modules/employees/um-dashboard-metadata.controller.ts` — reference: controller pattern with `RequestActorContext.resolveActorId()`
- `services/people-service/src/modules/employees/employees.service.ts` — reference: `getUMDashboardMetadata` lines 217–256 (active-assignment filter, leave join, department join); `PersonProjectAssignment.role` values: `'DeliveryManager'`, `'ProjectManager'`, `'Member'` (confirmed in employees.service.spec.ts:261)
- `services/people-service/src/modules/employees/employees.module.ts` — register new controller
- `services/frontend/src/components/DashboardCountCard/`, `DashboardTable/`, `SeverityBadge/` — import; established props interfaces
- `services/frontend/src/components/SideMenu/hooks/useSideMenu.ts` — extend: add `canAccessDMPMDashboard` probe (lines 1–35 pattern)
- `services/frontend/src/components/SideMenu/SideMenu.tsx` — extend: conditional link (lines 61–88 pattern)
- `services/frontend/src/pages/UMDashboardPage/UMDashboardPage.tsx` — reference: counter cards, DashboardTable columns, own action items, `navigate('/')` in `useEffect`
- `services/frontend/src/pages/UMDashboardPage/hooks/useUMDashboardPage.ts` — reference: `isUnauthorized` / `isError` / `navigateToProfile` pattern
- `services/frontend/src/api/umDashboard.ts` — reference: `getUMDashboardApiCall` structure and exported type shapes
- `services/frontend/src/router/index.tsx` — extend: add `dm-pm-dashboard` route
- `services/frontend/src/locales/en/translation.json` — extend: `dashboard.dmpm.*` and `sidebar.dmpmDashboard`

## Tasks & Acceptance

**Execution:**
- [x] `services/people-service/src/modules/employees/dm-pm-dashboard-metadata.dto.ts` — create: `DMPMDashboardPersonDto` (`{ personId, fullName, department: {id,label}|null, leaveStatus: string|null }`), `DMPMDashboardProjectDto` (`{ projectId, projectLabel, people: DMPMDashboardPersonDto[] }`), `DMPMDashboardMetadataResponseDto` (`{ projects: DMPMDashboardProjectDto[] }`)
- [x] `services/people-service/src/modules/employees/employees.service.ts` — add `getDMPMDashboardMetadata(callerPersonId)`: (1) find `personProjectAssignment` rows where `personId = callerPersonId`, `role IN ['DeliveryManager', 'ProjectManager']`, active; collect unique `projectNames` via `Set`; return `{ projects: [] }` if empty; (2) find all `personProjectAssignment` rows where `projectName IN projectNames`, active, include `person { id, fullName, department { id, name }, leaves (current, take 1, desc) }`; (3) group by `projectName`, deduplicate people per project; return `{ projects }`
- [x] `services/people-service/src/modules/employees/dm-pm-dashboard-metadata.controller.ts` — create: `@Controller('internal/dm-pm-dashboard')` `@Get('metadata')`; resolve caller via `actorContext.resolveActorId()`; delegate to `service.getDMPMDashboardMetadata(callerPersonId)`
- [x] `services/people-service/src/modules/employees/employees.module.ts` — register `DMPMDashboardMetadataController`
- [x] `services/bff/src/modules/dm-pm-dashboard/dm-pm-dashboard.service.ts` — create: (1) fire two parallel ACS permission checks (`delivery-manager`, `project-manager`); 403 if both deny or either throws; (2) GET `people-service/api/v1/internal/dm-pm-dashboard/metadata`; 403 if `projects` empty; (3) collect all personIds; paginate WMS risks (max 50 pages); GET WMS `action-items/mine` with session bearer token; (4) build `projectRows` (each person left-joined with WMS risk row or nulled fields); aggregate `riskCounts`, `actionItemCounts`; return `{ projects: projectRows, riskCounts, actionItemCounts, ownActionItems }`
- [x] `services/bff/src/modules/dm-pm-dashboard/dm-pm-dashboard.controller.ts` — create: `GET /api/v1/dm-pm-dashboard`; `OidcService.resolveAuthorization` for people-service and ACS tokens; `wmsAuth` = session bearer forwarded unchanged; delegate to service; propagate 403
- [x] `services/bff/src/modules/dm-pm-dashboard/dm-pm-dashboard.module.ts` — create: NestJS module following `um-dashboard.module.ts`
- [x] `services/bff/src/app.module.ts` — register `DMPMDashboardModule`
- [x] `services/frontend/src/api/dmPmDashboard.ts` — create: `getDMPMDashboardApiCall(signal?)` → `GET /api/v1/dm-pm-dashboard`; export `DMPMDashboardRow` (`{ personId, fullName, severity: RiskSeverity|null, trendDirection: RiskTrendDirection|'none', leaveStatus: string|null }`), `DMPMDashboardProject` (`{ projectId, projectLabel, rows: DMPMDashboardRow[] }`), `DMPMDashboardOwnActionItem` (`{ id, title, dueDate, status, isOverdue: boolean }`), `DMPMDashboardResponse`
- [x] `services/frontend/src/components/SideMenu/hooks/useSideMenu.ts` — add `canAccessDMPMDashboard` probe: `getDMPMDashboardApiCall(signal)` → true on 200, false on error
- [x] `services/frontend/src/components/SideMenu/SideMenu.tsx` — conditionally render DM/PM dashboard link when `canAccessDMPMDashboard`; label `t('sidebar.dmpmDashboard')`
- [x] `services/frontend/src/pages/DMPMDashboardPage/hooks/useDMPMDashboardPage.ts` — create: TanStack Query `useDMPMDashboard()`; `isUnauthorized` (403 flag); `isError: dashboard.isError && !isUnauthorized`; `navigateToProfile(personId)`; `selectedProjectId` state (`string | 'all'`, default `'all'`); computed `activeProjects`/`activeRows`/`activeRiskCounts` from selection (client-side); return all
- [x] `services/frontend/src/pages/DMPMDashboardPage/DMPMDashboardPage.tsx` — create: `navigate('/')` in `useEffect` when `isUnauthorized`; project selector (`<select>`) with "All projects" option + one per project; counter cards (total-people, per-severity risk, open/overdue AI) from `activeRiskCounts`; `DashboardTable` with columns [name→link, severity→`SeverityBadge`|"—", leave→`leaveStatus`|"—"]; own action items sorted by `dueDate` asc, overdue rows highlighted; skeleton loading
- [x] `services/frontend/src/locales/en/translation.json` — add `dashboard.dmpm.title/totalPeople/riskCounts.*/actionItemCounts.open|overdue/projectSelector.all/columns.*/ownActionItems.*/empty.*`; add `sidebar.dmpmDashboard`
- [x] `services/frontend/src/router/index.tsx` — add `{ path: 'dm-pm-dashboard', element: <DMPMDashboardPage /> }`
- [x] `services/people-service/src/modules/employees/__tests__/dm-pm-dashboard-metadata.controller.spec.ts` — unit tests: happy path, no DM/PM assignments → empty projects, auth failure
- [x] `services/people-service/src/modules/employees/__tests__/employees.service.spec.ts` — extend: `getDMPMDashboardMetadata` — DeliveryManager matches, ProjectManager matches, mixed DM+PM projects, zero DM/PM assignments → empty, null leaveStatus, person appears in multiple projects (deduplicated)
- [x] `services/bff/src/modules/dm-pm-dashboard/__tests__/dm-pm-dashboard.service.spec.ts` — unit tests: both ACS deny → 403; DM-only grant proceeds; PM-only grant proceeds; ACS HTTP 5xx → 403; ACS JSON error → 403; empty projects → 403; composed response; null leaveStatus propagated; People Service 5xx closes; WMS risks 5xx closes; WMS action-items 5xx closes (distinct path)
- [x] `services/frontend/src/components/SideMenu/hooks/__tests__/useSideMenu.test.ts` — extend: `canAccessDMPMDashboard` true on 200, false on 403, false on any error
- [x] `services/frontend/src/pages/DMPMDashboardPage/__tests__/DMPMDashboardPage.test.tsx` — unit tests: counter cards render aggregated counts; project selector filters rows client-side; empty table shows `emptyMessage`; overdue action item highlighted; unauthorized → redirect

**Acceptance Criteria:**
- Given an authenticated DM or PM with managed projects, when `/dm-pm-dashboard` loads, then counter cards show aggregated total-people, per-severity risk counts, and open/overdue AI counts; a project selector defaults to "All projects"; a table lists managed members with name, severity badge, and leave status; own action items sorted by due date with overdue rows visually distinct.
- Given the viewer selects a specific project, then counters and rows update to that project only without a network request.
- Given a person with no risk record or absent leave status, their severity or leave cell shows "—" without error.
- Given both ACS permission checks deny or the caller has no managed DM/PM projects, when the BFF endpoint is called, then 403 is returned with no employee data.
- Given the SideMenu probe receives 403, then the DM/PM Dashboard link is absent with no error message shown.
- Given pre-Epic 13 state, no resourcing-request count or campaign-count block appears on the page.

## Design Notes

BFF ACS OR-logic: fire both permission checks in parallel with `Promise.allSettled`. For each settled result, treat as denied if rejected OR if `!response.ok` OR if parsed `granted` is false. Grant if either check is non-denied. This handles network errors per-leg — if one ACS call throws and the other grants, access is allowed.

People Service deduplication: a caller may hold both DM and PM assignments on the same project (deferred-work.md open question). Group project names via `Set` before step 2. Within each project, deduplicate people by `personId` using a `Map` (first-seen wins) before returning.

Column declaration (mirrors Story 5.2 pattern):
```tsx
[
  { key: 'name',     sortable: false, render: row => row.fullName },
  { key: 'severity', sortable: false, render: row => row.severity ? <SeverityBadge level={row.severity} /> : '—' },
  { key: 'leave',    sortable: false, render: row => row.leaveStatus ?? '—' },
]
```

## Spec Change Log

## Verification

**Commands:**
- `cd services/people-service && npm test` — expected: new controller spec passes; `getDMPMDashboardMetadata` cases pass; existing tests unaffected
- `cd services/bff && npm test` — expected: `dm-pm-dashboard.service.spec.ts` passes; existing unaffected
- `cd services/frontend && npm test` — expected: `DMPMDashboardPage.test.tsx` and `useSideMenu.test.ts` pass; existing unaffected
- `cd services/frontend && npm run lint` — expected: no lint errors
- `cd services/frontend && npm run build` — expected: type-safe build succeeds

**Manual checks:**
- Log in as seeded DM; confirm DM/PM Dashboard link in SideMenu and page loads with project selector, counters, and table rows
- Log in as seeded PM (non-DM); confirm link appears and page loads
- Log in as plain employee; confirm link absent from SideMenu
- Select a specific project; confirm counters and table update without a network request

## Suggested Review Order

**BFF: permission check & composition (highest-leverage entry point)**

- OR-logic: `Promise.allSettled` on two ACS checks; grants if either fulfils with `granted:true`
  [`dm-pm-dashboard.service.ts:206`](../../services/bff/src/modules/dm-pm-dashboard/dm-pm-dashboard.service.ts#L206)

- `checkPermission` private method: fail-closed for network errors, bad JSON, non-ok status
  [`dm-pm-dashboard.service.ts:362`](../../services/bff/src/modules/dm-pm-dashboard/dm-pm-dashboard.service.ts#L362)

- WMS risk pagination loop (50-page guard) feeding into per-person risk map
  [`dm-pm-dashboard.service.ts:243`](../../services/bff/src/modules/dm-pm-dashboard/dm-pm-dashboard.service.ts#L243)

- Response composition: per-project rows, deduplicated totals, sorted action items
  [`dm-pm-dashboard.service.ts:294`](../../services/bff/src/modules/dm-pm-dashboard/dm-pm-dashboard.service.ts#L294)

- Controller: token resolution — audience-exchanged for people-service/ACS, session bearer for WMS
  [`dm-pm-dashboard.controller.ts:412`](../../services/bff/src/modules/dm-pm-dashboard/dm-pm-dashboard.controller.ts#L412)

**People Service: data layer**

- `getDMPMDashboardMetadata`: two-query pattern — caller's DM/PM assignments, then all project members
  [`employees.service.ts:256`](../../services/people-service/src/modules/employees/employees.service.ts#L256)

- Project deduplication (Set) and people deduplication per project (Map, first-seen wins)
  [`employees.service.ts:320`](../../services/people-service/src/modules/employees/employees.service.ts#L320)

- Internal controller: resolves caller from JWT principal, never accepts caller-supplied actor
  [`dm-pm-dashboard-metadata.controller.ts:27`](../../services/people-service/src/modules/employees/dm-pm-dashboard-metadata.controller.ts#L27)

**Frontend: page and client-side filtering**

- `useDMPMDashboardPage`: `isUnauthorized`/`isError` split; `useMemo` per-project filter (no refetch)
  [`useDMPMDashboardPage.ts:966`](../../services/frontend/src/pages/DMPMDashboardPage/hooks/useDMPMDashboardPage.ts#L966)

- Page component: project selector drives filter state; action item counts stay global (not per-project)
  [`DMPMDashboardPage.tsx:1044`](../../services/frontend/src/pages/DMPMDashboardPage/DMPMDashboardPage.tsx#L1044)

- SideMenu probe: separate `useEffect` fires `getDMPMDashboardApiCall`; true on 200, false on any error
  [`useSideMenu.ts:47`](../../services/frontend/src/components/SideMenu/hooks/useSideMenu.ts#L47)

**Supporting: types, wiring, i18n**

- Frontend API types (`DMPMDashboardRow`, `DMPMDashboardResponse`)
  [`dmPmDashboard.ts:1`](../../services/frontend/src/api/dmPmDashboard.ts#L1)

- People Service DTO interfaces
  [`dm-pm-dashboard-metadata.dto.ts:1`](../../services/people-service/src/modules/employees/dm-pm-dashboard-metadata.dto.ts#L1)

- `dashboard.dmpm.*` and `sidebar.dmpmDashboard` i18n keys
  [`translation.json:38`](../../services/frontend/src/locales/en/translation.json#L38)

- Route registration and module wiring
  [`router/index.tsx:54`](../../services/frontend/src/router/index.tsx#L54)

**Tests**

- BFF service: 15 cases covering ACS OR-logic, empty projects→403, upstream failures, sort order
  [`dm-pm-dashboard.service.spec.ts:1`](../../services/bff/src/modules/dm-pm-dashboard/__tests__/dm-pm-dashboard.service.spec.ts#L1)

- Hook unit test: per-project filter recalculation, isUnauthorized/isError split
  [`useDMPMDashboardPage.test.ts:1`](../../services/frontend/src/pages/DMPMDashboardPage/__tests__/useDMPMDashboardPage.test.ts#L1)

- Page component tests: counter cards, selector, empty state, overdue highlight, redirect
  [`DMPMDashboardPage.test.tsx:1`](../../services/frontend/src/pages/DMPMDashboardPage/__tests__/DMPMDashboardPage.test.tsx#L1)

- People Service controller and service tests
  [`dm-pm-dashboard-metadata.controller.spec.ts:1`](../../services/people-service/src/modules/employees/__tests__/dm-pm-dashboard-metadata.controller.spec.ts#L1)
