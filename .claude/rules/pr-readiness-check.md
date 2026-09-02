# PR readiness check

For a final story commit, final push, PR creation or update, final review request, story
`review`/`done` status, or PR merge, use the canonical orchestrator:

`.claude/skills/pr-readiness-check/SKILL.md`

This rule is only a trigger and does not duplicate audit logic. Reuse an already completed
`work-readiness-sync` or `planning-gap-audit` result for the same repository state; do not start
a duplicate audit chain.

Do not run for ordinary intermediate commits or local experimentation unless explicitly requested.
The audit is repository-read-only with disposable verification outputs allowed; repository,
planning, Git, dependency, environment, and PR mutations require explicit approval.
