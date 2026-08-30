# Access Control service

The policy and derived-relationship-projection engine per
[ARCHITECTURE-SPINE](../../_bmad-output/planning-artifacts/architecture/architecture-PeopleManagementSystem-2026-08-25/ARCHITECTURE-SPINE.md):
owns access-role resolution (Manager/People Partner/Full-profile-access, derived from
relationships), functional-role permission checks, and section/record/operation authorization
decisions. Distinct from `authentication-service`, which only handles authentication/identity —
this service never issues or validates tokens. No other service may hardcode a role-name check in
its place. This spec (1.1 part 1) only scaffolds the service skeleton — no domain logic, no
RabbitMQ consumer/producer, no calls into `people-service` yet; see
`_bmad-output/implementation-artifacts/deferred-work.md` for the resolution-engine follow-up.

## Tech Stack

- **Framework**: ASP.NET Core 8 Web API (controllers, not minimal-API-only)
- **Database**: PostgreSQL 18 via `infra/docker-compose.yml` (DB only; the app runs locally)
- **Config**: `Microsoft.Extensions.Configuration` (appsettings + environment variables) +
  `DotNetEnv` for local `.env` loading, with explicit fail-fast validation in
  `Configuration/AppConfig.cs` (see Gotchas)
- **Health checks**: `AspNetCore.HealthChecks.NpgSql` at `/api/v1/health`, real Postgres
  connectivity ping, JSON body via a custom `HealthCheckResponseWriter`
- **Docs**: Swagger/OpenAPI via `Swashbuckle.AspNetCore`, Development environment only
- **Tests**: xUnit — unit tests alongside their subject under `tests/AccessControlService.Api.Tests/`,
  plus a `WebApplicationFactory<Program>`-based integration test proving the composed pipeline

## Commands

- `dotnet build --configuration Release` — build (matches CI)
- `dotnet test` — unit + integration tests
- `dotnet run --project src/AccessControlService.Api` — run locally (needs Postgres up via
  `infra/docker-compose.yml` and a local `.env`, see Environment)

## Project Structure

- `AccessControlService.sln` — solution file at the service root (CI-glob-compatible)
- `src/AccessControlService.Api/Program.cs` — bootstrap: config validation, CORS, correlation-id
  middleware, health checks, controllers
- `src/AccessControlService.Api/Configuration/AppConfig.cs` — fail-fast startup config validation
  (`PORT`, `CORS_ORIGIN`, `ConnectionStrings:Postgres`)
- `src/AccessControlService.Api/Middleware/CorrelationIdMiddleware.cs` — `x-correlation-id`
  propagation
- `src/AccessControlService.Api/Health/HealthCheckResponseWriter.cs` — health-check JSON shape
  (`status`/`checks`/`totalDurationMs`)
- `tests/AccessControlService.Api.Tests/` — unit tests (config validation, correlation-id
  resolution) plus the `WebApplicationFactory<Program>` pipeline test

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
- **No Dockerfile yet** — this is a scaffold-only spec (1.1 part 1), so no container image is
  built for this service yet. Consequently, the reusable CI workflow's Docker build/save/upload-artifact
  steps in `.github/workflows/_reusable-dotnet-ci.yml` silently no-op for this service (gated on
  `if [ -f Dockerfile ]`), and no image artifact appears in CI's `_reusable-dotnet-ci.yml` run for
  this service until a Dockerfile is added.
