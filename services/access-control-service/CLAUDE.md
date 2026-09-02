# Access Control service

The policy and derived-relationship-projection engine per
[ARCHITECTURE-SPINE](../../_bmad-output/planning-artifacts/architecture/architecture-PeopleManagementSystem-2026-08-25/ARCHITECTURE-SPINE.md):
owns access-role resolution (Manager/People Partner/Full-profile-access, derived from
relationships), functional-role permission checks, and section/record/operation authorization
decisions. Distinct from `authentication-service`, which only handles authentication/identity —
this service never issues or validates tokens. No other service may hardcode a role-name check in
its place.

Story 1.1 part 1 scaffolded the service skeleton (no domain logic). Story 1.1 part 2
(`spec-1-1b-access-role-resolution-engine.md`) added the first domain logic: Reporting-line access
role resolution (transitive reports-to + department-management) via a three-project
Domain/Infrastructure/Api split (hexagonal internals, AD-1), backed by an EF Core domain model and
fixture-seeded test data — no RabbitMQ consumer/producer, no calls into `people-service`, and no
HTTP endpoint exposing the resolver yet. Story 1.1 part 2b (`spec-1-1c-project-line-resolution.md`)
added Project-line access role resolution alongside it: `AccessRole.ProjectLine`, an independent
flag from `ReportingLine` — a viewer qualifies for Project-line when they're DM or PM (direct,
non-transitive check) on a project the subject is assigned to, resolved from a fixture-seeded
`ProjectAssignment` EF Core entity in this service's own schema, same pattern as `Person`/
`Department`. Story 1.1 part 2d (`spec-1-1d-project-assignment-event-consumer.md`) added the
decision logic that actually populates that table from an event: a provider-neutral
`ProjectAssignmentChangedEvent` contract (event id, aggregate id + version, occurred-at, schema
version, grant/revoke flag, project id, person id, role — ADR-001/AD-11) and a pure
`ProjectAssignmentEventProcessor` that checks a per-aggregate watermark (idempotent/replay-safe,
`<=` version comparison), rejects a cross-aggregate conflict on the same `(ProjectId, PersonId)`
pair before ever mutating a row, validates schema version/role/id shape, and upserts/removes the
`ProjectAssignment` row accordingly — including a `RejectedPersistenceFailure` outcome for a
`DbUpdateException` from the final `SaveChangesAsync`. Story 1.1 part 2e
(`spec-1-1e-project-assignment-rabbitmq-wiring.md`) added the real `RabbitMQ.Client` wiring that
calls `ProcessAsync`: `ProjectAssignmentEventConsumer` (a `BackgroundService` that connects,
declares its own quorum queue plus a dead-letter queue/exchange, creates one DI scope per message,
and maps every `ProjectAssignmentEventOutcome` — plus a malformed body and any other exception
escaping `ProcessAsync` itself — to ack/reject accordingly) and `FakeProjectAssignmentEventProducer`
(test-only, publishes to the same queue/contract a real producer would). See
`_bmad-output/implementation-artifacts/deferred-work.md` for what's still carved off (concurrency
protection around the watermark read-then-write, whether one person can hold both DM and PM on the
same project, and the missing `Project`-table/id validation). Story 1.9
(`spec-1-9-project-line-narrowing-vs-reporting-line.md`) added the first HTTP endpoint exposing
`AccessRoleResolver` (per ADR-003's recommended shape) — `GET /api/v1/access-roles/resolve` — plus
a new, pure `ManagerSectionAccessPolicy` that maps a resolved `AccessRole` to the Manager
audience's per-section (S1–S16) access, resolving the section-matrix's former "most-permissive-
path-wins" open question: whenever `ReportingLine` qualifies, every section (including S2/S3/S5)
gets the unnarrowed Reporting-line view regardless of `ProjectLine`; only a viewer who qualifies
via `ProjectLine` alone gets S2/S3 dropped to `None` and S5 narrowed to Read/CV+certificates-only.
Revocation and the full section-gated *profile* response (real field data) are not deferred-work
carve-offs — they're already-planned Epic 1 stories (1.2 and 1.6 respectively), tracked in
`_bmad-output/planning-artifacts/epics.md` and
`_bmad-output/implementation-artifacts/sprint-status.yaml`. Story 1.6b
(`spec-1-6b-pp-access-role-resolution.md`) added `AccessRole.PeoplePartnerLine`: true when the
viewer is the subject's assigned people partner, OR is transitively above that PP in the PP's own
reports-to chain (the "HR line" — the PP's manager chain, never the subject's) — resolved
unconditionally and independently of `ReportingLine`/`ProjectLine`. It reuses
`AccessRoleResolver`'s existing transitive reports-to walk (generalized to accept any starting
person id, not just the subject) rather than a second copy, and a new
`IRelationshipRepository.GetPeoplePartnerIdAsync`/`Person.PeoplePartnerId` column
(`AddPeoplePartnerToPerson` migration) backs it. `GET /api/v1/access-roles/resolve` now also
returns `peoplePartnerLine`/`peoplePartnerSectionAccess`, the latter computed by
`ManagerSectionAccessPolicy.ResolveForPeoplePartner()` — PP matches the unnarrowed Reporting-line
view for most sections but is ReadWrite on S2/S3/S5 (Reporting-line is only Read there even
unnarrowed), so this is a dedicated mapping, not a reuse of `Resolve` with a synthetic role — an
earlier draft of spec-1-6b assumed the two were cell-for-cell identical; they aren't, per the
section matrix's PP column, corrected during that spec's review.

