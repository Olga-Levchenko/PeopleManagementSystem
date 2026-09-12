---
title: 'Story 3.1: Manual action item creation, scoped to creator''s access'
type: 'feature'
created: '2026-09-12'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'b2366512933206997d6d801ea233df68b2be67d7'
context:
  - '{project-root}/.claude/rules/access-control-invariants.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/docs/requirements/project-requirements.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-PeopleManagementSystem-2026-08-25/prd.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-functional-roles-and-permissions-as-runtime-editable-data.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-s7-management-notes-flag-gating.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-o4-142-principal-personid-mapping.md'
  - '{project-root}/services/work-management-service/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 3 owns action items in `work-management-service`, but no `ActionItem` model, API, or authorization path exists yet. FR-20 / spec §4.5 require manual creation by a UM/DM/PM/PP (or any holder of the `create-action-items` functional permission) **only** for people they hold Manager or People Partner access over — never widening access beyond the creator's resolved access role (Story 1.4).

**Approach:** Add an `action-items` module in `work-management-service` with a single `POST /action-items` create endpoint. Resolve the authenticated actor to platform `Person.id` from JWT `iss`+`sub` (O4-142 / same contract ACS uses in `EnsureViewerBindingAsync`) — **not** raw Keycloak `sub`. Enforce a **dual gate** on every create for **other** assignees: (1) ACS `POST /api/v1/permissions/check` with `permissionKey: "create-action-items"` must return `granted: true` (ACS resolves the actor from the exchanged service JWT); (2) ACS `GET /api/v1/access-roles/resolve` with `viewerPersonId` = resolved `Person.id` toward the assignee must show `reportingLine || peoplePartnerLine || projectLine` (Manager or PP access paths — `projectLine` covers PM/DM project-derived manager access). **Self-assign** (`assigneePersonId === resolved viewer Person.id`): permission gate only — relationship resolve is skipped because ACS returns no Manager/PP line toward self; this matches PRD UJ-2 (Marcus creates a task for himself on his dashboard). Reuse Story 1.7's JWT auth, service-token exchange, and `access-control-client.ts` pattern; add a minimal request-scoped identity-resolution port (mirror `people-service`'s `RequestActorContext.resolveActorId()`) plus a small permissions-check port alongside the existing resolve port. Persist with Prisma; return `201` with the created row. No UI, BFF proxy, list/read surfaces, lifecycle transitions, or profile S14 assembly in this story.

**Scope note:** BFF proxy is deferred (same precedent as Story 1.7 — verify ACs directly against `work-management-service`). Profile S14 read, dashboards, overdue rendering, assignee completion, and author cancel belong to Stories 3.3–3.4 and Epic 5 — not here.

## Boundaries & Constraints

**Always:**
- `authorPersonId` is the authenticated actor's platform `Person.id` (resolved from JWT `iss`+`sub` — same contract ACS uses in `EnsureViewerBindingAsync`). Never accepted from the request body.
- For ACS `GET /api/v1/access-roles/resolve`, pass the same resolved `Person.id` as `viewerPersonId`.
- `assigneePersonId` comes from the body. For **other** assignees, creator must pass both gates. For **self-assign** (`assigneePersonId === resolved viewer Person.id`), only the permission gate applies.
- `status` is `open` on create; `source` is `manual`; `completionDate` is null; `cancelReason` is null.
- Required body fields: `title` (non-empty string), `assigneePersonId` (UUID), `dueDate` (ISO date or date-time). Optional: `description`, `linkUrl`.
- Permission gate uses ACS `create-action-items` (seeded for UM/DM/PM/PP in Story 1.4) via service JWT — never a hardcoded role-name check.
- Relationship gate: `reportingLine || peoplePartnerLine || projectLine` on resolve toward assignee. **Do not** treat `fullProfileAccessLine` alone as sufficient — epic AC names Manager or PP access only.
- Fail closed: ACS network/parse errors → deny create (403), same as management-notes resolve adapter.
- Colleague or out-of-scope assignee → 403 with no existence leak.
- Holder of `create-action-items` without any qualifying line toward a **different** assignee → 403 (epic AC3).
- Qualifying line toward assignee but permission not granted → 403.
- **Self-assign** (`assigneePersonId === resolved viewer Person.id`): allowed when `create-action-items` is granted; skip relationship resolve (confirmed 2026-09-12 — PRD UJ-2 Marcus journey). Permission denied → 403.

**Prerequisite (identity):** Story 1.7's management-notes module currently passes raw JWT `sub` as `viewerPersonId`; that diverges from O4-142 (Keycloak `sub` ≠ platform `Person.id` in seed data and production). This story **must** port a minimal identity-resolution port into `work-management-service` and use resolved `Person.id` for `authorPersonId`, self-assign checks, and ACS resolve — not defer real-ACS integration to a follow-up.

**Never:**
- Campaign-generated items (Story 3.2).
- PATCH complete/cancel (Story 3.3).
- Employee self-complete (Story 3.4).
- `GET` list/detail endpoints, profile S14 assembly, dashboard counters, overdue UI (later stories).
- BFF module in this story.
- Caller-supplied actor identity headers or body fields.
- Functional permission widening data access beyond access-role scope.

## Provenance

