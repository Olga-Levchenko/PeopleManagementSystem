# Deferred Work

<!-- Append-only. Each entry is a goal carved off a spec during planning's token-budget split. -->

- source_spec: none
  summary: Add JWT validation middleware/guard to the BFF that validates a bearer token against Keycloak's JWKS and populates a verified `request.user` (`sub` claim), rejecting missing/expired/malformed/signature-invalid tokens before any domain call.
  evidence: Split from Story 1.11's multi-goal intent (`_bmad-output/planning-artifacts/epics.md`, Epic 1) at bmad-build's step-01 multi-goal check — user chose to scope the first spec to authentication-service + Keycloak realm/token issuance only, since Story 1.11 as a whole spans building a new service, real Keycloak provisioning, BFF wiring, and downstream propagation, well beyond one spec's token budget. This is Story 1.11's second slice, target filename when written: `spec-1-11b-bff-jwt-validation.md`.

- source_spec: none
  summary: Propagate the BFF's verified identity to downstream domain services (Access Control, People/Organization, Work Management, Resourcing) as a platform-established identity, never a caller-supplied `actorId`/`personId`; also establish trusted service-to-service identity for non-browser-originated calls (background jobs, service-to-service).
  evidence: Split from Story 1.11's multi-goal intent at the same step-01 multi-goal check as the entry above; depends on the BFF JWT validation slice landing first. Target filename when written: `spec-1-11c-verified-identity-propagation.md`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11-platform-authentication-via-keycloak.md`
  summary: Strip or reconsider `directAccessGrantsEnabled: true` on the `bff-confidential` client in `keycloak/realm-export.json` before this exact realm file is ever imported into anything but local dev/CI.
  evidence: Code review of story-1-11 found this is a durable capability of the checked-in realm file, not something that turns off after this story's own integration test runs — anyone importing this file into a shared/staging Keycloak inherits Resource Owner Password Credentials grant on the client with no code change.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11-platform-authentication-via-keycloak.md`
  summary: Pin Keycloak's `KC_HOSTNAME`/`KC_HOSTNAME_URL` to a single canonical value before any token-validation logic depends on `AppConfig.Issuer` matching Keycloak's real `iss` claim in a multi-hostname (containerized/deployed) topology.
  evidence: Code review of story-1-11 found that Keycloak (no `KC_HOSTNAME`/`KC_HOSTNAME_URL` set) resolves its real `iss` claim from the request's Host header, while `AppConfig.Issuer` is a static string derived from `KEYCLOAK_BASE_URL`. Harmless today (no token validation happens yet — this story only proves the realm/token issuance are reachable), but becomes load-bearing the moment `spec-1-11b-bff-jwt-validation.md` validates `iss` against a value sourced from this service's `/api/v1/auth/config` endpoint.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11-platform-authentication-via-keycloak.md`
  summary: Make back-channel/front-channel logout an explicit acceptance criterion of whichever future spec implements login/logout — real logout must invalidate tokens server-side (OIDC back-channel logout), not just clear a BFF session cookie.
  evidence: Code review of story-1-11 found no logout configuration exists on the `bff-confidential` client (correctly out of scope for this story, since no login/logout flow exists yet), and no currently-tracked spec names this requirement explicitly.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11-platform-authentication-via-keycloak.md`
  summary: Design guardrail for `spec-1-11b`/`spec-1-11c`: token claims added to the realm later must stay limited to stable identity facts (`sub`, `email`, employee id if one exists) and never a role/permission claim — access roles and functional-role permissions must keep being resolved by `access-control-service`, never sourced from Keycloak claims.
  evidence: Code review of story-1-11 flagged this as the reason `fullScopeAllowed` was set to `false` with an explicit `defaultClientScopes` list excluding `roles` — the guardrail should stay explicit for whoever builds the next slices, not just implicit in today's empty-realm-roles state.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11-platform-authentication-via-keycloak.md`
  summary: Template the `bff-confidential` client secret and seeded test user's password in `keycloak/realm-export.json` (e.g. `${BFF_CLIENT_SECRET}` substituted at import time) before this exact file is ever imported into a shared/non-local environment.
  evidence: Code review of story-1-11 found both are hardcoded in plaintext — acceptable for an ephemeral local-dev/CI-only Keycloak with no persistent storage, but must never be reused if this file is imported anywhere else.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11-platform-authentication-via-keycloak.md`
  summary: Add a docker-compose smoke test (or equivalent) proving `infra/docker-compose.yml`'s realm auto-provisioning path (bind-mount + `--import-realm`) actually works, as a repo-wide CI infrastructure decision.
  evidence: Code review of story-1-11 found `KeycloakIntegrationTests` provisions Keycloak through `Testcontainers.Keycloak`'s own independent code path (`KeycloakBuilder.WithRealm(...)`), never touching `infra/docker-compose.yml`, and no CI workflow in this repo runs `docker compose` at all. A broken mount path or a dropped `--import-realm` flag would silently regress local dev provisioning with `dotnet test` still green.

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

## Deferred from: code review of PR #14 (2026-08-31)

- source_spec: `services/access-control-service/src/AccessControlService.Api/CLAUDE.md`
  summary: Add a test proving Swagger/`/swagger` is unreachable outside the Development environment — `CLAUDE.md` states this as fact but nothing verifies it.
  evidence: Fresh-context code review of PR #14 (chunk 1, scaffold) found no test asserting Swagger's environment gating; low risk for a scaffold-only service with no domain endpoints yet.

- source_spec: `services/access-control-service/src/AccessControlService.Api/Program.cs`
  summary: Document (or add) the service's HTTPS posture — no `UseHttpsRedirection()` call and no written decision that this is HTTP-only for local dev, TLS terminated upstream in real deployments.
  evidence: Fresh-context code review of PR #14 found this gap; consistent with the rest of the repo's current local-dev-only posture (no TLS anywhere else yet either), not unique to this service, so not blocking.

- source_spec: `.github/workflows/access-control-service-ci.yml`
  summary: Consider whether CI path filters should also cover `infra/postgres-init/**`, `.gitattributes`, and root `.gitignore` — a regression in the DB-init script wouldn't retrigger any service's CI today.
  evidence: Fresh-context code review of PR #14 found these files (touched by this PR) aren't in any service's CI path filter; low-churn files, acceptable tradeoff for now.

- source_spec: `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/Department.cs`
  summary: Decide whether one person can legitimately manage more than one department — the current schema (`Person.ManagesDepartmentId`, a single nullable field) can't represent it, and this assumption isn't recorded anywhere in spec-1-1b's Boundaries/Design Notes.
  evidence: Fresh-context code review of PR #14 (chunk 2, Reporting-line resolution) found this undocumented assumption; zero blast radius today since department data is fixture-only, similar in category to the already-deferred DM+PM-same-project schema question.

- source_spec: `_bmad-output/implementation-artifacts/deferred-work.md` (the existing "recursive CTE" entry from spec-1-1b's second review pass)
  summary: When implementing the recursive-CTE optimization for `AccessRoleResolver`'s walk, also account for the sequential-per-instance constraint documented in `AccessRoleResolver.ResolveAsync`'s own XML doc (calls must be sequential per resolver/DbContext instance) — resolving Reporting-line for the All Employees list (500+ rows, AD-7's p95≤2s gate) needs either N separate scoped DbContext instances or serialized awaits, a scaling dimension the existing entry's evidence doesn't mention.
  evidence: Fresh-context code review of PR #14 found the existing deferred entry frames the performance risk purely as round-trip count, not as compounding with the sequential-call constraint; appending as a new entry since the existing one is not to be modified.

- source_spec: `services/access-control-service/tests/AccessControlService.Infrastructure.Tests/AccessControlService.Infrastructure.Tests.csproj`
  summary: Add a graceful skip (not a hard failure) for `AccessControlService.Infrastructure.Tests` when Docker is unavailable locally, so a contributor without Docker (e.g. on Cursor, per `tooling-parity.md`'s equal-functionality goal) doesn't hit an unexplained hard failure running `dotnet test`.
  evidence: Fresh-context code review of PR #14 found `dotnet test` hard-fails on this project when Docker isn't running, with no opt-out or explanation in `CLAUDE.md`'s Commands section or the csproj; affects every Testcontainers-based test project in this service, not just this chunk's tests.

- source_spec: `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/AccessControlDbContext.cs`
  summary: Add a database-level guard (e.g. a CHECK constraint) against a self-referential `Person.ManagerId` or `Department.ParentDepartmentId` (a row pointing at its own id) — currently the only protection against a one-node cycle is `AccessRoleResolver`'s in-memory cycle guard, so a bad write made outside the resolver (a future admin tool, a data-sync bug) could silently create an undetected cycle at the data layer.
  evidence: Fresh-context code review of PR #14 (chunk 3, Project-line resolution) found no such constraint on either self-referencing FK; zero blast radius today since this schema is fixture-only, same category as the already-deferred DM+PM-same-project and single-department-manager schema questions.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1c-project-line-resolution.md`
  summary: Extend Project-line resolution to include everyone above the qualifying DM/PM in their own reports-to chain, not just the direct DM/PM — `docs/access-control/section-matrix.md`'s Project-line audience definition and `.claude/rules/access-control-invariants.md`'s three-relation transitive-closure statement both describe this, but `AccessRoleResolver.QualifiesViaProjectAssignmentAsync` only performs a direct, non-transitive DM/PM check, matching spec-1-1c's own frozen (narrower) Intent text.
  evidence: Fresh-context code review of PR #14 (chunk 3, Project-line resolution) found this gap via the acceptance-auditor lens against spec-1-1c's referenced context docs; user confirmed (2026-08-31) deferring rather than implementing now or renegotiating the frozen spec text, reason: scoped out for spec-1-1c's token budget, same as every other spec-1-1c narrowing — the transitive walk is real follow-up work, not a bug in what shipped.

- source_spec: `services/access-control-service/src/AccessControlService.Infrastructure/Persistence/AccessControlDbContext.cs`
  summary: Add an FK constraint from `ProjectAssignmentEventWatermark.OwnedProjectId`/`OwnedPersonId` to `Person`, matching `ProjectAssignment.PersonId`'s existing FK — currently a watermark can "own" a person id that no longer exists with nothing at the DB layer to catch it, an inconsistency in defensive-constraint style between two entities that otherwise mirror each other.
  evidence: Fresh-context code review of PR #14 (chunk 4, project-assignment event processing) found no such constraint; zero blast radius today since this schema is fixture-only, same category as the already-deferred self-referential-FK and DM+PM-same-project schema questions.

- source_spec: `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventProcessor.cs`
  summary: Decide correct behavior when a redelivered event has the same `EventId` as the aggregate's watermark's `LastAppliedEventId` but a different `AggregateVersion` than what was actually applied — currently `ProcessAsync` treats any `EventId` match as a harmless exact duplicate (`DuplicateIgnored`) with no consistency check against the recorded version, so a corrupted/buggy redelivery (same id, different content) would pass through silently.
  evidence: Fresh-context code review of PR #14 (chunk 4, project-assignment event processing) found this gap; low urgency since no real producer exists yet (deferred to `spec-1-1e`) and this requires a real decision on the correct outcome/signal, not a mechanical fix.

- source_spec: `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventProcessor.cs`
  summary: Decide whether the person-existence check in `ProcessAsync` should gate revoke events the same way it gates grants, and whether it should run before or after the exact-duplicate watermark check — currently any event (grant or revoke) for a `PersonId` no longer in `People` is unconditionally rejected as `RejectedInvalid`, so a revoke can never clean up that person's existing `ProjectAssignment` row once the person is gone, and a duplicate redelivery for a since-removed person returns `RejectedInvalid` instead of `DuplicateIgnored`.
  evidence: Fresh-context code review of PR #14 (chunk 4, project-assignment event processing) found this gap; user confirmed (2026-08-31) deferring rather than changing the check now, reason: `Person` is a fixture-only stub with no hard-delete flow today, so both consequences are currently unreachable in practice — revisit once a real people-service sync/delete flow lands.

- source_spec: `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventConsumer.cs`
  summary: Neither `RejectForRetryAsync`'s nor `DeadLetterImmediatelyAsync`'s republish `BasicPublishAsync` uses publisher confirms, and both pass `mandatory: false` with no `BasicReturnAsync` handler — the republish-then-ack sequence isn't atomic, and a misconfigured DLX/queue binding would silently drop a message instead of surfacing an error.
  evidence: Fresh-context code review of PR #14 (chunk 5, RabbitMQ consumer wiring) found this gap; low urgency since `ProjectAssignmentEventProcessor.ProcessAsync` is already idempotent by `EventId`, so a duplicate redelivery from this race degrades to a harmless no-op rather than data corruption.

- source_spec: `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventConsumer.cs`
  summary: The `x-dead-letter-reason` header is only set on a delivery's first rejection — if a message fails for a different reason on a later attempt, the eventually-dead-lettered message's header still reflects the first failure, not the one that actually exhausted the retry limit. A deliberate trade-off (re-tagging every attempt costs another publish+ack round trip), but not yet explicitly documented as a known limitation.
  evidence: Fresh-context code review of PR #14 (chunk 5, RabbitMQ consumer wiring) found this nuance undocumented; low urgency, purely a debugging-clarity concern.

- source_spec: `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventConsumer.cs`
  summary: No RabbitMQ/consumer-liveness health check — `/api/v1/health` can report healthy while `ProjectAssignmentEventConsumer` is stuck in its 5s reconnect loop indefinitely.
  evidence: Fresh-context code review of PR #14 (chunk 5, RabbitMQ consumer wiring) found this gap; same category as the already-deferred Postgres health-check-timeout item.

- source_spec: `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/RabbitMqConnectionOptions.cs`
  summary: Connection/retry configuration is minimal and hardcoded — `ReconnectDelay` (5s) and `DeliveryLimit` (5) are compile-time constants rather than `AppConfig`-sourced, and `RabbitMqConnectionOptions` has no `VirtualHost` or TLS/`Ssl` support, so this consumer cannot currently target a non-default vhost or an AMQPS-only broker.
  evidence: Fresh-context code review of PR #14 (chunk 5, RabbitMQ consumer wiring) found this gap; same category as the already-deferred HTTPS-posture item (local-dev-only today, TLS terminated upstream in real deployments).

- source_spec: `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventConsumer.cs`
  summary: Neither the main quorum queue nor the dead-letter queue declares a max-length or TTL argument — a stalled consumer or a burst of malformed messages can grow the DLQ (or the main queue pre-consumption) without bound, with no operational backstop.
  evidence: Fresh-context code review of PR #14 (chunk 5, RabbitMQ consumer wiring) found this gap; zero blast radius today against fixture-scale/no-real-traffic, worth a real decision before production load.

- source_spec: `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/FakeProjectAssignmentEventProducer.cs`
  summary: This file ships inside the production `AccessControlService.Infrastructure` assembly, not a test-only project, despite its own doc comment calling it test-only — it calls `internal static ProjectAssignmentEventConsumer.DeclareTopologyAsync`, so cross-assembly access would need `InternalsVisibleTo` or making that method public. Decide whether to accept as-is or restructure into a shared test-support project.
  evidence: Fresh-context code review of PR #14 (chunk 5, RabbitMQ consumer wiring) found and verified this dependency; real architectural trade-off, not a mechanical fix.

- source_spec: `services/access-control-service/tests/AccessControlService.Infrastructure.Tests/Messaging/ProjectAssignmentEventConsumerTests.cs`
  summary: No test forces a connection/channel loss mid-run and asserts the consumer reconnects and resumes processing — the structurally most complex part of this consumer (`ChannelShutdownAsync`/`ConnectionShutdownAsync` → `loopEnded` → `RunOnceAsync` throws → `ExecuteAsync`'s 5s-backoff retry) is entirely unverified.
  evidence: Fresh-context code review of PR #14 (chunk 5, RabbitMQ consumer wiring) found this gap; deferred as a dedicated resilience-testing follow-up given the complexity/flakiness risk of reliably forcing this scenario against a real Testcontainers broker within a test.

- source_spec: `services/access-control-service/src/AccessControlService.Infrastructure/Messaging/ProjectAssignmentEventConsumer.cs`
  summary: A `QueueDeclareAsync` hitting `PRECONDITION_FAILED` (a pre-existing queue declared with different arguments) would retry forever on the same 5s backoff as an ordinary transient connectivity failure, indistinguishable from it in logs.
  evidence: Fresh-context code review of PR #14 (chunk 5, RabbitMQ consumer wiring) found this gap; an operator would see "retrying" forever with no signal the actual cause is a permanent topology mismatch, not a network blip.

- source_spec: `services/access-control-service/src/AccessControlService.Api/Program.cs`
  summary: `CORS_ORIGIN` has no support for multiple comma-separated origins — only a single literal origin string is passed to `WithOrigins`. Distinct from the already-deferred "well-formed-absolute-URI validation" item, which is about validating the one origin, not supporting more than one.
  evidence: Fresh-context code review of PR #14 (chunk 5, RabbitMQ consumer wiring) found this gap while reviewing `Program.cs`'s CORS wiring.

- source_spec: `services/access-control-service/src/AccessControlService.Api/Program.cs`
  summary: No test forces an actual Kestrel port-bind conflict (two instances on the same `PORT`) to verify the `catch (IOException)` → descriptive `InvalidOperationException` wrapping actually fires as intended.
  evidence: Fresh-context code review of PR #14 (chunk 5, RabbitMQ consumer wiring) found this gap; low urgency, existing behavior not introduced by this chunk.

## Deferred from: ADR-002 (2026-08-31)

- source_spec: `docs/decisions/ADR-002-people-access-control-relationship-boundary.md`
  summary: Build Story 1.4's real permission-check HTTP endpoint on `access-control-service` (e.g. `POST /api/v1/permissions/check`), replacing ADR-002's non-binding interim recommendation. People/Organization's Story 1.3 write path should already be coded against a swappable port/interface per the ADR, so this lands as a client swap, not a call-site rewrite.
  evidence: Raised resolving another developer's cross-service dependency questions ahead of Stories 1.3/1.4 planning; access-control-service currently exposes zero domain HTTP endpoints (`/api/v1/health` only).

- source_spec: `docs/decisions/ADR-002-people-access-control-relationship-boundary.md`
  summary: Formalize the organisational-relationship event contract (manager/PP/department/department-manager changes) into its own frozen spec, mirroring `spec-1-1c`'s pattern, once Story 1.3's producer-side work is scheduled — ADR-002's payload table is a proposed, non-binding stub to unblock parallel work, not the frozen contract.
  evidence: Same as above; the four organisational-relationship fields remain fixture-seeded in access-control-service today, with no producer or consumer implementation.

- source_spec: `docs/decisions/ADR-002-people-access-control-relationship-boundary.md`
  summary: Build People/Organization's transactional-outbox write path and publisher for organisational-relationship changes (Story 1.3's producer side) — apply the relationship change, write the journal entry, and insert the pending outbox row in one transaction, then publish via a separate process, per ADR-002 decision 3.
  evidence: Same as above; `services/people-service` is currently an empty NestJS scaffold with no domain models, no outbox pattern, and no RabbitMQ client wiring yet.

- source_spec: `docs/decisions/ADR-002-people-access-control-relationship-boundary.md`
  summary: Build access-control-service's consumer for organisational-relationship events, mirroring `spec-1-1d`/`spec-1-1e`'s pattern (idempotent per-aggregate watermark processor + real RabbitMQ.Client wiring with quorum queue/DLQ) but scoped to manager/PP/department/department-manager changes instead of project assignment.
  evidence: Same as above; this is the consumer-side counterpart to the producer work above, needed before Access Control's reports-to/department data can stop being fixture-only.

- source_spec: `docs/decisions/ADR-002-people-access-control-relationship-boundary.md`
  summary: Decide `libs/contracts`' schema-artifact format/tooling for a cross-language (.NET ↔ Node) shared contract (JSON Schema, OpenAPI/AsyncAPI, generated types, or another approach), then populate it for both the existing project-assignment event contract and the organisational-relationship one ADR-002 proposes — per AD-9, shared contracts should be versioned and owned in a shared location, but `libs/contracts` is currently empty and both contracts today live only as documentation/private types on the consumer side.
  evidence: Explicitly out of ADR-002's scope (its own "Explicitly out of this ADR's scope" note) since choosing cross-language contract tooling is a larger, separate decision than the boundary questions that ADR resolves.

## Deferred from: ADR-003 (2026-08-31)

- source_spec: `docs/decisions/ADR-003-epic-1-remaining-story-dependencies.md`
  summary: Build the HTTP endpoint exposing `AccessRoleResolver` (e.g. `GET /api/v1/access-roles/resolve?viewerPersonId=...&subjectPersonId=...`) — this supersedes/fulfills the existing "Add an HTTP endpoint exposing access-role resolution" entry from Story 1.1 with a concrete proposed shape, now that Story 1.6 (its named trigger) is an identified real consumer.
  evidence: ADR-003 found this is the single blocker underneath four of the six still-blocked Epic 1 stories (1.6, 1.7, 1.8, 1.9, 1.10); the existing deferred entry named the trigger condition but not a shape.

- source_spec: `docs/decisions/ADR-003-epic-1-remaining-story-dependencies.md`
  summary: Decide whether the access-role-resolution endpoint above should also expose which project-assignment role(s) (DM vs. PM) the viewer holds toward the subject, needed by Story 1.7's S7 flag-gating (which distinguishes "PM specifically" from "Project-line generally," a distinction `AccessRole.ProjectLine`'s boolean doesn't carry) — recommended as an additive `projectRoles` field on the same endpoint rather than a second service reading project-assignment data directly (per AD-2).
  evidence: ADR-003 found this gap while tracing Story 1.7's dependencies; not resolved by that ADR, flagged as a real design decision for whoever picks up 1.7.

- source_spec: `docs/decisions/ADR-003-epic-1-remaining-story-dependencies.md`
  summary: Add tests proving Story 1.2's Project-line access-role-un-derivation acceptance criterion, which is already satisfied by existing behavior (`ProjectAssignmentEventProcessor`'s revoke handling plus `AccessRoleResolver`'s no-caching design) — no new production code is needed for the Project-line half of Story 1.2, only test coverage claiming the AC formally once Story 1.2 is picked up.
  evidence: ADR-003 traced this through PR #14's already-shipped `ProcessAsync_RevokeEventExistingAssignment_RemovesRowAndReleasesOwnership` test and `AccessRoleResolver`'s documented no-cache contract; flagged to prevent someone re-implementing already-working behavior.

- source_spec: `docs/decisions/ADR-003-epic-1-remaining-story-dependencies.md`
  summary: Decide whether Story 1.10's custom-field-visibility authorization decision point lives in People/Organization (which owns the field and its visibility setting) or is proxied through Access Control (for consistency with AD-2's "Access Control owns policy decisions" rule, like every other authorization decision in this epic).
  evidence: ADR-003 found this genuinely undecided while tracing Story 1.10's dependencies; the visibility policy itself (S16, management/employee/colleague) is already fully specified, only the decision-point's owning service is open.

## Deferred from: code review of story-1-2 (2026-09-01)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-access-role-un-derives-when-a-relationship-ends.md`
  summary: Add a Department-management revoke test that changes a multi-level department-ancestor chain (e.g. the department's own manager, or a department several levels below the managed one), not just the direct hop-0 case the shipped test covers.
  evidence: Code review of story-1-2 found `ResolveAsync_DepartmentManagementEditRevokesReportingLine_...` only sets `subject.DepartmentId = null`, never exercising `ManagesSubjectsDepartmentOrAncestorAsync`'s multi-hop walk against real Postgres; the walk itself is already unit-tested against the hand-written fake in `AccessControlService.Domain.Tests`, so this is an integration-test coverage gap only, not an unverified algorithm.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-access-role-un-derives-when-a-relationship-ends.md`
  summary: Add a Department-management grant-direction test, mirroring `ResolveAsync_ReportsToEditGrantsReportingLine_...` — the shipped tests cover reports-to revoke+grant and department-management revoke, but not department-management grant.
  evidence: Code review of story-1-2 found this asymmetry; not required by the frozen I/O matrix (which has no "department-management grants" row), so it's a nice-to-have completeness gap rather than an AC violation.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-access-role-un-derives-when-a-relationship-ends.md`
  summary: Add a Project-line revoke test using `Role: ProjectAssignmentRole.ProjectManager`, not just `DeliveryManager` — confirm the guarantee holds for both qualifying roles once they're distinguished.
  evidence: Code review of story-1-2 found only the DM role is exercised; low priority today since `AccessRoleResolver.QualifiesViaProjectAssignmentAsync` doesn't yet branch on role (Story 1.9's project-line-narrowing work is what will make DM vs. PM behavior actually diverge), so a PM-specific test would currently just duplicate the DM one's assertions.

- source_spec: `_bmad-output/implementation-artifacts/sprint-status.yaml`
  summary: Update `1-1-two-dimensional-access-role-resolution`'s status from `review` to `done` — its PR (#14, story-1-1-access-role-resolution) already merged to `main`.
  evidence: Code review of story-1-2 found this stale entry while touching the adjacent `1-2-...` line in the same file; pre-existing, not caused by this diff, but worth a `bmad-sprint-planning` repair pass.

## Deferred from: code review of story-1-9 (2026-09-01)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-9-project-line-narrowing-vs-reporting-line.md`
  summary: Decide and implement service-to-service authentication/authorization for access-control-service's domain HTTP endpoints (starting with `GET /api/v1/access-roles/resolve`) — today any caller reaching the service can ask "what can arbitrary viewer X see about arbitrary subject Y" for any two GUIDs, with no check that the caller is entitled to ask.
  evidence: Code review of story-1-9 found this gap on the service's first real business endpoint (previously only `/api/v1/health` existed, which needs no such check). Not unique to this story — no domain service in the repo has service-to-service auth wired in yet (Keycloak integration lives in `authentication-service`; the intended trust model between backend services was never decided) — so it's a platform-wide, pre-existing gap this endpoint happens to make concretely reachable for the first time, not a defect introduced by this story's own logic.

## Deferred from: code review of story-1-11b (2026-09-02)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11b-bff-jwt-validation.md`
  summary: The `KC_HOSTNAME`/`iss`-drift risk already logged from Story 1.11's first slice is no longer purely theoretical — `spec-1-11b` is the exact "the moment token validation depends on it" trigger condition that entry named, and this slice shipped without resolving it. It works today only because every environment (local dev, CI, the Testcontainers e2e fixture) reaches Keycloak via the same hostname the BFF is configured with; a real deployment with Keycloak behind a reverse proxy or a different internal-vs-external hostname would start silently rejecting valid tokens.
  evidence: Code review of story-1-11b (identity-access-engineer + blind-hunter, independently) confirmed `infra/docker-compose.yml`'s `keycloak` service still sets no `KC_HOSTNAME`/`KC_HOSTNAME_URL`, and neither `authentication-service`'s nor the BFF's issuer derivation accounts for a Keycloak-observed `iss` that could differ from their own static `KEYCLOAK_BASE_URL` copies. Pin `KC_HOSTNAME_URL` (or move to a real reverse-proxy-aware hostname strategy) before any non-single-hostname deployment.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11b-bff-jwt-validation.md`
  summary: Add a cross-realm "wrong issuer" and "wrong audience" test once a second Keycloak realm/client fixture exists — today's e2e suite only has one realm/client, so a correctly-signed token from a genuinely different issuer or audience is unverified in practice (only proven correct by the strategy's own config, not by a test that could fail).
  evidence: Code review of story-1-11b (identity-access-engineer + blind-hunter) found this gap; disproportionate effort to fix now (would need a second realm fixture) relative to the current single-client reality.

## Deferred from: code review of story-1-8 (2026-09-02)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-colleague-view-field-whitelist.md`
  summary: Add pagination (`take`/`skip`) to `people-service`'s Prisma `leaves` and `personProjectAssignments` selects in `ProfileService.getProfile` before real org-scale data exists, to avoid unbounded memory loading for subjects with large leave/assignment histories.
  evidence: Edge-case-hunter review of story-1-8 found no pagination on either relation select. Ordering is now implemented (`orderBy: { startDate: 'asc' }`); pagination is deferred because no page-size or API shape for S10/S11 is spec'd yet — revisit when UX pagination requirements are defined.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-colleague-view-field-whitelist.md`
  summary: `PersonProjectAssignment` table has no writer — `s11` will return empty arrays in production until the timetracker sync (epic-14) or another mechanism populates `person_project_assignments`. The schema and access-pattern are implemented; population is out of scope for Story 1.8.
  evidence: Code review of story-1-8 (blind-hunter) found no inbound event consumer or sync adapter writing to this table. Epic-14 is the intended owner.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-colleague-view-field-whitelist.md`
  summary: `orderBy: { startDate: 'asc' }` on nullable `PersonProjectAssignment.startDate` uses PostgreSQL's default null ordering (nulls last), which is not explicitly specified. If the product requires nulls first (open-ended assignments at top), an explicit `nulls: 'first'` Prisma modifier is needed.
  evidence: Code review of story-1-8 (edge-case-hunter) noted that nullable columns have DB-engine-dependent null ordering. Current behavior (nulls last) is probably acceptable but is undocumented.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11b-bff-jwt-validation.md`
  summary: Override `JwtAuthGuard.handleRequest` to distinguish a JWKS-fetch failure (Keycloak/network outage) from an actually-invalid/expired token, and log the distinction — both currently surface as an indistinguishable bare 401, which will make a real Keycloak outage look identical to normal bad-token traffic in monitoring/on-call triage.
  evidence: Code review of story-1-11b (blind-hunter) found this; correct fail-closed security posture either way, so this is an observability improvement, not a security gap.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11b-bff-jwt-validation.md`
  summary: Add test coverage for a non-Bearer `Authorization` scheme (e.g. `Basic ...`) and an empty Bearer value — currently relies entirely on `passport-jwt`'s `ExtractJwt.fromAuthHeaderAsBearerToken()` built-in behavior, unverified by any test in this repo.
  evidence: Code review of story-1-11b (blind-hunter) found this gap; low risk since the library's behavior here is well-established, but not asserted locally.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11b-bff-jwt-validation.md`
  summary: Consider a shared fixture or contract test asserting `authentication-service`'s `AppConfig.Issuer`/`JwksUri` (.NET) and the BFF's `deriveIssuer`/`deriveJwksUri` (Node) derive identical values from the same `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM` inputs — today the same formula is hand-duplicated in two languages with nothing catching a future silent desync (e.g. a Keycloak version bump changing the certs path in one place but not the other).
  evidence: Code review of story-1-11b (blind-hunter) found this gap; real but low-current-risk, and a cross-language contract test is nontrivial to set up cheaply.

## Deferred from: story-1-11c (2026-09-02)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11c-verified-identity-propagation.md`
  summary: Add the same JWT-validation pattern (`passport-jwt`/`jwks-rsa`, global guard,
  `@Public()` opt-out) to each of `access-control-service`, `work-management-service`, and
  `resourcing-service` once it individually gains a real consumer that reads an actor identity —
  today none of the three has an endpoint that does, so adding the plumbing now would be
  speculative infrastructure with no real caller. For `access-control-service` this is the
  identical trigger condition already logged from Story 1.9's review ("Decide and implement
  service-to-service authentication/authorization for access-control-service's domain HTTP
  endpoints"). Consolidated from three near-duplicate entries (one per service) into this single
  entry so the three stay in sync as one unit rather than drifting independently.
  evidence: `spec-1-11c`'s own Boundaries & Constraints explicitly scope JWT validation to
  `people-service` only for this reason, naming all three of these services as deliberately left
  unauthenticated; recorded here per that spec's Design Notes, mirroring the same principle
  already applied from Story 1.9's review.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11c-verified-identity-propagation.md`
  summary: Wire `services/people-service/test/jwt-guard.e2e-spec.ts` into `people-service-ci.yml`
  (`run_e2e: true`) once `people-service`'s *other* e2e file (`test/app.e2e-spec.ts`, which needs
  a real, already-running Postgres) is itself made CI-safe (e.g. its own
  `@testcontainers/postgresql`-based setup) — flipping `run_e2e: true` today would run both e2e
  files in the same `npm run test:e2e` invocation and break CI on the Postgres-dependent one,
  exactly as `_reusable-node-ci.yml`'s own `run_e2e` input comment already warns.
  evidence: `spec-1-11c`'s own Tasks explicitly required confirming this before touching CI wiring;
  confirmed by inspection of `people-service-ci.yml`/`_reusable-node-ci.yml` (unlike `bff-ci.yml`,
  which sets `run_e2e: true` because the BFF's e2e suite is fully Testcontainers-self-contained)
  and verified locally: the new `jwt-guard.e2e-spec.ts` itself needed `PrismaService` stubbed to
  run without a real Postgres, but `app.e2e-spec.ts` still asserts a real database ping and was
  left unchanged, per this story's Never boundaries.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-server-assembled-section-gated-profile-response.md`
  summary: Story 1.6's `test/profile.e2e-spec.ts` (its own ephemeral Testcontainers Postgres, same self-contained pattern as `jwt-guard.e2e-spec.ts`) is a second e2e file blocked by the same `run_e2e: false` gap the entry above already tracks — it passes locally but never runs in CI. Resolving the entry above (making `app.e2e-spec.ts` CI-safe, then flipping `run_e2e: true`) should be checked against both e2e files, not just `jwt-guard.e2e-spec.ts`.
  evidence: `people-service-ci.yml` still omits `run_e2e`, confirmed unchanged by this story; `profile.e2e-spec.ts` is the concrete proof of Story 1.6 AC1's zero-trace behavior (`Object.keys` assertions per the I/O matrix), so its absence from CI is a real, not hypothetical, verification gap for this story specifically.

- source_spec: none
  summary: `RequestActorContext.actorId` (the raw Keycloak `sub` claim) is used directly as a `Person.id` throughout `people-service` — `organisational-relationships.service.ts`'s self-assignment checks and Story 1.6's `ProfileService`'s Self short-circuit both compare a Keycloak-user-typed value against `Person.id`-typed fields — with no `Person.keycloakId`/`externalId` mapping column anywhere in the schema. In production a Keycloak `sub` will essentially never equal a `Person.id` UUID, so "Self" detection (and the pre-existing self-assignment rejection checks) likely never actually match for a real logged-in user; every e2e/unit test masks this by setting the test "viewer id" directly to a `Person.id` rather than a real Keycloak `sub`.
  evidence: Confirmed independently by two review passes during Story 1.6 (access-control-reviewer and a general-purpose adversarial review) tracing `request-actor.context.ts`, `organisational-relationships.service.ts`'s `personId === actorId`/`normalizedRelatedId === actorId`/`managerId === actorId` checks, and `profile.service.ts`'s `viewerPersonId === subjectPersonId` short-circuit. Pre-existing since Story 1.11c introduced `RequestActorContext`, not newly introduced by Story 1.6 — this entry is the first place it's been named explicitly rather than silently relied upon. Fails in the access-*restrictive* direction (Self never matches, falling through to the resolver) so it isn't a leak, but it does mean the "Self" identity path is unverified against a real user identity anywhere in the codebase today.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-server-assembled-section-gated-profile-response.md`
  summary: Add a real contract test between `people-service`'s `HttpAccessRoleResolutionAdapter` and `access-control-service`'s actual `GET /api/v1/access-roles/resolve` response (e.g. both services under Testcontainers in one test, or a shared fixture captured from a real response) — today the adapter's unit test and the e2e's port override both use a hand-authored JSON literal matching the TS interface, never the real C# serialized output, so a future wire-shape drift on the access-control-service side (renamed field, casing change) would silently break parsing in production with no test catching it.
  evidence: Adversarial review during Story 1.6 confirmed the shapes currently match (verified by manual cross-file inspection of `AccessRolesController.cs`'s default ASP.NET Core camelCase serialization vs the TS `AccessRoleResolution` interface), but found no automated test proves this — only manual inspection does.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11c-verified-identity-propagation.md`
  summary: Addendum to the story-1-11b entry above titled "Consider a shared fixture or contract
  test asserting `authentication-service`'s `AppConfig.Issuer`/`JwksUri` (.NET) and the BFF's
  `deriveIssuer`/`deriveJwksUri` (Node) derive identical values" — that entry described the
  formula as hand-duplicated in two languages/two places; as of this story it is hand-duplicated
  in three: `authentication-service`'s `AppConfig` (.NET), `services/bff`'s `JwtStrategy` (Node),
  and now `services/people-service`'s `JwtStrategy` (Node, a second copy of the same Node
  formula). Any future contract test covering this should cover all three, not just the original
  two.
  evidence: `services/people-service/src/modules/auth/jwt.strategy.ts`'s `deriveIssuer`/
  `deriveJwksUri` are a byte-for-byte-identical port of `services/bff/src/modules/auth/jwt.strategy.ts`'s
  own functions of the same name, per this story's own Code Map instruction to port the BFF's
  pattern verbatim.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11c-verified-identity-propagation.md`
  summary: Named boundary, not yet addressed: both `services/bff` and `services/people-service`
  validate the identical browser-obtained bearer token against the same `audience:
  'bff-confidential'` — there is no per-hop token exchange or downscoped credential between the
  BFF and `people-service` (or any future adopting Node service). A leaked bearer token is
  therefore equally powerful at every service that adopts this pattern, not just at the BFF where
  the browser session lives. This is a legitimate, currently-accepted tradeoff (simplicity over a
  token-exchange flow neither Keycloak realm nor any client currently implements) — record it so
  whoever wires a third/fourth Node service into this pattern consciously re-evaluates it rather
  than treating "same audience at every hop" as an unexamined default that just falls out of
  continued copy-paste.
  evidence: Adversarial review of story-1-11c (identity-access-engineer) flagged this as an
  unwritten security tradeoff once a second service (`people-service`) started validating the
  same audience the BFF does; `services/people-service/src/modules/auth/jwt.strategy.ts`'s own
  `BFF_CLIENT_ID` doc comment already explains *why* this is correct for the current two-hop
  topology, but nothing previously flagged it as a boundary to reconsider as more services adopt
  the pattern.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11c-verified-identity-propagation.md`
  summary: `services/bff/src/modules/auth/` and `services/people-service/src/modules/auth/` are
  now byte-for-byte duplicated in full — `jwt.strategy.ts`, `jwt-auth.guard.ts`,
  `public.decorator.ts`, `auth.module.ts`, including the hardcoded `'bff-confidential'`
  client-id literal — and their respective `test/jwt-guard.e2e-spec.ts` e2e fixtures duplicate the
  same Testcontainers-Keycloak client secret/test username/password constants. Recommend
  extracting into a shared library (e.g. a new `libs/auth` alongside the existing `libs/config`/
  `libs/contracts`) once a third Node service adopts this identical pattern, per
  `.claude/rules/parallel-work-boundaries.md`'s guidance on treating genuinely shared code as a
  shared seam rather than continuing to hand-copy it service by service.
  evidence: Adversarial review of story-1-11c (blind-hunter) diffed `services/people-service/src/modules/auth/`
  against `services/bff/src/modules/auth/` and found the port intentionally verbatim (per this
  story's own Code Map instruction), which is correct for a second consumer but becomes a real
  maintenance-drift risk (a fix applied to one copy silently missing the other) the moment a third
  consumer appears.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11c-verified-identity-propagation.md`
  summary: `UnavailableRelationshipPermissionAdapter.canChange()` rejects with
  `UnauthorizedException` (401) instead of `ForbiddenException` (403), even though
  `RelationshipPermissionPort`'s own contract expects a resolved `false` → 403 via
  `OrganisationalRelationshipsService.assertPermission`'s `if (!allowed)` branch. This mismatch
  was invisible before this story (every request already 401'd earlier, at `RequestActorContext`,
  before ever reaching the permission stub); now that a real, verified actor reaches the stub, a
  real client sees two different 401s — "not authenticated" vs. "not authorized" — distinguishable
  only by response message text, never by status code. Recommend Story 1.4 fix the stub (or its
  eventual real replacement) to reject with `ForbiddenException` instead, matching the documented
  port contract. Deliberately not fixed here: `spec-1-11c`'s own frozen "Never" boundary forbids
  touching `organisational-relationships.ports.ts`/`RequestActorContext` in this story.
  evidence: Adversarial review of story-1-11c (edge-case-hunter + verification-gap, independently)
  both flagged that `services/people-service/test/jwt-guard.e2e-spec.ts`'s own "valid token" test
  now asserts a `401` with a message-text distinction, not a `403`, for what the port's own
  interface contract documents as a permission (not authentication) failure.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11c-verified-identity-propagation.md`
  summary: The story-1-11b entry above ("Add a cross-realm 'wrong issuer' and 'wrong audience'
  test once a second Keycloak realm/client fixture exists") now also applies to
  `services/people-service/test/jwt-guard.e2e-spec.ts`, which has the identical gap: only one
  realm/client fixture, so a correctly-signed token from a genuinely different issuer or audience
  is unverified by any test that could fail, proven correct only by `JwtStrategy`'s own config.
  evidence: Adversarial review of story-1-11c (verification-gap) found the same gap already logged
  from story-1-11b's review now repeated verbatim in `people-service`'s own e2e suite; still
  disproportionate effort to fix now (needs a second realm fixture) relative to the current
  single-client reality, same reasoning as the original entry.

## Deferred from: code review of story-1-10 (2026-09-03)

- source_spec: `_bmad-output/implementation-artifacts/spec-1-10-custom-field-visibility-enforcement.md`
  summary: Add a `fieldType` column (`STRING`, `NUMBER`, `DATE`, `BOOLEAN`) to `CustomFieldDefinition` so values can be validated and coerced at write time and rendered correctly by the UI — currently `value` is a plain `String` with no schema-level type contract.
  evidence: Blind-hunter review of story-1-10 noted the field is missing; spec explicitly defers type coercion ("value is stored as a plain String — type coercion is not in scope for this story"). Zero blast radius today since no write UI exists, but the omission will force a migration that renames/changes `value`'s interpretation once a type-aware UI or export lands.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-10-custom-field-visibility-enforcement.md`
  summary: Add `createdAt` and `updatedAt` timestamp columns to both `CustomFieldDefinition` and `CustomFieldValue` models — currently neither table records when a definition was created/edited or when a person's field value was last written, which will be needed by any audit trail, export, or diff-view feature.
  evidence: Blind-hunter review of story-1-10 noted the omission; out of scope for this story's read-only visibility enforcement (no write path exists yet), but worth adding before the first admin CRUD story or timeline/audit feature touches these tables.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-10-custom-field-visibility-enforcement.md`
  summary: Add a `@@unique([name])` constraint on `CustomFieldDefinition` to prevent duplicate field names — currently two definitions with identical names can coexist, which would produce confusingly duplicated `name` values in the `s16` array and break any name-keyed lookup in filters or export columns.
  evidence: Blind-hunter review of story-1-10 found no uniqueness guarantee on `name`; deferred because no write path exists yet (definitions are seeded in tests only), but must be added before any admin CRUD endpoint for definitions, to avoid a data-integrity gap in production data.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-10-custom-field-visibility-enforcement.md`
  summary: The `CustomFieldValueRow` private type in `profile.service.ts` shapes how the Prisma select result is consumed; it should be the single authoritative definition shared by any Epic-2 surface (list engine, export) that also reads custom field values — currently each new consumer would need to duplicate or redeclare the same structure independently.
  evidence: Edge-case-hunter review of story-1-10 noted `CustomFieldValueRow` is unexported and module-private; not a functional issue for this story's scope (only `profile.service.ts` reads it today), but worth extracting before a second service or module starts building its own Prisma select for `customFieldValues`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-10-custom-field-visibility-enforcement.md`
  summary: The `add_custom_field_definition_value` migration has no explicit down-migration (`-- DropTable`, `-- DropEnum`). If a rollback is ever attempted via a manual revert, the enum type and its two dependent tables must be dropped in dependency order — currently only the `migrate reset`/`db push --force-reset` paths handle this automatically.
  evidence: Edge-case-hunter review of story-1-10 found no down-migration SQL; standard Prisma behavior (auto-generated migrations have no down script), but worth documenting before any shared-env rollback procedure assumes one exists.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-10-custom-field-visibility-enforcement.md`
  summary: An empty-string `value` (`''`) is stored and returned to all audiences without any validation — currently indistinguishable from "field not filled in" by a UI consumer. Decide whether empty-string should be treated as absent (filtered out of `s16`) or as a valid value, and add a `@IsNotEmpty()` or equivalent constraint on any future write path.
  evidence: Edge-case-hunter review of story-1-10 noted that `value: ''` passes all current filtering (isActive + canSeeCustomField) and would appear in the `s16` array; spec defers type coercion and write validation, so this is out of scope, but the current read path has no filtering for it either.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-10-custom-field-visibility-enforcement.md`
  summary: `parseSectionAccessGroup` in `profile.ports.ts` now parses an `s16` section from the access-control-service response (`parseSectionAccess(o['s16'])`), but `access-control-service` never returns an `s16` section — the parsed `s16SectionAccess` value is always `undefined` (defaults to `None`) and `ProfileService` never reads it. This dead parse line could mislead a future developer into thinking S16 gating lives in the section-level response shape when it does not.
  evidence: Verification-gap review of story-1-10 found this; the spec's Code Map entry for `profile.ports.ts` explicitly required parsing `s16`, keeping the interface symmetric with the section matrix, but the parsed value is genuinely unused at runtime. Remove or document once the design is stable.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-10-custom-field-visibility-enforcement.md`
  summary: The narrowed Project-line e2e test asserts that the viewer sees `s16` with management-level fields (because they qualify via `managerSectionAccess`, receiving `customFieldAudienceLevel: 'management'`), but the test does not explicitly assert the `isColleague: false` path that makes the distinction — a future reader could confuse "project-line viewer gets management-level S16" with "only full Reporting-line viewers get management S16."
  evidence: Verification-gap review of story-1-10 found this coverage gap; the existing narrowed-Project-line test (`it('Narrowed Project line...')`) already verifies the correct `s16` contents, but adding an inline comment or a dedicated `isColleague`-false assertion would make the intent unambiguous for a reader unfamiliar with the `resolveAudience` branching logic.

## Corrections

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-two-dimensional-access-role-resolution.md`
  summary: The earlier entry above titled "Wire real authentication/authorization ... and exception-handling middleware" (evidence citing `app.UseAuthorization()` called with no corresponding `AddAuthorization()`/`UseAuthentication()`) no longer reflects the current code and should be treated as resolved/moot, not actionable.
  evidence: A fresh-context code review of the merged scaffold (2026-08-31) found `Program.cs` has no `UseAuthorization()`/`UseAuthentication()` call at all (verified via grep, zero matches) — the auth wiring this entry's evidence described has since been removed or was never present in the version that shipped. The broader goal (wiring real authentication/authorization once domain endpoints exist) may still be valid future work, but the specific evidence backing that entry is stale; do not action it on the strength of that evidence alone without re-checking `Program.cs` first.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-9-project-line-narrowing-vs-reporting-line.md`
  summary: Three earlier entries above are resolved as of Story 1.9, not actionable: (1) the Story-1.1b entry "Add an HTTP endpoint exposing access-role resolution once a real consumer... needs to call it," (2) the ADR-002 entry whose evidence states "access-control-service currently exposes zero domain HTTP endpoints (`/api/v1/health` only)," and (3) the ADR-003 entry "Build the HTTP endpoint exposing `AccessRoleResolver`."
  evidence: Story 1.9 shipped `GET /api/v1/access-roles/resolve` (`AccessRolesController.cs`), a real DI-composed HTTP endpoint calling `AccessRoleResolver` then the new `ManagerSectionAccessPolicy`, proven end-to-end against a real, migrated Testcontainers Postgres in `AccessRoleResolverCompositionTests`. The trigger condition all three entries were waiting on — a concrete real consumer needing the resolver over HTTP — has been satisfied by this endpoint itself; do not re-build it on the strength of those entries' evidence, which now describes a state that no longer exists. (ADR-003's remaining, still-open sub-items under the same entry — the `projectRoles`/DM-vs-PM design question for Story 1.7, and the response-shape addendum now recorded directly in ADR-003 — are unaffected by this correction and remain real, open work.)

- source_spec: none
  summary: Build PP ("People Partner"/HR line) access-role resolution in `access-control-service` — a recursive walk of the PP's own manager chain inside HR, per `docs/access-control/section-matrix.md`'s PP column — and expose it alongside `AccessRole.ReportingLine`/`ProjectLine`.
  evidence: Split from Story 1.6's multi-goal intent at bmad-build's step-01 multi-goal check. No prior story (1.1's AC only covers Reporting/Project line) ever scoped PP resolution — it is a genuine, previously-unowned gap discovered while scoping Story 1.6's first spec, not a pre-existing tracked deferral. `docs/access-control/section-matrix.md`'s own "Test coverage note (Story 1.9)" already flags PP as "not started in substance." Story 1.6's first slice (`spec-1-6-server-assembled-section-gated-profile-response.md`) covers only Self/Reporting-line/Project-line/Colleague; a PP-audience slice needs this resolver first.

- source_spec: none
  summary: Extend the section-gated profile response to the Full-profile-access audience (RW-everywhere per the section matrix) once Story 1.5's grant/journal mechanism exists.
  evidence: Split from Story 1.6's multi-goal intent at the same step-01 multi-goal check as the entry above; Story 1.5 (`1-5-full-profile-access-as-a-separate-journaled-grant`) is `backlog` with no implementation on `main` — there is no way to determine "does this viewer hold Full profile access" yet.

- source_spec: none
  summary: Add the mentor field to the S1 profile header (Story 1.6 AC2/AC4) once a mentorship data model exists, and resolve Open Question 5 (whether mentor-in-header visibility follows the general S1 rule) with the spec owner.
  evidence: Split from Story 1.6's multi-goal intent at the same step-01 multi-goal check. S13/mentorship is Story 10.x (`epic-10`), `backlog` with no schema anywhere in `services/people-service/prisma/schema.prisma`. `_bmad-output/planning-artifacts/epics.md`'s own Story 1.6 text already flags AC4's premise as `[ASSUMPTION, see Open Question 5]`, unresolved.

- source_spec: none
  summary: Enforce Story 1.6 AC3 (reject manager/PP/department changes submitted through a normal S1 write) once a general S1 profile-write endpoint exists.
  evidence: Split from Story 1.6's multi-goal intent at the same step-01 multi-goal check. No general S1 write endpoint exists anywhere in `services/people-service` today — only Story 1.3's dedicated relationship-change endpoints. `spec-1-3-organisational-relationship-changes-as-a-dedicated-journaled.md`'s own "Out of scope" section already deferred this identical gap to "when the general profile-edit story lands" (Epic 2 Story 2.2, inline editing) — this entry restates the same blocker from Story 1.6's side so both specs point at the same open gap instead of two independent trackers.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-server-assembled-section-gated-profile-response.md`
  summary: The two earlier entries on `test/app.e2e-spec.ts` needing a real, already-running Postgres (from Story 1.11c's review and this story's own PR readiness check) are resolved, not actionable. `app.e2e-spec.ts` now boots its own ephemeral Testcontainers Postgres, mirroring `jwt-guard.e2e-spec.ts`/`profile.e2e-spec.ts`; `people-service-ci.yml` now sets `run_e2e: true`.
  evidence: All three e2e spec files verified passing together in one `test:e2e` invocation (13/13) with no dependency on `infra/docker-compose.yml`'s shared Postgres. `_reusable-node-ci.yml`'s `run_e2e` input comment updated to reflect the new self-contained state instead of naming `app.e2e-spec.ts` as the blocker. Enabling `run_e2e: true` surfaced a second, previously-latent bug in the same area: `test/jest-e2e-setup.ts` never seeded placeholder `DATABASE_URL`/`RABBITMQ_URL` values, so `AppModule`'s eager `ConfigModule.forRoot()` validation failed all 13 tests outright in CI's clean environment (no `.env` file) — local runs never caught this because a developer's own `.env` happened to already set both. Fixed in the same PR by adding both as explicit placeholders, same pattern as the existing `KEYCLOAK_*`/`ACCESS_CONTROL_SERVICE_BASE_URL` entries.

- source_spec: none
  summary: Systematic audit (2026-09-02) cross-referencing every open deferred-work.md entry against epics.md's full story list. Entries below are marked resolved because an existing story's own stated Acceptance Criteria already covers the work — "resolved" here means "no longer an orphan needing separate tracking," not necessarily "already built." Entries not listed here were checked and found genuinely unowned (mostly RabbitMQ resilience/observability, schema-constraint hardening, CI/test-infra hygiene, and Keycloak deployment-topology decisions — none of which any story's AC claims as its scope) and remain open.
  evidence: Full pass over all 94 entries against `_bmad-output/planning-artifacts/epics.md` (16 epics), `sprint-status.yaml`, and existing spec files' frontmatter `status`. Spot-checked the highest-stakes claims directly (Story 2.1 AC4's exact text, Story 1.5/1.6/1.7/1.11's AC text already read during this session) before writing the entries below.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11c-verified-identity-propagation.md`
  summary: "Propagate the BFF's verified identity to downstream domain services (Access Control, People/Organization, Work Management, Resourcing)... also establish trusted service-to-service identity" is partially ALREADY DONE and the remainder is COVERED, not open as originally scoped — `spec-1-11c` (status `done`) built exactly this for `people-service`. The remaining three services are already tracked by the consolidated entry above ("Add the same JWT-validation pattern... to access-control-service/work-management-service/resourcing-service"), itself COVERED by Story 1.11 AC4.
  evidence: `spec-1-11c-verified-identity-propagation.md` frontmatter `status: done`; its own Design Notes already name the three remaining services and defer them to the entry this one points at.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1b-access-role-resolution-engine.md`, `spec-1-1d-project-assignment-event-consumer.md`, `spec-1-1e-project-assignment-rabbitmq-wiring.md`, `spec-1-11b-bff-jwt-validation.md`
  summary: Four entries above ("Implement the access-role resolution engine... target filename spec-1-1b", "Implement the RabbitMQ project-assignment event contract... target filename spec-1-1d", "Implement the actual RabbitMQ.Client consumer/producer plumbing... target filename spec-1-1e", "Add JWT validation middleware/guard to the BFF... target filename spec-1-11b") are ALREADY DONE, not open — each named its own target spec filename as a forward pointer, and all four specs now exist with `status: done` in their frontmatter.
  evidence: Verified `spec-1-1b-access-role-resolution-engine.md`, `spec-1-1d-project-assignment-event-consumer.md`, `spec-1-1e-project-assignment-rabbitmq-wiring.md`, and `spec-1-11b-bff-jwt-validation.md` all exist and carry `status: done`.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1b-access-role-resolution-engine.md`
  summary: The "Optimize AccessRoleResolver's relationship checks... into single recursive/set-based queries" entry, and its addendum "the recursive-CTE optimization must also account for the sequential-per-instance constraint," are COVERED by Story 2.1, not unowned — Story 2.1's own AC4 is a hard release gate: "500+ employee records... including permission resolution... returns within 2 seconds (NFR-2/SM-4) — this is a hard release gate for this story, not an aspiration." The current per-hop-round-trip resolver cannot meet this at real scale without exactly this optimization.
  evidence: `_bmad-output/planning-artifacts/epics.md:936-939`, Story 2.1 ("Universal filter/column engine over profile fields") AC4, read verbatim.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1d-project-assignment-event-consumer.md`
  summary: The "Confirm whether ProjectAssignmentEventProcessor's synchronous per-event SaveChangesAsync design can meet the 15-minute/4-hour revocation guarantee" entry is partially COVERED — Story 14.3 ("FR-44 closing verification") explicitly requires proving "the same 15-minute/4-hour access guarantees hold end-to-end." The entry's second half (SchemaVersion forward/backward-compatibility story) is not addressed by any story's AC and remains genuinely unowned.
  evidence: Epic 14 Story 14.3's stated closing-verification scope in `epics.md`.

- source_spec: `docs/decisions/ADR-002-people-access-control-relationship-boundary.md`, `_bmad-output/implementation-artifacts/deferred-work.md` (Corrections)
  summary: Correcting a prior Correction: the Story-1.9 correction above ("Three earlier entries above are resolved as of Story 1.9") item (2) — "the ADR-002 entry whose evidence states 'access-control-service currently exposes zero domain HTTP endpoints'" — was matched to the ADR-002 entry by evidence-text overlap only, not by actual scope equivalence. That ADR-002 entry's real ask is "Build Story 1.4's real permission-check HTTP endpoint (e.g. `POST /api/v1/permissions/check`)" — a permission-check decision ("can this actor perform this action"), genuinely different from Story 1.9's shipped `GET /api/v1/access-roles/resolve` (an access-role-resolution decision, "what role does this viewer have"). This item is not resolved; it is COVERED by Story 1.4, per ADR-003's own text: "ADR-002 Decision 1 already specifies the one contract this story owes People/Organization (the permission-check endpoint)."
  evidence: Re-read `docs/decisions/ADR-002-people-access-control-relationship-boundary.md` Decision 1 and `docs/decisions/ADR-003-epic-1-remaining-story-dependencies.md`'s Story 1.4 status paragraph directly; confirmed via `services/access-control-service`'s current controllers that no `/api/v1/permissions/check`-shaped endpoint exists anywhere, only `/api/v1/access-roles/resolve` and `/api/v1/health`. Found during the 2026-09-02 systematic audit.

- source_spec: `docs/decisions/ADR-003-epic-1-remaining-story-dependencies.md`
  summary: "Decide whether the access-role-resolution endpoint should also expose which project-assignment role(s) (DM vs. PM) the viewer holds" is COVERED by Story 1.7, not an open, unowned design question — Story 1.7 AC4 explicitly requires distinguishing "a viewer who is specifically a PM (not simply Project line generally — a DM keeps full RW despite Project-line narrowing elsewhere)," which cannot be satisfied without resolving this exact question.
  evidence: `epics.md`, Story 1.7 ("S7 Management notes flag gating") AC4, read verbatim.

- source_spec: `docs/decisions/ADR-003-epic-1-remaining-story-dependencies.md`
  summary: "Add tests proving Story 1.2's Project-line access-role-un-derivation acceptance criterion" is COVERED — Story 1.2 AC3 already states this exact criterion ("Given a stubbed project-assignment-ended event... Then Project-line access derived solely from that assignment is absent from the next resolution"); the entry's own evidence confirms only test coverage is missing, not the AC itself.
  evidence: `epics.md`, Story 1.2 AC3, read verbatim (already quoted in the original deferred-work entry).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-access-role-un-derives-when-a-relationship-ends.md`
  summary: "Add a Department-management revoke test that changes a multi-level department-ancestor chain" is COVERED — Story 1.2 AC2 states the guarantee generally for "the subject's department chain changes such that the viewer no longer manages an ancestor," not only the direct hop-0 case the shipped test covers; the multi-hop scenario is within this AC's stated scope even though only test coverage is missing.
  evidence: `epics.md`, Story 1.2 AC2, read verbatim.

- source_spec: `_bmad-output/implementation-artifacts/sprint-status.yaml`
  summary: "Update 1-1-two-dimensional-access-role-resolution's status from review to done" is ALREADY DONE — current `sprint-status.yaml` shows `1-1-two-dimensional-access-role-resolution: done`.
  evidence: `_bmad-output/implementation-artifacts/sprint-status.yaml`, `development_status.1-1-two-dimensional-access-role-resolution: done`, checked directly.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-9-project-line-narrowing-vs-reporting-line.md`, `spec-1-11c-verified-identity-propagation.md`
  summary: "Decide and implement service-to-service authentication/authorization for access-control-service's domain HTTP endpoints" (from Story 1.9's review) and its consolidated restatement "Add the same JWT-validation pattern to access-control-service/work-management-service/resourcing-service" (from story-1-11c's review) are both COVERED, not unowned platform gaps — Story 1.11 AC4 already requires "a trusted service-to-service identity established by the platform" for exactly this kind of non-browser-originated, service-to-service call. The work remains unbuilt, but it already has a story-level home; it is not an orphan.
  evidence: Epic 1 context / Story 1.11's stated requirement (`_bmad-output/implementation-artifacts/epic-1-context.md`: "A background job or service-to-service call with no browser-originated request must still carry a trusted service-to-service identity, not an unauthenticated one"), read verbatim.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-11b-bff-jwt-validation.md`
  summary: "Add test coverage for a non-Bearer Authorization scheme and an empty Bearer value" is COVERED — Story 1.11 AC2 requires rejecting a bearer token that is "missing, expired, malformed, or signature/issuer-invalid... before reaching any domain service"; a non-Bearer scheme and an empty Bearer value are both concrete instances of "malformed/missing" this AC already commits to rejecting, so they belong under that AC's existing test obligations, not a separate untracked gap.
  evidence: Epic 1 context's restatement of Story 1.11 AC2, read verbatim.

- source_spec: none
  summary: "Build PP (People Partner/HR line) access-role resolution in access-control-service" is ALREADY DONE — `spec-1-6b-pp-access-role-resolution.md` exists, implements exactly this (a recursive walk of the PP's own manager chain, `AccessRole.PeoplePartnerLine`), and is merged to `main` (status `in-review` at merge time, all tests passing).
  evidence: `_bmad-output/implementation-artifacts/spec-1-6b-pp-access-role-resolution.md` exists with this exact scope; `services/access-control-service/src/AccessControlService.Domain/AccessRole.cs` has `PeoplePartnerLine`; merged via PR #31 on 2026-09-02.

- source_spec: none
  summary: "Extend the section-gated profile response to the Full-profile-access audience" is COVERED, not an orphan — Story 1.5 AC5 already states the exact requirement: "a Full-profile-access holder viewing any profile... gets RW on every section, matching the matrix's RW-everywhere row." The work is blocked on Story 1.5 landing first (still `backlog`, unimplemented), but it already has a story-level home.
  evidence: `epics.md`, Story 1.5 ("Full profile access as a separate, journaled grant") AC5, read verbatim.

- source_spec: none
  summary: "Add the mentor field to the S1 profile header once a mentorship data model exists" is COVERED — this is literally Story 1.6's own AC4 ("the mentor field is present — this assumption is flagged in the story so it's trivial to flip if the spec owner resolves Open Question 5 the other way"), carved off Story 1.6's first two slices (spec-1-6/spec-1-6b) for scope reasons, not a new orphan — it remains Story 1.6's own stated, not-yet-implemented AC.
  evidence: `epics.md`, Story 1.6 AC4, read verbatim (already quoted in the original deferred-work entry).

- source_spec: none
  summary: "Enforce Story 1.6 AC3 (reject manager/PP/department changes via a normal S1 write) once a general S1 profile-write endpoint exists" is COVERED — the rejection requirement is Story 1.6's own AC3; the missing write endpoint it must be enforced against is Story 2.2's ("Inline editing writes through to the profile, subject to access") already-defined scope. Both halves have a story-level home; neither is an orphan.
  evidence: `epics.md`, Story 1.6 AC3 and Story 2.2's title/scope, both read verbatim.