## Tech Stack

- **Framework**: ASP.NET Core 8 Web API (controllers, not minimal-API-only)
- **Database**: PostgreSQL 18 via `infra/docker-compose.yml` (DB only; the app runs locally)
- **Domain model / ORM**: EF Core via `Npgsql.EntityFrameworkCore.PostgreSQL`, in
  `AccessControlService.Infrastructure` only — `AccessControlService.Domain` has zero external
  package references (pure logic, hexagonal boundary per AD-1)
- **Config**: `Microsoft.Extensions.Configuration` (appsettings + environment variables) +
  `DotNetEnv` for local `.env` loading, with explicit fail-fast validation in
  `Configuration/AppConfig.cs` (see Gotchas)
- **Health checks**: `AspNetCore.HealthChecks.NpgSql` at `/api/v1/health`, real Postgres
  connectivity ping, JSON body via a custom `HealthCheckResponseWriter`
- **Docs**: Swagger/OpenAPI via `Swashbuckle.AspNetCore`, Development environment only
- **Tests**: xUnit throughout —
  - `tests/AccessControlService.Api.Tests/` — unit tests (config validation, correlation-id
    resolution) plus a `WebApplicationFactory<Program>` pipeline test and a real-subprocess
    real-socket test (`RealServerBindingTests`); `AccessRoleResolverCompositionTests` also covers
    Story 1.9's real, DI-composed, migrated-Postgres HTTP tests for
    `GET /api/v1/access-roles/resolve` — Reporting-line-only, Project-line-only (narrowed),
    both-lines-qualify (most-permissive-path-wins), neither-line-qualifies (`null`
    `managerSectionAccess`), and the missing/invalid-`Guid`-query-param 400 cases, plus
    (spec-1-6b) `peoplePartnerLine`/`peoplePartnerSectionAccess` cases: direct-PP-match,
    transitive-HR-line-match, isolation from Reporting-line, and subject-has-no-PP
  - `tests/AccessControlService.Domain.Tests/` — `AccessRoleResolver` unit tests against a
    hand-written fake `IRelationshipRepository` (no EF Core, no database), including spec-1-6b's
    PP-line/HR-line I/O-matrix cases (`FakeRelationshipRepository.SetPeoplePartner`);
    `ManagerSectionAccessPolicyTests` covers all 16 sections for the narrowed (Project-line-only),
    unnarrowed (Reporting-line-only), and combined-lines cases
  - `tests/AccessControlService.Infrastructure.Tests/` — `EfRelationshipRepository` integration
    tests against a real, ephemeral Postgres started via `Testcontainers.PostgreSql` (requires
    Docker), with the actual EF Core migration applied — the only tests that exercise real EF Core
    query translation and prove the fixture seed data is actually queryable, including
    `GetPeoplePartnerIdAsync` (spec-1-6b). Also
    `ProjectAssignmentEventProcessorTests` (same Testcontainers pattern) covering every I/O-matrix
    scenario plus the cross-aggregate-conflict/validation cases, a container-free
    `ProjectAssignmentEventProcessorSignatureTests` asserting the processor's constructor only takes
    `AccessControlDbContext`/`ILogger<T>`, and `ProjectAssignmentEventConsumerTests` (adds
    `Testcontainers.RabbitMq` alongside `Testcontainers.PostgreSql`) proving the real consumer
    end-to-end: a valid grant applied, a malformed body dead-lettered, a persistence failure
    retried past the bounded limit and dead-lettered, and — the review-loopback amendment's
    scenario — an exception escaping `ProcessAsync` itself rejected without permanently stalling a
    subsequent, unrelated message under `prefetchCount: 1`

