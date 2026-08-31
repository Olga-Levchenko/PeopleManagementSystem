---
title: 'Story 1.1 (part 1): Scaffold access-control-service'
type: 'chore'
created: '2026-08-30'
status: 'done'
review_loop_iteration: 1
baseline_commit: '3e82fee409f90d4d3dd12d96cf1ec57b2950b77f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<!-- Split from the original combined spec (~2,200-2,300 tokens) — see deferred-work.md for the
     resolution-engine logic deferred to a follow-up spec. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `services/access-control-service` doesn't exist yet — just a `.gitkeep` placeholder —
and no .NET service exists anywhere in this repo yet, so there's no sibling to copy conventions
from. Story 1.1's resolution engine (deferred to a follow-up spec) needs somewhere to live first.

**Approach:** Stand up `access-control-service` as an empty, runnable .NET 8 Web API that mirrors
the existing Node services' conventions in .NET idiom: a `/health` endpoint that pings Postgres,
correlation-id propagation, a `CLAUDE.md` following the standard heading order, and its own Postgres
database. No domain logic yet — this spec only proves the skeleton builds, runs, and passes CI.

## Boundaries & Constraints

**Always:**
- Follow existing per-service conventions in .NET idiom: `/health` endpoint pinging Postgres,
  correlation-id middleware (read `x-correlation-id`, generate if absent, echo on response, log
  method/url/id), `.env.example` + config validation, `CLAUDE.md` with the standard heading order
  (Tech Stack, Commands, Project Structure, Code Style, Environment, Gotchas).
- Add `access_control_service` to `infra/postgres-init/01-create-databases.sh`.
- `.github/workflows/access-control-service-ci.yml` already exists and calls
  `_reusable-dotnet-ci.yml` (.NET 8.0.x) — it currently no-ops (no `.csproj`/`.sln` found) and will
  activate automatically once this spec adds one. Do not edit the workflow files themselves.

**Ask First:** none identified.

**Never:**
- No access-role resolution logic, no domain entities, no RabbitMQ consumer/producer — deferred to
  the follow-up spec (see `deferred-work.md`).
- No Dockerfile/containerization — optional per CI, out of scope here.
- No calls into `people-service` or any other domain service.

</frozen-after-approval>

## Code Map

- `services/access-control-service/.gitkeep` -- placeholder to replace with the new project
- `services/people-service/src/modules/health/health.controller.ts` -- health-check pattern (DB
  ping via `@nestjs/terminus`) to mirror in .NET idiom
- `services/people-service/src/common/middleware/correlation-id.middleware.ts` -- correlation-id
  pattern to mirror: read `x-correlation-id`, generate `randomUUID()` if absent, echo on response,
  log `METHOD url [id]`
- `services/people-service/CLAUDE.md`, `services/bff/CLAUDE.md` -- fixed heading order to replicate
  (Tech Stack, Commands, Project Structure, Code Style, Environment, Gotchas)
- `services/people-service/.env.example` -- env var shape reference (PORT, DB connection, CORS)
- `.github/workflows/access-control-service-ci.yml` -- already wired to `_reusable-dotnet-ci.yml`;
  do not edit, just make it stop no-op-ing by adding a `.csproj`/`.sln`
- `infra/docker-compose.yml` -- Postgres 18 connection details (host/port/credentials); services
  aren't containerized in compose themselves, only shared infra runs there
- `infra/postgres-init/01-create-databases.sh` -- add `access_control_service` to the DB list

## Tasks & Acceptance

