---
title: 'Story 4.2: Risk Dashboard'
type: 'feature'
created: '2026-09-13'
status: 'in-review'
review_loop_iteration: 0
baseline_commit: 'e97d7d56b19ee9d7343d23bd70a564c3f333693f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-PeopleManagementSystem-2026-08-29/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Risk records exist only as per-person history in Work Management Service. Managers, People Partners, and Full Profile Access holders cannot see their permitted population's current risk posture, filter it, or navigate to the relevant profile without inspecting people one at a time.

**Approach:** Deliver one server-authorized Risk Dashboard: Work Management Service owns current-risk selection, severity/trend/count computation, and access filtering; People service supplies displayed/filterable organisation metadata; BFF composes the two service responses for a protected frontend page.

## Boundaries & Constraints

**Always:** Treat `department` as the product's unit filter; there is no separate Unit entity. Dashboard eligibility requires both the runtime-editable `view-dashboard` permission scoped to `risk-dashboard` and a Reporting line, Project line, People Partner line, or Full Profile Access (FPA) relationship. The viewer's own `Person.id` is excluded before any result, count, or filter option is returned. Enforce access server-side and fail closed: ACS or token-exchange failure returns the uniform empty-body `403`; People-service failure returns no risk-derived data and a generic request-failure response. The browser must never decide visibility. Use only each subject's latest `RiskRecord` by `recordedAt DESC, createdAt DESC, personId ASC`; `low` remains in the table/counts but is excluded from the active count. Preserve Story 4.1 severity order (`leaver`, `high`, `medium`, `need_attention`, `low` for descending display) and its existing trend semantics. BFF forwards an authenticated request to WMS and returns only the composed, authorized response. All UI strings are i18n keys; severity always has text as well as colour; sortable headers expose `aria-sort`; the dense table horizontally scrolls on mobile. Medium, high, and leaver counters are visually emphasised while retaining their text label.

**Ask First:** Changing the authoritative ownership of people metadata, adding a separate Unit model, exposing risk narratives beyond the listed S6 viewers, or adding a generic shared dashboard framework belongs to another decision/story.

**Never:** Render the dashboard or a row for Self, Colleague, anonymous users, or an unauthorized subject; rely on hidden navigation or client-side filters as authorization; create/edit/delete risk records here; make `leaver` an employment-status fact; copy People data into WMS; introduce dashboard blocks assigned to Epic 5.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Authorized dashboard | Reporting/Project/PP/FPA viewer; accessible current risks | `200` counts and one row per eligible subject, default severity-desc/date-desc | N/A |
| Self exclusion | Viewer has own/current risk or FPA | Own id absent from rows, counts, options, and drill-through | N/A |
| Current low | Latest risk is `low` | Low row/count shown; active count excludes it | N/A |
| Count drill-through | Viewer selects a severity count | Table applies that level filter and keeps other filters | N/A |
| Metadata filters | Department/unit, project, PP, or manager selection | Only already-authorized rows matching all selected filters; counts reflect filtered result | Invalid value yields empty result, never another person's data |
| No accessible risks | Eligible viewer has no current-risk rows | `200`, zero counts, empty factual state | N/A |
| No dashboard entitlement | Self/colleague or no qualifying line/FPA | BFF/WMS returns uniform `403`; UI does not disclose risk data | No table/count/filter data rendered |
| Authorization dependency failure | ACS or token exchange fails | Fail closed; no risk-derived data | BFF/WMS returns uniform empty-body `403`; UI renders no named dashboard capability or data |
| Non-authorization dependency failure | People service or WMS is unavailable after authorization | Fail closed; no risk-derived data | BFF returns a generic non-data request failure; UI uses a generic request-failure state |

</frozen-after-approval>

## Contract & Data Semantics

