# Always test before committing

If a change is testable, run the actual commands that would exercise it — locally, before
committing — rather than committing on the strength of a careful read of the diff. A diff that
looks correct is not the same claim as "this runs."

## Why this is a hard rule here

On 2026-08-28/29, three CI-workflow commits landed back to back, each fixing a failure the
previous one had introduced or missed, because none of them were run locally first:

1. `libs/config`'s ESLint base failed to resolve `@eslint/js` in CI (`ERR_MODULE_NOT_FOUND`) —
   the reusable Node CI workflow never installed `libs/config`'s own dependencies.
2. The fix above shipped fine, but a separate, pre-existing bug then surfaced: Jest's `preset`
   path in every service's `package.json` was miscalculated relative to `rootDir`, so tests
   failed with "Preset ... not found relative to rootDir ...".
3. With both fixed, `services/frontend`'s CI run still failed: `playwright test` needs a
   downloaded browser binary that `npm install` never provides, so every e2e test failed with
   `browserType.launch: Executable doesn't exist`.

Each of these would have been caught by literally running the command locally — `npm run lint`,
`npm test` — before pushing. Instead, each fix was validated only by re-reading YAML and package
files, pushed, and failed again in CI. That's three round trips (and three sets of GitHub Actions
minutes) that one local run each would have collapsed into one.

## The rule

Before committing a change to anything runnable — application code, CI/CD workflow files, scripts,
config that something else parses at runtime — actually run it locally to whatever extent the
environment allows:

- **Code changes**: run the affected service's own lint/build/test commands (per that service's
  `CLAUDE.md`), not just a syntax read-through.
- **CI/CD workflow changes**: if the failure is reproducible locally (a lint rule, a test runner,
  a resolution path), reproduce and fix it locally first — don't use a CI run as the first real
  execution of the change. `gh run view <id> --job <id>` / the GitHub Actions API is for diagnosing
  a *failure that already happened*, not a substitute for testing before you push.
- **Multi-service or shared-config changes** (anything touching `libs/config`, `libs/contracts`,
  or a workflow file all services depend on): test against at least one real consumer, not just
  the shared file in isolation — the `@eslint/js` bug above was invisible from `libs/config` alone
  because nothing in that directory itself exercises the import.

## When local testing isn't possible

Some things can't be verified locally (a GitHub-hosted-runner-specific OS package, a secret only
CI has, infrastructure not running locally). When that's the case, say so explicitly in the commit
message or to the user — "not locally testable: X, because Y" — rather than silently skipping
verification and letting a push stand in for a test run. See the `--with-deps` caveat noted when
verifying the Playwright fix as a concrete example of this pattern.

## Related

- `.cursor/rules/test-before-commit.mdc` — the Cursor-side mirror of this file
  (`tooling-parity.md` applies to itself here too).
