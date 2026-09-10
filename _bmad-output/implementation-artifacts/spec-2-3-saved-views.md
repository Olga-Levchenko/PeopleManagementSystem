---
title: 'Story 2.3: Saved views'
type: 'feature'
created: '2026-09-10'
status: 'done'
review_loop_iteration: 3
baseline_commit: 'e6cb547686c5e38187e56997c8ccf73b09befaa8'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/decisions/ADR-004-epic-2-open-decisions.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-universal-filter-column-engine-over-profile-fields.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-inline-editing-writes-through-to-the-profile-subject-to-acce.md'
  - '{project-root}/services/people-service/CLAUDE.md'
  - '{project-root}/services/bff/CLAUDE.md'
  - '{project-root}/services/frontend/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Managers and PPs rebuild the same All Employees filter and column layout every session. Story 2.1–2.2 deliver a paginated, filterable list with inline edit, but nothing persists a named filter+column configuration or lets one manager or PP share a reusable view with another without granting extra data access.

**Approach:** Add server-persisted saved views in `people-service` (creator-owned records with optional share rows), proxy CRUD + share through BFF, and extend `AllEmployeesPage` with a tab bar: ephemeral **All** tab plus named saved views. Selecting a tab applies stored filters, `visibleColumnKeys`, and `pageSize` (ADR-004 Decision 3). List execution stays viewer-scoped — a saved view is configuration only, not an access grant (EXPERIENCE.md).

**Dependency:** Requires Story 2.1 list-filter parity over HTTP — especially `customFieldFilters` validation and rejection of unknown `custom:` keys at the list boundary. Saved-view configuration validation must call the same shared validator module as `listEmployees`; do not ship 2.3 while 2.1's custom-field HTTP filter path is still broken.

## Boundaries & Constraints

**Always:** **Browse gate (interim, matches Story 2.1):** any authenticated user may call saved-view APIs; `creatorPersonId` and share `recipientPersonId` come from `RequestActorContext.actorId` (JWT `sub`, same as the list endpoint). **UI gate (interim):** hide the saved-view tab bar when the viewer's field catalog is colleague-tier only (no management-visible filter/column keys) — same audience signal Story 2.1 uses for catalog scoping. **Deferred to Story 2.5:** server-side 403/empty-list colleague exclusion and full colleague-mode browse gate; do not block 2.3 on 2.5. Persist under `creatorPersonId` from authenticated actor id. Configuration JSON holds `visibleColumnKeys: string[]` and `filters { countryCity?, departmentId?, yearsWithCompanyMin?, yearsWithCompanyMax?, customFieldFilters? }` using catalog keys (`custom:{definitionId}`); **`pageSize` (1–100) is a top-level model/API field only — never stored inside `configuration` JSON.** Only the creator may `PATCH`, `DELETE`, add shares, or revoke shares; recipients may **read and apply** shared views only (403 on mutating calls). Multiple views per user appear as separate tabs alongside a default **All** tab (session-only, not persisted). Share target is a single `recipientPersonId` per request (must be an existing person); creator cannot share with self. Saved view names are unique per creator, case-sensitive (409 on duplicate create **or** rename). Validate filters and column keys via the shared list-configuration validator: unknown `custom:` keys → 400; empty `visibleColumnKeys` → 400; `yearsWithCompanyMin > yearsWithCompanyMax` → 400. Unknown stored column keys → 400 on create/update (same catalog vocabulary as 2.1). UX: tab bar per `key-all-employees.html`; "+ New view" saves current UI state; owned tabs expose **Save changes** (PATCH configuration + `pageSize`) and **Rename** (PATCH name); shared tabs show a read-only badge and disable edit/delete/share/revoke controls. Switching tabs with unsaved changes on an owned tab prompts confirm-or-discard (no silent auto-save). Filter/column tweaks on a shared tab are session-only and are lost on tab switch — recipients cannot PATCH the owner's record. Sort order, toolbar search text, quick-filter avatar selection, row group-by, and group expand/collapse remain per-session only (EXPERIENCE.md) — not part of saved configuration.

**Ask First:** Bulk share (multiple recipients in one call) — default single-recipient POST; extend only if UX needs it. Recipient "hide shared view from my tabs" without owner unshare — default out of scope (owner revokes via DELETE share).

