---
title: 'Story 3.4: Self-complete action item'
type: 'feature'
created: '2026-09-12'
status: 'done'
review_loop_iteration: 1
baseline_commit: 'be56e94d4d3fc13b78b5a776ed724085d0b19ff1'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-3-action-item-lifecycle-and-overdue-display.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/services/work-management-service/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.3 delivered assignee-only `PATCH /action-items/:id/complete`, but employees have no API to **read** their own assigned items (S14 `R (own)`). FR-15 / epic AC require an employee to view their own action items and mark them complete without manager involvement — completion logic exists; the self-service read + end-to-end path does not.

**Approach:** Add `GET /action-items/mine` in `work-management-service`, returning all `ActionItem` rows where `assigneePersonId` equals the resolved viewer `Person.id`, mapped to `ActionItemView` (including `isOverdue`). Self-completion uses the existing `PATCH …/complete` from Story 3.3 unchanged — no duplicate transition logic. No ACS calls on the list path (scope is implicit: only the assignee's own rows). Manager/profile S14 read for other subjects, BFF proxy, and UI remain deferred.

## Boundaries & Constraints

**Always:**
- Resolve viewer via `RequestActorContext.resolveActorId()` — never accept actor or assignee identity from query/body.
- **`GET /action-items/mine`:** return only rows with `assigneePersonId === viewerPersonId`; include all statuses (`open`, `completed`, `cancelled`); order by `dueDate` ascending (nulls last if any); map each row through existing `toView` / `computeIsOverdue`.
- **Self-complete:** `PATCH /action-items/:id/complete` behavior is identical to Story 3.3 — assignee-only, empty body, atomic open→completed. This story adds e2e coverage for list→complete journey; do not fork completion logic.
- **Reject other's items:** non-assignee `PATCH …/complete` → `403` (already implemented in Story 3.3; assert in this story's e2e matrix under self-complete framing).
- Response shape: `ActionItemView[]` (same fields as create/complete responses).
- Register `@Get('mine')` on the controller **before** any future `@Get(':id')` route to avoid Nest param capture.

**Ask First:**
- _(none — BFF proxy remains deferred per Story 3.1 precedent)_

**Never:**
- `GET` list/detail for another person's action items (manager S14 read — later story).
- ACS `permissions/check` or `access-roles/resolve` on `GET /action-items/mine`.
- New complete/cancel semantics, caller-supplied `completionDate`, or author completing on behalf of assignee.
- Profile S14 assembly, dashboard UI, BFF proxy, pagination/filter query params (unless required by AC — not in epic).
- Schema migration — `ActionItem` model is sufficient.

## Provenance

| Source | What this story closes |
|---|---|
| `epics.md` Story 3.4 | Employee views own items; completes via same flow as 3.3; rejects completing others' items |
| PRD FR-15 | Employee can mark own action items complete |
| `section-matrix.md` S14 | Employee `R (own) + mark complete` |
| Story 3.3 | `PATCH …/complete`, `ActionItemView`, `isOverdue` — reuse, do not duplicate |
| `epic-3-context.md` | Self-complete (FR-15 portion) is Story 3.4 |

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| AC1: list own items | Viewer has 2 assigned + 1 assigned to another person | `200`; array length 2; only viewer's rows; each includes `isOverdue` | N/A |
| AC1: self-complete journey | Open item in list; viewer = assignee; `PATCH …/complete` | `200`; `status=completed`; `completionDate` set; subsequent `GET /mine` shows completed row | N/A |
| AC2: complete other's item | Viewer ≠ assignee | — | `403` on `PATCH …/complete` |
| Empty list | Viewer has no assigned items | `200`; `[]` | N/A |
| Mixed statuses | Own rows: open, completed, cancelled | `200`; all three returned | N/A |
| Overdue in list | Own open row with past `dueDate` | `200`; `isOverdue=true` on that element | N/A |
| Sort order | Own rows with different `dueDate` | `200`; earliest `dueDate` first | N/A |
| No JWT | Missing/expired token on `GET /mine` | — | `401` (guard) |
| No JWT complete | Missing token on `PATCH …/complete` | — | `401` (guard — extend jwt-guard e2e) |
| Campaign source | Own `source=campaign` row | Included in list; completable same as manual | N/A |

</frozen-after-approval>

## Code Map

- `services/work-management-service/src/modules/action-items/action-items.controller.ts` — add `@Get('mine')` **above** existing `@Post` / `@Patch` routes; resolve actor; delegate to service
- `services/work-management-service/src/modules/action-items/action-items.service.ts` — add `listMyActionItems(viewerPersonId): Promise<ActionItemView[]>` using `prisma.actionItem.findMany({ where: { assigneePersonId: viewerPersonId }, orderBy: { dueDate: 'asc' } })`; reuse private `toView`
- `services/work-management-service/src/modules/action-items/__tests__/action-items.service.spec.ts` — unit tests: filter scope, sort, empty, `isOverdue`, ACS ports not called
- `services/work-management-service/test/action-items.e2e-spec.ts` — e2e: `GET /mine` happy path + scope isolation; list→complete journey; non-assignee complete `403`
- `services/work-management-service/test/jwt-guard.e2e-spec.ts` — add `401` for `GET /action-items/mine`
- Reuse: `RequestActorContext`, `ActionItemView`, `completeActionItem` (lines 87–117), e2e helpers (`e2e-auth.helpers.ts`, `e2e-db.helpers.ts`)

