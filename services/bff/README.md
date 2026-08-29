# BFF

Browser-facing composition boundary for the People Management Platform — validates auth, composes
calls to the domain services, returns consistent errors. Owns no data of its own. See
[CLAUDE.md](./CLAUDE.md) for conventions.

## Quick start

```bash
nvm use
npm install
npm run start:dev   # http://localhost:3001
```

Check: `curl http://localhost:3001/api/v1/health`
