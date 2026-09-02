---
name: pr-readiness-check
description: 'Read-only readiness audit before final story delivery, PR creation or update, final review request, story review/done status, or PR merge.'
---

# PR Readiness Check

## Purpose

Verify that a branch is genuinely ready for final delivery. This audit is read-only with respect
to the repository and persistent environments. Verification may create ignored or disposable
build output, coverage files, reports, temporary directories, and ephemeral containers.

Verification must never modify tracked source, tests, snapshots, lockfiles, planning artifacts,
remote branches, or persistent/shared environments. Clean up only temporary directories,
processes, containers, and disposable artifacts created by the current audit. Never delete or
overwrite pre-existing ignored outputs or developer-owned resources unless explicitly approved.

Use this skill before:

- final story commit;
- final push;
- PR creation;
- PR update after review fixes;
- final code-review request;
- marking a story `review` or `done`;
- PR merge.

Do not run it for ordinary intermediate commits or local experimentation unless explicitly requested.

## Safety

`git fetch` may update remote-tracking refs, but must not modify the working tree or local branch
history. Read-only Git remote and PR metadata access is allowed when configured and required for
readiness.

External mutations, paid-service operations, credential changes, comments, reviews, labels, pushes,
and PR updates require explicit approval.

Never automatically:

- merge, rebase, reset, stash, commit, push, force-push, or delete branches;
- create or update PRs;
- resolve conflicts;
- modify source, tests, snapshots, dependencies, environments, or planning artifacts;
- install dependencies, browsers, Docker images, or global tools;
- apply migrations to persistent, shared, staging, or production databases;
- create or edit `.env` files;
- run formatters, autofix lint, or file-updating snapshots.

Stop and ask when the target branch, story, PR scope, ownership, security policy, or migration
strategy is ambiguous.

Label every finding as `[FACT]` or `[INFERENCE]`. Never print secret values or real personal data.

## On activation

1. Resolve the project root, current intent, story, target branch, and repository state.
2. Define the readiness-run key as:
   `<branch, commit, target branch, freshly fetched remote state>`.
3. If `work-readiness-sync` already ran for this exact key, reuse its result and label it
   `REUSED — work-readiness-sync`.
4. If `planning-gap-audit` already ran for the same story, gate, and repository state, reuse its
   result and label it `REUSED — planning-gap-audit`.
5. Each skill may invoke another skill at most once during one readiness run.
6. `pr-readiness-check` is the final orchestrator before a PR action. A nested skill must not start
   another readiness chain or invoke an already-completed audit again.

## 1. PR metadata and Git state

Record:

- current branch;
- current local commit, short and full SHA;
- target branch;
- fetch time in UTC;
- working-tree state;
- staged, unstaged, and untracked files;
- divergence from the local and remote target branch;
- remote feature-branch status;
- open PR number and URL when available;
- whether PR visibility is `full`, `partial`, or `unavailable`.

Use read-only inspection. A fetch is allowed only to refresh remote-tracking refs. Confirm that the
working tree and local branch history did not change after fetching.

When GitHub or `gh` is unavailable, report that PR visibility is unavailable and do not infer PR
state.

## 2. Scope audit

Determine:

- owning epic and story;
- approved specification;
- acceptance criteria;
- changed files and services;
- whether every change belongs to the story;
- whether required files are tracked;
- whether unrelated files are included;
- whether generated, temporary, ignored, report, coverage, secret, or local-environment files
  would enter the PR;
- whether package lockfiles and project metadata changes are intentional;
- whether parallel branches or PRs touch the same files, migrations, contracts, or BMAD artifacts.

A merged PR is not sufficient evidence that a story is complete.

## 3. Status reconciliation

Keep these layers separate:

1. Recorded BMAD status.
2. Implementation delivery status.
3. End-to-end integration verification status.

Compare:

- `sprint-status.yaml`;
- story specification status;
- task and review checkboxes;
- Git commits;
- merged and open PRs;
- verification evidence;
- documented blockers and deferred work.

