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
`ProjectAssignment` row accordingly. It has zero messaging-transport dependency — no
`RabbitMQ.Client` reference anywhere in this service yet; the real broker wiring that calls
`ProcessAsync` is a separate, deferred spec (`spec-1-1e`). See
`_bmad-output/implementation-artifacts/deferred-work.md` for what's still carved off (concurrency
protection around the watermark read-then-write, a DB-failure-specific outcome for `spec-1-1e` to
key ack/nack off, whether one person can hold both DM and PM on the same project, and the missing
`Project`-table/id validation). Precedence between qualifying lines, revocation, and the
section-gated HTTP response are not deferred-work carve-offs — they're already-planned Epic 1
stories (1.9, 1.2, and 1.6 respectively), tracked in `_bmad-output/planning-artifacts/epics.md` and
`_bmad-output/implementation-artifacts/sprint-status.yaml`.

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
    real-socket test (`RealServerBindingTests`)
  - `tests/AccessControlService.Domain.Tests/` — `AccessRoleResolver` unit tests against a
    hand-written fake `IRelationshipRepository` (no EF Core, no database)
  - `tests/AccessControlService.Infrastructure.Tests/` — `EfRelationshipRepository` integration
    tests against a real, ephemeral Postgres started via `Testcontainers.PostgreSql` (requires
    Docker), with the actual EF Core migration applied — the only tests that exercise real EF Core
    query translation and prove the fixture seed data is actually queryable. Also
    `ProjectAssignmentEventProcessorTests` (same Testcontainers pattern) covering every I/O-matrix
    scenario plus the cross-aggregate-conflict/validation cases, and a container-free
    `ProjectAssignmentEventProcessorSignatureTests` asserting the processor's constructor only takes
    `AccessControlDbContext`/`ILogger<T>`

## Commands

- `dotnet build --configuration Release` — build (matches CI)
- `dotnet test` — unit + integration tests (the Infrastructure test project needs Docker running
  locally to start its ephemeral Postgres container)
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
  `AccessRole.cs` (result type — `ReportingLine` and `ProjectLine`, two independent flags, never
  collapsed), `IRelationshipRepository.cs` (the port Infrastructure implements),
  `AccessRoleResolver.cs` (the transitive reports-to/department-management walk with a bounded
  cycle guard, plus the direct, non-transitive project-assignment intersection check)
- `src/AccessControlService.Infrastructure/Persistence/` — `AccessControlDbContext.cs` (EF Core,
  Npgsql provider), `Person.cs`/`Department.cs`/`ProjectAssignment.cs`/`ProjectAssignmentRole.cs`
  (fixture-only entities, stubbed pending a real synced relationship/project-assignment projection
  from `people-service`/the timetracker integration — see deferred-work.md),
  `ProjectAssignmentEventWatermark.cs` (per-aggregate last-applied-version/event-id, plus the
  `(ProjectId, PersonId)` pair that aggregate currently owns — see Messaging below),
  `EfRelationshipRepository.cs` (the `IRelationshipRepository` implementation),
  `FixtureSeedData.cs` (the seed data shared between the migration's `HasData` and the
  Infrastructure integration tests), `Migrations/` (EF Core migrations)
- `src/AccessControlService.Infrastructure/Messaging/` — `ProjectAssignmentChangedEvent.cs` (the
  provider-neutral event contract) and `ProjectAssignmentEventProcessor.cs` (the pure decision
  logic: watermark check, cross-aggregate-conflict check, validation, upsert/remove) plus its
  `ProjectAssignmentEventOutcome` result enum. No RabbitMQ/messaging-transport package reference
  anywhere in this project — see `spec-1-1d-project-assignment-event-consumer.md`
- `src/AccessControlService.Api/Program.cs` — bootstrap: config validation, CORS, correlation-id
  middleware, health checks, controllers, and the composition-root wiring of
  `AccessControlDbContext`/`EfRelationshipRepository`/`AccessRoleResolver` into DI (no HTTP
  endpoint calls the resolver yet — deferred until a real consumer exists)
- `src/AccessControlService.Api/Configuration/AppConfig.cs` — fail-fast startup config validation
  (`PORT`, `CORS_ORIGIN`, `ConnectionStrings:Postgres`)
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
- Local Postgres comes from the shared `infra/docker-compose.yml`, not a per-service compose file
- Required at startup, fail-fast if missing/blank: `PORT`, `CORS_ORIGIN`,
  `ConnectionStrings:Postgres` (set via the `ConnectionStrings__Postgres` env var — ASP.NET Core's
  double-underscore convention for nested config keys)

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
  manager/department"** — `EfRelationshipRepository`'s four lookup methods return `null` for both
  an id that matches no seeded row and a known row whose FK column is legitimately null. This fails
  in the safe (access-denying) direction and has zero blast radius today (no real HTTP consumer
  passes unsynced ids yet), but it's a tracked, deliberate gap, not an oversight — a real decision
  (throw, log, or another signal) is needed before any consumer is wired up, since a data-sync gap
  could otherwise masquerade indefinitely as "correctly no access." See deferred-work.md.
