# People Management Platform — root context

Spec-driven monorepo for the People Management Platform (Iteration 2, AI-native SDLC bootcamp). This file is a table of contents — service-specific stack details, commands, and gotchas live in each `services/<name>/CLAUDE.md`, not here.

## Where things are

- Source spec: `docs/requirements/project-requirements.md` — the normative scope; Sections 2 and 3 (roles, access matrix) cannot be redesigned.
- Architecture/process decisions: `docs/decisions/` (ADRs)
- Integration research (timetracker, PeopleForce): `docs/integrations/`
- Access-control matrix as a living doc, traced to test coverage: `docs/access-control/`
- HTML prototypes: `prototypes/`
- Services: `services/frontend`, `services/bff`, `services/auth-service` (.NET + Keycloak),
  `services/authorization-service` (.NET — policy and derived-relationship-projection engine,
  separate from `auth-service`), `services/people-service`, `services/work-management-service`
  (risks, action items, CDS, mentorship, campaigns, feedback), `services/resourcing-service`,
  `services/integration-timetracker`, `services/integration-peopleforce`
- Shared code for Node services: `libs/contracts` (DTOs/API types), `libs/config` (lint/tsconfig/jest bases) — not used by `auth-service`
- Local dev environment: `infra/docker-compose.yml`
- BMAD planning/implementation artifacts: `_bmad-output/`
- Tooling for AI-assisted development: `.claude/` (skills, rules, subagents) for Claude Code;
  `.cursor/rules/*.mdc` for Cursor — see `.claude/rules/tooling-parity.md`.

## Policy

- This is a **true monorepo**, not git submodules — see `docs/decisions/` for why. Cross-service changes (e.g. a shared DTO) should land in one commit, not split across repos.
- **Never put real personal data anywhere in this repo, in logs, or in agent context** — pseudonymised data only, per the spec's Section 7. Real structure/volume, substituted names and contacts.
- **Access control is the primary quality attribute.** Any change touching profile sections, role resolution, or the section matrix must be checked against `docs/access-control/section-matrix.md` before being considered done — see `.claude/rules/access-control-invariants.md`.
- Functional roles are data, not code (Section 2.3) — never hardcode a role name as a permission check; resolve access roles from relationships and functional-role permissions from stored, runtime-editable grants.
- **Always return a PR summary to the user after creating a pull request** — title, what changed in plain language, and anything the requester should act on before merge, not just the URL. See `.claude/rules/pr-summaries.md`.
- **Keep Claude Code and Cursor at equal functionality.** The team has contributors on both. Any new or edited `.claude/rules/*.md` or `.claude/agents/*.md` needs a matching `.cursor/rules/*.mdc`, and vice versa — see `.claude/rules/tooling-parity.md`.

## Running and verifying

Nothing runs from the repo root yet — run each service from inside its own directory per its `CLAUDE.md`. `infra/docker-compose.yml` brings up shared infrastructure (Postgres — one instance, one database per service, see `infra/postgres-init/`; Keycloak in dev mode; RabbitMQ) for local dev: `cp infra/.env.example infra/.env && docker compose -f infra/docker-compose.yml --env-file infra/.env up -d`.
