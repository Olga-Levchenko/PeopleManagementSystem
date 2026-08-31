---
title: 'Story 1.1 (part 2e): Project-assignment RabbitMQ consumer wiring'
type: 'feature'
created: '2026-08-31'
status: 'done'
review_loop_iteration: 1
baseline_commit: '18635cea33593c0bf5b8bbf15cd0cc2995a4568f'
context:
  - '{project-root}/docs/decisions/ADR-001-authorization-projection-consistency.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `ProjectAssignmentEventProcessor` (spec-1-1d) has no way to receive real events — it's
never called by anything.

**Approach:** Add a `BackgroundService` RabbitMQ consumer that subscribes to a queue, deserializes
each message into `ProjectAssignmentChangedEvent`, creates a DI scope per message (the processor is
scoped), calls `ProcessAsync`, and acks/nacks based on the outcome — `RejectedPersistenceFailure`
(transient) is nacked for requeue-then-dead-letter after limited retries; every other outcome
(including all rejections) is acked, since those are permanent judgments about the event's content,
not delivery failures. A fake test producer publishes to the same queue for testing.

## Boundaries & Constraints

**Always:**
- `RabbitMQ.Client` (no framework), declares its own queue + a dead-letter queue/exchange.
- A malformed message body (fails to deserialize) is dead-lettered directly, never crashes the
  consumer or blocks the queue.
- `RejectedPersistenceFailure` nacks with requeue, up to a bounded retry count, then dead-letters
  (ADR-001 decision 5: retries + dead-letter handling).
- Every other outcome (`Applied`, `DuplicateIgnored`, `RejectedStale`, `RejectedInvalid`,
  `RejectedCrossAggregateConflict`) acks — these are correct, final judgments on the event content.
- One DI scope created per message (`IServiceScopeFactory`), since `ProjectAssignmentEventProcessor`
  and its `DbContext` are scoped.
- Fake producer + `Testcontainers.RabbitMq` for tests, mirroring `Testcontainers.PostgreSql` already
  proven in this service's CI.

**Ask First:** none identified.

**Never:**
- No reconciliation sweep (ADR-001 decision 10) and no concurrency protection beyond what
  spec-1-1d already has — both remain separately deferred.
- No real timetracker adapter — the producer here is test/fake-only.
- No changes to `ProjectAssignmentEventProcessor`'s own logic — this only calls it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid grant event published | Fake producer publishes a well-formed grant | Row inserted, message acked | N/A |
| Malformed message body | Non-deserializable payload published | Dead-lettered immediately | Logged |
| Persistence failure | Processor returns `RejectedPersistenceFailure` | Nacked/requeued, then dead-lettered after retry limit | Logged each attempt |
| Permanent rejection | Processor returns `RejectedInvalid`/`RejectedStale`/`RejectedCrossAggregateConflict` | Acked (not requeued, not dead-lettered) | Logged |

</frozen-after-approval>

## Code Map

- `Messaging/ProjectAssignmentEventProcessor.cs` -- existing, unchanged; the consumer's only call
- `Program.cs:54` -- `ProjectAssignmentEventProcessor` registered scoped; consumer must create a
  scope per message, not resolve once at startup
- `docs/decisions/ADR-001-authorization-projection-consistency.md` decision 5 -- retry/dead-letter
  requirement
- `infra/docker-compose.yml` -- RabbitMQ (`rabbitmq:4-management-alpine`, guest/guest, 5672/15672)
- `tests/.../RealServerBindingTests.cs` -- precedent for proving a real hosted process/service, not
  just unit-testing handler logic in isolation

## Tasks & Acceptance

