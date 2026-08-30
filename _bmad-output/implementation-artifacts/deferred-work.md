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

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1b-access-role-resolution-engine.md`
  summary: Implement Project-line resolution (DM/PM via project-assignment) on top of Reporting-line resolution — the provider-neutral RabbitMQ project-assignment event contract, an idempotent/replay-safe/watermark-tracked consumer, a fake test producer, and extending AccessRoleResolver's output to a dual-line flags result (Reporting/Project/both/neither). Target filename when written: `spec-1-1c-project-line-resolution.md`.
  evidence: The combined Reporting-line + Project-line resolver spec estimated ~2,200 tokens, over the 1,600 target. Reporting-line resolution (EF Core domain model + fixture-seeded reports-to/department-management data + the 3-project restructure) is independently shippable/reviewable via fixture data alone, with no RabbitMQ plumbing required; Project-line resolution depends on new infrastructure (RabbitMQ client, event contract, stub producer) that is a distinct, larger concern, so it was deferred to a follow-up spec.

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
  summary: Optimize `AccessRoleResolver`'s reports-to/department-management walk from one DB round-trip per hop to a single recursive query (Postgres recursive CTE), before real org-scale data exists.
  evidence: Review noted the current N+1-style walk costs nothing against 7 fixture people/4 departments but risks the architecture spine's explicit p95<=2s/500+ employees permission-resolution performance gate (AD-7) once real organizational depth exists.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1b-access-role-resolution-engine.md`
  summary: Share one Testcontainers Postgres instance across `EfRelationshipRepositoryTests`' test methods (via a class/collection fixture) instead of starting a fresh container per `[Fact]`.
  evidence: Second review pass noted `IAsyncLifetime` is implemented directly on the test class, so xUnit's per-method instantiation spins up and tears down a new container for each of the ten test methods (~25s total); not blocking, but will keep growing linearly as more repository tests are added.
