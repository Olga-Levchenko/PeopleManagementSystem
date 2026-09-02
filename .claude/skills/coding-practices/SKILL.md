---
name: coding-practices
description: Guide implementation of repository-specific C#/.NET, NestJS/TypeScript/Prisma, React, and test code.
---

# Coding Practices

## Purpose

Guide implementation-time decisions for changed or newly generated application and test code.

This skill is repository-specific implementation guidance. It does not replace:
- `work-readiness-sync` for repository and parallel-work synchronization;
- `planning-gap-audit` for planning, ownership, or dependency gates;
- `pr-readiness-check` for final delivery readiness;
- `bmad-code-review` for broad adversarial review;
- specialized access-control, identity, or test-automation reviews.

## Activation and enforcement

Use this skill before generating or modifying:
- C#/.NET, ASP.NET Core, or EF Core code;
- NestJS, TypeScript, or Prisma code;
- React or frontend TypeScript code;
- xUnit, Jest, Playwright, or Testcontainers tests;
- directly related implementation configuration.

Do not activate for:
- documentation-only changes;
- BMAD planning artifacts;
- Git-only operations;
- status synchronization;
- PR-description-only work;
- skill or rule maintenance unless explicitly requested.

The trigger should automatically load the skill for matching files when supported by the active
tool. Deterministic compliance remains the responsibility of compiler, analyzers, lint, tests,
and CI.

## Required workflow

1. Detect the affected technology and service.
2. Read the nearest applicable `CLAUDE.md`.
3. Read the applicable shared ESLint, Prettier, TypeScript, .NET, test, and service configuration.
4. Inspect adjacent production code and tests.
5. Confirm ownership and dependency direction from the architecture spine and relevant ADRs.
6. Reuse existing utilities, ports, adapters, validators, fixtures, and patterns.
7. Select the smallest implementation that satisfies the requested behavior.
8. Identify required tests before writing implementation code.
9. Keep the implementation within the requested scope.
10. Explain any deliberate deviation from established conventions.

Do not invent a library, abstraction, public contract, infrastructure component, or configuration
key without first confirming that the repository or task requires it.

## Implementation boundaries

- Preserve public API and message contracts unless the task explicitly changes them.
- Keep domain logic in the owning service.
- Do not access another service's database or internal models.
- Keep external systems behind existing ports or adapters.
- Keep authorization server-side.
- Never introduce temporary authentication or caller-controlled production identity.
- Handle failures explicitly and preserve correlation context.
- Never expose secrets, personal data, raw upstream payloads, or raw internal exception details.
- Add or update tests with behavior changes.
- Distinguish unit, integration, contract, and E2E evidence honestly.
- Do not mass-format unrelated files.
- Do not modify BMAD artifacts unless the active workflow explicitly requires it.

## C#/.NET

When generating or changing C#/.NET code:

- Preserve nullable reference-type correctness.
- Use `async`/`await` for I/O.
- Propagate `CancellationToken` through applicable call chains.
- Never use `.Result` or `.Wait()`. Do not use `async void` except for framework-required event
  handlers.
- Do not create unobserved fire-and-forget work; use an explicit, observed error boundary when
  background execution is required.
- Keep ASP.NET Core controllers thin.
- Preserve Domain, Application, API, and Infrastructure dependency directions.
- Use constructor dependency injection.
- Use validated options/configuration for runtime settings.
- Use structured `ILogger` message templates.
- Do not log tokens, secrets, personal data, or complete request payloads.
- Use established exception mapping and `ProblemDetails` conventions instead of ad-hoc error bodies.
- Keep DTOs, domain models, persistence models, and message contracts distinct.
- Use `AsNoTracking()` for read-only EF queries.
- Check for obvious N+1 queries.
- Use explicit transactions when multiple writes must be atomic.
- Encode important invariants with database constraints where appropriate.
- Use optimistic concurrency or equivalent protection when concurrent updates matter.
- Dispose `IDisposable` and `IAsyncDisposable` resources correctly.
- Do not rewrite an already-merged migration; add a forward migration.
- Add xUnit tests at the appropriate layer.
- Reuse shared Testcontainers fixtures for expensive infrastructure when an applicable fixture exists.

## NestJS/TypeScript/Prisma

When generating or changing NestJS or TypeScript service code:

- Preserve the repository's strict TypeScript configuration.
- Avoid `any`; use `unknown` at untrusted boundaries and narrow it safely.
- Avoid unnecessary or unsafe type assertions.
- Keep controllers focused on transport concerns.
- Put business, persistence, and transaction logic in services or existing domain/application layers.
- Validate request DTOs using the established `class-validator` and Nest bootstrap conventions.
- Reject unknown fields where the existing API policy requires it.
- Use explicit ports/adapters for external systems.
- Never import another service's persistence layer or internal models.
- Await promises or attach an explicit, observed error boundary.
- Do not silently discard rejected promises.
- Map validation, authorization, not-found, conflict, and unavailable-service failures consistently
  with surrounding code.