- `GET /api/v1/risk-dashboard` is the BFF-facing dashboard read. Query: optional `severity`, `departmentId`, `projectId`, `peoplePartnerId`, `managerId`; `pageSize` (1–100, default 50); and an opaque `cursor`. Every filter is conjunctive. Invalid, stale, or unauthorized filter IDs yield the same empty `200` result; malformed query syntax yields `400` with no risk-derived data.
- The WMS response has `counts` (one count per severity plus `activeCount`), `rows`, and `nextCursor`. Each row exposes only `personId`, current `severity`, `recordedAt`, and Story 4.1 `trendDirection`; People metadata is added only by BFF after WMS authorization. `activeCount` counts each visible, current, non-`low` subject once, including `leaver`.
- Filters apply to the post-authorization current-risk set before counts and pagination. Pagination is keyset/cursor based on severity rank descending, `recordedAt` descending, `createdAt` descending, then `personId` ascending; the cursor encodes the complete sort key. Adjacent pages must have neither duplicate nor omitted subject IDs.
- WMS resolves candidate subjects completely by batching ACS calls in at most 500 subject IDs. Any malformed, incomplete, unavailable, or non-success batch response denies the request rather than dropping candidates.
- The trusted People metadata/catalog endpoint accepts only authenticated service callers and a bounded, de-duplicated set of WMS-authorized `personId`s. BFF never forwards client-supplied subject IDs to it. It derives metadata and catalog options solely from that set; each option has a stable ID and display label, and multi-project membership does not duplicate a row.

## Code Map

- `services/work-management-service/src/modules/risks/risks.service.ts` — reuse rank, latest-record ordering, trend, and S6 qualifying-line semantics; add an aggregate/read-list path rather than looping through `getRiskHistory`, including scoped `view-dashboard` permission enforcement and cursor pagination.
- `services/work-management-service/src/modules/risks/risks.controller.ts` and `risks.module.ts` — add protected dashboard endpoint and DTOs; retain `RequestActorContext` platform-person resolution.
- `services/work-management-service/src/modules/management-notes/access-control-client.ts` — extend the fail-closed ACS adapter with the existing batch-resolve contract for candidate subject ids.
- `services/access-control-service/src/AccessControlService.Api/Controllers/AccessRolesController.cs` — existing `POST /api/v1/access-roles/resolve-batch` contract and 500-subject bound to consume; no access-control redesign.
- `services/people-service/src/modules/employees/` — add a trusted, bounded metadata query for dashboard composition (person id/name, department, active projects, manager, PP) and filter catalog values; do not reuse catalogue-audience sampling.
- `services/bff/src/modules/management-notes/` — model a new `risk-dashboard` proxy module on its session-token forwarding, upstream-status forwarding, and WMS URL configuration.
- `services/frontend/src/router/index.tsx`, `src/components/SideMenu/SideMenu.tsx` — add protected dashboard route and navigation item for every server-authorized audience; server `403` remains authoritative and renders no named unavailable capability.
- `services/frontend/src/api/client.ts`, `src/api/employees.ts`, `src/api/hooks/useEmployees.ts` — established API/query cancellation pattern for a dashboard client and query hook.
- `services/frontend/src/pages/AllEmployeesPage/AllEmployeesPage.tsx` and `hooks/useAllEmployeesPage.ts` — reuse responsive filter/table/loading/error and profile navigation patterns; dashboard-specific cards and SeverityBadge remain local to this story.
- `services/frontend/e2e/all-employees-management-profile.spec.ts` — Playwright routing/auth/profile-navigation model for new dashboard E2E coverage.

## Tasks & Acceptance

