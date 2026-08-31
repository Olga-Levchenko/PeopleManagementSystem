# ADR-002: People↔Access-Control boundary — permission checks, relationship event contract, and outbox obligations

- **Status:** Accepted
- **Date:** 2026-08-31

## Context

Story 1.1 (`services/access-control-service`, PR #14) shipped access-role resolution plus a
fully-implemented, consumer-side reference for exactly one relationship kind: project assignment
(`spec-1-1c`/`spec-1-1d`/`spec-1-1e` — `ProjectAssignmentChangedEvent`, `ProjectAssignmentEventProcessor`,
`ProjectAssignmentEventConsumer`). Reports-to, department-management, and People Partner
relationships remain fixture-seeded in Access Control — there is no producer (People/Organization
side) and no consumer for them yet.

Planning for Stories 1.3 (organisational-relationship changes as a dedicated, journaled operation),
1.4 (functional roles and permissions), and the profile-response stories that depend on them
(1.6–1.10) surfaced three boundary questions that block that work from starting in parallel with
whoever picks up Story 1.4's access-control-service-side implementation:

1. **Permission decision boundary** — how does People/Organization verify a caller holds the
   "change organisational relationships" permission (Story 1.3, AC1) before applying a manager/PP/
   department/department-manager change?
2. **Shared relationship event contract** — location, event name, payload fields, versioning, and
   relationship types for the events Access Control will consume to update its projection for these
   four fields.
3. **Transactional outbox boundary** — what People/Organization must persist, and what broker/
   adapter contract Access Control's side will consume.

Per `.claude/rules/parallel-work-boundaries.md`, a dependency on a contract that doesn't exist yet
should be resolved by stubbing against a documented shape, not by waiting. This ADR is that
documented shape — it resolves what can be derived from already-accepted decisions (ADR-001, and
AD-2/AD-3/AD-9 in the architecture spine) with certainty, and proposes a concrete, non-binding
interim contract for the parts that are genuinely not yet implemented, so Stories 1.3/1.4 and their
dependents can build against something real instead of guessing or blocking.

## Decision

### 1. Permission decision boundary

Per **AD-2** ("Access Control owns access-role resolution, functional permissions, and section,
record, and operation policy decisions... No other service may replace this with a hardcoded
role-name check"), People/Organization must not implement or locally cache the "change
organisational relationships" permission check itself. It calls Access Control Service
synchronously, at write time, to obtain the decision before applying a manager/PP/department/
department-manager change. This is a point-in-time write gate, not the steady-state relationship-read
path AD-3's projection exists for — it falls under ADR-001 decision 7's "synchronous lookup as an
exceptional, stronger-freshness check," not a violation of the async-projection default.

The concrete HTTP contract is Story 1.4's deliverable (access-control-service owns permission
storage/decisions) and does not exist yet — access-control-service currently exposes zero domain
HTTP endpoints (`/api/v1/health` only; see `deferred-work.md`'s "Add an HTTP endpoint exposing
access-role resolution" entry, which this permission-check endpoint is a sibling of, not a
duplicate — one exposes role *resolution*, this one exposes permission *decisions*).

Until Story 1.4 lands:

- People/Organization's Story 1.3 write path should depend on a port/interface for this check
  (e.g. a `PermissionsClient.checkPermission(actorPersonId, permission)` abstraction), not inline
  HTTP-call code at the call site — so the real client swaps in without touching call sites, the
  same interface-first-stub approach `parallel-work-boundaries.md` prescribes.
- **Recommended interim shape** (non-binding, for stubbing only — Story 1.4's implementer may
  change it): `POST /api/v1/permissions/check` on access-control-service, request body
  `{ "actorPersonId": "<guid>", "permission": "change-organisational-relationships" }`, response
  `{ "granted": true | false }`.

### 2. Shared relationship event contract

**AD-3** already fixes the general envelope for every relationship-change event Access Control
consumes: event id, source aggregate/version, occurred-at timestamp, schema version, and whether
the change grants or revokes access. `ProjectAssignmentChangedEvent` is the first fully-implemented
instance of this envelope — it is the reference shape this decision reuses, not a
project-assignment-specific one-off.

For the four organisational-relationship fields Story 1.3 owns (manager, People Partner,
department, department-manager), the same envelope applies, with relationship-specific payload
fields:

| Field | Type | Notes |
|---|---|---|
| `EventId` | Guid | unique per event instance — idempotency key, same role as the existing contract's field of the same name |
| `AggregateId` | Guid | for this contract, the affected Person's own id — one person's manager/PP/department assignment is the aggregate whose lifecycle this event stream tracks |
| `AggregateVersion` | long | monotonically increasing per `AggregateId`, same semantics as the existing contract |
| `OccurredAtUtc` | DateTime (UTC) | when the change happened at the source, not when published |
| `SchemaVersion` | int | starts at `1` |
| `RelationshipType` | enum: `Manager` \| `PeoplePartner` \| `Department` \| `DepartmentManager` | which of the four fields changed — a distinct, typed value per change, not a polymorphic free-form payload |
| `PersonId` | Guid | whose relationship changed |
| `NewValueId` | Guid? | the new manager/PP/department(-manager) id |

Queue name: `access-control.organisational-relationship-events`, parallel to the existing
`access-control.project-assignment-events`, with its own dead-letter exchange/queue following the
exact pattern `ProjectAssignmentEventConsumer` already establishes (quorum queue, `x-delivery-limit`,
DLX/DLQ, `x-dead-letter-reason` tagging).

This shape is proposed here to unblock parallel work — it is **not frozen**. It should be
formalized into its own spec (mirroring `spec-1-1c`'s pattern) when Story 1.3's producer-side work
is scheduled, at which point that spec becomes the human-approved, frozen contract. Until then, both
the producer (People/Organization) and consumer (Access Control) sides should code against the
table above, kept easy to adjust.

**Explicitly out of this ADR's scope**: whether `libs/contracts` should hold a formal,
language-neutral schema artifact for this contract (and the existing project-assignment one) per
**AD-9**. `libs/contracts` is currently empty (`.gitkeep` only) — choosing its schema format/tooling
(JSON Schema, OpenAPI/AsyncAPI, generated types, something else) for a cross-language (.NET ↔ Node)
contract is its own decision, tracked separately in `deferred-work.md`, not decided by this ADR.

### 3. Transactional outbox boundary

Per **ADR-001 decision 4** and **AD-3**, People/Organization — not Access Control — owns the
outbox. Concretely: whichever People/Organization operation changes a person's manager/PP/
department, or a department's manager (Story 1.3's dedicated write path), must, in the **same
database transaction**:

1. Apply the relationship change to People/Organization's own tables.
2. Write the journal entry for that change (`.claude/rules/access-control-invariants.md` — manager/
   PP/department/department-manager changes are 4 of the journal's 6 event types).
3. Insert a pending outbox row for the corresponding event, shaped per Decision 2 above.

A separate publisher process/job reads unpublished outbox rows and publishes them to RabbitMQ —
never publish directly inside the request-handling transaction; that would let a broker publish
succeed while the DB commit fails, or vice versa, which is exactly what the outbox pattern exists
to prevent (ADR-001's Context).

What Access Control will consume is exactly the pattern `services/access-control-service` already
implements for project assignment: `ProjectAssignmentEventConsumer.cs` — a `BackgroundService`, one
DI scope per message, an idempotent per-aggregate watermark, `basic.reject`-based retry bounded by
`x-delivery-limit`, dead-lettering with a reason header. The equivalent consumer for organisational-
relationship events does not exist yet in access-control-service (currently fixture-seeded data
only) — tracked in `deferred-work.md` as the mirror of `spec-1-1c`/`spec-1-1d`/`spec-1-1e`'s work,
scoped to organisational relationships instead of project assignment.

## Consequences

### Positive

- Unblocks Stories 1.3, 1.4, and 1.6–1.10 planning without serializing on Story 1.4's
  access-control-service implementation landing first, per `parallel-work-boundaries.md`.
- Keeps People/Organization from inventing its own ad hoc permission-check mechanism or event
  shape that would later have to be reconciled with Access Control's actual implementation.
- Reuses an already-implemented, already-tested pattern (the project-assignment event pipeline)
  rather than designing a second, different mechanism for organisational relationships.

### Negative

- The event payload table and the permission-check endpoint shape in this ADR are provisional,
  not frozen specs — either side's implementation may need to change once the real spec/endpoint
  is built and reviewed. Both the People/Organization stub and any Access Control mock must stay
  behind an interface/port that's cheap to swap, not hardcoded call sites.
- This ADR does not resolve `libs/contracts`' tooling question, so a cross-language, machine-checked
  contract (per AD-9's letter) still does not exist for either the project-assignment event or the
  organisational-relationship event described here — both remain documentation-level contracts
  until that follow-up lands.

## Scope

This ADR resolves the three named boundary questions for Stories 1.3, 1.4, and 1.6–1.10 planning.
It does not implement any of the described contracts — the People/Organization-side write path,
outbox, and publisher; the access-control-service-side permission-check endpoint and
organisational-relationship consumer; and the `libs/contracts` schema-tooling decision all remain
real, tracked, not-yet-built work (see the `deferred-work.md` entries this ADR adds).

## Related

- `docs/decisions/ADR-001-authorization-projection-consistency.md` — the general projection/outbox/
  revocation-propagation policy this ADR applies concretely to organisational relationships.
- `_bmad-output/planning-artifacts/architecture/architecture-PeopleManagementSystem-2026-08-25/ARCHITECTURE-SPINE.md`
  — AD-2 (policy boundary), AD-3 (projection/event envelope), AD-9 (contract versioning/ownership).
- `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/` — the
  reference implementation (`ProjectAssignmentChangedEvent.cs`, `ProjectAssignmentEventProcessor.cs`,
  `ProjectAssignmentEventConsumer.cs`) this ADR's proposed organisational-relationship contract
  mirrors.
- `.claude/rules/access-control-invariants.md` — the six-event-type journal, and the "never
  self-assignable" / "dedicated screen, never a side effect of S1" rules Story 1.3's write path
  must also satisfy alongside the permission check described here.
- `.claude/rules/parallel-work-boundaries.md` — the stub-don't-wait guidance this ADR follows.
- `_bmad-output/implementation-artifacts/deferred-work.md` — tracks the concrete follow-up work
  this ADR identifies but doesn't implement.
