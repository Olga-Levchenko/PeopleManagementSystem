---
description: Always return a PR summary to the user after creating a pull request, always in context
globs:
alwaysApply: true
---

# Always return a PR summary after creating a pull request

Creating a PR is a visible, shared-state action (`AGENTS`/session guidance already treats it as
one requiring confirmation before running `gh pr create`). Getting confirmation to open it is not
the same as telling the user what actually shipped — on a project with contributors on both
Claude Code and Cursor (`.claude/rules/parallel-work-boundaries.md`) working async, the PR
description is not guaranteed to be read by the requester at the moment it's created.

## The rule

Whenever a pull request is created in this repo — via `gh pr create` or any equivalent — follow
it with a written summary in the chat response, not just the PR URL. Include:

- The PR title and URL.
- What changed, in plain language (the substance of the PR body's Summary section, not a copy of
  the diff).
- Anything the requester should act on before merge: an incomplete test-plan item, an open
  question the PR doesn't resolve, or a follow-up it depends on.

A bare "PR created: `<url>`" does not satisfy this rule — the point is that the user can read what
happened without leaving the conversation, the same way the git-workflow guidance already expects
a commit summary, not just a hash.

## Related

- `.cursor/rules/pr-summaries.mdc` — the Cursor-side mirror of this file (`tooling-parity.md`
  applies to itself here too).
