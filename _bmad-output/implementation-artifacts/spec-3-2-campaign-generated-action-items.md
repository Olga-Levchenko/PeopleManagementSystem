---
title: 'Story 3.2: Campaign-generated action items'
type: 'feature'
created: '2026-09-12'
status: 'in-progress'
review_loop_iteration: 0
baseline_commit: 'ba3305d2933206997d6d801ea233df68b2be67d7'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-manual-action-item-creation-scoped-to-creator-s-access.md'
  - '{project-root}/docs/requirements/project-requirements.md'
  - '{project-root}/docs/decisions/ADR-001-authorization-projection-consistency.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/libs/contracts/README.md'
  - '{project-root}/services/work-management-service/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.1 supports manual `ActionItem` creation only. FR-21 / spec §4.5 require that activating a form campaign generates exactly one open action item per resolved recipient, with the campaign's link and due date, and that the recipient list is frozen at activation — people who match the audience later must not receive items retroactively. Epic 11 (real campaigns) does not exist yet.

**Approach:**
- **Contract:** versioned **`campaign-activated-event.v1`** in `libs/contracts` (mirror `relationship-changed-event.v1`).
- **Processor:** **`CampaignActivationProcessor`** in `work-management-service` — validate → idempotency → atomic bulk create of `ActionItem` rows (`source: campaign`, `status: open`) for each `recipientPersonId`.
- **Schema:** extend `ActionItem` with optional `campaignId` and `@@unique([campaignId, assigneePersonId])`; add `ProcessedCampaignActivationEvent { eventId PK, processedAt }`.
- **Publisher port:** in-process **`CampaignActivationPublisher`** (stub for tests; Epic 11 calls the same processor).
- **Out of scope:** ACS dual gate per recipient, RabbitMQ consumer, UI/BFF, list/read APIs — mirror ACS `spec-1-1d` (processor + contract; broker wiring deferred).

## Boundaries & Constraints