## Commands

- `dotnet build --configuration Release` — build (matches CI)
- `dotnet test --configuration Release` — unit + integration tests, Release configuration (matches
  CI, which runs `dotnet build --configuration Release` then `dotnet test --no-build --configuration
  Release`; the Infrastructure test project needs Docker running locally to start its ephemeral
  Postgres container)
- `dotnet run --project src/AccessControlService.Api` — run locally (needs Postgres up via
  `infra/docker-compose.yml` and a local `.env`, see Environment)
- `dotnet tool restore` — one-time, restores the `dotnet-ef` CLI pinned in
  `.config/dotnet-tools.json`
- `dotnet ef database update --project src/AccessControlService.Infrastructure --startup-project src/AccessControlService.Api`
  — applies migrations to the local dev Postgres (never run automatically at startup, by design —
  see Gotchas)
- `dotnet ef migrations add <Name> --project src/AccessControlService.Infrastructure --startup-project src/AccessControlService.Api --output-dir Persistence/Migrations`
  — adds a new migration after a model change

## Project Structure

- `AccessControlService.sln` — solution file at the service root (CI-glob-compatible)
- `src/AccessControlService.Domain/` — pure resolution logic, zero external dependencies:
  `AccessRole.cs` (result type — `ReportingLine`, `ProjectLine`, and `PeoplePartnerLine` (spec-1-6b),
  three independent flags, never collapsed), `IRelationshipRepository.cs` (the port Infrastructure
  implements, including `GetPeoplePartnerIdAsync`), `AccessRoleResolver.cs` (the transitive
  reports-to/department-management walk with a bounded cycle guard — its private
  `IsTransitiveManagerAsync` is generalized over its starting person id so the same walk resolves
  both Reporting-line and the PP's own "HR line" — plus the direct, non-transitive
  project-assignment intersection check), `ManagerSectionAccessPolicy.cs` (Story 1.9:
  `SectionAccessLevel` enum — `None`/`Read`/`ReadWrite` — plus `SectionAccess`/`ManagerSectionAccess`
  records and `ManagerSectionAccessPolicy.Resolve(AccessRole)`, the pure most-permissive-path-wins
  mapping from a resolved `AccessRole` to the Manager audience's 16 named section properties,
  S1–S16; spec-1-6b reuses this same method with a synthetic `AccessRole { ReportingLine = true }`
  for the PP audience rather than adding a second mapping)