| Source | What this story closes |
|---|---|
| `epics.md` Story 3.1 | Four create-scope ACs (success, out-of-scope reject, permission-without-relationship reject, self-assign) |
| PRD FR-20 | Manual creation scoped to creator's access |
| PRD UJ-2 (Marcus) | Manager may create an action item assigned to themselves (self-assign) |
| Spec §4.5 | Action item fields and manual source |
| `section-matrix.md` S14 | Informs later read/write stories; this story only establishes create authorization toward assignee |
| Story 1.4 | `create-action-items` permission catalogue + grants |
| Story 1.7 / 1.9 / 1.6b | ACS resolve client pattern; `reportingLine` / `peoplePartnerLine` / `projectLine` semantics |
| Story O4-142 | OIDC principal → platform `Person.id` mapping; `people-service`'s `RequestActorContext` pattern |
| Story 1.7 scope note | Direct service API verification without BFF |

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| AC1: happy path UM | Viewer JWT; permission granted; `reportingLine=true` toward assignee; valid body | `201`; row persisted; response includes id, title, assignee, author, dueDate, status=open, source=manual | N/A |
| AC1: PP line | `peoplePartnerLine=true` toward assignee | `201` | N/A |
| AC1: PM project line | `projectLine=true`, `reportingLine=false`, `peoplePartnerLine=false` | `201` | N/A |
| AC2: out of scope | No qualifying line toward assignee | `403` | No leak |
| AC3: permission only | `create-action-items` granted; assignee is **another** person; all lines false | `403` | No leak |
| Self-assign | `assigneePersonId === resolved viewer Person.id`; permission granted | `201`; resolve not required | N/A |
| Self-assign denied | `assigneePersonId === resolved viewer Person.id`; permission denied | `403` | N/A |
| Permission denied | Qualifying line; permission `granted: false` | `403` | N/A |
| Missing permission call fail-closed | ACS permissions/check unreachable | `403` | Logged |
| Missing resolve fail-closed | ACS resolve unreachable | `403` | Logged |
| Invalid body | Missing title/assignee/dueDate | `400` validation | N/A |
| No JWT | Missing/expired token | `401` | Guard |

</frozen-after-approval>

## Code Map

**work-management-service (NestJS):**
- `prisma/schema.prisma` — NEW `ActionItem` model: `id`, `title`, `description?`, `assigneePersonId`, `authorPersonId`, `dueDate`, `linkUrl?`, `status` (`open` \| `completed` \| `cancelled` enum or string), `source` (`manual` \| `campaign`), `completionDate?`, `cancelReason?`, `createdAt`, `updatedAt`
- `prisma/migrations/*_add_action_item/` — migration
- `src/modules/action-items/action-items.module.ts` — NEW
- `src/modules/action-items/action-items.controller.ts` — `POST /action-items` only; resolve actor via identity port
- `src/modules/action-items/action-items.service.ts` — dual gate + create
- `src/modules/action-items/dto/create-action-item.dto.ts` — class-validator DTO
- `src/modules/auth/request-actor.context.ts` (or shared `src/modules/identity/`) — NEW minimal port: `resolveActorId()` from JWT `iss`+`sub` → platform `Person.id` (mirror `people-service`'s `RequestActorContext`; call people-service identity resolver or equivalent HTTP contract)
- `src/modules/action-items/permissions-client.ts` — NEW port: `checkPermission('create-action-items')` → boolean, fail-closed (ACS resolves actor from exchanged JWT)
- `src/modules/action-items/access-control-client.ts` — reuse or re-export Story 1.7 `AccessRoleResolutionPort` from management-notes (shared module/provider preferred over duplicate HTTP)
- `src/modules/action-items/__tests__/action-items.service.spec.ts` — unit tests per I/O matrix
- `test/action-items.e2e-spec.ts` — e2e with real Prisma, mocked ACS HTTP
- `src/app.module.ts` — import `ActionItemsModule`

**Not in this story:** `libs/contracts` (manual create has no cross-service event), BFF proxy, `people-service` S14, frontend.

## Tasks & Acceptance

**Execution:**
- [x] Prisma `ActionItem` model + migration
- [x] Identity-resolution port (`iss`+`sub` → platform `Person.id`)
- [x] Permissions-check port (ACS `POST /api/v1/permissions/check`)
- [x] `ActionItemsService` dual gate + create
- [x] `POST /action-items` controller (resolved `Person.id` as author)
- [x] Unit tests — all I/O matrix rows
- [x] E2E — create success + self-assign success + 403 out-of-scope + 403 permission-only (other assignee)
- [x] `deferred-work.md` — one line: BFF `action-items` proxy deferred (Story 1.7 precedent)

**Acceptance Criteria:** (verbatim from `epics.md`, Epic 3 Story 3.1)
- Given a UM/DM/PM/PP, or a role holding "create action items", when they create an action item for a person they hold Manager or PP access over, then the action item is created and assigned to that person
- Given the same creator, when they attempt to create an action item for a person outside their access scope, then the request is rejected server-side
- Given a functional role holding "create action items" but no Manager/PP relationship over a given person, when they attempt to create an action item for that person, then the request is rejected — the permission never widens access beyond the holder's access role (Story 1.4)
- Given a holder of "create action items", when they create an action item with `assigneePersonId` equal to their own person id, then the action item is created (permission gate only; PRD UJ-2)

## Verification

- `npm test` and `npm run test:e2e` in `services/work-management-service`
- Manual: `POST /api/v1/action-items` with seeded JWT + mocked/real ACS fixtures
- `access-control-reviewer` not required (no section-matrix cell change — create authorization only)

## Dependencies

- Story **1.4** **done** — `create-action-items` permission exists
- Story **1.7** **done** — JWT auth + ACS resolve client in work-management-service (identity resolution added in this story)
- Story **O4-142** **done** — principal → `Person.id` mapping exists in people-service
- Story **1.9** / **1.6b** **done** — `projectLine` / `peoplePartnerLine` on resolve endpoint
- Epic **2** **done** — profile/access patterns stable; not a hard API dependency for this story's ACs
- **Blocks:** Story 3.2 (campaign create), 3.3 (lifecycle), 3.4 (self-complete), Epic 5 dashboard action-item surfaces
