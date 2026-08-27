# People / Organization service

People/Organization — the authoritative domain per [ARCHITECTURE-SPINE AD-1](../../_bmad-output/planning-artifacts/architecture/architecture-PeopleManagementSystem-2026-08-25/ARCHITECTURE-SPINE.md). Owns profiles, employment history, organization structure, reporting lines, departments, projects, assignments, People Partner relationships, cross-system identity links, custom-field definitions/values, system dictionaries, and authoritative organizational relationships — plus the career-timeline record store and manual timeline overrides (other domain services publish events that cause timeline entries). See [CLAUDE.md](./CLAUDE.md) for conventions.

## Quick start

```bash
nvm use
npm install
cp .env.example .env
npm run db:migrate   # against Postgres from infra/docker-compose.yml
npm run start:dev    # http://localhost:3002
```

Check: `curl http://localhost:3002/api/v1/health`