**Execution:**
- [x] `src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventConsumer.cs` -- `BackgroundService`: connects, declares queue + DLQ, subscribes; per message creates a DI scope, deserializes, calls `ProcessAsync`, maps outcome to ack/nack/dead-letter per Boundaries
- [x] `src/AccessControlService.Infrastructure/Messaging/FakeProjectAssignmentEventProducer.cs` -- test-only producer publishing to the same queue/contract
- [x] `Program.cs` -- register the consumer as a hosted service
- [x] `tests/AccessControlService.Infrastructure.Tests/Messaging/ProjectAssignmentEventConsumerTests.cs` -- `Testcontainers.RabbitMq`-based tests covering every I/O matrix scenario above end-to-end
- [x] `src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventConsumer.cs` -- wrap the DI-scope-creation + `ProcessAsync` call in a catch-all `try`/`catch (Exception)`, not just the deserialization step. Any exception not already mapped to a `ProjectAssignmentEventOutcome` (i.e. anything `ProjectAssignmentEventProcessor` itself didn't catch and turn into `RejectedPersistenceFailure`) must be treated the same way as `RejectedPersistenceFailure` -- reject-with-requeue, letting the quorum queue's existing `x-delivery-limit` bound the retries and dead-letter it, rather than leaving the delivery unacked/unrejected forever. Also wrap the ack/reject call itself: if `BasicAckAsync`/`BasicRejectAsync` throws (e.g. the channel died), catch it, log it, and break out of the consume loop so `ExecuteAsync`'s outer reconnect logic takes over instead of continuing to read from a channel that may itself be dead
- [x] Same file -- explicitly set `AutomaticRecoveryEnabled = false` on the `ConnectionFactory`, since the consumer already implements its own manual reconnect loop; leaving RabbitMQ.Client's built-in automatic recovery at its default risks the two mechanisms fighting (the client silently recovering the connection/topology while the manual loop is also trying to reconnect and re-declare it)
- [x] Same file -- tag dead-lettered messages with a reason (a message header, e.g. `x-dead-letter-reason`: `malformed-body` / `persistence-failure-exhausted` / `unhandled-exception`) so someone triaging the dead-letter queue later doesn't have to guess why a message landed there
- [x] `services/access-control-service/CLAUDE.md` -- fix the stale sentence that still lists a DB-failure-specific outcome as "deferred to spec-1-1e" even though `RejectedPersistenceFailure` already shipped in spec-1-1d and this spec already consumes it
- [x] `tests/AccessControlService.Infrastructure.Tests/Messaging/ProjectAssignmentEventConsumerTests.cs` -- remove the stray BOM before its `using` statements (inconsistent with every other new file in this diff) and add a test proving an exception escaping `ProcessAsync` (not just a returned outcome) does not permanently stall the consumer -- e.g. swap in a processor/DbContext that throws something other than `DbUpdateException` for one message, then publish a second, ordinary valid event afterward and assert it still gets processed (proving the channel wasn't wedged)

**Acceptance Criteria:**
- Given the fake producer publishes a grant event, when the consumer processes it, then a real `ProjectAssignment` row is created and no code change would be needed for Epic 14's real adapter to publish to the same queue/contract instead
- Given a persistence failure is simulated, when retried past the bounded limit, then the message ends up in the dead-letter queue, not lost and not retried forever
- Given an exception escapes `ProcessAsync` that isn't already a defined outcome, when it happens, then the message is rejected (not left unacked) and a subsequent, unrelated message is still processed -- the consumer never permanently stalls under `prefetch=1`

## Spec Change Log

### 2026-08-31 — Review loopback (iteration 1)

**Triggering findings:** all three review layers independently converged on the same root cause:
`HandleMessageAsync` only catches deserialization failures and `ProcessAsync`'s own
`DbUpdateException`-mapped `RejectedPersistenceFailure`. Any *other* exception escaping the DI
scope creation or the `ProcessAsync` call (an unexpected Npgsql exception, a DI resolution
failure, anything else) propagates to the outer `catch` in the `ReceivedAsync` handler, which only
logs -- it never acks or rejects the delivery. Because the channel uses `prefetchCount: 1`, that
one stuck, unacknowledged delivery permanently stops RabbitMQ from delivering any further message
to this consumer -- no crash, no dead-letter, just one log line, until the process restarts.
Related: `ConnectionFactory`'s `AutomaticRecoveryEnabled` was left at its client default, which
could silently reconnect/recover underneath the consumer's own hand-rolled reconnect loop,
compounding the risk of two competing recovery mechanisms. Smaller findings: `CLAUDE.md` still
described `RejectedPersistenceFailure` as "deferred to spec-1-1e" even though it already shipped in
spec-1-1d; dead-lettered messages carry no reason metadata; a stray BOM in the new test file.

**Amended:** Tasks & Acceptance (added the catch-all exception handling + defensive ack/reject
error handling, explicit `AutomaticRecoveryEnabled = false`, dead-letter reason metadata, the
CLAUDE.md fix, the BOM removal, and a test proving an unhandled exception doesn't stall subsequent
message processing) and Acceptance Criteria (added an explicit criterion for the stall scenario).

**Known-bad state avoided:** the entire project-assignment event pipeline silently and permanently
wedging on the first unanticipated exception, with no operator-visible signal beyond a single log
line -- a production-critical failure mode for the mechanism this spec exists to build.

**KEEP instructions:** preserve the existing consumer/producer design, the quorum-queue +
`x-delivery-limit` + `basic.reject` mechanism (already correct, per the first Change Log entry
below), the DI-scope-per-message pattern, and the four existing consumer tests -- none of these
need to change, only the catch-all exception handling, the `AutomaticRecoveryEnabled` setting, the
dead-letter metadata, and the documentation/test-hygiene fixes.

### 2026-08-31 — Initial implementation notes

- The queue is a **quorum queue** with `x-delivery-limit` (5) plus a dead-letter exchange/queue, so
  RabbitMQ itself counts redeliveries and dead-letters `RejectedPersistenceFailure` after the bound
  is exceeded -- the consumer never tracks a retry count itself.
- Implementation-level correction to the literal "nacked" wording in Boundaries (behavior
  unchanged, mechanism corrected): the retry/dead-letter requeue uses AMQP `basic.reject`
  (`IChannel.BasicRejectAsync`), not `basic.nack`. Confirmed empirically against a real
  `rabbitmq:4-management-alpine` broker that RabbitMQ's quorum-queue `x-delivery-limit` only counts
  a redelivery caused by `basic.reject` (or a consumer/connection failure) -- `basic.nack` with
  `requeue: true` is treated as an unlimited, uncounted "application routing" requeue and never
  trips the limit, which would silently defeat "then dead-letters after limited retries" (an
  initial `basic.nack`-based draft looped 5000+ times against a real broker without ever
  dead-lettering, caught by the Testcontainers.RabbitMq test before this landed). The malformed-body
  path also uses `basic.reject(requeue: false)` for the same reason, though requeue-without-retry
  behaves identically under either method.
- The consumer's connect/declare/consume loop retries with a fixed 5s backoff on any failure
  (including RabbitMQ being unreachable at startup) instead of crashing the host, mirroring this
  service's existing "boots fine with Postgres down" contract -- not called out explicitly in
  Boundaries but consistent with it and required for `RealServerBindingTests`/`HealthEndpointTests`
  to keep passing with an unreachable `RABBITMQ_HOST`.
- Added `RABBITMQ_HOST`/`RABBITMQ_PORT`/`RABBITMQ_USER`/`RABBITMQ_PASSWORD` as required, fail-fast
  `AppConfig` values (`.env.example`/`appsettings.json` updated to match) -- connection settings
  the spec's Code Map didn't explicitly enumerate but which `ProjectAssignmentEventConsumer` and
  the fake producer both need to reach a real broker.
- `Testcontainers.PostgreSql` was bumped from 3.10.0 to 4.14.0 (alongside adding
  `Testcontainers.RabbitMq` 4.14.0) as a forced compatibility bump, not a deliberate upgrade:
  `Testcontainers.RabbitMq` and `Testcontainers.PostgreSql` share a common base library
  (`Testcontainers`), and pulling in `Testcontainers.RabbitMq` 4.14.0 alongside the
  already-referenced `Testcontainers.PostgreSql` 3.10.0 produced a `MissingMethodException` at test
  run time from the mismatched base-library versions the two packages pulled in transitively --
  resolved by pinning both to the same 4.14.0 line. This version line also changed
  `PostgreSqlBuilder`'s constructor shape: it now takes the container image tag directly as a
  constructor argument (`new PostgreSqlBuilder("postgres:16-alpine")`) instead of a parameterless
  constructor followed by a fluent `.WithImage("postgres:16-alpine")` call, so every test file
  constructing a `PostgreSqlContainer` needed that one-line update.

## Verification

**Commands:**
- `cd services/access-control-service && dotnet build --configuration Release` -- expected: builds clean, matches CI
- `cd services/access-control-service && dotnet test` -- expected: all tests pass, including every I/O matrix scenario above and the full existing suite (unaffected)

**Actual results (2026-08-31):**
- `dotnet build --configuration Release`: builds clean, 0 warnings, 0 errors.
- `dotnet test`: all green -- `AccessControlService.Domain.Tests` 20/20, `AccessControlService.Api.Tests` 42/42 (41 + 1 new composition test proving the real `Program.cs` RabbitMQ DI wiring end-to-end), `AccessControlService.Infrastructure.Tests` 44/44. Total 106/106.

## Suggested Review Order

**The consumer's failure-handling core (start here, this is what both review rounds hardened)**

- Catch-all exception handling around DI-scope-creation + `ProcessAsync`, with a clean-shutdown carve-out so ordinary host stop doesn't get misclassified as a failure
  [`ProjectAssignmentEventConsumer.cs:127`](../../services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventConsumer.cs#L127)

- Outcome-to-ack/reject mapping, now an explicit switch with a throwing default so a future outcome value can't silently fall through to "ack"
  [`ProjectAssignmentEventConsumer.cs:324`](../../services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventConsumer.cs#L324)

- `HandleMessageAsync` itself: deserialization catch widened to match the `ProcessAsync` catch-all's breadth, per the second review round
  [`ProjectAssignmentEventConsumer.cs:258`](../../services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventConsumer.cs#L258)

**Real-broker proof (what closed the confirmed verification gap)**

- The composition test proving `Program.cs`'s actual `RABBITMQ_*` env-var -> `AppConfig` -> `RabbitMqConnectionOptions` mapping works, not just a hand-constructed options object
  [`ProjectAssignmentEventConsumerCompositionTests.cs:34`](../../services/access-control-service/tests/AccessControlService.Api.Tests/ProjectAssignmentEventConsumerCompositionTests.cs#L34)

- `AutomaticRecoveryEnabled = false` -- deliberate, since the consumer already implements its own manual reconnect loop
  [`ProjectAssignmentEventConsumer.cs:169`](../../services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventConsumer.cs#L169)

**Peripherals**

- Full review trail and what's still deliberately deferred (backoff jitter, mid-run reconnect test, RabbitMQ health-check wiring, DLQ monitoring/TLS, the retry-tagging duplication window)
  [`deferred-work.md:101`](../../_bmad-output/implementation-artifacts/deferred-work.md#L101)
