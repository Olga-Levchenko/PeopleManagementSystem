# Work Management service

Work Management — per [ARCHITECTURE-SPINE AD-1](../../_bmad-output/planning-artifacts/architecture/architecture-PeopleManagementSystem-2026-08-25/ARCHITECTURE-SPINE.md), owns risks, action items, CDS, mentorship, campaigns, and feedback. See [CLAUDE.md](./CLAUDE.md) for conventions.

## Quick start

```bash
nvm use
npm install
cp .env.example .env
npm run db:migrate   # against Postgres from infra/docker-compose.yml
npm run start:dev    # http://localhost:3004
```

Check: `curl http://localhost:3004/api/v1/health`
