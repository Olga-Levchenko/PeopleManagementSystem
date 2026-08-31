---
title: 'Story 1.1 (part 2d): Project-assignment event processing logic'
type: 'feature'
created: '2026-08-31'
status: 'done'
review_loop_iteration: 1
baseline_commit: '5502c73546e7aa47194b1399b137c79132ac9501'
context:
  - '{project-root}/docs/decisions/ADR-001-authorization-projection-consistency.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<!-- Split from the original combined RabbitMQ-consumer spec (~2,000-2,050 tokens) — see
     deferred-work.md for the real RabbitMQ.Client wiring/fake producer/Testcontainers.RabbitMq
     tests (spec-1-1e), deferred to a follow-up spec. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `ProjectAssignment` rows are currently only ever fixture-seeded (spec-1-1c) — nothing
decides how an incoming "project-assignment changed" signal should update them, idempotently and
without regressing state from a stale/replayed signal.

**Approach:** Define the provider-neutral event contract (event id, source aggregate + version,
occurred-at, schema version, grant/revoke flag — per ADR-001/AD-11) and a pure processor that,
given an already-deserialized event, checks a watermark, upserts/removes the corresponding
`ProjectAssignment` row, and updates the watermark — idempotent and replay-safe, with zero
messaging-transport dependency. The actual RabbitMQ.Client consumer/producer that delivers real
messages to this processor is a separate, deferred spec (`spec-1-1e`) — this spec only needs the
decision logic to be correct given an event, however it arrives.

## Boundaries & Constraints

**Always:**
- Event contract fields: event id (Guid), source aggregate id + version, occurred-at (UTC),
  schema version (int), grant-or-revoke flag (bool), project id, person id, role — provider-neutral,
  no timetracker-specific fields (AD-11).
