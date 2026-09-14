---
title: 'Story 5.4: PP Dashboard'
type: 'feature'
created: '2026-09-14'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'fc16da2f4c7e517158e8fc06d03f5e466ce06c34'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** People Partners have no dashboard surface and must use All Employees to see risk, leave, and action-item status for the people they're responsible for.

**Approach:** Add a PP dashboard page backed by a new BFF `pp-dashboard` module (single ACS `people-partner` permission check) and a new People Service internal endpoint (queries `Person` where `peoplePartnerId = callerPersonId`). Frontend uses Story 5.1 shared components with a client-side dept/project grouping toggle; no resourcing block; complete as shipped.

## Boundaries & Constraints

**Always:**
- BFF fires one ACS `POST /api/v1/permissions/check` call (`{ permissionKey: 'view-dashboard', scope: { dashboardType: 'people-partner' } }`); 403 on deny or ACS unavailable. No OR logic — PP has a single scope.
- Resolve caller from the JWT principal via session; never accept `actorPersonId` from the request.
- People Service endpoint queries `Person` where `peoplePartnerId = callerPersonId`. Returns `{ people: [] }` when none; BFF returns 403 on empty people.
- Grouping toggle (dept/project) is client-side, no refetch. Counter cards (headcount, risk counts, AI counts) always reflect the full PP population regardless of active group.
- Use Story 5.1 shared components (`DashboardCountCard`, `DashboardTable`, `SeverityBadge`, `TrendIcon`). All strings via `useTranslation`, `dashboard.pp.*` namespace.
- WMS `action-items/mine` uses session bearer token forwarded unchanged (management-notes pattern).
- Leave status nullable → render "—" without error.
- No resourcing block — this dashboard is complete as shipped in this story.

**Ask First:**
- Department hierarchy drill-down beyond flat group-by.
- Separate API calls per grouping mode.

**Never:**
- Add resourcing, campaign, or Epic 7/11/13 blocks.
- Accept caller-supplied actor or permission state from the browser.
- Add new WMS endpoints.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| PP with assigned people | ≥1 person with `peoplePartnerId = callerPersonId`; WMS has risk rows | Counter cards (headcount, per-severity risk, open/overdue AI); grouping toggle; grouped tables; own action items | — |
| Grouping toggle switched | Viewer toggles dept ↔ project | Tables re-group client-side; counters unchanged; no network request | — |
| No assigned people | ACS grants but People Service returns `people: []` | 403; SideMenu probe → link absent | 403, no data |
| ACS denies | `granted: false` | 403 | 403, no data |
| No risk record / absent leave | WMS row missing; S10 not synced | Severity "—"; leave "—" | — |
| Upstream 5xx | People Service or WMS error | Fail closed; generic error state | No partial data |

</frozen-after-approval>

## Code Map

