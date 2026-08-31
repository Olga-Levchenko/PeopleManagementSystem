# Deferred Work

<!-- Append-only. Each entry is a goal carved off a spec during planning's token-budget split. -->

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-two-dimensional-access-role-resolution.md`
  summary: Implement the access-role resolution engine (reports-to/department-management transitive closure, project-assignment DM/PM lookup, fixture seed data, stubbed RabbitMQ project-assignment event contract) on top of the scaffolded access-control-service. Target filename when written: `spec-1-1b-access-role-resolution-engine.md`.
  evidence: The combined scaffold+resolver spec estimated ~2,200-2,300 tokens, over the 1,600 target. Scaffolding (new .NET 8 project, /health, correlation-id, CLAUDE.md, CI activation, Postgres DB) is independently shippable/reviewable on its own, so it was kept as the narrowed current spec; the resolver logic is deferred to a follow-up spec once the scaffold lands.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-two-dimensional-access-role-resolution.md`
  summary: Establish a shared .NET style/analyzer baseline (`.editorconfig`, `dotnet format` check) for access-control-service, analogous to what `libs/config` provides for the Node services.
  evidence: Review of the Story 1.1 scaffold noted CLAUDE.md documents Code Style conventions (English comments, IConfiguration-only config access, /api/v1 routing) with no automated enforcement anywhere, and this is the first .NET service in the repo so no such baseline exists yet to extend.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-two-dimensional-access-role-resolution.md`
  summary: Add an explicit timeout to the Postgres health check registration (`AddNpgSql`) in access-control-service so `/health` fails fast instead of hanging if Postgres is unreachable/slow.
  evidence: Review of the Story 1.1 scaffold found no timeout configured on the NpgSql health check; not blocking for a local scaffold-only story, but a real risk once other services depend on this health endpoint.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-two-dimensional-access-role-resolution.md`
  summary: Decide whether access-control-service's CORS policy needs `AllowCredentials()` once the BFF actually calls it (cookies/auth headers), and update the policy accordingly.
  evidence: Review of the Story 1.1 scaffold found CORS configured with a fixed origin and AllowAnyHeader/AllowAnyMethod but no AllowCredentials, and no wiring to the BFF exists yet to confirm which is needed.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-two-dimensional-access-role-resolution.md`
  summary: Reconcile access-control-service's CORS wiring with CLAUDE.md's own statement that the service isn't meant to be called directly from a browser — confirmed (2026-08-30) as intentional for Swagger UI's browser-based "Try it out" in dev, but worth revisiting once real BFF integration exists and Swagger's actual dev usage pattern is confirmed.
  evidence: Second review pass flagged CORS as possibly dead/unreconciled scope given the stated browser->BFF->service architecture; user confirmed keeping it for Swagger rather than removing it now.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-two-dimensional-access-role-resolution.md`
  summary: Add CORS_ORIGIN well-formed-absolute-URI validation and x-correlation-id length/control-character limits to access-control-service's config/middleware.
  evidence: Second review pass found CORS_ORIGIN accepts any non-blank string (a malformed value would silently never match any origin) and the correlation-id middleware echoes arbitrarily long or control-character-laden header values verbatim; both are low-value hardening for a scaffold-only story, not blocking.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-two-dimensional-access-role-resolution.md`
  summary: Wire real authentication/authorization (AddAuthentication/AddAuthorization + policies) and exception-handling middleware (UseExceptionHandler/ProblemDetails) into access-control-service once real domain endpoints exist.
  evidence: Second review pass found `app.UseAuthorization()` called with no corresponding AddAuthorization()/UseAuthentication() (currently a no-op since no endpoint requires auth) and no exception-handling middleware for any environment; both are premature for a scaffold with only a health endpoint and no domain logic yet, per this spec's "Never" boundaries.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-two-dimensional-access-role-resolution.md`
  summary: Consider extracting a shared .NET service-scaffold library (correlation-id middleware, health-check response writer, AppConfig-style validated config pattern) once `authentication-service` is stood up, analogous to `libs/config`'s role for the Node services.
  evidence: Second review pass noted access-control-service is currently the only .NET service and these three pieces have no shared extraction point; premature to build a shared lib for a single consumer, but authentication-service will otherwise likely reimplement the same patterns from scratch.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1c-project-line-resolution.md`
  summary: Implement the RabbitMQ project-assignment event contract, an idempotent/replay-safe/watermark-tracked consumer, and a fake test producer that populate the project-assignment projection `spec-1-1c` resolves against (currently fixture-seeded). Target filename when written: `spec-1-1d-project-assignment-event-consumer.md`.
  evidence: `spec-1-1c` (data model + `AccessRoleResolver`'s Project-line extension) already estimated as likely to exceed the 1,600-token budget on its own, being at least as large as the combined spec that hit ~2,200 tokens for less; pre-split before drafting rather than measure-then-split again. RabbitMQ event consumption depends on new infrastructure (client library, event contract, stub producer) that is a distinct, larger concern from the resolver/data-model work, so it's deferred to a follow-up spec, mirroring exactly how Reporting-line's own EF Core work shipped fixture-seeded before any event-sourcing plumbing existed.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1d-project-assignment-event-consumer.md`
  summary: Implement the actual `RabbitMQ.Client` consumer/producer plumbing (subscribe to a queue, deserialize incoming messages, call the pure event processor from `spec-1-1d`, ack/nack, dead-letter on failure) and a `Testcontainers.RabbitMq`-based fake test producer + integration tests proving the real broker wiring end-to-end. Target filename when written: `spec-1-1e-project-assignment-rabbitmq-wiring.md`.
  evidence: `spec-1-1d`'s initial combined draft (event contract + watermark storage + pure consumer decision logic + real RabbitMQ.Client wiring + fake producer + Testcontainers.RabbitMq tests) estimated ~2,000-2,050 tokens, over the 1,600 target. The pure decision logic (idempotency check, watermark comparison, grant/revoke handling given an already-deserialized event) is independently unit-testable with zero RabbitMQ dependency, mirroring how `AccessRoleResolver`'s pure logic was separated from `EfRelationshipRepository`'s real DB wiring — kept as the narrowed `spec-1-1d`; the real messaging plumbing is deferred to this follow-up spec once the decision logic lands.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1d-project-assignment-event-consumer.md`
  summary: Scope and implement ADR-001's independent periodic reconciliation sweep (decision 10) — a count/hash comparison against People/Organization's authoritative data, run independently of the event stream, to catch a never-published event (which watermarks alone cannot detect).
  evidence: Explicitly out of scope for `spec-1-1d`/`spec-1-1e` per ADR-001's own framing of the sweep as a separate mechanism from event consumption; also blocked in practice today since `people-service` has no real domain model yet to reconcile against (still scaffold-only).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1b-access-role-resolution-engine.md`
  summary: Add an HTTP endpoint exposing access-role resolution once a real consumer (e.g. the BFF, or Story 1.6's section-gated profile response) needs to call it.
  evidence: Story 1.1's own acceptance criteria only require the resolution logic to exist and be correct, not that it be reachable over HTTP yet; adding an endpoint with no caller would be speculative scope, so it's deferred until a concrete consumer exists.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1b-access-role-resolution-engine.md`
  summary: Define and implement how access-control-service's fixture-only reports-to/department-management data gets replaced by a real, synced relationship projection from `people-service` (the authoritative source per AD-3), rather than remaining hardcoded fixtures indefinitely.
  evidence: Review flagged that `Person.cs`/`Department.cs` are explicitly documented as stubbed pending real sync, but no existing deferred-work entry actually describes that transition — this closes that dangling cross-reference.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1b-access-role-resolution-engine.md`
  summary: Decide and implement explicit handling for an unknown person/department id in `EfRelationshipRepository` (throw, log, or another signal) instead of silently resolving to "no relationship" — currently indistinguishable from a genuine "has no manager/department" case.
  evidence: Review found this ambiguity fails in the safe (access-denying) direction and has zero blast radius today since no real HTTP consumer exists yet to pass unsynced ids, but it needs a real decision before any consumer is wired up, since a data-sync gap could otherwise masquerade indefinitely as "correctly no access."

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1b-access-role-resolution-engine.md`
  summary: Optimize `AccessRoleResolver`'s relationship checks — the reports-to/department-management walk (one DB round-trip per hop) and the Project-line check's two sequential repository calls plus O(n·m) list-intersection — into single recursive/set-based queries (Postgres recursive CTE / a single overlap query) before real org-scale data exists.
  evidence: Review noted the current approach costs nothing against fixture-scale data but risks the architecture spine's explicit p95<=2s/500+ employees permission-resolution performance gate (AD-7) once real organizational/project depth exists; the Project-line check's two non-atomic reads also carries a narrow TOCTOU window (a project-assignment change landing between the two awaits) worth closing in the same pass, once spec-1-1d's consumer can write concurrently with reads.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1b-access-role-resolution-engine.md`
  summary: Share one Testcontainers Postgres instance across `EfRelationshipRepositoryTests`' test methods (via a class/collection fixture) instead of starting a fresh container per `[Fact]`.
  evidence: Second review pass noted `IAsyncLifetime` is implemented directly on the test class, so xUnit's per-method instantiation spins up and tears down a new container for each of the ten test methods (~25s total); not blocking, but will keep growing linearly as more repository tests are added.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1c-project-line-resolution.md`
  summary: Decide whether one person can hold both DM and PM roles simultaneously on the same project (the current unique `(ProjectId, PersonId)` index only allows one role per person per project), and extend the schema if real org data needs it.
  evidence: Review noted the I/O matrix's "PM and DM same project" scenario is tested using two different people rather than one person holding both roles; zero blast radius today since data is fixture-only, but worth a real decision before spec-1-1d's consumer starts writing real project-assignment data.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1c-project-line-resolution.md`
  summary: Add a `Project` table (or equivalent validation) so `ProjectAssignment.ProjectId` can't silently reference a nonexistent/stale project — currently unvalidated, matching `Department`'s existing lack of a real upstream source.
  evidence: Review noted a typo'd or stale project id would silently seed as an orphaned assignment today with nothing to detect it; low risk against hand-written fixtures, but a real concern once spec-1-1d's RabbitMQ consumer populates this same schema from less-controlled event data.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1d-project-assignment-event-consumer.md`
  summary: Add concurrency protection (optimistic concurrency token, row lock, or elevated isolation level) around `ProjectAssignmentEventProcessor.ProcessAsync`'s read-then-write watermark sequence, sized to whatever consumption model `spec-1-1e`'s real RabbitMQ consumer actually uses (e.g. unnecessary if messages are consumed strictly sequentially per queue).
  evidence: Review found no concurrency protection today — two redelivered/concurrent copies of the same message (normal under RabbitMQ's at-least-once delivery) could both pass the duplicate/stale checks and race on `SaveChangesAsync`. Zero blast radius today (no real caller exists), and the right fix depends on `spec-1-1e`'s not-yet-decided consumption model, so resolving it now would be guessing.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1d-project-assignment-event-consumer.md`
  summary: Extend `ProjectAssignmentEventOutcome` (or add a parallel signal) so `spec-1-1e`'s RabbitMQ consumer can distinguish a DB constraint failure (FK/unique violation) from the existing `Applied`/`DuplicateIgnored`/`RejectedStale` outcomes, so it can decide ack/nack/dead-letter accordingly instead of treating any exception the same way.
  evidence: Review found `ProcessAsync` has no outcome or exception-mapping story for a DB failure even though the Spec Change Log frames the outcome enum as existing specifically to drive that future ack/nack decision; deferred since the real decision belongs with `spec-1-1e`'s actual consumer design.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1d-project-assignment-event-consumer.md`
  summary: Share one Testcontainers Postgres instance across `ProjectAssignmentEventProcessorTests`' test methods too (same fix already deferred for `EfRelationshipRepositoryTests`), instead of starting a fresh container per `[Fact]`.
  evidence: Review found the same per-test `IAsyncLifetime` pattern (no shared fixture) now repeated in this new test file — six more fresh containers per run, compounding the existing deferred item's cost as more test files adopt the same pattern.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1d-project-assignment-event-consumer.md`
  summary: Decide correct behavior when the same `AggregateId` sends a valid, non-stale event for a *different* `(ProjectId, PersonId)` pair than the one its watermark currently records as owned (no intervening revoke) — currently the old pair's `ProjectAssignment` row is never cleaned up and the watermark silently reassigns to the new pair, which could later let a different aggregate "legitimately" claim the orphaned old pair without tripping the conflict check.
  evidence: Second review pass on `spec-1-1d` found this scenario untested and unhandled; resolving it depends on the still-open question of what `AggregateId` really represents under a real producer's semantics (can one relationship's identity legitimately migrate to a different project/person, or does that indicate a producer bug that should be rejected instead) — the same open question already deferred for the cross-aggregate-conflict design generally, so resolving this now would be guessing ahead of `spec-1-1e`'s real producer.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1d-project-assignment-event-consumer.md`
  summary: Add a foreign-key constraint (or equivalent validation) from `ProjectAssignmentEventWatermark.OwnedPersonId` to `Person`, matching `ProjectAssignment.PersonId`'s existing FK — the table that exists specifically to police assignment-ownership integrity currently has weaker referential guarantees than the table it protects.
  evidence: Second review pass found this asymmetry; low risk today (no real event producer exists to write a dangling `OwnedPersonId`), grouped with the already-deferred lack of a `Project` table for `ProjectId` validation.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1d-project-assignment-event-consumer.md`
  summary: Confirm whether `ProjectAssignmentEventProcessor`'s synchronous, per-event `SaveChangesAsync` design can meet the 15-minute (degrading to 4-hour) project-derived-access revocation guarantee (`.claude/rules/access-control-invariants.md`) once wired to a real consumer, and whether `SchemaVersion`'s current strict-equality check needs a forward/backward-compatibility story before the schema actually evolves.
  evidence: Second review pass noted neither this spec nor `spec-1-1e`'s deferred scope explicitly addresses the latency guarantee this event-consumption path exists to satisfy, nor what happens when a real producer eventually ships a new schema version; both depend on decisions `spec-1-1e` and/or Story 1.2 haven't made yet.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1e-project-assignment-rabbitmq-wiring.md`
  summary: Add jitter and a growth cap to `ProjectAssignmentEventConsumer`'s fixed 5-second reconnect backoff, and write an integration test that stops/restarts the `Testcontainers.RabbitMq` broker mid-test to prove the consumer actually reconnects and resumes consuming (currently only "boots fine with RabbitMQ unreachable at startup" is proven, not a mid-run reconnect).
  evidence: Review found multiple service instances reconnecting simultaneously after a broker restart would hammer RabbitMQ in lockstep with no jitter, and an extended outage logs an error every 5 seconds indefinitely; the reconnect loop itself has no end-to-end test proving it actually resumes consumption after a broker blip.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1e-project-assignment-rabbitmq-wiring.md`
  summary: Wire RabbitMQ connectivity into `/api/v1/health` (or an equivalent operator-visible signal) so a consumer stuck retrying against an unreachable broker is distinguishable from healthy — currently `/health` stays green regardless of RabbitMQ state.
  evidence: Review noted this service already has a real Postgres health check but no equivalent for RabbitMQ; consistent with the already-known, accepted gap from the original scaffold spec ("no service's health check covers RabbitMQ yet, deferred until a service integrates an AMQP client") — this is that service, now that the gap is concretely reachable.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1e-project-assignment-rabbitmq-wiring.md`
  summary: Add monitoring/alerting for dead-letter-queue depth, decide TLS/credential hardening for `RabbitMQ.Client`'s connection beyond local `guest`/`guest` docker-compose defaults, and add a TTL/max-length bound to the dead-letter queue itself (currently unbounded), before any non-local environment relies on this consumer.
  evidence: Review noted the DLQ mechanism itself is proven correct by tests, but nothing pages an operator when it actually accumulates messages in a running environment, connection settings assume a local, unauthenticated-equivalent broker with no story for TLS or credential rotation elsewhere, and the DLQ has no TTL/max-length so it can grow indefinitely on top of having no visibility.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1e-project-assignment-rabbitmq-wiring.md`
  summary: Add a consumer-lag / time-since-last-successfully-processed-message metric for `ProjectAssignmentEventConsumer`, as the natural leading indicator for approaching the 15-minute (degrading to 4-hour) project-derived-access guarantee from `.claude/rules/access-control-invariants.md`.
  evidence: Review noted this spec is the milestone that makes that access-control guarantee concretely reachable (a real consumer now exists), but nothing measures or surfaces how close the pipeline is to that boundary during a prolonged outage — DLQ depth alone doesn't capture a consumer that's simply stalled/reconnecting.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1e-project-assignment-rabbitmq-wiring.md`
  summary: Revisit `ProjectAssignmentEventConsumer`'s retry-tagging mechanism (republishing a tagged copy, then acking the original) for an atomicity gap — if the channel dies between the republish and the ack, the original gets redelivered on reconnect while the tagged copy already sits in the queue, a duplicate-processing window. Currently safe only because `ProjectAssignmentEventProcessor`'s own idempotency (duplicate event id = no-op) absorbs the duplicate; revisit if a stronger exactly-once guarantee is ever needed.
  evidence: Review found no publisher confirms tie the two operations together; low risk today since the processor's idempotency already provides a safety net, but worth a real decision if publisher-confirms or an alternative retry-tagging approach (e.g. a header set via `IBasicProperties` before the first publish, avoiding republish entirely) becomes worth the added complexity.