**Execution:**
- [x] `services/access-control-service/AccessControlService.sln` + `src/AccessControlService.Api/AccessControlService.Api.csproj` -- scaffold ASP.NET Core Web API (.NET 8) -- gives CI something to build
- [x] `services/access-control-service/src/AccessControlService.Api/Program.cs` -- wire `/health` (Postgres connectivity check) + correlation-id middleware, validating PORT/CORS_ORIGIN/ConnectionStrings:Postgres as present AND non-blank, with PORT parsed explicitly -- convention parity with Node services, and a real fail-fast (see Acceptance Criteria)
- [x] `services/access-control-service/src/AccessControlService.Api/Middleware/CorrelationIdMiddleware.cs` -- treat a blank/whitespace-only incoming header as absent, and take the first non-empty value when the header repeats -- correlation id must never be blank or a comma-joined malformed value
- [x] `services/access-control-service/.env.example`, `appsettings.json` -- Postgres connection vars -- environment convention parity
- [x] `services/access-control-service/CLAUDE.md` -- standard heading order -- per-service doc convention
- [x] `services/access-control-service/tests/AccessControlService.Api.Tests/*` -- a `WebApplicationFactory<Program>`-based integration test alongside the existing correlation-id unit tests -- proves the composed pipeline, not just isolated classes
- [x] `infra/postgres-init/01-create-databases.sh` -- add `access_control_service` -- new service's own Postgres database

**Acceptance Criteria:**
- Given a fresh checkout with `infra/docker-compose.yml` running, when `access-control-service` starts locally, then `/api/v1/health` returns a healthy response reflecting real Postgres connectivity (not a hardcoded 200)
- Given `_reusable-dotnet-ci.yml` runs after this spec lands, when it processes `access-control-service`, then it finds a `.csproj`/`.sln` (no longer skips) and `dotnet build`/`dotnet test` both pass, even with zero domain tests
- Given a request with no `x-correlation-id` header, when it hits any endpoint, then the response includes a generated correlation id and the server log line includes it
- Given any required config value (`PORT`, `CORS_ORIGIN`, `ConnectionStrings:Postgres`) is null, empty, or whitespace-only, when the service starts, then it fails fast with a clear exception naming the missing key -- not a silent pass-through and not a raw framework exception
- Given `PORT` is present but not a valid integer, when the service starts, then it fails fast with a clear exception rather than an unhandled `FormatException`
- Given an `x-correlation-id` header that is empty or whitespace-only, when any endpoint is hit, then the middleware generates a new id rather than echoing the blank value
- Given multiple `x-correlation-id` values on one request, when the middleware processes it, then it selects the first non-empty value rather than comma-joining them
- Given a `WebApplicationFactory<Program>`-based integration test hitting `/api/v1/health` with no `x-correlation-id` header, when it runs, then the response carries a generated correlation-id header AND the body matches `HealthCheckResponseWriter`'s JSON shape (`status`/`checks`/`totalDurationMs`) -- proving `Program.cs`'s actual wiring, not just the middleware class in isolation

## Spec Change Log

### 2026-08-30 — Review loopback (iteration 1)