**Never:** Saved views as access grants or permission widening. Export (2.4), server-side colleague saved-view API lockout before Story 2.5 ships, manually curated member lists ("bench" rosters), bulk add-to-view, or client-only persistence (`localStorage`). Hardcoded functional-role names. Overwriting another user's view record (including silent PATCH by a share recipient). Persisting current page number, sort state, search text, or group-by expand state. Applying stale configuration by widening results beyond the viewer's entitlements.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| CREATE_OWN_VIEW | Authenticated user POSTs name + configuration + pageSize | 201; view returned; appears in GET list | N/A |
| DUPLICATE_NAME | Creator POSTs name that already exists for them | 409 Conflict | N/A |
| DUPLICATE_NAME_ON_PATCH | Creator PATCHes name to one they already own | 409 Conflict | N/A |
| LIST_VISIBLE | Viewer has own views + shares | GET returns union, each with `isOwner: true/false`; own views before shared, then alphabetical by name within each group | N/A |
| COLLEAGUE_UI_HIDDEN | Viewer's field catalog is colleague-tier only | Saved-view tab bar hidden; `+ New view` not offered; list still works | APIs remain callable (interim, matches 2.1) — server 403 deferred to Story 2.5 |
| APPLY_TAB | User selects saved tab | UI applies stored filters/columns/pageSize; list refetches page 1 | N/A |
| OWNER_UPDATE | Creator PATCHes name, configuration, and/or pageSize (partial body allowed) | 200; persisted | N/A |
| RECIPIENT_UPDATE | Share recipient PATCHes view | 403 Forbidden | No mutation of owner's record |
| OWNER_DELETE | Creator DELETEs view | 204; shares cascade; recipients no longer see view on next GET | N/A |
| DELETE_VIEW_ACTIVE_TAB | Owner deletes view while recipient has that tab selected | Recipient UI falls back to **All** on next fetch or shows graceful empty state | N/A |
| RECIPIENT_DELETE | Share recipient DELETEs view | 403 Forbidden | Recipient cannot remove owner's view |
| SHARE_VIEW | Creator POSTs `recipientPersonId` | 201 share row; recipient sees view in list | 404 if recipient person missing |
| DUPLICATE_SHARE | Creator POSTs share for recipient already shared | 200 OK; returns existing share row (idempotent) | No duplicate row created |
| REVOKE_SHARE | Creator DELETEs `.../shares/:recipientPersonId` | 204; recipient no longer sees view | 403 if non-owner |
| SHARE_NOT_OWNER | Non-creator POSTs share or DELETEs share | 403 Forbidden | N/A |
| VIEW_NOT_VISIBLE | Viewer PATCH/DELETE/POST share on view they do not own and is not shared with them | 404 Not Found | Do not distinguish missing vs forbidden |
| INVALID_CUSTOM_FILTER_KEY | Configuration contains unknown `custom:` key | 400 on create/update | Same posture as list API |
| EMPTY_COLUMNS | `visibleColumnKeys: []` | 400 Bad Request | N/A |
| YEARS_FILTER_INVERTED | `yearsWithCompanyMin > yearsWithCompanyMax` in stored config | 400 on create/update | Align with list validation |
| STALE_DEPARTMENT | Saved `departmentId` references deleted department | On apply (tab select): omit `departmentId` from list request and run remaining filters; on create/update (save): 400 if department not found | No 500 |
| STALE_CUSTOM_FIELD | Saved filter/column references deactivated custom field | On apply: omit field from list request; on save: 400 if definition inactive | No leak of closed field values |
| VIEWER_SCOPED_LIST | Same saved config; creator sees more subjects than recipient | Recipient list contains only subjects their own entitlements allow — never creator-only rows | Negative e2e required |
| ALL_TAB_DEFAULT | User on **All** tab | Ephemeral filters/columns; no saved-view API call | N/A |
| UNSAVED_TAB_SWITCH | Owned tab has dirty filter/column/pageSize state; user selects another tab | Confirm discard or cancel switch | No silent PATCH |

</frozen-after-approval>

## Code Map

