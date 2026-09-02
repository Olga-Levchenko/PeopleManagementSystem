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

## Corrections

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-two-dimensional-access-role-resolution.md`
  summary: The earlier entry above titled "Wire real authentication/authorization ... and exception-handling middleware" (evidence citing `app.UseAuthorization()` called with no corresponding `AddAuthorization()`/`UseAuthentication()`) no longer reflects the current code and should be treated as resolved/moot, not actionable.
  evidence: A fresh-context code review of the merged scaffold (2026-08-31) found `Program.cs` has no `UseAuthorization()`/`UseAuthentication()` call at all (verified via grep, zero matches) — the auth wiring this entry's evidence described has since been removed or was never present in the version that shipped. The broader goal (wiring real authentication/authorization once domain endpoints exist) may still be valid future work, but the specific evidence backing that entry is stale; do not action it on the strength of that evidence alone without re-checking `Program.cs` first.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-9-project-line-narrowing-vs-reporting-line.md`
  summary: Three earlier entries above are resolved as of Story 1.9, not actionable: (1) the Story-1.1b entry "Add an HTTP endpoint exposing access-role resolution once a real consumer... needs to call it," (2) the ADR-002 entry whose evidence states "access-control-service currently exposes zero domain HTTP endpoints (`/api/v1/health` only)," and (3) the ADR-003 entry "Build the HTTP endpoint exposing `AccessRoleResolver`."
  evidence: Story 1.9 shipped `GET /api/v1/access-roles/resolve` (`AccessRolesController.cs`), a real DI-composed HTTP endpoint calling `AccessRoleResolver` then the new `ManagerSectionAccessPolicy`, proven end-to-end against a real, migrated Testcontainers Postgres in `AccessRoleResolverCompositionTests`. The trigger condition all three entries were waiting on — a concrete real consumer needing the resolver over HTTP — has been satisfied by this endpoint itself; do not re-build it on the strength of those entries' evidence, which now describes a state that no longer exists. (ADR-003's remaining, still-open sub-items under the same entry — the `projectRoles`/DM-vs-PM design question for Story 1.7, and the response-shape addendum now recorded directly in ADR-003 — are unaffected by this correction and remain real, open work.)