- `services/people-service/prisma/schema.prisma` — `Person.peoplePartnerId` FK (self-relation `"person_pp"`), `Person.partneredPeople` inverse nav; the query anchor for the PP metadata endpoint
- `services/people-service/src/modules/employees/employees.service.ts` — add `getPPDashboardMetadata(callerPersonId)`: `findMany({ where: { peoplePartnerId: callerPersonId } })` selecting fullName, department (id+name), active `personProjectAssignment` (endDate null or future, projectName), current leave (take 1, desc); L218–257 (`getUMDashboardMetadata`) is the exact pattern to follow
- `services/people-service/src/modules/employees/pp-dashboard-metadata.dto.ts` — create: `PPDashboardPersonDto` (`{ personId, fullName, department: {id,label}|null, projects: string[], leaveStatus: string|null }`), `PPDashboardMetadataResponseDto` (`{ people: PPDashboardPersonDto[] }`)
- `services/people-service/src/modules/employees/pp-dashboard-metadata.controller.ts` — create: `@Controller('internal/pp-dashboard')` `@Get('metadata')`; resolve caller via `actorContext.resolveActorId()`; delegate to service; follows `um-dashboard-metadata.controller.ts` exactly
- `services/people-service/src/modules/employees/employees.module.ts` — L21–27 controllers array; register `PPDashboardMetadataController` alongside existing dashboard controllers
- `services/bff/src/modules/um-dashboard/um-dashboard.service.ts` — reference: single ACS check pattern at L61–63 (`{ permissionKey: 'view-dashboard', scope: { dashboardType: 'unit-manager' } }`); WMS pagination loop (50-page guard); compose pattern
- `services/bff/src/modules/pp-dashboard/pp-dashboard.service.ts` — create: (1) single ACS check (`people-partner` scope); 403 if deny or throw; (2) GET `people-service/api/v1/internal/pp-dashboard/metadata`; 403 if `people` empty; (3) collect `personIds`; paginate WMS risks (50-page guard); GET WMS `action-items/mine` with session bearer; (4) left-join people with WMS risk rows; aggregate `riskCounts`, `actionItemCounts`; return `{ headcount, riskCounts, actionItemCounts, rows, ownActionItems }`
- `services/bff/src/modules/pp-dashboard/pp-dashboard.controller.ts` — create: `GET /api/v1/pp-dashboard`; `OidcService.resolveAuthorization` for people-service and ACS tokens; session bearer for WMS; delegate to service; propagate 403
- `services/bff/src/modules/pp-dashboard/pp-dashboard.module.ts` — create: NestJS module following `um-dashboard.module.ts`
- `services/bff/src/app.module.ts` — L27–35 dashboard imports; register `PPDashboardModule`
- `services/frontend/src/api/ppDashboard.ts` — create: `getPPDashboardApiCall(signal?)` → `GET /api/v1/pp-dashboard`; export `PPDashboardRow` (`{ personId, fullName, department: {id,label}|null, projects: string[], leaveStatus: string|null, severity: RiskSeverity|null, trendDirection: RiskTrendDirection|'none' }`), `PPDashboardOwnActionItem`, `PPDashboardResponse` (`{ headcount, riskCounts, actionItemCounts, rows: PPDashboardRow[], ownActionItems }`)
- `services/frontend/src/components/SideMenu/hooks/useSideMenu.ts` — L50–58 (last probe: `canAccessDMPMDashboard`); add `canAccessPPDashboard` probe: `getPPDashboardApiCall(signal)` → true on 200, false on error; return alongside existing values
- `services/frontend/src/components/SideMenu/SideMenu.tsx` — L61–88 conditional link pattern; add PP dashboard link guarded by `canAccessPPDashboard`; label `t('sidebar.ppDashboard')`
- `services/frontend/src/pages/PPDashboardPage/hooks/usePPDashboardPage.ts` — create: TanStack Query `usePPDashboard()`; `isUnauthorized` (403 flag); `isError`; `navigateToProfile(personId)`; `groupBy: 'department'|'project'` state (default `'department'`); `groupedRows: { label: string; rows: PPDashboardRow[] }[]` via `useMemo` (see Design Notes); return all
- `services/frontend/src/pages/PPDashboardPage/PPDashboardPage.tsx` — create: `navigate('/')` in `useEffect` when `isUnauthorized`; grouping toggle (`<select>` or two-option toggle); counter cards from full data; `{groupedRows.map(g => group header + <DashboardTable>)}`; columns [name→link, severity→`SeverityBadge`|"—", leave→`leaveStatus`|"—"]; own action items sorted by `dueDate` asc, overdue rows highlighted; skeleton loading
- `services/frontend/src/locales/en/translation.json` — add `dashboard.pp.title/loading/error/headcount/riskCounts.*/actionItemCounts.open|overdue/groupBy.department|project/columns.*/ownActionItems.*/empty.*`; add `sidebar.ppDashboard`
- `services/frontend/src/router/index.tsx` — L53–55; add `{ path: 'pp-dashboard', element: <PPDashboardPage /> }`

## Tasks & Acceptance

