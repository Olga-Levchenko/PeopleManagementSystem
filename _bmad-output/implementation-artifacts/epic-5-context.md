# Epic 5 Context: Dashboard Framework & Early Blocks

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

UM, DM/PM, and PP each get a working dashboard on one shared engine as early as the data allows. Moved earlier in the sequence deliberately — this is the screen every persona actually looks at first (UJ-2). Resourcing-count, campaign-count, the Unassigned bucket, and DM visibility into PM-created requests are explicitly deferred to Epic 13.

## Stories

- Story 5.1: Shared dashboard engine, per-audience configuration
- Story 5.2: UM dashboard — early blocks
- Story 5.3: DM/PM dashboard — early blocks
- Story 5.4: PP dashboard (complete as shipped — no resourcing block)

## Requirements & Constraints

- FR-16: Shared engine — a fifth audience is a new config entry, not a new page. Same counter/table/action-item-list components configured per audience, not per-page-level code.
- FR-17 (partial): UM dashboard — headcount, risk counts by level, open/overdue action-item counts; subordinates table with risk/project/leave status; own action items sorted by due date, overdue highlighted.
- FR-18 (partial): DM/PM dashboard — per-project table; project selector defaults to "All projects", recalculates counters on change; risk/leave status columns. Resourcing-request count and campaign count **omitted** (not zeroed) — Epic 13 backfills.
- FR-19: PP dashboard — same building blocks scoped to PP's people, groupable by dept/project; no resourcing block. Complete as shipped.
- Leave status comes from S10 (timetracker-synced); may be stubbed if integration not live — all stories must handle graceful absence.
- No "you don't have permission" messages — missing dashboards simply do not appear in the sidebar.

## Technical Decisions

- **Frontend**: React 19 + Vite + Tailwind v4 + shadcn/ui (radix-nova). Talks only to BFF (AD-5).
- **BFF**: Composes People Service org metadata + WMS risk/action-item data per audience, following the same proxy pattern as `risk-dashboard` and `management-notes` modules (session-token forwarding via `OidcService.resolveAuthorization`). New BFF module per audience dashboard; shared composition logic extracted to a service or helper.
- **People Service**: Owns org metadata (subordinates, department, projects, leave status S10, manager/PP assignment). The existing `POST /api/v1/internal/risk-dashboard/metadata` endpoint (batch by `personIds`) is the established pattern — audience-dashboard metadata endpoints follow the same shape.
- **WMS**: Reads from existing Epic 3 action-item endpoints and Story 4.1 risk endpoints. No new WMS data model needed for Epic 5.
- **Access control**: BFF enforces audience eligibility — functional permission `view-dashboard` scoped per dashboard type AND Manager/PP access role; no data returned without a qualifying relationship. ACS batch-resolve pattern already established in Story 4.2 (`risk-dashboard.service.ts` → fetch all WMS rows, POST to People Service metadata, intersect server-side).
- **SideMenu**: Extend the existing capability-probe pattern (`canAccessRiskDashboard` in `SideMenu.tsx` fires a 1-row probe at login) to gate per-audience dashboard links — one probe per dashboard type, no 403 shown, link simply absent.
- Story 4.2 (`RiskDashboardPage`) is the reference implementation: counter cards, filter bar, table, cursor pagination all already built. Do not duplicate; share or replicate the pattern.

## UX & Interaction Patterns

- **Loading**: Skeleton loading (not spinners) on cold load for all dashboard surfaces.
- **UM dashboard**: Grouped by people; counter cards for headcount, risk levels, open/overdue action items; subordinates table (columns: name, risk severity, project, leave status); own action items list sorted by due date, overdue rows highlighted.
- **DM/PM dashboard**: Grouped by project; one table per project (or a single table with project grouping when "All projects" selected); project selector defaults to "All projects" and recalculates counters on change; columns include risk/leave status.
- **PP dashboard**: Groupable by department or project (toggle); same counter/table building blocks as UM, scoped to PP's people.
- **Shared components**: `SeverityBadge` (already introduced in Epic 4 — reuse), `StatusPill` for action-item status, skeleton wrappers, counter card. These belong in `services/frontend/src/components/` (not inside any single page folder) once used by more than one dashboard page.
- **Sidebar visibility**: No new sidebar menu item for a dashboard the viewer can't access. Extend the existing probe pattern in `SideMenu.tsx`.

## Cross-Story Dependencies

- **Requires (done):** Epic 3 (action items API); Story 4.1 (WMS risk API); Story 4.2 (Risk Dashboard — reference BFF proxy + WMS integration pattern and `SeverityBadge`); Epic 1 (access roles, functional permissions, `view-dashboard` permission).
- **Requires (may be partial):** Timetracker leave-data sync (S10) — stories must handle graceful absence.
- **Blocks:** Epic 13 (backfills resourcing-count and campaign-count blocks deferred here).
- **Story 5.1 blocks 5.2/5.3/5.4:** the shared engine and component library must land first so audience dashboards can import from it.