- Preserve correlation IDs and structured logging conventions.
- Do not leak upstream response bodies or internal exception details.
- Use Prisma transactions for atomic multi-write operations.
- Encode important invariants with database constraints where appropriate.
- Keep generated Prisma output out of commits.
- Add forward migrations rather than rewriting merged migrations.
- Validate configuration and fail fast for invalid required values.
- Use typed Jest mocks.
- Clean up timers, handles, clients, and containers.

## React/TypeScript

When generating or changing React code:

- Keep components focused and follow the existing component/page structure.
- Keep API access and server-state orchestration in the established hooks or API modules.
- Do not duplicate server state in local component state without a clear reason.
- Keep hooks unconditional and dependencies correct.
- Clean up effects, subscriptions, timers, and event listeners.
- Use semantic controls, accessible labels, keyboard behavior, and visible focus.
- Handle relevant loading, empty, success, validation, authorization, not-found, conflict, and
  service-failure states.
- Show safe localized messages; never render raw backend errors.
- Do not implement authorization only in the UI.
- Use accessible roles and names for Playwright selectors.
- Keep frontend DTOs aligned with the existing API contract.
- Add component tests for isolated behavior and Playwright tests for user journeys where the
  repository has the corresponding test infrastructure.
- Follow the existing shadcn/UI and Lucide conventions where applicable.

## Test code

When generating or changing tests:

- Map tests to the requested behavior or acceptance criterion.
- Assert observable behavior rather than implementation details.
- Cover applicable success, validation, denial, missing-target, conflict, and failure paths.
- Add negative authorization tests for protected operations.
- Use unit tests for pure behavior.
- Use integration tests for database, broker, serialization, transaction, and framework behavior.
- Use E2E tests for complete API/UI journeys.
- Never describe mocked adapters as cross-service verification.
- Use stable, pseudonymized test data.
- Avoid arbitrary sleeps; wait on observable conditions with bounded timeouts.
- Release resources and settle promises in `finally` blocks where appropriate.
- Clean up timers, clients, containers, browser contexts, and temporary resources.
- Do not weaken assertions or increase timeouts merely to conceal flakiness.
- Use shared infrastructure fixtures for expensive Testcontainers resources when possible.
- Preserve the distinction between unit, integration, and E2E test locations used by the service.

## Decision rules

### Mandatory

Treat these as implementation blockers:
- broken type or nullability guarantees;
- blocking async code;
- unobserved asynchronous failures;
- resource leaks;
- transaction or migration-safety violations;
- cross-service persistence coupling;
- authorization boundary violations;
- secret or personal-data exposure;
- unsafe error leakage;
- tests that falsely claim integration or E2E evidence.

### Preferred

Treat these as advisory unless the surrounding repository already requires them:
- naming refinements;
- small-function decomposition;
- fixture organization;
- minor component decomposition;
- preferred test naming or assertion style.

Do not block implementation merely because the repository consistently uses another reasonable
pattern.

## Verification

After implementation, run only safe, relevant checks available from the affected service:

- typecheck;
- build;
- non-fixing lint;
- format check;
- focused unit tests;
- test-source typecheck;
- schema validation.

Integration tests may run when existing Docker/browser prerequisites are already available.

Do not install dependencies, download browsers or images, apply persistent migrations, edit `.env`
files, run formatters/autofix, or perform Git/PR mutations without explicit approval.

Report:
- changed files;
- practices applied;
- deliberate deviations and rationale;
- tests added or updated;
- verification executed;
- verification blocked or not run;
- remaining risks.

## Relationship to other skills

- `work-readiness-sync` determines whether repository work may start.
- `planning-gap-audit` identifies planning ownership and dependency gaps.
- `coding-practices` guides implementation decisions.
- `bmad-code-review` may review the completed change broadly.
- `access-control-reviewer`, `identity-access-engineer`, and `test-automation-engineer` remain
  authoritative for their specialized concerns.
- `pr-readiness-check` is the final readiness orchestrator.

Do not recursively invoke another readiness chain or duplicate a completed audit.

## Enforcement boundary

This skill is guidance, not a deterministic quality gate.

Prefer compiler, analyzer, ESLint, Prettier, database, and CI enforcement whenever a rule can be
checked mechanically. Do not claim this skill guarantees compliance.

## Safety

- Do not modify files outside the requested implementation scope.
- Do not mass-format existing files.
- Do not install dependencies without approval.
- Do not change architecture or public contracts silently.
- Do not edit BMAD artifacts unless the active workflow explicitly requires it.
- Do not stage, commit, push, merge, or change PRs without explicit approval.
