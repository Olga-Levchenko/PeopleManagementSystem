# Epic 3 Context: Action Items & Tasks

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Managers and people partners create action items for people in their access scope; assignees complete them or authors cancel them; overdue items surface everywhere they are shown. Epic 3 establishes the `ActionItem` entity and authorization in `work-management-service`, then layers campaign-driven bulk creation, lifecycle transitions, and employee self-completion — all server-side, with UI deferred to Epic 5 (dashboards) and profile S14 assembly in later stories.

## Stories

- Story 3.1: Manual action item creation, scoped to creator's access — **done**
- Story 3.2: Campaign-generated action items — **done**
- Story 3.3: Action item lifecycle and overdue display — **done**
- Story 3.4: Self-complete action item — **done**

## Requirements & Constraints

- Action items are the single task entity (spec §4.5): title, description, assignee, author, due date, optional link, status, completion date, source (`manual` | `campaign`).
- Manual creation (FR-20) requires Manager/PP access over assignee plus `create-action-items` permission — delivered in Story 3.1.
- Campaign activation (FR-21) generates exactly one open action item per resolved recipient at activation time, carrying the campaign link and due date; the recipient list is frozen — late joiners do not receive items retroactively.
- Lifecycle (FR-22): assignee completion records completion date; author cancel requires reason; overdue rendering is Story 3.3.
- Self-complete (FR-15 portion): Story 3.4.
- No section-matrix change for create/generate paths; S14 read/write on profile is not in Epic 3's first stories.
- Campaigns UI and audience builder are Epic 11; Story 3.2 consumes a **stubbed activation contract** only.

## Technical Decisions

- `work-management-service` owns both action items and (future) campaigns per architecture AD-1.
- Cross-service event contracts live in `libs/contracts` (JSON Schema + TypeScript), following `relationship-changed-event.v1` precedent.
- Story 3.1 established `ActionItem` Prisma model, JWT auth, identity resolution, and ACS clients — reuse; do not duplicate manual-create authorization for campaign-generated rows.
- Campaign-generated items trust the activation event's frozen `recipientPersonIds` — access scope was enforced when the publisher (Epic 11 stub) built the list; WMS does not re-run ACS resolve per recipient in this story.
- RabbitMQ broker wiring for campaign events is **not** required in Story 3.2 (mirror ACS `spec-1-1d`: processor + in-process/stub publisher; broker deferred).

## UX & Interaction Patterns

- No UI in Epic 3 backend stories. StatusPill applies when UI surfaces action items (Epic 5+).

## Cross-Story Dependencies

- **Requires:** Story 3.1 (model + manual path), Story 1.4 (permissions catalogue — not re-checked per campaign item).
- **Blocks:** Story 3.3 (lifecycle on generated items), Story 3.4, Epic 5 dashboard lists, Epic 11 completion tracking (uses generated items).
- **Epic 11** will publish real activation events / call the same processor when campaigns exist.
