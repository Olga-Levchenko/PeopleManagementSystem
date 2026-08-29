# Parallel work boundaries

Per `docs/requirements/project-requirements.md` Section 8 [NORMATIVE]: parallel work over
features is a strict rule for this project. "A situation where one person waits for another is
unacceptable and will be treated as a process defect regardless of the output." This file records
how the team's monorepo topology is meant to support that, and where the real bottleneck risk
actually lives.

## Parallelism comes from branches/worktrees, not repo boundaries

This is a true monorepo (`services/*`, `libs/*`), not git submodules — see `docs/decisions/` for
the full rationale. At 4 contributors, submodule ceremony (commit-per-repo, gitlink sync,
detached-HEAD footguns) costs more than the isolation buys. Parallel work is achieved through
feature branches or `git worktree` per contributor working on a given service, not through
repository boundaries. Do not port multi-repo assumptions (per-service `.gitmodules`,
cross-repo sync scripts) into this repo.

## Natural parallel seams

Each `services/<name>` directory is meant to be an independently workable unit once its contract
with the rest of the system is agreed:

- `services/frontend`, `services/bff`, `services/authentication-service`, `services/people-service`,
  `services/resourcing-service`, `services/integration-timetracker`,
  `services/integration-peopleforce` — different contributors can build these concurrently once
  the shapes crossing their boundary are settled.
- `libs/contracts` (shared DTOs/API types for Node services) and `libs/config` are the deliberate
  exception: multiple services depend on them, so changes here are the one place true blocking
  risk lives.

## The actual bottleneck to guard against: shared-contract churn

- Treat `libs/contracts`, `docs/access-control/section-matrix.md`, and any cross-service API
  shape as a **shared seam**, not a service-local file. A change here blocks every dependent
  service's work until it lands.
- Land shared-seam changes in small, fast-reviewed commits — don't let a contract PR sit waiting
  on unrelated review cycles while other contributors are blocked on it.
- Prefer additive changes to shared contracts (new optional field, new DTO) over breaking ones.
  A breaking change to a shared contract is the one case where synchronous coordination
  (a Teams call, not just an async PR) is legitimate — record the resulting decision as an ADR in
  `docs/decisions/` rather than letting it live only in chat.
- If a service's implementation depends on a contract or API shape that doesn't exist yet, stub it
  (mock server, fixture, interface-first contract) rather than waiting for the upstream service to
  be implemented first. This is explicitly what Section 8 is testing for.

## Foundation phase specifically

Section 8 requires foundation-phase work (prototyping/design approach, tech choices, testing
architecture, and whatever else the team identifies) to run in parallel with named owners per
topic, aligned and written down *before* implementation starts — not serialized, and not skipped.
Findings belong in `docs/decisions/` (ADRs) or `docs/integrations/` as they land, not held until
a single end-of-phase document.

## Related

- `docs/decisions/` — where monorepo-vs-submodules and other foundational decisions are recorded.
- `docs/requirements/project-requirements.md` Section 8 — normative source of this rule.
