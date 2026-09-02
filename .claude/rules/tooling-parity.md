# Tooling parity: Claude Code and Cursor

This repo has contributors on both Claude Code and Cursor. Keep the two tools' guardrails,
subagents, and skills at equal functionality — never let one tool's users get access to a
guardrail, checklist, or piece of context that the other tool's users don't.

## Why this matters more than usual "keep docs in sync" advice

Most of what's mirrored here isn't documentation — it's the access-control, data-privacy, and
parallel-work guardrails from `docs/requirements/project-requirements.md` Sections 2, 3, and 7,
which are safety-critical, not stylistic. A guardrail that only reaches Claude Code users is a gap
the Cursor-using contributor won't know exists, on a project where access control is explicitly
the primary graded quality attribute.

## The rule

- Any new or edited `.claude/rules/*.md` needs a matching `.cursor/rules/*.mdc` (frontmatter:
  `description`, `globs`, `alwaysApply`). Always-on rules stay always-on (`alwaysApply: true`,
  empty `globs`); path-scoped rules get an equivalent `globs` pattern.
- Any new or edited `.claude/agents/*.md` subagent needs a `.cursor/rules/*.mdc` equivalent,
  reframed from "you are a subagent with these tools" to plain instructions/checklists — Cursor
  has no isolated-subagent mechanism to port the persona to directly. Glob-scope it to whatever
  path the subagent was originally scoped to.
- Root `CLAUDE.md` changes need the mirrored content updated in
  `.cursor/rules/00-project-overview.mdc` — Cursor doesn't read `CLAUDE.md`.
- BMAD skills (`.claude/skills/bmad-*`) are already mirrored to `.agents/skills/bmad-*` by the
  BMAD installer itself — confirmed via `bmad-method install --list-tools`, which maps `cursor` →
  `.agents/skills`. This layer is installer-managed, not hand-maintained. If the team ever adds a
  *custom* (non-BMAD) skill only under `.claude/skills/`, check whether it needs a hand-added
  `.agents/skills/` counterpart too.
- When auditing parity, compare **topic coverage** between the two rule directories, not
  byte-for-byte content — the Cursor versions are reframed, not verbatim copies, and that's
  correct: `.mdc` frontmatter and Cursor's auto-attach model differ from Claude Code's.

The custom `pr-readiness-check` skill is canonical under
`.claude/skills/pr-readiness-check/SKILL.md` and has concise mirrored trigger rules in
`.claude/rules/pr-readiness-check.md` and `.cursor/rules/pr-readiness-check.mdc`.

The implementation-time `coding-practices` skill is canonical under
`.claude/skills/coding-practices/SKILL.md` and has equivalent trigger rules in
`.claude/rules/coding-practices.md` and `.cursor/rules/coding-practices.mdc`.

It guides repository-specific implementation practices for C#/.NET, NestJS/TypeScript/Prisma,
React/TypeScript, and xUnit/Jest/Playwright/Testcontainers code. It is not a replacement for
compiler, analyzer, ESLint, Prettier, database, or CI enforcement.

## PR readiness check

Before final story delivery, PR creation or update, final review request, marking a story
`review` or `done`, or merging a PR, run the shared
[pr-readiness-check skill](../skills/pr-readiness-check/SKILL.md).

It is the final orchestrator. It is repository-read-only by default, although safe verification
may create disposable outputs or ephemeral containers that must be cleaned up. Dependency,
environment, Git, planning-artifact, and PR mutations require explicit approval.

Reuse `work-readiness-sync` or `planning-gap-audit` results when they already cover the same
repository state; do not start duplicate audit chains.

Manual examples:

    /pr-readiness-check
    /pr-readiness-check Check Story 1.4 before creating a PR.
    /pr-readiness-check Re-check PR #20 after review fixes.

Verdicts are `PR READY`, `READY WITH DOCUMENTED BLOCKERS`, `NOT READY`, `SYNC REQUIRED`, and
`DECISION REQUIRED`, as defined by the canonical skill.

## Planning gap audit

The shared [planning-gap-audit skill](../skills/planning-gap-audit/SKILL.md) works in both
Claude Code and Cursor. Use it before recommending the next story, approving a story
specification, starting implementation, changing story order, or marking a story complete.

Examples:

    /planning-gap-audit
    /planning-gap-audit Check whether Story 1.4 is ready for implementation.
    /planning-gap-audit Check whether Story 1.3 can be marked done.

It checks the PRD, architecture, UX, epics, stories, dependencies, Git/PR delivery,
authentication, authorization, cross-service contracts, and testing. It distinguishes BMAD
status, implementation delivery, and end-to-end verification, then reports gaps and remediation
recommendations. The audit is read-only by default and must not modify stories, statuses, or
planning artifacts without explicit approval.

## Work-readiness synchronization

The shared [work-readiness-sync skill](../skills/work-readiness-sync/SKILL.md) works in both
Cursor and Claude Code. It runs automatically before selecting, starting, resuming, reviewing,
or completing a story, and before `bmad-build`.

It checks the current branch, `origin/main` divergence, open PRs, parallel work, BMAD statuses,
dependencies, artifact consistency, and collision risk. It invokes `planning-gap-audit` as part
of its readiness decision. The sync is read-only by default and requires explicit approval before
merge, rebase, artifact or status edits, commit, push, or PR changes.

Manual invocation is optional because the trigger rules normally run it automatically:

    /work-readiness-sync Story 1.4
    /work-readiness-sync Can Story 1.3 be resumed or completed?
    /work-readiness-sync Reconcile main with BMAD sprint artifacts.

## Related

- `.cursor/rules/tooling-parity.mdc` — the Cursor-side mirror of this file (this rule applies to
  itself).
- `.claude/rules/access-control-invariants.md`, `.claude/rules/pseudonymized-data-only.md`,
  `.claude/rules/parallel-work-boundaries.md`, `.claude/rules/pr-summaries.md`,
  `.claude/rules/test-before-commit.md` — the five guardrails this parity requirement currently
  covers, each with a `.cursor/rules/*.mdc` counterpart.
- `.claude/agents/*.md` — the five subagents, each with a `.cursor/rules/*.mdc` counterpart.
- The per-area service rules under `services/*/.claude/rules/*.md` (four `nest-*.md` files shared
  by the six NestJS backend services, eight `react-*.md` files for `services/frontend`) are also
  mirrored — as root-level, glob-scoped `.cursor/rules/{nest,react}-*.mdc` files, since Cursor
  rules aren't looked up per-service the way `.claude/rules/` is. `nest-prisma.mdc` excludes `bff`
  in its `globs` (that service has no Prisma scaffold).
