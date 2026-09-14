---
title: 'Story 5.1: Shared Dashboard Engine, Per-Audience Configuration'
type: 'feature'
created: '2026-09-14'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'cf4729ebade23c28cd7f70a6b97434dea33918b9'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `RiskDashboardPage` is the only dashboard surface and all its counter cards, filter bar, severity rendering, and table logic are inline in one ~200-line component. Stories 5.2–5.4 each need an audience-scoped dashboard; without a shared engine, each would duplicate that code with no consistency guarantee.

**Approach:** Extract shared dashboard UI primitives (`SeverityBadge`, `TrendIcon`, `DashboardCountCard`, configurable `DashboardTable`) from `RiskDashboardPage` into `src/components/`, refactor `RiskDashboardPage` to use them as the existence proof, move `SideMenu`'s capability-probe effects into a dedicated hook, and introduce a `dashboard.common.*` i18n namespace so all four audience dashboards draw from one label source.

## Boundaries & Constraints

**Always:**
- Refactor `RiskDashboardPage` to use every extracted component — it is the proof that the engine works. Behavior after refactor must be identical (same API calls, rendering, filter interactions).
- Components live in `src/components/`, never inside a page folder, so all audience dashboards can import them.
- `DashboardTable` accepts a `columns: ColumnSpec[]` prop so a new dashboard declares its columns, not new JSX.
- Capability-probe `useEffect`/`useState` pairs move out of `SideMenu.tsx` into `components/SideMenu/hooks/useSideMenu.ts`; future dashboard probes are added only there.
- `SeverityBadge` always pairs a color token with a text label — color is never the sole signal.
- All user-visible strings use `useTranslation` with i18n keys.

**Ask First:**
- Adding a shared BFF base service or composition helper (deferred to 5.2/5.3/5.4 unless blocking).
- Changing `RiskDashboardPage` pagination behavior (out of scope).

**Never:**
- Build UM, DM/PM, or PP dashboard data, BFF, or page layers — those are Stories 5.2–5.4.
- Add new BFF modules, people-service endpoints, or WMS endpoints.
- Leave inline severity/trend/counter-card code in `RiskDashboardPage` after extraction.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| SeverityBadge — each level | `level` ∈ `{low, need_attention, medium, high, leaver}` | Token color + i18n text label for that level, no arrow | N/A |
| TrendIcon — each direction | `direction` ∈ `{up, down, none}` | Arrow icon (up/down) or nothing; `aria-label` from i18n | N/A |
| DashboardCountCard — click | Card with `onFilter` clicked | Calls `onFilter(value)` exactly once | N/A |
| DashboardTable — column config | `columns` prop with 3-column spec | Renders exactly those 3 columns in declared order | N/A |

</frozen-after-approval>

## Code Map

- `services/frontend/src/pages/RiskDashboardPage/RiskDashboardPage.tsx` — target for refactor; counter cards inline at lines 51–83 (`<button>` grid, `emphasized` set drives font weight), filter bar at 85–134 (four raw `<select>` elements + `setFilter` helper), table at 141–185 (severity/trend rendered inline); all state and `useNavigate` also inline
- `services/frontend/src/components/SideMenu/SideMenu.tsx` — probe `useEffect`/`useState` pairs at lines 25–41 (admin probe) and 35–41 (risk-dashboard probe); conditional renders at line 82; probe logic must move to hook
- `services/frontend/src/api/riskDashboard.ts` — `RiskSeverity` and `RiskTrendDirection` type definitions to reuse in new components; `getRiskDashboardApiCall` is the API call pattern for `useSideMenu` to reference
- `services/frontend/src/locales/en/translation.json` — existing `riskDashboard.severity.*` and trend strings; add `dashboard.common.severity.*` and `dashboard.common.trend.*` at same level; existing keys may alias or be left in place for backward compatibility during this story
- `services/frontend/src/components/` — destination for `SeverityBadge/`, `TrendIcon/`, `DashboardCountCard/`, `DashboardTable/`

## Tasks & Acceptance

**Execution:**
- [x] `services/frontend/src/components/SeverityBadge/SeverityBadge.tsx` — create: `level: RiskSeverity` prop → design-token color class + `dashboard.common.severity.<level>` i18n label; reuse `RiskSeverity` from `src/api/riskDashboard.ts`
- [x] `services/frontend/src/components/TrendIcon/TrendIcon.tsx` — create: `direction: RiskTrendDirection | 'none'` prop → `ArrowUp`/`ArrowDown` Lucide icon with `aria-label` from i18n, or null for `'none'`
- [x] `services/frontend/src/components/DashboardCountCard/DashboardCountCard.tsx` — create: `label`, `count`, `emphasized?: boolean`, `onClick?: () => void` props; `font-bold` when emphasized; renders as accessible `<button>` with `aria-pressed` when active
- [x] `services/frontend/src/components/DashboardTable/DashboardTable.tsx` — create: `columns: ColumnSpec<T>[]` and `rows: T[]` props; `ColumnSpec<T> = { key: string; header: string; sortable?: boolean; render: (row: T) => ReactNode }`; `aria-sort` on sortable headers
- [x] `services/frontend/src/components/SideMenu/hooks/useSideMenu.ts` — create: extract both probe `useEffect`/`useState` pairs from `SideMenu.tsx`; return `{ canAccessRiskDashboard, canAccessAdministration }`; each probe fires a 1-row API call on mount with an `AbortController` signal
- [x] `services/frontend/src/components/SideMenu/SideMenu.tsx` — refactor: replace inline probe pairs with `useSideMenu()`; conditional renders unchanged
- [x] `services/frontend/src/pages/RiskDashboardPage/hooks/useRiskDashboardPage.ts` — create: extract all `useState` filter state, `setFilter` helper, 403-guard, and `useNavigate` from `RiskDashboardPage`; return `{ filters, setFilter, isUnauthorized, navigateToProfile, ...queryResult }`
- [x] `services/frontend/src/pages/RiskDashboardPage/RiskDashboardPage.tsx` — refactor: replace inline counter cards → `DashboardCountCard`, severity cells → `SeverityBadge`, trend cells → `TrendIcon`, table → `DashboardTable` with a `columns` config array; call `useRiskDashboardPage()` for all state; no behavior change
- [x] `services/frontend/src/locales/en/translation.json` — add `dashboard.common.severity.*` (five levels) and `dashboard.common.trend.up/down` keys; update `SeverityBadge`/`TrendIcon` to use these keys
- [x] `services/frontend/src/components/**/__tests__/` — unit tests: `SeverityBadge` (all 5 levels render label + no missing color class), `TrendIcon` (up/down/none), `DashboardCountCard` (onClick fires once), `DashboardTable` (renders only declared columns)