- `src/AccessControlService.Infrastructure/Persistence/` — `AccessControlDbContext.cs` (EF Core,
  Npgsql provider), `Person.cs`/`Department.cs`/`ProjectAssignment.cs`/`ProjectAssignmentRole.cs`
  (fixture-only entities, stubbed pending a real synced relationship/project-assignment projection
  from `people-service`/the timetracker integration — see deferred-work.md; `Person.PeoplePartnerId`
  added by spec-1-6b's `AddPeoplePartnerToPerson` migration),
  `ProjectAssignmentEventWatermark.cs` (per-aggregate last-applied-version/event-id, plus the
  `(ProjectId, PersonId)` pair that aggregate currently owns — see Messaging below),
  `EfRelationshipRepository.cs` (the `IRelationshipRepository` implementation),
  `FixtureSeedData.cs` (the seed data shared between the migration's `HasData` and the
  Infrastructure integration tests), `Migrations/` (EF Core migrations)
- `src/AccessControlService.Infrastructure/Messaging/` — `ProjectAssignmentChangedEvent.cs` (the
  provider-neutral event contract) and `ProjectAssignmentEventProcessor.cs` (the pure decision
  logic: watermark check, cross-aggregate-conflict check, validation, upsert/remove) plus its
  `ProjectAssignmentEventOutcome` result enum (see `spec-1-1d-project-assignment-event-consumer.md`).
  `ProjectAssignmentEventConsumer.cs` (the real `RabbitMQ.Client` `BackgroundService`: connects with
  `AutomaticRecoveryEnabled = false` since it owns its own manual reconnect loop, declares a quorum
  queue with `x-delivery-limit` plus a dead-letter queue/exchange, creates one DI scope per message,
  and maps outcomes to `basic.ack`/`basic.reject` — including a catch-all for any exception escaping
  `ProcessAsync` itself, tagging dead-lettered messages with an `x-dead-letter-reason` header),
  `FakeProjectAssignmentEventProducer.cs` (test-only producer publishing to the same queue/contract),
  and `RabbitMqConnectionOptions.cs` (plain connection-settings holder, mapped from `AppConfig` in
  `Program.cs` — Infrastructure has no dependency on the Api project's own config type) — see
  `spec-1-1e-project-assignment-rabbitmq-wiring.md`
- `src/AccessControlService.Api/Program.cs` — bootstrap: config validation, CORS, correlation-id
  middleware, health checks, controllers, the composition-root wiring of
  `AccessControlDbContext`/`EfRelationshipRepository`/`AccessRoleResolver` into DI, and
  registration of `ProjectAssignmentEventConsumer` as a hosted service
- `src/AccessControlService.Api/Controllers/AccessRolesController.cs` — Story 1.9:
  `GET /api/v1/access-roles/resolve?viewerPersonId={guid}&subjectPersonId={guid}`, a thin wrapper
  calling `AccessRoleResolver` then `ManagerSectionAccessPolicy` and mapping both to response DTOs
  (`AccessRoleResolveResponse`/`ManagerSectionAccessResponse`/`SectionAccessResponse`, this file
  only — Domain stays free of JSON attributes per AD-1). `managerSectionAccess` is `null` in the
  response whenever neither `reportingLine` nor `projectLine` qualifies. `SectionAccessLevel` is
  rendered as a PascalCase string (`Level.ToString()`), matching
  `HealthCheckResponseWriter`'s existing `report.Status.ToString()` convention. A missing/invalid
  `Guid` query parameter falls through to ASP.NET Core's own `[ApiController]` model-validation
  400, with no custom handling needed. Spec-1-6b added `peoplePartnerLine`/
  `peoplePartnerSectionAccess` alongside the above — the latter `null` whenever
  `peoplePartnerLine` is `false`, computed via the same `ManagerSectionAccessResponse` shape reused
  for the PP audience.
- `src/AccessControlService.Api/Configuration/AppConfig.cs` — fail-fast startup config validation
  (`PORT`, `CORS_ORIGIN`, `ConnectionStrings:Postgres`, `RABBITMQ_HOST`/`RABBITMQ_PORT`/
  `RABBITMQ_USER`/`RABBITMQ_PASSWORD` — values only, not actual broker reachability, so the app
  still boots fine with RabbitMQ down, same contract as Postgres)
- `src/AccessControlService.Api/Middleware/CorrelationIdMiddleware.cs` — `x-correlation-id`
  propagation
- `src/AccessControlService.Api/Health/HealthCheckResponseWriter.cs` — health-check JSON shape
  (`status`/`checks`/`totalDurationMs`)
- `.config/dotnet-tools.json` — local tool manifest pinning `dotnet-ef`
- `tests/AccessControlService.Api.Tests/`, `tests/AccessControlService.Domain.Tests/`,
  `tests/AccessControlService.Infrastructure.Tests/` — see Tech Stack above for what each covers

## Code Style

- All code comments in English
- Nullable reference types are ON (`<Nullable>enable</Nullable>`) — do not suppress with `!` where
  a real null check is possible
- No `process.env`-equivalent (`Environment.GetEnvironmentVariable`) in application code outside
  `Program.cs`'s own bootstrap — everything else reads through `IConfiguration`/`AppConfig`
- Routes are explicitly versioned (`/api/v1/...`) — there is no automatic URI-versioning convention
  in ASP.NET Core the way NestJS provides it, so new controllers must declare the prefix themselves

## Environment

- App port **3007** (`PORT`); CORS is open for `http://localhost:4200` (the React frontend, via
  the BFF in practice — this service is not meant to be called directly from the browser)
- `.env` is gitignored; `.env.example` is the committed template — loaded via `DotNetEnv` at
  startup, but never overrides a variable already set in the process environment (CI/test-injected
  env vars always win, and a missing `.env` file is a no-op, not a startup failure)
- Local Postgres and RabbitMQ both come from the shared `infra/docker-compose.yml`, not a
  per-service compose file
- Required at startup, fail-fast if missing/blank: `PORT`, `CORS_ORIGIN`,
  `ConnectionStrings:Postgres` (set via the `ConnectionStrings__Postgres` env var — ASP.NET Core's
  double-underscore convention for nested config keys), and `RABBITMQ_HOST`/`RABBITMQ_PORT`/
  `RABBITMQ_USER`/`RABBITMQ_PASSWORD` (same guest/guest defaults `infra/docker-compose.yml`'s own
  RabbitMQ container falls back to)

## Gotchas

- **Config validation is stricter than `??`** — `AppConfig.Load` rejects `null`, empty, and
  whitespace-only values alike (an earlier draft only guarded `null`, which silently let
  `appsettings.json`'s own `"Postgres": ""` default through). A non-numeric `PORT` fails fast with
  a clear exception, not a raw `FormatException`.
- **Correlation id edge cases**: a blank/whitespace-only `x-correlation-id` header is treated as
  absent (a new id is generated, the blank value is never echoed); when the header repeats, the
  first non-empty value is used, never comma-joined.
- **`global.json` pins the SDK to `8.0.x`** — this machine has multiple .NET SDKs installed; without
  it, `dotnet` commands here would silently pick up a newer SDK than CI's `actions/setup-dotnet
  8.0.x`.
- Manual health check path is `/api/v1/health`, not `/health` — the route is explicitly mapped in
  `Program.cs`, there is no NestJS-style automatic version prefix in ASP.NET Core.
- **`ProjectAssignmentEventConsumer` reconnects itself; RabbitMQ.Client's own automatic recovery is
  explicitly off** — `AutomaticRecoveryEnabled = false` on the `ConnectionFactory`, since the
  consumer already retries connect/declare/consume with a fixed 5s backoff on any failure
  (including RabbitMQ being unreachable at startup, mirroring the Postgres "boots fine when down"
  contract). Leaving the client default on would risk it silently recovering the same
  connection/topology underneath this hand-rolled loop.
- **No Dockerfile yet** — no container image is built for this service yet. Consequently, the
  reusable CI workflow's Docker build/save/upload-artifact steps in
  `.github/workflows/_reusable-dotnet-ci.yml` silently no-op for this service (gated on
  `if [ -f Dockerfile ]`), and no image artifact appears in CI's `_reusable-dotnet-ci.yml` run for
  this service until a Dockerfile is added.
- **No auto-migrate at startup, deliberately** — `Program.cs` registers `AccessControlDbContext`
  but never calls `Database.Migrate()`/`EnsureCreated()`. This preserves the existing "boots fine
  with Postgres down" contract `RealServerBindingTests`/`HealthEndpointTests` rely on (the health
  check reports Unhealthy, the app doesn't crash). Apply migrations explicitly — see Commands.
- **An unknown person/department id is indistinguishable from "genuinely has no
  manager/department/PP"** — `EfRelationshipRepository`'s scalar lookup methods (including
  spec-1-6b's `GetPeoplePartnerIdAsync`) return `null` for both an id that matches no seeded row
  and a known row whose FK column is legitimately null. This fails
  in the safe (access-denying) direction. **No longer purely theoretical as of Story 1.9**: `GET
  /api/v1/access-roles/resolve` is now a real HTTP consumer that accepts arbitrary
  `viewerPersonId`/`subjectPersonId` values from any caller, including ids that don't correspond to
  any seeded/synced person — it silently resolves to `AccessRole.None` rather than distinguishing
  "not a real person" from "no relationship." The underlying decision (throw, log, or another
  signal) is still deliberately deferred, not resolved by this story — see deferred-work.md — but
  the gap now has a concrete, reachable caller instead of a hypothetical one.
