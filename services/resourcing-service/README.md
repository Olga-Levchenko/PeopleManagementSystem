# Resourcing service

Resourcing — per [ARCHITECTURE-SPINE AD-1](../../_bmad-output/planning-artifacts/architecture/architecture-PeopleManagementSystem-2026-08-25/ARCHITECTURE-SPINE.md), owns requests, candidates, proposals, approvals, request history, and resourcing-specific workflow state. See [CLAUDE.md](./CLAUDE.md) for conventions.

## Quick start

```bash
nvm use
npm install
cp .env.example .env
npm run db:migrate   # against Postgres from infra/docker-compose.yml
npm run start:dev    # http://localhost:3003
```

Check: `curl http://localhost:3003/api/v1/health`
