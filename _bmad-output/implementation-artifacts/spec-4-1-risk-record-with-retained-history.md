---
title: 'Story 4.1: Risk record with retained history'
type: 'feature'
created: '2026-09-12'
status: 'in-review'
review_loop_iteration: 0
baseline_commit: '8a2decec65248d7f6c8537d9266d810fa1b1fcf2'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-7-self-read-of-managed-data-and-never-own-risk-level.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-manual-action-item-creation-scoped-to-creator-s-access.md'
  - '{project-root}/docs/access-control/section-matrix.md'
  - '{project-root}/services/work-management-service/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 4 owns risks in `work-management-service`, but no `RiskRecord` model or API exists. FR-23 / spec §4.6 require managers/PP to append risk levels over time with full retained history, fixed severity semantics, trend comparison, and active-risk rules — while Self must **never** read S6 (Story 2.7).

**Approach:** Add a `risks` module with `POST /risks` (append record) and `GET /risks?subjectPersonId=` (full history + computed summary). Dual gate on every call: ACS `create-edit-risks` permission **and** `reportingLine || peoplePartnerLine || projectLine || fullProfileAccessLine` toward `subjectPersonId`. **Reject self-subject** (`viewerPersonId === subjectPersonId`) with `403` on both routes. Append-only persistence; compute `currentLevel`, `isActive` (`currentLevel !== 'low'`), and per-row `trendDirection` (`up` | `down` | `null`) from severity order. No profile S6 assembly, dashboard, or BFF in this story.

## Boundaries & Constraints