Never relabel or edit BMAD status automatically. If evidence contradicts recorded status, report:

- the recorded value;
- the repository evidence;
- the proposed correction;
- the exact artifact requiring change;
- confidence;
- whether human approval is required.

## 4. Acceptance-criteria audit

For every acceptance criterion, report one of:

- implemented;
- verified;
- partially verified;
- blocked externally;
- missing;
- not applicable.

Cite concrete evidence from source files, tests, migrations, contracts, commits, and story
artifacts.

Do not treat unit tests, mocked adapters, compilation, or test discovery as end-to-end evidence.

Invoke `planning-gap-audit` when:

- ownership is missing;
- a required follow-up story does not exist;
- the story cannot honestly reach `done`;
- authentication, authorization, UI, API, infrastructure, or cross-service work is unassigned.

## 5. Tiered verification

### Tier 1 — safe verification

Tier 1 checks may create disposable or ignored outputs, including build output, coverage, reports,
temporary directories, and ephemeral processes. They must not modify tracked repository files,
lockfiles, planning artifacts, remote branches, or persistent/shared environments.

Run only confirmed read-only verification commands, such as:

- `git diff --check`;
- typecheck;
- production build;
- lint without `--fix`;
- affected unit tests;
- Prisma or EF schema validation;
- shared-package build and export validation;
- test-source typecheck where configured.

Derive commands from repository scripts, CI workflows, `CLAUDE.md` files, READMEs, and package or
project configuration. Do not invent commands or passing results.

After execution, clean up only processes and disposable resources created by this audit. Report
generated artifacts that remain.

### Tier 2 — relevant integration verification

Run relevant checks only when their prerequisites are satisfied:

- API integration tests;
- PostgreSQL or Testcontainers tests;
- RabbitMQ and outbox tests;
- contract serialization and compatibility tests;
- frontend Playwright tests;
- clean migration application against an ephemeral database;
- CI build-order verification;
- cross-service producer/consumer compatibility;
- authorization negative and fail-closed tests.

Testcontainers may run automatically only when Docker is available and the required image is
already available locally or repository policy explicitly permits pulling it automatically. If the
image must be downloaded and repository policy does not permit automatic pulling, request explicit
approval before downloading it.

Use ephemeral containers and databases only. Always stop and remove containers created by the
current audit, including after failures. Never use production or shared mutable data.

If Docker, browsers, credentials, or external services are unavailable, report `BLOCKED` or
`NOT RUN`; never report `PASSED`.

### Tier 3 — explicit approval required

The following always require explicit approval:

- dependency installation, including `npm ci`;
- clean-install verification;
- Playwright browser installation;
- Docker or image installation when automatic pulling is not permitted;
- applying migrations to persistent or shared databases;
- `.env` creation or editing;
- formatters;
- lint with `--fix`;
- snapshots that update files;
- external or paid-service calls;
- staging, committing, pushing, merging, or PR mutation.

Clean-install verification may run only after approval and only inside a validated temporary
directory. It must not copy unnecessary caches or modify the repository's `node_modules`,
lockfiles, or source tree.

## 6. Verification freshness and reporting

Prior verification evidence may be reused only when:

- it belongs to the exact current commit;
- no relevant source, test, configuration, dependency, lockfile, workflow, or environment file
  changed afterward;
- the command and scope are known;
- the evidence is available in repository or CI records.

Label reused evidence as `REUSED — exact commit` and include its original command, scope, and
source. Otherwise rerun the check when safe, or report it as `NOT RUN` or `BLOCKED`.

For every check, report:

- command;
- scope;
- status;
- whether it was executed or reused;
- duration when available;
- evidence;
- reason if blocked or skipped;
- whether the failure is introduced by the PR or pre-existing.

Allowed statuses:

- `PASSED`
- `FAILED`
- `BLOCKED`
- `NOT RUN`
- `NOT APPLICABLE`
- `PRE-EXISTING FAILURE`

Never reuse test discovery, compilation-only output, mocked seams, or a developer statement as
test-execution evidence.

## 7. Contracts and shared packages

