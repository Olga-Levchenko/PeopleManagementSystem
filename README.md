# People Management Platform

Intelligent repository for the People Management Platform — Iteration 2 (AI-native SDLC bootcamp).

React frontend + NestJS microservices (BFF + domain services) + a .NET auth service backed by Keycloak, PostgreSQL, REST APIs. Full spec in [`docs/requirements/project-requirements.md`](docs/requirements/project-requirements.md).

## Repo layout

- `docs/` — requirements, architecture decisions (`decisions/`), integration research (`integrations/`), the access-control matrix as a living doc (`access-control/`)
- `prototypes/` — HTML prototypes from the foundation phase
- `services/` — one folder per deployable service (frontend, bff, auth-service, people-service, resourcing-service, integration-timetracker, integration-peopleforce)
- `libs/` — code shared across Node services (contracts/DTOs, shared config) — not used by `auth-service`, which is .NET
- `infra/` — local dev docker-compose, CI pipeline config
- `_bmad/`, `_bmad-output/` — BMAD framework install and its generated planning/implementation artifacts
- `.claude/` — skills, rules, and subagents for AI-assisted development in this repo

## Getting started

Setup instructions land here once the first service is scaffolded. See each `services/<name>/CLAUDE.md` for service-specific commands once populated.

## Process

This project follows BMAD (spec-driven, agent-per-phase development) and a strict parallel-work model across 4 contributors — see `docs/decisions/` for why specific choices were made (e.g. monorepo over submodules).