**Triggering findings:** (1) Required config values (`PORT`/`CORS_ORIGIN`/`ConnectionStrings:Postgres`) were only guarded against `null` via `?? throw`, silently passing on empty-string/whitespace (e.g. `appsettings.json`'s own `"Postgres": ""` default) — contradicting the documented fail-fast promise. (2) No test exercised the composed pipeline in `Program.cs` — the only test constructed `CorrelationIdMiddleware` directly, so dropping the middleware or the health response writer from `Program.cs` would not fail any existing test. (3) The spec's own manual-check `curl` command pointed at `/health` instead of the actual mapped route `/api/v1/health`. (4) Correlation-id edge cases (whitespace-only header value, repeated header) were unhandled. (5) A non-numeric `PORT` raised a raw `FormatException` instead of a clear startup error.

**Amended:** Tasks & Acceptance (added explicit tasks/criteria for empty/whitespace config rejection, `PORT` parse-failure handling, correlation-id whitespace/multi-value handling, and a pipeline-level integration test) and Verification (added the integration-test expectation, fixed the manual-check path to `/api/v1/health`).

**Known-bad state avoided:** a service that silently starts with an empty Postgres connection string or CORS origin instead of failing fast as documented; a regression in `Program.cs`'s middleware/health-check wiring shipping with green CI because no test touches the composed pipeline.

**KEEP instructions:** preserve the existing project structure (`.sln` at the service root, `src/AccessControlService.Api`, `tests/AccessControlService.Api.Tests` — already CI-glob-compatible and build/test-verified), the `CorrelationIdMiddleware` and `HealthCheckResponseWriter` design/shape, the `CLAUDE.md` content (only its manual-check path reference needs fixing), and the package choices (`AspNetCore.HealthChecks.NpgSql`, `DotNetEnv`, `Swashbuckle`, `xUnit`) — none of these need to change, only config-validation strictness, correlation-id edge-case handling, the manual-check path, and added test coverage.

## Verification

**Commands:**
- `cd services/access-control-service && dotnet build --configuration Release` -- expected: builds clean, matches CI
- `cd services/access-control-service && dotnet test` -- expected: passes, including a `WebApplicationFactory<Program>` integration test asserting the health-endpoint shape and correlation-id propagation through the real pipeline, in addition to unit tests covering the config-validation and correlation-id edge cases above

**Manual checks (if no CLI):**
- `docker compose -f infra/docker-compose.yml --env-file infra/.env up -d` then `curl http://localhost:<port>/api/v1/health` -- expect a healthy response reflecting DB connectivity

## Suggested Review Order

**Composition root**

- Why `.env` must load before `CreateBuilder`, and only from cwd, not upward -- the one subtle ordering bug found by actually running the app
  [`Program.cs:6`](../../services/access-control-service/src/AccessControlService.Api/Program.cs#L6)

- Full request pipeline: config load, CORS, correlation-id middleware, controllers, health mapping -- the whole composition root in one file
  [`Program.cs:19`](../../services/access-control-service/src/AccessControlService.Api/Program.cs#L19)

**Fail-fast config validation**

- Core validation: rejects null/empty/whitespace and out-of-range PORT with a named-key exception, not a raw framework one
  [`AppConfig.cs:28`](../../services/access-control-service/src/AccessControlService.Api/Configuration/AppConfig.cs#L28)

- The PORT range check added after review found `0`/`-1`/`99999` parsed fine but broke Kestrel binding unclearly
  [`AppConfig.cs:40`](../../services/access-control-service/src/AccessControlService.Api/Configuration/AppConfig.cs#L40)

**Correlation-id edge cases**

- Picks the first non-blank header value, generating a new id rather than echoing blank or comma-joining repeats
  [`CorrelationIdMiddleware.cs:44`](../../services/access-control-service/src/AccessControlService.Api/Middleware/CorrelationIdMiddleware.cs#L44)

**Health-check response shape**

- JSON body (status/checks/totalDurationMs) driven by a real Postgres ping, not a hardcoded 200
  [`HealthCheckResponseWriter.cs:12`](../../services/access-control-service/src/AccessControlService.Api/Health/HealthCheckResponseWriter.cs#L12)

**Tests proving the composed pipeline (not just isolated classes)**

- Integration test fixture: proves middleware + health wiring survive through the real `Program.cs`, not just unit-level
  [`HealthEndpointTests.cs:23`](../../services/access-control-service/tests/AccessControlService.Api.Tests/HealthEndpointTests.cs#L23)

- Real subprocess test proving the app actually binds to the configured PORT via Kestrel, since `WebApplicationFactory` alone can't prove this
  [`RealServerBindingTests.cs:26`](../../services/access-control-service/tests/AccessControlService.Api.Tests/RealServerBindingTests.cs#L26)

- Out-of-range PORT theory cases added in the second review pass
  [`AppConfigTests.cs:61`](../../services/access-control-service/tests/AccessControlService.Api.Tests/Configuration/AppConfigTests.cs#L61)

**Peripherals**

- Doc/config parity: standard heading order, fixed manual-check path, Dockerfile-absence Gotcha
  [`CLAUDE.md:1`](../../services/access-control-service/CLAUDE.md#L1)

- Unplanned but necessary: forces LF on `.sh` files so the Postgres bind-mount shebang doesn't break on Windows checkouts
  [`.gitattributes`](../../.gitattributes#L1)

- New DB entry for this service
  [`01-create-databases.sh:12`](../../infra/postgres-init/01-create-databases.sh#L12)

- VS-specific artifacts ignored now that this is the first .NET project in the repo
  [`.gitignore`](../../.gitignore#L1)