When shared contracts or packages changed, verify:

- canonical ownership;
- public exports;
- semantic or schema version;
- producer and consumer compatibility;
- cross-language compatibility;
- serialization fixtures;
- rejection of unsupported versions or fields;
- clean-runner package installation;
- generated `dist` assumptions;
- CI build order;
- stable event IDs and routing metadata where relevant.

If a consumer is absent, separate producer completeness from integration completeness.

## 8. Database migrations

When Prisma or EF models changed, verify:

- a migration exists;
- schema and migration agree;
- naming conventions;
- indexes and constraints;
- ordering relative to `origin/main`;
- collisions with parallel migrations;
- application to a clean ephemeral database;
- upgrade from the supported previous schema where required;
- rollback, recovery, or forward-fix notes;
- no hidden destructive operation.

Never rewrite an already-merged migration. Propose a new corrective migration when needed.

## 9. CI verification

Verify that CI:

- detects every new package and service;
- installs dependencies in the correct order;
- builds shared packages before consumers;
- runs relevant unit, integration, and E2E checks;
- does not rely on local `dist`, generated files, caches, global tools, or developer paths;
- handles supported Windows/Linux command differences;
- documents required secrets and environment variables;
- does not silently skip required tests.

When possible, perform a focused clean-runner simulation in a temporary directory without
modifying the working repository. Treat dependency restoration as Tier 3 and request approval
before running it.

## 10. Security and privacy

Check for:

- committed credentials, tokens, keys, connection strings, or personal data;
- unsafe `.env` files;
- caller-controlled identity;
- UI-only authorization;
- hardcoded functional-role checks;
- fail-open adapters;
- missing negative authorization tests;
- raw upstream error leakage;
- stale-access or cache invalidation gaps.

Report only file path, category, and remediation for secrets or personal-data findings.

## 11. PR description

Verify or draft a concise description containing:

- summary;
- scope;
- owning story;
- important design decisions;
- verification commands and results;
- migration notes;
- runtime and environment notes;
- external blockers;
- deferred follow-up work;
- explanation when BMAD remains `in-progress`.

Do not claim blocked work is complete.

## Required output

### PR metadata

| Field | Value |
|---|---|

### Scope audit

| Area | Evidence | Status | Required action |
|---|---|---|---|

### Acceptance criteria

| Criterion | Implementation | Verification | Status |
|---|---|---|---|

### Verification matrix

| Check | Command | Status | Evidence/Reason |
|---|---|---|---|

### Migration and contract checks

| Item | Status | Evidence | Required action |
|---|---|---|---|

### Blockers

Separate:

- must fix before PR;
- external documented blockers;
- environment blockers;
- pre-existing unrelated failures;
- optional cleanup.

### Verdict

Use exactly one:

- `PR READY`
- `READY WITH DOCUMENTED BLOCKERS`
- `NOT READY`
- `SYNC REQUIRED`
- `DECISION REQUIRED`

### Next actions

Provide the smallest ordered sequence required to reach PR readiness.

## Verdict rules

Return `PR READY` only when required files are tracked, the branch is sufficiently synchronized,
acceptance criteria are implemented and verified, required checks pass, migrations/contracts/CI are
safe, and no must-fix finding remains.

Return `READY WITH DOCUMENTED BLOCKERS` only for genuinely external blockers explicitly documented
and outside approved PR scope.

Return `NOT READY` for locally fixable required work, failed required tests, missing files, unsafe
migrations, secret exposure, or broken clean CI.

Return `SYNC REQUIRED` when the branch must reconcile with `origin/main` or parallel work.

Return `DECISION REQUIRED` when human judgment is required for scope, ownership, security policy,
migration strategy, or story completion criteria.

## References

- `.claude/skills/work-readiness-sync/SKILL.md`
- `.claude/skills/planning-gap-audit/SKILL.md`
- `.claude/rules/work-readiness-sync.md`
- `.cursor/rules/work-readiness-sync.mdc`
- `docs/decisions/`
- `_bmad-output/implementation-artifacts/`