- Processing is idempotent (duplicate event id = no-op) and replay-safe/watermark-tracked (an
  event older than the aggregate's last applied version is rejected, logged, never applied).
- A grant event upserts the corresponding `ProjectAssignment` row; a revoke event removes it.
- Watermark storage lives in `AccessControlDbContext` alongside `ProjectAssignment`, same
  ownership/migration pattern as existing entities.
- The processor has no RabbitMQ/messaging-transport dependency — a plain method taking a
  deserialized event, testable against real Postgres (Testcontainers.PostgreSql) with no broker.
- `AccessControlService.Domain` stays free of external package references (AD-1) — the event
  contract/processor live in `Infrastructure` since they touch EF Core.

**Ask First:** none identified.

**Never:**
- No `RabbitMQ.Client`, no real message consumption/publishing, no fake producer — deferred to
  `spec-1-1e`. Events arrive as already-deserialized objects passed directly to the processor here.
- No reconciliation sweep (ADR-001 decision 10) — separate, deferred concern.
- No changes to `AccessRoleResolver` — it already reads whatever rows exist; this only changes how
  rows get populated.
- Does not resolve the DM+PM-same-project schema question or add a `Project` table — both remain
  separately deferred.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Grant event, new assignment | Event for a (project, person) pair not yet in the table | A new `ProjectAssignment` row is inserted | N/A |
| Revoke event, existing assignment | Event for a (project, person) pair currently present | The row is removed | N/A |
| Duplicate event id | Same event id processed twice | Second processing is a no-op | N/A |
| Stale/out-of-order event | Event version older than the last applied version for that aggregate | Rejected, watermark unchanged | Logged, not applied |
| Revoke for a non-existent assignment | Revoke event for a (project, person) pair not currently present | No-op (idempotent — already "not assigned") | N/A |

</frozen-after-approval>

## Code Map

- `Persistence/ProjectAssignment.cs`, `AccessControlDbContext.cs` -- extend with a watermark table
- `Persistence/ProjectAssignmentRole.cs` -- existing enum, event payload must carry a role
- `docs/decisions/ADR-001-authorization-projection-consistency.md` -- decisions 5/10 (10 = sweep,
  out of scope here)
- ARCHITECTURE-SPINE.md AD-11 -- provider-neutral contract shared with Epic 14's real adapter
- `tests/AccessControlService.Infrastructure.Tests/EfRelationshipRepositoryTests.cs` -- existing
  Testcontainers.PostgreSql pattern to mirror, no RabbitMQ needed

## Tasks & Acceptance

**Execution:**
- [x] `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentChangedEvent.cs` -- provider-neutral event contract (event id, aggregate id + version, occurred-at, schema version, grant/revoke flag, project id, person id, role)
- [x] `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/ProjectAssignmentEventWatermark.cs` + `AccessControlDbContext.cs` + migration -- tracks last-applied version per aggregate (project-assignment identity), AND records which `(ProjectId, PersonId)` pair that aggregate currently owns
- [x] `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventProcessor.cs` -- given a `ProjectAssignmentChangedEvent`, checks the watermark (reject if stale, reject if the event's `AggregateId` doesn't match the watermark already on record for a *different* aggregate claiming the same `(ProjectId, PersonId)` pair), upserts/removes the `ProjectAssignment` row, updates the watermark -- idempotent and replay-safe, zero messaging-transport dependency. Validates `SchemaVersion` (rejects/logs an unrecognized version rather than silently processing it as current), validates `Role` is a defined `ProjectAssignmentRole` (rejects/logs otherwise), and validates `EventId`/`AggregateId`/`ProjectId`/`PersonId` are non-empty Guids (rejects/logs otherwise). Logs on every outcome, including the two success paths (grant applied, revoke applied) -- not just `DuplicateIgnored`/`RejectedStale`.
- [x] `services/access-control-service/tests/AccessControlService.Infrastructure.Tests/Messaging/ProjectAssignmentEventProcessorTests.cs` -- real-Postgres integration tests (Testcontainers) covering every I/O matrix scenario above plus: a cross-aggregate conflict (a second `AggregateId` sends a grant for a `(ProjectId, PersonId)` pair already owned by a different aggregate) is rejected, not silently applied; an equal-version event with a different event id is handled per the documented `<=` comparison (not just strictly-older); an unrecognized `SchemaVersion` is rejected; an undefined `Role` value is rejected
- [x] `services/access-control-service/CLAUDE.md` -- fix the "part 2c" reference to match this spec's actual "part 2d" title (currently inconsistent between the two documents)

**Acceptance Criteria:**
- Given the processor's public method signature, when inspected, then it has zero messaging-transport dependency -- depends only on `AccessControlDbContext` and `ILogger<T>` (a necessary but not sufficient condition for `spec-1-1e` to wrap it without modification; full compatibility can only be confirmed once that spec exists)
- Given the processor processes an event, when it re-processes the identical event id, then the resulting `ProjectAssignment` state and watermark are unchanged (proven by a real integration test, not inspection)
- Given a `(ProjectId, PersonId)` pair already owned by aggregate A, when an event for the same pair arrives claiming a different `AggregateId` B, then the conflict is rejected and logged, never silently overwriting or deleting A's row
- Given an event with an unrecognized `SchemaVersion`, an undefined `Role`, or an empty `EventId`/`AggregateId`/`ProjectId`/`PersonId`, when processed, then it is rejected and logged, never applied as if valid

## Spec Change Log

### 2026-08-31 — Review loopback (iteration 1)

**Triggering findings:** (1) The watermark is keyed by `AggregateId`, but the `ProjectAssignment`
row mutation is keyed directly by `(ProjectId, PersonId)` from the event, with no check that the
event's `AggregateId` actually matches whichever aggregate currently owns that pair. If a pair's
aggregate lineage ever changed (a plausible real-world scenario under event-sourcing semantics —
an assignment ending and a new one later starting under a different aggregate id), a stale event
from a superseded aggregate would not be caught as stale by its own independent watermark, yet
could still silently overwrite or delete the row now legitimately owned by a different aggregate --
undermining the "replay-safe" guarantee this spec exists to provide. (2) `SchemaVersion` is
captured but never validated. (3) `Role` is persisted without checking it's a defined enum value.
(4) None of `EventId`/`AggregateId`/`ProjectId`/`PersonId` are checked against `Guid.Empty`.
(5) Logging only covered the `DuplicateIgnored`/`RejectedStale` outcomes, not the two success
paths. (6) An acceptance criterion asserted compatibility with a spec (`spec-1-1e`) that doesn't
exist yet, overstating what's actually been proven. (7) `CLAUDE.md` labeled this work "part 2c"
while the spec's own title says "part 2d."

**Amended:** Tasks & Acceptance (added the cross-aggregate-conflict check and its test, the four
validation checks and their tests, symmetric logging, and the CLAUDE.md title fix) and Acceptance
Criteria (replaced the overstated `spec-1-1e`-compatibility claim with what's actually provable
today, and added explicit criteria for the conflict-rejection and validation behaviors).

**Known-bad state avoided:** a stale or cross-aggregate event silently corrupting a
`ProjectAssignment` row's ownership with no error and no log line; an unrecognized schema version,
undefined role, or malformed id being processed as if it were valid.

**KEEP instructions:** preserve the existing event contract shape, the overall
watermark-then-upsert/remove flow, the `ProjectAssignmentEventOutcome` enum (Applied/
DuplicateIgnored/RejectedStale -- extend with a new outcome for the cross-aggregate-conflict case
rather than replacing the existing three), the DI registration in `Program.cs`, and the existing
six tests -- none of these need to change, only the additional validation/conflict-checking logic,
its tests, symmetric logging, and the two documentation fixes.

### 2026-08-31 — Second review pass (patches, no further loopback)

The cross-aggregate-conflict check added above only covered "a *different* aggregate's watermark
already owns this pair" -- it missed the concrete case (already present in this codebase's own
`FixtureSeedData`) of an existing `ProjectAssignment` row with **no watermark at all**, which the
original check treated as unclaimed/safe to overwrite. Broadened the check to also reject when an
existing row has no matching ownership record for the event's own aggregate, regardless of whether
a different aggregate's watermark exists or none does. Also added: a test for a valid same-aggregate
re-grant (role change in place, no duplicate row); a test proving the DB-level unique filtered index
independently of the app-level check; `SaveChangesAsync` exception handling (`RejectedPersistenceFailure`);
`PersonId`-exists and `AggregateVersion > 0` validation; `OccurredAtUtc` in all log lines; explicit
`ValueGeneratedNever()` on the watermark's caller-supplied key. All patch-level, no design change.