**Execution:**
- [x] `services/work-management-service/src/modules/risks/` — add the bounded, cursor-paginated dashboard endpoint/DTOs defined above; enforce scoped `view-dashboard` permission and S6 access including FPA, exclude Self, select one latest record per subject, batch ACS calls at 500 ids with fail-closed validation, and return filtered counts, rows, trend, and stable pagination.
- [x] `services/work-management-service/src/modules/management-notes/access-control-client.ts` and tests — add bounded fail-closed ACS batch resolution; deny malformed, unavailable, or non-success responses.
- [x] `services/people-service/src/modules/employees/` and tests — expose the authenticated, trusted, bounded dashboard-metadata/filter-catalog read model for WMS-authorized IDs only, where department is the unit; support people with multiple projects without duplicating a risk row or leaking catalog values.
- [x] `services/bff/src/modules/risk-dashboard/` and BFF module registration/tests — compose WMS authorized risk output with People metadata only for WMS-approved IDs, preserve correlation/auth forwarding, forward authorization `403` uniformly, and return generic non-data failures without leaking data.
- [x] `services/frontend/src/pages/RiskDashboardPage/`, `src/api/`, `src/router/index.tsx`, `src/components/SideMenu/`, and `src/locales/en/translation.json` — build counts (with medium/high/leaver emphasis), filters, severity/trend table, empty and generic request-failure states, access-safe absence for `403`, count drill-through, and row-to-`/people/:personId` navigation for every authorized audience.
- [x] `services/work-management-service/src/modules/risks/__tests__/`, `services/people-service/src/modules/employees/__tests__/`, `services/bff/src/modules/risk-dashboard/__tests__/`, and `services/frontend/e2e/risk-dashboard.spec.ts` — cover every matrix row, scoped permission and every authorized audience, uniform authorization failure, metadata/catalog containment, ACS batching, multi-project filtering, count consistency, counter emphasis, ordering, adjacent-page tie/cursor behavior, and drill-through.

**Acceptance Criteria:**
- Given a viewer with the scoped `view-dashboard` permission and an authorized Reporting/Project/PP/FPA relationship, when they open the Risk Dashboard, then they receive only their permitted non-self population's current risks, level counts (with medium, high, and leaver emphasised), active count, and severity/date-sorted rows with existing trend direction.
- Given a dashboard filter or severity count, when it is selected, then the table and counts represent the same intersection of authorized current-risk rows and a row drills through to that person's profile.
- Given a subject's current risk is `low`, when dashboard active risks are calculated, then that subject is excluded from active count while remaining visible in the low count and table.
- Given a Self, colleague, or failed authorization/dependency decision, when they request the dashboard, then no risk-derived data is returned or rendered.

## Design Notes

Counts are computed from the same filtered, post-authorization current-risk set as table rows. The WMS result is the security boundary; People metadata only enriches already-approved person ids in BFF. Each person appears once even when they have several project assignments; a project filter matches any assignment. The navigation item is offered to every server-authorized audience; the server remains the final access decision.

## Verification

**Commands:**
- `cd services/work-management-service && npm test && npm run test:e2e` — expected: dashboard authorization, current-risk and migration-backed API coverage passes.
- `cd services/people-service && npm test` — expected: trusted metadata/filter endpoint tests pass.
- `cd services/bff && npm test` — expected: dashboard proxy/composition and upstream failure tests pass.
- `cd services/frontend && npm test && npx playwright test e2e/risk-dashboard.spec.ts` — expected: dashboard interaction and access-safe UI coverage passes.

### Review Findings

- [x] [Review][Patch] Show dashboard navigation to every server-authorized audience [spec-4-2-risk-dashboard.md:23]
- [x] [Review][Patch] Require scoped `view-dashboard` functional permission [docs/requirements/project-requirements.md:71]
- [x] [Review][Patch] Make dependency failures uniformly fail closed [epic-4-context.md:29]
- [x] [Review][Patch] Constrain the unauthorized UI state to capability absence [EXPERIENCE.md:129]
- [x] [Review][Patch] Specify the API and pagination contract [spec-4-2-risk-dashboard.md:61]
- [x] [Review][Patch] Keep filter catalog and People enrichment within authorized IDs [spec-4-2-risk-dashboard.md:64]
- [x] [Review][Patch] Handle the ACS 500-subject resolution bound [services/access-control-service/src/AccessControlService.Api/Controllers/AccessRolesController.cs:102]
- [x] [Review][Patch] Require emphatic counters for medium, high, and leaver [docs/requirements/project-requirements.md:198]
