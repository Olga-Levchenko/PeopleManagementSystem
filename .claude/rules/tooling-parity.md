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

## Related

- `.cursor/rules/tooling-parity.mdc` — the Cursor-side mirror of this file (this rule applies to
  itself).
- `.claude/rules/access-control-invariants.md`, `.claude/rules/pseudonymized-data-only.md`,
  `.claude/rules/parallel-work-boundaries.md`, `.claude/rules/pr-summaries.md` — the four
  guardrails this parity requirement currently covers, each with a `.cursor/rules/*.mdc`
  counterpart.
- `.claude/agents/*.md` — the five subagents, each with a `.cursor/rules/*.mdc` counterpart.
