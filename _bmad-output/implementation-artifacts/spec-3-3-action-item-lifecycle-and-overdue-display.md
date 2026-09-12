---
title: 'Story 3.3: Action item lifecycle and overdue display'
type: 'feature'
created: '2026-09-12'
status: 'done'
review_loop_iteration: 0
baseline_commit: '878885e3956405441f78077b608175dc797e4254'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-manual-action-item-creation-scoped-to-creator-s-access.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-2-campaign-generated-action-items.md'
  - '{project-root}/docs/requirements/project-requirements.md'
  - '{project-root}/services/work-management-service/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 3.1–3.2 create open `ActionItem` rows but expose no lifecycle transitions. FR-22 / spec §4.5 require assignee completion (with recorded completion date), author cancellation (with required reason), and overdue indication wherever items appear — backend must supply transition APIs and overdue semantics before Epic 5 UI and profile S14 assembly.

**Approach:** Extend `work-management-service` `action-items` module with `PATCH /action-items/:id/complete` (assignee-only) and `PATCH /action-items/:id/cancel` (author-only, `cancelReason` required). Add computed `isOverdue` on every `ActionItemView` (create + transition responses). No ACS permission checks on transitions — authorization is identity match on stored `assigneePersonId` / `authorPersonId` (resolved viewer `Person.id` from JWT, same as Story 3.1). Visual StatusPill / dashboard rendering deferred to Epic 5; Story 3.4 reuses the complete endpoint for employee self-service.

## Boundaries & Constraints

**Always:**
- Resolve actor via `RequestActorContext.resolveActorId()` — never accept actor identity from body.
- **Complete:** viewer `Person.id` must equal row `assigneePersonId`; row `status` must be `open`. Set `status=completed`, `completionDate=now()` (server UTC instant); leave `cancelReason` null. No request body — `PATCH :id/complete` with empty body only; any body field → `400` (`forbidNonWhitelisted`).
- **Cancel:** viewer `Person.id` must equal row `authorPersonId`; row `status` must be `open`. Set `status=cancelled`, persist trimmed non-empty `cancelReason` (max 10_000 chars, same bound as `description`); `completionDate` stays null.
- **Overdue:** `isOverdue` is a **boolean** on `ActionItemView`. `isOverdue = (status === 'open' && utcCalendarDate(now) > utcCalendarDate(dueDate))` — compare **UTC calendar dates** extracted from `dueDate` and `now()` (ignore time-of-day on `dueDate`); item due today is not overdue until the next UTC calendar day. Terminal rows (`completed`, `cancelled`) always return `isOverdue=false`. Include `isOverdue` on all `ActionItemView` responses (extend `toView` and existing `POST` create).
- Unknown `id` → `404`. Wrong actor for the operation → `403` (no content leak). Terminal state transition → `409 Conflict`.
- **Existence vs access:** missing `id` → `404`. Existing item, wrong actor for the operation → `403` (may imply existence to a caller who holds a valid id — acceptable; same pattern as management-notes `PATCH`).
- Transitions must be **atomic**: persist changes only when `status=open` at write time (e.g. `update`/`updateMany` with `where: { id, status: 'open' }`). If zero rows updated, return `409 Conflict` — do not re-read to distinguish "already terminal" from a race.
- **Self-assign:** when `authorPersonId === assigneePersonId`, complete and cancel remain separate operations — the viewer must match the role required for each endpoint; either transition is allowed while `status=open`.
- Manual and campaign `source` rows share identical lifecycle rules.
- No schema migration expected — `status`, `completionDate`, `cancelReason` already exist on `ActionItem`.

**Ask First:**
- _(none — BFF proxy remains deferred per Story 3.1 precedent)_

**Never:**
- Caller-supplied `completionDate` or `status` fields on PATCH bodies.
- ACS `permissions/check` or `access-roles/resolve` on complete/cancel (not create-scope operations).
- Author completing on behalf of assignee, or assignee cancelling.
- `GET` list/detail endpoints, profile S14 assembly, dashboard counters, frontend, BFF proxy (later stories / Epic 5).
- Re-open completed/cancelled items in this story.

## Provenance

