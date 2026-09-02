# Git workflow

Always check out a dedicated branch before starting any story, task, fix, or experiment. Never commit directly to `main`.

## The rule

- Every piece of work — implementation, spec, planning-artifact update, or one-off fix — goes on its own branch, not on `main`.
- Branch naming: `feature/<story-key-or-slug>`, `fix/<slug>`, `chore/<slug>`.
- `main` receives changes only via PR merge, never via direct `git commit` + `git push`.

## Related

- `.claude/rules/pr-readiness-check.md` — run before creating or merging a PR.
- `.claude/rules/pr-summaries.md` — always include a written summary after opening a PR.
