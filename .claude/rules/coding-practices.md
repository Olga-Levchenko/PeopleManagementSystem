# Coding practices

Before generating or modifying application or test code in this repository, use the canonical
implementation skill:

`.claude/skills/coding-practices/SKILL.md`

Apply it to:
- C#/.NET/ASP.NET Core/EF Core;
- NestJS/TypeScript/Prisma;
- React/TypeScript;
- xUnit, Jest, Playwright, and Testcontainers tests;
- directly related implementation configuration.

Do not apply it to documentation-only work, BMAD planning artifacts, Git operations, status
synchronization, PR-description-only work, or skill/rule maintenance unless explicitly requested.

The trigger should automatically load the skill for matching files when supported by the active
tool. Deterministic compliance remains the responsibility of compiler, analyzers, lint, tests,
and CI.

The skill is implementation-time guidance. Use compiler, analyzers, ESLint, Prettier, database
checks, and CI for deterministic enforcement.

It complements, and must not duplicate:
- `work-readiness-sync`;
- `planning-gap-audit`;
- `pr-readiness-check`;
- `bmad-code-review`;
- access-control, identity, and test-automation rules.

Read the nearest service `CLAUDE.md`, shared configuration, adjacent code, and applicable ADRs
before implementing. Preserve service ownership, public contracts, strict typing, async/resource
safety, server-side authorization, safe errors, migration safety, and truthful test-level claims.