| Source | What this story closes |
|---|---|
| `epics.md` Story 3.3 | Three ACs: assignee complete + date; author cancel + reason; overdue display |
| PRD FR-22 | Lifecycle transitions and overdue |
| Spec §4.5 | open → completed; author cancel with reason; overdue wherever shown |
| `epic-3-context.md` | Backend lifecycle before UI; self-complete in 3.4 |
| Story 3.1 | `ActionItem` model, identity resolution, `ActionItemView`, `POST` create |
| Story 3.2 | Campaign-generated rows use same lifecycle |
| Story 3.4 | Reuses complete endpoint; no duplicate transition logic |

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| AC1: assignee completes | Open item; viewer = assignee | `200`; `status=completed`; `completionDate` set; `isOverdue=false` | N/A |
| AC2: author cancels | Open item; viewer = author; valid `cancelReason` | `200`; `status=cancelled`; `cancelReason` persisted; `completionDate` null | N/A |
| AC3: overdue open item | `status=open`; `dueDate` before today (UTC date) | Response `isOverdue=true` | N/A |
| AC3: due today | `status=open`; `dueDate` = today UTC | `isOverdue=false` | N/A |
| AC3: due today with time | `status=open`; `dueDate` = today UTC with non-midnight time | `isOverdue=false` | N/A |
| AC3: completed past due | `status=completed`; past `dueDate` | `isOverdue=false` | N/A |
| AC3: cancelled past due | `status=cancelled`; past `dueDate` | `isOverdue=false` | N/A |
| Self-assign complete | Open item; viewer = assignee = author | `200`; completed | N/A |
| Self-assign cancel | Open item; viewer = assignee = author; valid `cancelReason` | `200`; cancelled | N/A |
| No JWT | Missing/expired token on complete or cancel | — | `401` (guard) |
| Non-assignee complete | Viewer ≠ assignee | — | `403` |
| Non-author cancel | Viewer ≠ author | — | `403` |
| Missing item | Random UUID | — | `404` |
| Cancel missing reason | Body without `cancelReason` | — | `400` validation |
| Cancel empty reason | Whitespace-only `cancelReason` | — | `400` validation |
| Cancel reason too long | `cancelReason` > 10_000 chars | — | `400` validation |
| Complete with body fields | Non-empty JSON body on complete | — | `400` validation |
| Complete when completed | `status=completed` | — | `409` |
| Cancel when cancelled | `status=cancelled` | — | `409` |
| Complete when cancelled | `status=cancelled` | — | `409` |
| Cancel when completed | `status=completed` | — | `409` |
| Concurrent complete | Two parallel `PATCH …/complete` on same open item | Exactly one `200`; the other `409` | N/A |
| Campaign item lifecycle | `source=campaign` open row | Same complete/cancel rules as manual | N/A |
| Create response overdue | New open item with past `dueDate` | `201` includes `isOverdue=true` | N/A |

</frozen-after-approval>

## Code Map

- `services/work-management-service/src/modules/action-items/action-items.controller.ts` — add `PATCH :id/complete` (no body) and `PATCH :id/cancel` with `ParseUUIDPipe`; mirror `management-notes.controller.ts` PATCH pattern
- `services/work-management-service/src/modules/action-items/action-items.service.ts` — `completeActionItem(viewerPersonId, id)` and `cancelActionItem(viewerPersonId, id, dto)` (no `subjectToken` — no ACS on transitions); extend `ActionItemView` + `toView` with `isOverdue`; add private `computeIsOverdue(item)` using UTC calendar-date compare; atomic `status=open` guard on updates
- `services/work-management-service/src/modules/action-items/dto/cancel-action-item.dto.ts` — NEW: `cancelReason` string, `@Transform` trim, `@MinLength(1)`, `@MaxLength(ACTION_ITEM_DESCRIPTION_MAX_LENGTH)` (from `create-action-item.dto.ts`)
- `services/work-management-service/src/modules/action-items/__tests__/action-items.service.spec.ts` — extend existing unit tests for I/O matrix rows (overdue math, auth, terminal states, self-assign, concurrent complete)
- `services/work-management-service/test/action-items.e2e-spec.ts` — extend with `authedPatch`, complete/cancel happy paths + 403/404/409/400 cases; seed rows via `prisma.actionItem.create` or `POST`
- `services/work-management-service/prisma/schema.prisma` — READ ONLY reference (`ActionItemStatus`, fields already present)
- Reuse: `RequestActorContext` (`request-actor.context.ts`), e2e auth/DB helpers (`test/support/e2e-auth.helpers.ts`, `e2e-db.helpers.ts`)

## Tasks & Acceptance