- `services/people-service/prisma/schema.prisma` — add `EmployeeListSavedView` + `EmployeeListSavedViewShare` models; migration
- `services/people-service/src/modules/employees/employees-list-config.validator.ts` — shared filter/column validation used by `listEmployees` and saved views (extract from or align with 2.1)
- `services/people-service/src/modules/employees/saved-views.service.ts` — CRUD, share, revoke, list-visible-to-viewer, owner checks
- `services/people-service/src/modules/employees/saved-views.controller.ts` — `GET/POST /employees/saved-views`, `PATCH/DELETE /employees/saved-views/:viewId`, `POST /employees/saved-views/:viewId/shares`, `DELETE /employees/saved-views/:viewId/shares/:recipientPersonId`
- `services/people-service/src/modules/employees/saved-views.dto.ts` — configuration + request/response DTOs
- `services/people-service/src/modules/employees/employees.module.ts` — register saved-views controller/service
- `services/people-service/src/modules/employees/__tests__/saved-views.service.spec.ts` — owner/recipient matrix, validation, VIEWER_SCOPED_LIST
- `services/people-service/test/saved-views.e2e-spec.ts` — HTTP create/list/share/revoke/recipient-403-update/viewer-scoped-list
- `services/bff/src/modules/employees/employees.controller.ts` — proxy saved-view routes (mirror list/field-catalog pattern)
- `services/bff/src/modules/employees/employees.service.ts` — upstream calls with auth forwarding
- `services/bff/src/modules/employees/__tests__/employees.service.spec.ts` — proxy smoke test
- `services/frontend/src/api/employees.ts` — saved-view types + API functions
- `services/frontend/src/api/hooks/useEmployees.ts` — queries/mutations for saved views
- `services/frontend/src/pages/AllEmployeesPage/hooks/useAllEmployeesPage.ts` — tab state, apply configuration, save/rename dialogs, dirty-state guard
- `services/frontend/src/pages/AllEmployeesPage/AllEmployeesPage.tsx` — tab bar UI (`All`, named views, `+ New view`, owner **Save changes**)
- `services/frontend/src/pages/AllEmployeesPage/__tests__/` — tab switch applies config; shared tab shows read-only affordances
- `_bmad-output/planning-artifacts/ux-designs/.../key-all-employees.html` — tab layout reference

## Tasks & Acceptance

**Execution:**
- [x] `schema.prisma` + migration — `EmployeeListSavedView` (`id`, `name`, `creatorPersonId`, `configuration` JSON, `pageSize`, timestamps) and `EmployeeListSavedViewShare` (`viewId`, `recipientPersonId`, unique pair)
- [x] `employees-list-config.validator.ts` — shared validation with `listEmployees`; block 2.3 until 2.1 custom-field HTTP path uses it
- [x] `saved-views.service.ts` + DTOs — create/list/update/delete/share/revoke; duplicate-name 409 on create and rename; recipient mutation 403; partial PATCH
- [x] `saved-views.controller.ts` — authenticated routes; wire `RequestActorContext.actorId`
- [x] `saved-views.service.spec.ts` + `saved-views.e2e-spec.ts` — matrix rows CREATE, RECIPIENT_UPDATE, SHARE_VIEW, DUPLICATE_SHARE, REVOKE_SHARE, STALE_DEPARTMENT, INVALID_CUSTOM_FILTER_KEY, VIEWER_SCOPED_LIST
- [x] `bff/.../employees.controller.ts` + `employees.service.ts` — proxy all saved-view endpoints including revoke
- [x] `frontend` API + hooks — fetch views on page load; create from current state; PATCH owned view; switch tabs with dirty guard
- [x] `AllEmployeesPage` — tab bar; owner save/rename vs shared read-only badge; hide tab bar when catalog is colleague-tier (interim UI gate)

**Acceptance Criteria:**
- Given a manager or PP with a configured filter and column set, when they save it as a named view, then the view persists under their identity as creator and appears as its own tab
- Given a saved view owned by one manager or PP, when they share it with another manager or PP, then the recipient can select and use that view without being able to silently overwrite the original creator's copy (PATCH/DELETE return 403 for recipient)
- Given a user with multiple saved views (own and shared-with-them), when they open All Employees, then all views coexist as separate, independently selectable tabs alongside the default **All** tab
- Given a saved view configuration with `pageSize`, when the user selects that tab, then the list requests use that page size (ADR-004)
- Given a shared saved view, when the recipient runs the list with its filters, then results respect the recipient's own access entitlements — not the creator's
- Given a viewer whose field catalog is colleague-tier only, when they open All Employees, then no saved-view tab bar or `+ New view` is shown (interim UI gate; server-side API lockout deferred to Story 2.5)
- Given an owned saved tab with unsaved filter or column changes, when the owner chooses **Save changes**, then the stored configuration and `pageSize` update and subsequent tab selections restore the new state
- Given an owned saved view, when the owner revokes a share, then that recipient no longer sees the view on the next list fetch
- Given unknown `custom:` filter keys or empty `visibleColumnKeys`, when create or update is attempted, then the API returns 400 with the same posture as the list endpoint

## Design Notes

**Configuration JSON** (stored in Prisma `Json` column — filters and columns only):

```json
{
  "visibleColumnKeys": ["fullName", "position", "departmentName"],
  "filters": {
    "countryCity": "Warsaw",
    "departmentId": "<uuid>",
    "yearsWithCompanyMin": 1,
    "customFieldFilters": { "custom:<uuid>": "FTE" }
  }
}
```