## Verification

**Commands:**
- `cd services/access-control-service && dotnet build --configuration Release` -- expected: builds clean, matches CI
- `cd services/access-control-service && dotnet test` -- expected: all tests pass, including every I/O matrix scenario above, the new cross-aggregate-conflict/validation tests, and the full existing suite (unaffected)

**Actual results (2026-08-31):**
- `dotnet build --configuration Release`: builds clean, 0 warnings, 0 errors.
- `dotnet test`: all green -- `AccessControlService.Domain.Tests` 20/20, `AccessControlService.Api.Tests` 25/25, `AccessControlService.Infrastructure.Tests` 40/40 (24 pre-existing + 16 added across both review rounds: cross-aggregate conflict for grant/revoke, release-then-reclaim, equal-version/different-event-id, unrecognized schema version, undefined role, four empty-guid cases, the no-watermark-fixture-conflict case, same-aggregate re-grant, the DB-level unique-index proof, non-existent `PersonId`, and two `AggregateVersion` validation cases). Total 85/85.

## Suggested Review Order

**The core fix (start here)**

- Broadened conflict check: rejects when an existing row has no ownership record for *this* event's aggregate, not just when a *different* aggregate owns it
  [`ProjectAssignmentEventProcessor.cs:183`](../../services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventProcessor.cs#L183)

- The test proving it against a live gap: a fixture-style row with zero watermark, untouched after a conflicting event is rejected
  [`ProjectAssignmentEventProcessorTests.cs:458`](../../services/access-control-service/tests/AccessControlService.Infrastructure.Tests/Messaging/ProjectAssignmentEventProcessorTests.cs#L458)

**Watermark shape**

- Tracks both the aggregate's version *and* which `(ProjectId, PersonId)` pair it owns -- the field this whole design hinges on
  [`ProjectAssignmentEventWatermark.cs:25`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/ProjectAssignmentEventWatermark.cs#L25)

- Unique filtered index as defense-in-depth behind the app-level check, plus the explicit caller-supplied-key declaration
  [`AccessControlDbContext.cs:125`](../../services/access-control-service/src/AccessControlService.Infrastructure/Persistence/AccessControlDbContext.cs#L125)

**Failure handling added in the second pass**

- `SaveChangesAsync` wrapped so a DB constraint violation becomes a defined outcome, never a raw exception
  [`ProjectAssignmentEventProcessor.cs:227`](../../services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventProcessor.cs#L227)

- The DB-level unique index proven independently of the app-level check
  [`ProjectAssignmentEventProcessorTests.cs:500`](../../services/access-control-service/tests/AccessControlService.Infrastructure.Tests/Messaging/ProjectAssignmentEventProcessorTests.cs#L500)

**Peripherals**

- Full review trail and what's still deliberately deferred (concurrency protection, ack/nack outcome mapping, same-aggregate-different-pair semantics)
  [`deferred-work.md:77`](../../_bmad-output/implementation-artifacts/deferred-work.md#L77)