## Tasks & Acceptance

**Execution:**
- [x] `action-items.service.ts` — implement `listMyActionItems` with assignee filter, `dueDate` asc, `toView` mapping
- [x] `action-items.controller.ts` — wire `GET /action-items/mine`
- [x] `action-items.service.spec.ts` — unit tests for I/O matrix rows (list paths; ACS not called)
- [x] `action-items.e2e-spec.ts` — e2e list scope, list→complete journey, non-assignee `403`
- [x] `jwt-guard.e2e-spec.ts` — `401` on `GET /action-items/mine`

**Acceptance Criteria:** (verbatim from `epics.md`, Epic 3 Story 3.4)
- Given an employee viewing their own action items, when they mark one complete, then it behaves identically to Story 3.3's completion flow, available without any manager/PP action
- Given an employee attempting to complete an action item assigned to someone else, when they attempt it, then the request is rejected — self-completion is scoped strictly to the employee's own items

**Scope note:** `GET /action-items/mine` delivers the "viewing their own action items" backend surface for S14 self-read. Visual UI (dashboard "my action items", StatusPill) remains Epic 5.

## Verification

**Commands:**
- `cd services/work-management-service && npm run lint` — no errors
- `cd services/work-management-service && npm test` — unit tests pass (Windows: `$env:NODE_OPTIONS="--experimental-vm-modules"; npx jest`)
- `cd services/work-management-service && npm run test:e2e` — e2e pass (same `NODE_OPTIONS` on Windows)

**Manual checks (if no CLI):**
- N/A — verify via unit + e2e only

**Review:**
- `access-control-reviewer` recommended — S14 self-read path; confirm list returns only assignee-scoped rows and does not leak other assignees' items.

## Dependencies

- Story **3.1** **done** — model, identity, `ActionItemView`
- Story **3.2** **done** — campaign rows appear in own list when assignee matches
- Story **3.3** **done** — `PATCH …/complete` reused for self-complete
- **Blocks:** Epic 5 "my action items" dashboard block, profile S14 assembly for managers viewing others' items (separate story)

### Review Findings

- [x] [Review][Patch] AC1 list e2e seeds 1 own item, not 2 own + 1 other per I/O matrix [`action-items.e2e-spec.ts`]
- [x] [Review][Patch] E2e list tests do not assert `isOverdue` on each element [`action-items.e2e-spec.ts`]
- [x] [Review][Patch] Mixed statuses I/O row untested (open + completed + cancelled for same viewer) [`action-items.e2e-spec.ts`]
- [x] [Review][Patch] Overdue-in-list I/O row has no e2e (past-due open row → `isOverdue: true`) [`action-items.e2e-spec.ts`]
- [x] [Review][Patch] Sort-order I/O row has no e2e (multiple due dates → ascending response order) [`action-items.e2e-spec.ts`]
- [x] [Review][Patch] Self-complete journey e2e does not assert `isOverdue: false` after complete [`action-items.e2e-spec.ts`]
- [x] [Review][Patch] Unit `isOverdue` assertion uses wall-clock time without `jest.useFakeTimers` [`action-items.service.spec.ts`]
- [x] [Review][Defer] OpenAPI/Swagger for `GET /action-items/mine` [`action-items.controller.ts`] — deferred, pre-existing gap from Story 3.1/3.3 pattern
- [x] [Review][Defer] Expired-token e2e for `GET /action-items/mine` specifically [`jwt-guard.e2e-spec.ts`] — global JwtAuthGuard; missing-token covered; expired path tested on other routes

## Spec Change Log

- 2026-09-12 — `bmad-code-review` pass 1: 7 patch findings (I/O matrix e2e gaps, `isOverdue` assertions, fake timers); 2 defer (OpenAPI, expired JWT route-specific).
- 2026-09-12 — `bmad-code-review` pass 1 fixes applied: expanded AC1 list e2e (2 own + 1 other), mixed statuses, sort order, `isOverdue` journey assertions, `jest.useFakeTimers` in unit tests.
- 2026-09-12 — `bmad-code-review` pass 2: clean — all I/O matrix rows covered; 2 defer items unchanged (OpenAPI, expired JWT route-specific).
- 2026-09-12 (done): PR #102 merged to `main` (`e7e81bb`); sprint/spec status → `done`; Jira O4-45 → Done.