**Execution:**
- [x] `services/people-service/src/modules/employees/pp-dashboard-metadata.dto.ts` — create: `PPDashboardPersonDto` and `PPDashboardMetadataResponseDto` as described in Code Map
- [x] `services/people-service/src/modules/employees/employees.service.ts` — add `getPPDashboardMetadata(callerPersonId: string)`: query `Person` where `peoplePartnerId = callerPersonId`, select name + department + active project names + current leave; return `{ people }` (empty array when none)
- [x] `services/people-service/src/modules/employees/pp-dashboard-metadata.controller.ts` — create: `GET internal/pp-dashboard/metadata`; resolve caller via `actorContext.resolveActorId()`; delegate; follow `um-dashboard-metadata.controller.ts` pattern exactly
- [x] `services/people-service/src/modules/employees/employees.module.ts` — register `PPDashboardMetadataController` in `controllers` array
- [x] `services/bff/src/modules/pp-dashboard/pp-dashboard.service.ts` — create: single ACS check → PS metadata → WMS risks + action-items → composed flat response
- [x] `services/bff/src/modules/pp-dashboard/pp-dashboard.controller.ts` — create: `GET /api/v1/pp-dashboard`; token resolution; delegate; propagate 403
- [x] `services/bff/src/modules/pp-dashboard/pp-dashboard.module.ts` — create NestJS module
- [x] `services/bff/src/app.module.ts` — register `PPDashboardModule`
- [x] `services/frontend/src/api/ppDashboard.ts` — create API call and exported type shapes
- [x] `services/frontend/src/components/SideMenu/hooks/useSideMenu.ts` — add `canAccessPPDashboard` probe (fifth useEffect/useState pair); return it
- [x] `services/frontend/src/components/SideMenu/SideMenu.tsx` — add conditional PP dashboard link
- [x] `services/frontend/src/pages/PPDashboardPage/hooks/usePPDashboardPage.ts` — create hook with groupBy state, groupedRows memo, isUnauthorized, navigateToProfile
- [x] `services/frontend/src/pages/PPDashboardPage/PPDashboardPage.tsx` — create page: grouping toggle, counter cards, grouped tables, own action items, skeleton, 403 redirect
- [x] `services/frontend/src/locales/en/translation.json` — add `dashboard.pp.*` and `sidebar.ppDashboard`
- [x] `services/frontend/src/router/index.tsx` — add `/pp-dashboard` route
- [x] `services/people-service/src/modules/employees/__tests__/pp-dashboard-metadata.controller.spec.ts` — unit tests: happy path, empty PP assignments, auth failure
- [x] `services/people-service/src/modules/employees/__tests__/employees.service.spec.ts` — extend: `getPPDashboardMetadata` — people returned, no assignments → empty, null department, null leave, multiple people
- [x] `services/bff/src/modules/pp-dashboard/__tests__/pp-dashboard.service.spec.ts` — unit tests: ACS deny → 403; ACS 5xx → 403; empty people → 403; composed response; null leaveStatus propagated; PS 5xx closes; WMS risks 5xx closes; WMS action-items 5xx closes
- [x] `services/frontend/src/components/SideMenu/hooks/__tests__/useSideMenu.test.ts` — extend: `canAccessPPDashboard` true on 200, false on 403, false on any error
- [x] `services/frontend/src/pages/PPDashboardPage/__tests__/usePPDashboardPage.test.ts` — unit tests: dept grouping groups correctly; project grouping (multi-project person → appears in each group); no-project person → 'Unassigned'; `isUnauthorized` on 403
- [x] `services/frontend/src/pages/PPDashboardPage/__tests__/PPDashboardPage.test.tsx` — unit tests: counter cards use global counts (not per-group); toggle re-groups without network call; unauthorized → redirect; empty group shows `emptyMessage`

**Acceptance Criteria:**
- Given an authenticated PP with assigned people, when `/pp-dashboard` loads, counter cards show total headcount, per-severity risk counts, and open/overdue AI counts; a grouping toggle defaults to "By department"; tables show a header per group and rows with name, severity badge, and leave status; own action items sorted by due date with overdue rows visually distinct.
- Given the viewer switches the grouping toggle, tables re-group client-side without a network request; counter card values do not change.
- Given a person assigned to multiple projects, when grouping by project, that person appears in each project's group.
- Given a person with no project assignments, when grouping by project, that person appears in an "Unassigned" group.
- Given ACS denies or the caller has no assigned PP people, the BFF endpoint returns 403 with no employee data.
- Given the SideMenu probe receives 403, the PP Dashboard link is absent with no error message.
- Given pre-Epic 7/11/13 state, no resourcing or campaign block appears on the page.

## Spec Change Log

## Design Notes

`groupedRows` computation: dept grouping groups rows by `row.department?.label ?? 'No department'`; project grouping allows cross-group duplicates because a person can be on multiple projects:

```ts
// project grouping
const map = new Map<string, PPDashboardRow[]>();
for (const row of rows) {
  const projects = row.projects.length ? row.projects : ['Unassigned'];
  for (const p of projects) {
    if (!map.has(p)) map.set(p, []);
    map.get(p)!.push(row);
  }
}
return Array.from(map.entries()).map(([label, rows]) => ({ label, rows }));
```

Counter cards (`headcount`, `riskCounts`, `actionItemCounts`) are derived once from the full `rows` array before the grouping memo, so switching the toggle never changes their values. This mirrors the DM/PM "action item counts stay global" rule from Story 5.3.

The `people-partner` ACS scope is already seeded (FixtureSeedData.cs, PermissionScopeValidator.cs, WMS permissions-client.ts) — no ACS or WMS changes needed.

## Verification

**Commands:**
- `cd services/people-service && npm test` — expected: new controller spec and `getPPDashboardMetadata` service cases pass; existing tests unaffected
- `cd services/bff && npm test` — expected: `pp-dashboard.service.spec.ts` passes; existing unaffected
- `cd services/frontend && npm test` — expected: all new hook and page tests pass; `useSideMenu.test.ts` PP probe cases pass; existing unaffected
- `cd services/frontend && npm run lint` — expected: no lint errors
- `cd services/frontend && npm run build` — expected: type-safe build succeeds