**`pageSize`:** top-level column on `EmployeeListSavedView` and on every API request/response body (`{ id, name, creatorPersonId, isOwner, pageSize, configuration }`). List execution reads `pageSize` from the applied tab state, not from inside `configuration`.

**Share model:** one row per `(viewId, recipientPersonId)`; deleting a view deletes its shares; owner revokes via `DELETE .../shares/:recipientPersonId`; duplicate `POST` share is idempotent **200** returning the existing row.

**Tab UX:** **All** resets to hook defaults (`DEFAULT_COLUMNS`, empty filters, `pageSize` 50). Switching away from **All** does not auto-save. Owned tabs: **Save changes** PATCHes `configuration` + `pageSize`; **Rename** PATCHes `name` only; dirty-state confirm on tab switch. Shared tabs: read-only badge; no save/rename/share. Inline edit (2.2) continues on any tab — saved view only changes filter/column/pageSize state.

**Session-only (not persisted):** page number, column sort order, toolbar search, quick-filter avatar stack, row group-by, group expand/collapse.

**Stale reference handling (planning-gap audit, 2026-09-10):**
- **`STALE_DEPARTMENT`:** on tab apply, drop `departmentId` from the list request if the department no longer exists; on create/update, return 400 if `departmentId` is present but not found.
- **Browse gate (interim):** match Story 2.1 — APIs open to any authenticated user; UI hides saved-view affordances when the field catalog has no management-tier keys. Story 2.5 owns server-side colleague API exclusion.
- **`DUPLICATE_SHARE`:** idempotent `POST` share returns **200** with the existing share row.

## Spec Change Log

- **2026-09-10 (approval):** Human-approved spec from separate context (review loop 2); status → `in-progress`, implementation started on `feature/2-3-saved-views`.
- **2026-09-10 (delivery):** PR [#69](https://github.com/Olga-Levchenko/PeopleManagementSystem/pull/69) merged to `main` at `299a73b`; status → `done`.

## Verification

**Commands:**
- `cd services/people-service && npm run lint && npm test` — saved-views unit tests green
- `cd services/people-service && node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --testPathPatterns=saved-views` — e2e green (includes VIEWER_SCOPED_LIST)
- `cd services/bff && npm run lint && npm test` — proxy tests green
- `cd services/frontend && npm run lint && npx tsc -b --noEmit` — clean
- `cd services/frontend && npm test -- --testPathPattern=AllEmployeesPage` — tab apply + shared read-only affordances

### Review Findings

- [x] [Review][Patch] VIEWER_SCOPED_LIST negative test missing [services/people-service/test/saved-views.e2e-spec.ts] — spec I/O matrix and verification require a negative e2e proving recipient list entitlements differ from creator; current e2e covers share/403/revoke only.
- [x] [Review][Patch] `departmentId` not applied on tab select [services/frontend/src/pages/AllEmployeesPage/savedViewState.ts:30] — backend persists/validates `filters.departmentId` and returns it in `applicableConfiguration`, but UI state and `listParams` never pass it to `listEmployees`, so STALE_DEPARTMENT/department-filter saved views silently ignore that filter.
- [x] [Review][Patch] Active tab not reset after revoke/delete [services/frontend/src/pages/AllEmployeesPage/hooks/useAllEmployeesPage.ts:47] — DELETE_VIEW_ACTIVE_TAB: when `savedViewsQuery` refetches and the active view disappears, UI keeps stale `activeTabId`/filters until manual tab change; no effect watching view list vs `activeTabId`.
- [x] [Review][Patch] Stale custom columns fallback [services/people-service/src/modules/employees/saved-views.service.ts:315] — when every `custom:` column is inactive, `applicableConfiguration.visibleColumnKeys` falls back to the raw stored keys instead of the sanitized `resolvedColumnKeys`, risking invalid column keys on apply.
- [x] [Review][Patch] Frontend tab tests not delivered [services/frontend/src/pages/AllEmployeesPage/__tests__/] — spec code map requires tab-apply and shared read-only affordance tests; no Playwright/unit tests were added (frontend has no Vitest harness).
- [x] [Review][Patch] DUPLICATE_NAME_ON_PATCH untested [services/people-service/src/modules/employees/__tests__/saved-views.service.spec.ts] — rename-to-existing-name 409 path has no unit coverage.
- [x] [Review][Defer] N+1 Prisma lookups in `toResponse` per list item [services/people-service/src/modules/employees/saved-views.service.ts:273] — deferred, pre-existing pattern acceptable for low view counts in 2.3.
