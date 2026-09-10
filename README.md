# People Management Platform

Intelligent repository for the People Management Platform — Iteration 2 (AI-native SDLC bootcamp).

React frontend + NestJS microservices (BFF + domain services) + a .NET auth service backed by Keycloak, PostgreSQL, REST APIs. Full spec in [`docs/requirements/project-requirements.md`](docs/requirements/project-requirements.md).

## Repo layout

- `docs/` — requirements, architecture decisions (`decisions/`), integration research (`integrations/`), the access-control matrix as a living doc (`access-control/`)
- `prototypes/` — HTML prototypes from the foundation phase
- `services/` — one folder per deployable service (frontend, bff, authentication-service, people-service, resourcing-service, integration-timetracker, integration-peopleforce)
- `libs/` — code shared across Node services (contracts/DTOs, shared config) — not used by `authentication-service`, which is .NET
- `infra/` — local dev docker-compose, CI pipeline config
- `_bmad/`, `_bmad-output/` — BMAD framework install and its generated planning/implementation artifacts
- `.claude/` — skills, rules, and subagents for AI-assisted development in this repo

## Getting started

See the complete [local development guide](docs/local-development.md) for prerequisites,
first-time bootstrap, service startup commands, local login, and seeded functional roles.

Prerequisites: Docker Desktop, Node.js 22 (see `.nvmrc`), .NET SDK 8.0.x.

Compose runs **Postgres, Keycloak, and RabbitMQ**. Application services run on the host.
The bootstrap script prepares the complete local setup:

```powershell
powershell -File infra/bootstrap-local.ps1
```

```bash
bash infra/bootstrap-local.sh
```

That copies `.env` files, generates gitignored RSA keys, starts infra, installs dependencies, runs
all service migrations, and applies `infra/seed/*.sql`.

Then start all application services with one command:

```powershell
powershell -File infra/start-all-local.ps1
```

On macOS/Linux:

```bash
bash infra/start-all-local.sh
```

Open http://localhost:4200. Sign in as `tt.site-admin@altexsoft.com` / `DevPassword1!`.
The account has the `hr-admin` functional role in Access Control, not in Keycloak.

## Process

This project follows BMAD (spec-driven, agent-per-phase development) and a strict parallel-work model across 4 contributors — see `docs/decisions/` for why specific choices were made (e.g. monorepo over submodules).
