# PeopleForce integration service

An integration adapter for PeopleForce — per [ARCHITECTURE-SPINE AD-1](../../_bmad-output/planning-artifacts/architecture/architecture-PeopleManagementSystem-2026-08-25/ARCHITECTURE-SPINE.md), integration services own adapters and genuinely integration-owned normalized records only; they are not the source of truth for organizational data. See [CLAUDE.md](./CLAUDE.md) for conventions.

## Quick start

```bash
nvm use
npm install
cp .env.example .env
npm run db:migrate   # against Postgres from infra/docker-compose.yml
npm run start:dev    # http://localhost:3006
```

Check: `curl http://localhost:3006/api/v1/health`