**Acceptance Criteria:**
- Given a developer building Story 5.2's UM dashboard page, when they need counter cards and a table, then they import `DashboardCountCard` and `DashboardTable` from `src/components/` and pass a `columns` config — no copy-paste of counter or table JSX from `RiskDashboardPage`.
- Given `SeverityBadge` is updated (e.g. color token change), when Risk Dashboard and future audience dashboards import it, then all reflect the change with no per-page edits.
- Given `RiskDashboardPage` after refactor, when a user applies filters, clicks count cards, and navigates to a profile row, then behavior is identical to before extraction.
- Given `SideMenu` after refactor, when capability probes fire on mount, then `canAccessRiskDashboard` and `canAccessAdministration` behave identically to before; `useSideMenu` is the only place to add a new probe.

## Design Notes

`ColumnSpec<T>` is the configuration primitive for FR-16's "new config not new page" rule. A minimal proof: the Risk Dashboard refactor uses `[nameCol, severityCol, trendCol, recordedAtCol, departmentCol]`; Story 5.2 adds `[nameCol, severityCol, projectCol, leaveStatusCol, actionItemCountCol]` — same table, different config.

## Verification

**Commands:**
- `cd services/frontend && npm test` — expected: all pre-existing tests pass; new unit tests for `SeverityBadge`, `TrendIcon`, `DashboardCountCard`, `DashboardTable` pass
- `cd services/frontend && npm run lint` — expected: no lint errors
- `cd services/frontend && npm run build` — expected: production build succeeds with no type errors

## Suggested Review Order

**Shared engine configuration primitive**

- `ColumnSpec<T>` interface and `DashboardTable` generic — the FR-16 "config not page" primitive
  [`DashboardTable.tsx:3`](../../services/frontend/src/components/DashboardTable/DashboardTable.tsx#L3)

- Risk Dashboard's `columns` array — live proof of ColumnSpec usage with 5 column types
  [`RiskDashboardPage.tsx:31`](../../services/frontend/src/pages/RiskDashboardPage/RiskDashboardPage.tsx#L31)

**Extracted shared primitives**

- `SeverityBadge` — design-token color map + i18n label; color is never the sole signal
  [`SeverityBadge.tsx:10`](../../services/frontend/src/components/SeverityBadge/SeverityBadge.tsx#L10)

- `TrendIcon` — ArrowUp/ArrowDown with aria-label; null for 'none'
  [`TrendIcon.tsx:1`](../../services/frontend/src/components/TrendIcon/TrendIcon.tsx#L1)

- `DashboardCountCard` — accessible button with aria-pressed and emphasized font-bold
  [`DashboardCountCard.tsx:1`](../../services/frontend/src/components/DashboardCountCard/DashboardCountCard.tsx#L1)

**Capability-probe extraction**

- `useSideMenu` hook — both probe useEffect/useState pairs; each has its own AbortController
  [`useSideMenu.ts:10`](../../services/frontend/src/components/SideMenu/hooks/useSideMenu.ts#L10)

- `SideMenu` after refactor — single `useSideMenu()` call replaces inline pairs
  [`SideMenu.tsx:1`](../../services/frontend/src/components/SideMenu/SideMenu.tsx#L1)

**Page-logic extraction**

- `useRiskDashboardPage` — filter state, setFilter, 403-guard, navigateToProfile all extracted
  [`useRiskDashboardPage.ts:30`](../../services/frontend/src/pages/RiskDashboardPage/hooks/useRiskDashboardPage.ts#L30)

**i18n and test infrastructure**

- `dashboard.common.severity.*` and `dashboard.common.trend.*` keys added
  [`translation.json:1`](../../services/frontend/src/locales/en/translation.json#L1)

- Vitest test block; jsdom environment; include pattern avoids Playwright conflict
  [`vite.config.ts:18`](../../services/frontend/vite.config.ts#L18)

- `DashboardTable` tests — column config, onRowClick, keyboard Enter, empty state, aria-sort
  [`DashboardTable.test.tsx:1`](../../services/frontend/src/components/DashboardTable/__tests__/DashboardTable.test.tsx#L1)

- `SeverityBadge` tests — all 5 levels render label + specific color class assertions
  [`SeverityBadge.test.tsx:1`](../../services/frontend/src/components/SeverityBadge/__tests__/SeverityBadge.test.tsx#L1)