## Suggested Review Order

Review the diff from `fc16da2f4c7e517158e8fc06d03f5e466ce06c34` in the following order:

1. **`_bmad-output/implementation-artifacts/spec-5-4-pp-dashboard.md`** — frozen intent, I/O matrix, Code Map, Design Notes; establishes what "done" means for this story
2. **`services/people-service/src/modules/employees/pp-dashboard-metadata.dto.ts`** — new `PPDashboardPersonDto` / `PPDashboardMetadataResponseDto`; shape contract between People Service and BFF
3. **`services/people-service/src/modules/employees/employees.service.ts`** — new `getPPDashboardMetadata` method; verify `peoplePartnerId` FK query, project-name null filter, leave select
4. **`services/people-service/src/modules/employees/pp-dashboard-metadata.controller.ts`** — new `GET internal/pp-dashboard/metadata`; verify `actorContext.resolveActorId()` and delegation
5. **`services/people-service/src/modules/employees/employees.module.ts`** — `PPDashboardMetadataController` registered in controllers array
6. **`services/people-service/src/modules/employees/__tests__/employees.service.spec.ts`** — new `getPPDashboardMetadata` describe block (happy path, empty, null department, null leave, multiple people)
7. **`services/people-service/src/modules/employees/__tests__/pp-dashboard-metadata.controller.spec.ts`** — new controller spec (happy path, empty assignments, auth failure, exception propagation)
8. **`services/bff/src/modules/pp-dashboard/pp-dashboard.service.ts`** — new BFF service; single ACS check → PS metadata → WMS risk pagination (50-page guard) → action-items/mine → composed flat response; null guards on `metadata?.people ?? []` and `riskPage.rows ?? []`
9. **`services/bff/src/modules/pp-dashboard/pp-dashboard.controller.ts`** — new `GET /pp-dashboard`; `OidcService.resolveAuthorization` for ACS/PS tokens; session bearer for WMS; 403 propagation
10. **`services/bff/src/modules/pp-dashboard/pp-dashboard.module.ts`** — NestJS module wiring
11. **`services/bff/src/app.module.ts`** — `PPDashboardModule` registered in imports
12. **`services/bff/src/modules/pp-dashboard/__tests__/pp-dashboard.service.spec.ts`** — 11 unit tests: ACS deny/5xx/throw/bad-JSON → 403; empty people → 403; composed response; null leave; PS/WMS 5xx → 502; action-item sort; `in_progress` counts as open
13. **`services/frontend/src/api/ppDashboard.ts`** — new `getPPDashboardApiCall`, `PPDashboardRow`, `PPDashboardOwnActionItem`, `PPDashboardResponse`
14. **`services/frontend/src/api/hooks/usePPDashboard.ts`** — TanStack Query hook
15. **`services/frontend/src/components/SideMenu/hooks/useSideMenu.ts`** — fifth probe: `canAccessPPDashboard`
16. **`services/frontend/src/components/SideMenu/SideMenu.tsx`** — conditional PP Dashboard link
17. **`services/frontend/src/components/SideMenu/hooks/__tests__/useSideMenu.test.ts`** — three new `canAccessPPDashboard` cases; updated "all flags" tests
18. **`services/frontend/src/pages/PPDashboardPage/hooks/usePPDashboardPage.ts`** — `groupBy` state, `groupedRows` memo (dept/project with cross-group duplicates), `isUnauthorized`, counters from full `rows`
19. **`services/frontend/src/pages/PPDashboardPage/PPDashboardPage.tsx`** — grouping toggle, counter cards, grouped tables, own action items, skeleton, 403 redirect
20. **`services/frontend/src/pages/PPDashboardPage/__tests__/usePPDashboardPage.test.ts`** — 8 hook tests: dept grouping, project multi-membership, Unassigned, counter invariance, isUnauthorized on 403
21. **`services/frontend/src/pages/PPDashboardPage/__tests__/PPDashboardPage.test.tsx`** — 8 render tests: counters global, toggle re-groups without network, redirect, empty group message
22. **`services/frontend/src/locales/en/translation.json`** — `dashboard.pp.*` namespace and `sidebar.ppDashboard`
23. **`services/frontend/src/router/index.tsx`** — `/pp-dashboard` route
24. **`_bmad-output/implementation-artifacts/sprint-status.yaml`** — `5-4-pp-dashboard: review`; `5-1: review` (pending PR #118 merge)
25. **`_bmad-output/implementation-artifacts/deferred-work.md`** — three new entries: risk pagination silent truncation, BFF inline interface duplication, missing PPDashboardController unit test