**Always:**
- One `ActionItem` per `(campaignId, assigneePersonId)` — duplicates from replay or re-delivery are no-ops; **first write wins** — a later event for the same pair with different title/dueDate/linkUrl is silently skipped (campaign-generated rows are immutable in this story; metadata updates are out of scope).
- Re-processing the same `eventId` is a no-op (record in `processed_campaign_activation_events` or equivalent with `eventId` as primary key).
- Persist the processed `eventId` and all `ActionItem` inserts in a **single database transaction** — all-or-nothing; rollback leaves no partial state (no idempotency record without matching rows, no rows without idempotency record when recipients are non-empty).
- Concurrent duplicate `eventId`: rely on unique PK on `eventId`; second inserter treats unique-violation as no-op (mirror at-least-once delivery safety per ADR-001).
- `authorPersonId` = `event.authorPersonId` (campaign creator's platform `Person.id`); never inferred inside WMS.
- `assigneePersonId` = each entry in `event.recipientPersonIds` (frozen list from publisher).
- `title`, `dueDate`, `linkUrl` from event; `description` optional from event; `status=open`, `source=campaign`, `completionDate`/`cancelReason` null. `title` and `linkUrl` must be non-empty after trim (campaigns require a navigable link per spec §4.5).
- `recipientPersonIds` may be empty → persist idempotency record, create zero rows, succeed.
- Validate event payload against `libs/contracts` schema **and** processor cross-field rules before processing; reject malformed payloads entirely (do not partially apply). Reject when: `schemaVersion !== 1`; any UUID field invalid; `source.aggregateType !== 'campaign'`; `source.aggregateId !== campaignId`; `title` or `linkUrl` empty after trim.
- **Trusted publisher only:** accept events from the in-process `CampaignActivationPublisher` port (tests/Epic 11 stub) or a future authenticated service-to-service producer — **never** from a public HTTP endpoint or caller-controlled body. `authorPersonId` and `recipientPersonIds` are trusted platform input on this path, not end-user request parameters.
- Campaign path does **not** call ACS `permissions/check` or `access-roles/resolve` — audience scope was resolved upstream when the list was frozen (Epic 11); Story 3.2 trusts the event.
- **Aggregate version:** idempotency is **`eventId`-keyed only** (no per-campaign watermark like `spec-1-1d`). A campaign re-activated with a new frozen list publishes a new `eventId`; new assignees get rows, existing `(campaignId, assigneePersonId)` pairs are skipped. Out-of-order `source.aggregateVersion` rejection is deferred to Epic 11 / broker wiring when a real producer exists.
- **Logging:** structured log on every outcome — validation reject (with reason), duplicate `eventId` no-op, and successful activation (rows created count).

**Ask First:**
- _(none — broker wiring explicitly deferred)_

**Never:**
- Manual-create dual gate in campaign processor (Story 3.1 path unchanged).
- Dynamic re-query of audience / filter engine inside WMS (retroactive recipients are Epic 11's responsibility to exclude before publishing).
- PATCH complete/cancel (Story 3.3), self-complete (Story 3.4), GET list/detail, profile S14, dashboards, BFF proxy.
- Public HTTP endpoint accepting activation payloads from browsers.
- RabbitMQ consumer registration in this story (defer to `deferred-work.md`).

## Provenance

| Source | What this story closes |
|---|---|
| `epics.md` Story 3.2 | Two ACs: one item per recipient with link/due date; frozen recipient list |
| PRD FR-21 | Campaign activation generates action items; list frozen at activation |
| Spec §4.5 | Action item fields, `source: campaign`, lifecycle defaults on create |
| Spec §4.12 | Activation freezes audience; each recipient gets an action item with link |
| `epic-3-context.md` | WMS owns action items; stubbed activation contract; broker deferred |
| Story 3.1 | `ActionItem` model, enums, manual-create path (unchanged) |
| `spec-1-1d` | Processor-first + idempotent event pattern; RabbitMQ wiring deferred |
| ADR-001 §5 | Idempotent, replay-safe consumers |
| Story 1.4 | Permission catalogue exists; **not invoked** on campaign-generated path |
| Epic 11 (future) | Real campaign CRUD + audience resolution publishes/triggers same processor |

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| AC1: happy path | Valid event; 3 recipient UUIDs; new `eventId` | 3 rows created; all `source=campaign`, shared `campaignId`, correct title/link/dueDate/author | N/A |
| AC1: single recipient | One UUID in list | 1 row | N/A |
| AC2: frozen list only | Event lists `[A,B]` only | Items only for A and B — processor never adds C even if tests simulate "C would match audience" | N/A |
| Idempotent eventId | Same `eventId` submitted twice | Second call no-op; row count unchanged | N/A |
| Concurrent duplicate eventId | Two parallel calls with same `eventId` before either commits | Exactly one creates rows; second no-op via unique `eventId` PK (or equivalent) | N/A |
| Idempotent assignee | Same `campaignId`+assignee in two events (different eventId) | Second assignee insert skipped via unique constraint; no error; title/dueDate from first event retained | N/A |
| Empty recipients | `recipientPersonIds: []` | 0 rows; `eventId` recorded | N/A |
| Invalid schema | Missing `campaignId` or bad top-level UUID | Reject; no rows; no idempotency record | Validation error |
| Invalid recipient UUID | Malformed UUID in `recipientPersonIds` | Reject entire event; no rows; no idempotency record | Validation error |
| Wrong schemaVersion | `schemaVersion !== 1` | Reject; no rows; no idempotency record | Validation error |
| AggregateId mismatch | `source.aggregateId !== campaignId` or `source.aggregateType !== 'campaign'` | Reject; no rows; no idempotency record | Validation error |
| Empty title or linkUrl | Whitespace-only `title` or `linkUrl` | Reject; no rows; no idempotency record | Validation error |
| Duplicate recipients in one event | `[A,A,B]` | One row per unique assignee (dedupe in processor before insert) | N/A |
| Transaction rollback | DB failure mid-batch after validation | No idempotency record; no partial rows | Error propagated; caller may retry |
| Race on same assignee | Two events same `campaignId`, overlapping assignee, concurrent insert | Unique `(campaignId, assigneePersonId)` — one wins, other skips assignee without aborting whole batch | N/A |

</frozen-after-approval>

## Code Map

**libs/contracts:**
- `schemas/campaign-activated-event.v1.schema.json` — NEW; fields: `eventId`, `schemaVersion: 1`, `occurredAtUtc`, `source` (`service: work-management-service`, `aggregateType: campaign`, `aggregateId` = campaignId, `aggregateVersion`), `campaignId`, `title`, `description?`, `linkUrl`, `dueDate`, `authorPersonId`, `recipientPersonIds[]`
- `src/campaign-events.ts` — NEW TypeScript type + validator export (mirror `relationship-events.ts`)
- `fixtures/campaign-activated-event.*.v1.json` — NEW happy-path + empty-recipients fixtures
- `test/campaign-events.test.ts` — NEW schema validation tests
- `src/index.ts`, `package.json` exports — wire new schema

**work-management-service:**
- `prisma/schema.prisma` — add `campaignId String?` on `ActionItem`; `@@unique([campaignId, assigneePersonId])`; NEW `ProcessedCampaignActivationEvent { eventId PK, processedAt }`
- `prisma/migrations/*_campaign_action_items/` — migration
- `src/modules/campaign-activation/campaign-activation.module.ts` — NEW
- `src/modules/campaign-activation/campaign-activation.processor.ts` — validate (schema + cross-field) → idempotency check → `$transaction` bulk create; structured logging per outcome
- `src/modules/campaign-activation/campaign-activation.publisher.ts` — port + default in-process impl calling processor
- `src/modules/campaign-activation/dto/campaign-activated-event.dto.ts` — class-validator aligned with contract
- `src/modules/campaign-activation/__tests__/campaign-activation.processor.spec.ts` — I/O matrix unit tests
- `test/campaign-activation.e2e-spec.ts` — e2e: publisher → DB rows + idempotency + empty list
- `src/app.module.ts` — import `CampaignActivationModule`
- Reuse: `ActionItem` model enums from Story 3.1 (`action-items.service.ts` create shape for field defaults)

**Not in this story:** BFF, frontend, RabbitMQ consumer, Epic 11 campaign CRUD, `people-service` S14.

## Tasks & Acceptance

**Execution:**
- [x] `libs/contracts/schemas/campaign-activated-event.v1.schema.json` — define v1 contract
- [x] `libs/contracts/src/campaign-events.ts` + fixtures + tests — export validated type
- [x] `prisma/schema.prisma` + migration — `campaignId`, unique pair, processed-events table
- [x] `campaign-activation.processor.ts` — core idempotent bulk create
- [x] `campaign-activation.publisher.ts` — in-process port for tests and Epic 11 handoff
- [x] Unit tests — all I/O matrix rows (include concurrent duplicate `eventId`, schemaVersion reject, aggregateId mismatch, empty title/linkUrl)
- [x] E2e — activation creates N items; replay no-op; empty recipients; transaction atomicity on failure path
- [x] `deferred-work.md` — RabbitMQ consumer for `campaign-activated-event.v1` deferred (Epic 11 / broker wiring)

**Acceptance Criteria:** (verbatim from `epics.md`, Epic 3 Story 3.2)
- Given a campaign-activation event (consumed here against a stubbed contract; the real Campaigns feature is Epic 11), when the campaign activates, then exactly one action item is generated per resolved recipient, carrying the campaign's link and due date
- Given the resolved recipient list at activation time, when someone joins the matching audience population after activation, then they do not retroactively receive an action item — the list is frozen at activation

## Verification

**Commands:**
- `cd libs/contracts && npm test` — schema + fixture validation pass
- `cd services/work-management-service && npm run lint && npm test && npm run test:e2e` — unit + e2e green

**Manual checks (if no CLI):**
- N/A — no public API; verify via e2e publisher injection only

## Dependencies

- Story **3.1** **done** — `ActionItem` model and WMS service scaffold
- Story **1.4** **done** — permission catalogue only (`create-action-items` / `create-form-campaigns` seeds exist); **not invoked** on campaign-generated path (audience scope enforced upstream by Epic 11)
- **Blocks:** Story 3.3, Epic 11 activation UI, Epic 5 action-item surfaces

### Review Findings

- [x] [Review][Patch] Narrow `P2002` handler to `eventId` constraint only [`campaign-activation.processor.ts:98-103`]
- [x] [Review][Patch] Add runtime JSON Schema validation in processor (spec requires schema **and** DTO) [`campaign-activation.processor.ts:105-127`]
- [x] [Review][Patch] Include validation failure details in reject logs [`campaign-activation.processor.ts:114-116`]
- [x] [Review][Patch] Align JSON Schema `title` rule with post-trim non-empty semantics [`campaign-activated-event.v1.schema.json:61-64`]
- [x] [Review][Patch] Unit test: reject malformed `recipientPersonIds` entry [`campaign-activation.processor.spec.ts`]
- [x] [Review][Patch] Unit test: reject whitespace-only `linkUrl` [`campaign-activation.processor.spec.ts`]
- [x] [Review][Patch] Unit test: reject wrong `source.aggregateType` [`campaign-activation.processor.spec.ts`]
- [x] [Review][Patch] Unit test: assignee idempotency across two `eventId`s (first write wins) [`campaign-activation.processor.spec.ts`]
- [x] [Review][Patch] Unit test: transaction rollback leaves no idempotency row or partial rows [`campaign-activation.processor.spec.ts`]
- [x] [Review][Patch] E2e: re-activation with overlapping + new recipients [`campaign-activation.e2e-spec.ts`]
- [x] [Review][Patch] E2e: assert persisted `title` and `dueDate` on created rows [`campaign-activation.e2e-spec.ts:88-91`]
- [x] [Review][Patch] E2e: publish committed `libs/contracts` happy-path fixture [`campaign-activation.e2e-spec.ts`]
- [x] [Review][Patch] Document `CampaignActivatedEvent` in `libs/contracts/README.md` [`libs/contracts/README.md`]
- [x] [Review][Defer] WMS e2e suites excluded from CI (`run_e2e` not set) [`.github/workflows/work-management-service-ci.yml`] — deferred, pre-existing (Story 3.1 same gap)