**Always:**
- **Identity (O4-142):** Resolve actor via `RequestActorContext.resolveActorId()` — use resolved platform `Person.id` for `viewerPersonId`, `authorPersonId`, and ACS `viewerPersonId`; never raw JWT `sub` (same prerequisite as Story 3.1). Never accept actor identity from untrusted body fields beyond `subjectPersonId` as the **target employee** (same pattern as management-notes `subjectPersonId` query param).
- **Gate order (every route):** (1) `viewerPersonId = RequestActorContext.resolveActorId()`; (2) if `viewerPersonId === subjectPersonId` → `403` **before** ACS resolve (Self S6 `—`; resolver does not model self); (3) permission check; (4) relationship resolve; (5) handler.
- **Severity enum** (Prisma + API): `low`, `need_attention`, `medium`, `high`, `leaver`. Fixed rank order for trend: `low` < `need_attention` < `medium` < `high` < `leaver`.
- **POST /risks** body: `subjectPersonId` (UUID), `level` (enum), `description` (trimmed non-empty string, max 10_000), `details` (optional trimmed string, max 10_000), `recordedAt` (ISO calendar date of the risk event; default server UTC date if omitted; must be today or in the past — reject future dates with `400`). Persist `authorPersonId` = viewer. **Append only** — never update/delete prior rows.
- **GET /risks?subjectPersonId=`** returns `{ summary, records }`: `summary.currentLevel` (`null` when no records exist), `summary.isActive` (false when no records or current is `low`), `summary.recordedAt` (`null` when no records); `records[]` each with `id`, `subjectPersonId`, `authorPersonId`, `level`, `description`, `details`, `recordedAt`, `trendDirection`, `createdAt`, ordered by `recordedAt` desc then `createdAt` desc.
- **Trend:** compare each record's `level` to the **immediately preceding** record in `recordedAt`/`createdAt` order; equal rank → `trendDirection: null`; first record → `null`; higher rank → `up`; lower → `down`.
- **Self-subject:** viewer === subject → `403` on POST and GET (S6 Self `—`; aligns with Story 2.7).
- **Out of scope subject:** none of `reportingLine`, `peoplePartnerLine`, `projectLine`, or `fullProfileAccessLine` → `403` (no leak).
- Permission denied or ACS unreachable → `403` fail-closed.
- `leaver` stored/returned as prediction only — no employment-status side effects.

**Ask First:**
- _(none — BFF proxy deferred per Story 3.1 precedent)_

**Never:**
- Employee self-read of risk history (even with permission grant).
- PATCH/DELETE/re-open/resolve risk records.
- Dashboard list/filter (Story 4.2), people-service `s6` profile assembly, UI, notifications.
- Caller-supplied `authorPersonId`.
- Hardcoded role-name checks — use `create-edit-risks` permission catalogue only.

## Provenance

| Source | What this story closes |
|---|---|
| `epics.md` Story 4.1 | Five ACs: history read, severity transitions, leaver semantics, active excludes low, trend arrow rules |
| PRD FR-23 | Risk record with retained history |
| Spec §4.6 | Levels, trend, dashboard prerequisites (API half) |
| `section-matrix.md` S6 | Manager/PP RW; Self `—` |
| Story 2.7 | Self never receives S6 — WMS denies self-subject |
| Story 1.4 | `create-edit-risks` permission |
| Story 3.1 | WMS dual-gate + identity patterns |
| Story 1.5 | `fullProfileAccessLine` → all-sections RW including S6 |
| Story O4-142 | OIDC principal → platform `Person.id` mapping |

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| AC1: append + read history | Manager with line + permission; existing rows | `POST 201`; `GET 200` full history; `summary.currentLevel` = newest `recordedAt` | N/A |
| AC2: downgrade to low | Open history; POST `level=low` | `201`; allowed; `summary.isActive=false` | N/A |
| AC3: leaver record | POST `level=leaver` | `201`; row stored; no employment-status mutation | N/A |
| AC4: active excludes low | Current level `medium` | `summary.isActive=true`; level `low` → `false` | N/A |
| AC5: trend unchanged | Two consecutive same `level` | Second row `trendDirection=null` | N/A |
| AC5: trend up/down | `medium` then `high` / `high` then `low` | `up` / `down` respectively | N/A |
| AC5: first record | Single row | `trendDirection=null` | N/A |
| Self-subject POST/GET | viewer === subject | — | `403` |
| No qualifying line | Permission granted; all lines false | — | `403` |
| Permission only | Lines true; permission false | — | `403` |
| Colleague | No line | — | `403` |
| PP line | `peoplePartnerLine=true` | `201` / `200` | N/A |
| Project line | `projectLine=true` only | `201` / `200` | N/A |
| FPA line only | `fullProfileAccessLine=true`; other lines false | `201` / `200` | N/A |
| FPA self-subject | `fullProfileAccessLine=true`; viewer === subject | — | `403` |
| No records | Qualifying viewer; zero rows for subject | `GET 200`; `records: []`; `summary.currentLevel=null`; `summary.isActive=false`; `summary.recordedAt=null` | N/A |
| Future `recordedAt` | POST with `recordedAt` after today (UTC) | — | `400` |
| Invalid body | Missing level/description/subject | — | `400` |
| No JWT | Missing token | — | `401` |
| ACS fail-closed | permissions/check unreachable | — | `403` |

</frozen-after-approval>

## Code Map

- `services/work-management-service/prisma/schema.prisma` — NEW `RiskLevel` enum + `RiskRecord` model (`id`, `subjectPersonId`, `authorPersonId`, `level`, `description`, `details?`, `recordedAt`, `createdAt`); index on `(subjectPersonId, recordedAt)`
- `prisma/migrations/*_add_risk_record/` — migration
- `src/modules/risks/risks.module.ts` — NEW
- `src/modules/risks/risks.controller.ts` — `POST /risks`, `GET /risks?subjectPersonId=`
- `src/modules/risks/risks.service.ts` — gate order (self before resolve), dual gate incl. `fullProfileAccessLine`, append, history query, `computeTrendDirection`, `buildSummary`; all authorization denials return uniform `403` (no body differentiation)
- `src/modules/risks/dto/create-risk-record.dto.ts` — validation
- `src/modules/risks/permissions-client.ts` — `hasCreateEditRisksPermission` (reuse or extend action-items port pattern)
- Reuse: `RequestActorContext`, `AccessRoleResolutionPort` from management-notes/action-items
- `__tests__/risks.service.spec.ts` — I/O matrix incl. FPA-only, FPA+self `403`, empty history, future `recordedAt` `400`; `test/risks.e2e-spec.ts`, extend `jwt-guard.e2e-spec.ts`

## Tasks & Acceptance

**Execution:**
- [x] Prisma `RiskRecord` + migration
- [x] Permissions port for `create-edit-risks`
- [x] `RisksService` dual gate (deny self-subject), append, history + summary + trend
- [x] Controller routes + DTOs
- [x] Unit tests — I/O matrix rows
- [x] E2e — happy path, self `403`, FPA-only, FPA+self `403`, out-of-scope `403`, empty history, future `recordedAt` `400`, trend/active semantics
- [x] `jwt-guard` `401` for new routes

**Acceptance Criteria:** (verbatim from `epics.md`, Epic 4 Story 4.1)
- Given a person's existing risk records, when a manager/PP reads risk history, then the current level is the most recent record, and full history is retained and readable by Reporting line/Project line/PP
- Given the fixed severity order (low < need attention < medium < high < leaver), when a new record is created at any level, then the transition to any other level is allowed, including back down to low — there is no resolved/closed state
- Given a risk record at level `leaver`, when it is interpreted anywhere in the system, then it is treated strictly as a prediction, never as the fact of departure (Epic 16's employment status is the fact)
- Given counters/filters/dashboards that report "active" risk counts, when a person's current level is `low`, then they are excluded from that count
- Given two consecutive risk records for the same person, when the level is unchanged between them, then no trend arrow is shown; a trend arrow appears only when the level differs from the immediately preceding record

**Scope note:** AC4 dashboard counters and AC5 visual arrows are Story 4.2/Epic 5 UI; this story delivers `summary.isActive` and `trendDirection` on API responses.

## Verification

**Commands:**
- `cd services/work-management-service && npm run lint`
- `cd services/work-management-service && npm test` (Windows: `$env:NODE_OPTIONS="--experimental-vm-modules"; npx jest`)
- `cd services/work-management-service && npm run test:e2e`

**Review:**
- `access-control-reviewer` **required** — S6 self `—` negative paths, Manager/PP/project-line/FPA gates, FPA+self `403`, uniform `403` across all deny paths, no self-read leak.

## Dependencies

- Epic **3** **done** — WMS identity + ACS client patterns
- Story **2.7** **done** — self S6 exclusion (people-service); WMS must mirror deny on self-subject
- Story **1.4** **done** — `create-edit-risks` permission
- Story **1.5** **done** — `fullProfileAccessLine` all-sections RW
- Story **O4-142** **done** — platform `Person.id` identity resolution in WMS
- **Blocks:** Story 4.2, people-service S6 assembly, Epic 5 risk counters

## Spec Change Log

- 2026-09-12 — Security Audit Personas amendments A1–A7: gate order, `fullProfileAccessLine`, O4-142 identity, future `recordedAt` rejection, empty-history contract, uniform `403`.
- 2026-09-12 — Approved for implementation (planning-gap-audit: PROCEED WITH CONDITIONS).