**Execution:**
- [x] `action-items.service.ts` — `computeIsOverdue`, extend `toView`, implement `completeActionItem` / `cancelActionItem` with atomic open-only updates
- [x] `cancel-action-item.dto.ts` — validation for required trimmed `cancelReason` (max 10_000 chars)
- [x] `action-items.controller.ts` — wire PATCH complete (no body) and PATCH cancel routes
- [x] `action-items.service.spec.ts` — unit tests covering all I/O matrix rows
- [x] `action-items.e2e-spec.ts` — e2e for complete, cancel, overdue flag on create + patch, error paths

**Acceptance Criteria:** (verbatim from `epics.md`, Epic 3 Story 3.3)
- Given an open action item, when the assignee completes it, then a completion date is recorded
- Given an open action item, when the author cancels it, then a reason is required, and the item moves to cancelled
- Given an action item whose due date has passed, when it is displayed anywhere (profile, dashboard, self-service), then it renders as overdue

**Scope note for AC3:** This story delivers `isOverdue` on API responses; visual rendering is Epic 5 / profile S14 — satisfies backend half of FR-22. Overdue is computed server-side in **UTC calendar dates**; client-local midnight is out of scope for this story (Epic 5 may document display timezone when rendering).

## Verification

**Commands:**
- `cd services/work-management-service && npm run lint` — no errors
- `cd services/work-management-service && npm test` — unit tests pass (Windows: `$env:NODE_OPTIONS="--experimental-vm-modules"; npx jest`)
- `cd services/work-management-service && npm run test:e2e` — e2e pass (same `NODE_OPTIONS` on Windows)

**Manual checks (if no CLI):**
- N/A — verify via unit + e2e only

**Review:**
- `access-control-reviewer` not required — transitions enforce S14 "mark complete" / author-cancel via stored assignee/author identity, not section-matrix read paths; no `GET` surface in this story.

## Dependencies

- Story **3.1** **done** — model, identity, create path
- Story **3.2** **done** — campaign rows eligible for same lifecycle
- **Blocks:** Story 3.4 (self-complete surfaces), Epic 5 overdue UI, profile S14 read stories

### Review Findings

- [x] [Review][Patch] Add missing I/O matrix e2e/unit tests: concurrent complete (one `200`, one `409`); cancel `404`; terminal `409` paths (cancel cancelled/completed, complete cancelled); whitespace-only and >10k `cancelReason` `400`; due-today `isOverdue=false` e2e [`action-items.e2e-spec.ts`, `action-items.service.spec.ts`]
- [x] [Review][Patch] Add `401` coverage for `PATCH /action-items/:id/complete` and `/cancel` in `jwt-guard.e2e-spec.ts` (action-items e2e bypasses auth guard) [`jwt-guard.e2e-spec.ts`]
- [x] [Review][Patch] Assert ACS `permissionsCheck` and `accessRoleResolution` are not called on complete/cancel [`action-items.service.spec.ts`]
- [x] [Review][Patch] Explicitly set `completionDate: null` in cancel `updateMany` payload [`action-items.service.ts:134-139`]
- [x] [Review][Patch] Assert `updateMany` not called when cancel returns `403` (mirror complete test) [`action-items.service.spec.ts:392-400`]
- [x] [Review][Patch] E2e verify DB persistence after complete/cancel (`completionDate` written, `cancelReason` stored, `completionDate` null after cancel) [`action-items.e2e-spec.ts`]
- [x] [Review][Patch] E2e campaign-source cancel happy path [`action-items.e2e-spec.ts`]
- [x] [Review][Patch] E2e cancel body with forbidden extra fields → `400` [`action-items.e2e-spec.ts`]
- [x] [Review][Defer] OpenAPI composite decorators + `entities/action-item.entity.ts` for `isOverdue` [`action-items.controller.ts`] — deferred, pre-existing gap from Story 3.1 pattern
- [x] [Review][Defer] `ActionItemView.status` / `source` typed as `string` instead of Prisma enums [`action-items.service.ts:23-24`] — deferred, pre-existing from Story 3.1

## Spec Change Log

- 2026-09-12 — `bmad-code-review`: applied 8 patch findings (I/O matrix test coverage, jwt-guard `401`, ACS-not-called assertions, cancel `completionDate: null`, DB persistence e2e).
- 2026-09-12 — Critique and Refine (A1–A6, A10): atomic open-only transitions, complete no-body rule, `cancelReason` max length, self-assign paths, `isOverdue` boolean/terminal semantics, UTC date-only compare, code-map corrections; status → ready for approval.
- 2026-09-12 — Critique and Refine (A7–A9, A11): `401` matrix row, 403 existence semantics, UTC scope note for AC3, access-control-reviewer waiver in Verification.
