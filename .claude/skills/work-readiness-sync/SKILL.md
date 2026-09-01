---
name: work-readiness-sync
description: 'Read-only audit before recommending the next story, selecting, starting, resuming, or completing a BMAD story, invoking bmad-build, changing sprint status, or continuing after related PRs merge. Verifies Git/PR state, BMAD artifacts, delivery vs integration status, dependencies, collisions, and planning gaps.'
---

# Work Readiness Sync

**Goal:** Before a developer recommends the next story, selects, starts, resumes, or completes
a story, invokes `bmad-build`, changes sprint status, or continues after related PRs merge,
produce a read-only synchronization report across Git, PRs, BMAD artifacts, dependencies, and
parallel-work ownership — then return a verdict and minimal next actions.

This skill **never** modifies sprint tracking, specs, epics, branches, or PRs. `git fetch` is
allowed as a read-only synchronization operation: it may update remote-tracking refs, but must
not modify the working tree or local branch history. Merge, rebase, reset, stash, commit, push,
and conflict resolution require approval. It **never** marks a story done solely because its PR
merged.

## On Activation

1. **Resolve context**
   - Load `{project-root}/_bmad/bmm/config.yaml` (and `config.user.yaml` if present).
     Resolve `{implementation_artifacts}`, `{planning_artifacts}`, `{project_knowledge}`,
     `{communication_language}`, `{user_name}`.
   - Record the **proposed story** from the user's message. If none is named, infer from
     the current branch name, open spec file, or `sprint-status.yaml` `in-progress` entries;
     if still ambiguous, ask once which story is in scope.
   - Record the **intent**: `recommend` | `select` | `start` | `resume` | `status-change` |
     `complete` (infer from phrasing).

2. **Run the audit** (Sections 1–7 below). Use parallel sub-agents or tool calls where
   available; prefer concrete evidence (commit hash, file path, PR URL) over inference.

3. **Integrate planning-gap audit** (Section 5).

4. **Emit the report** using the required output sections. Stay in `{communication_language}`.

## Safety (non-negotiable)

- Read-only: `git fetch` is permitted to synchronize remote-tracking refs. It must not modify
  the working tree or local branch history. No `git merge`, `rebase`, `reset`, `stash`, `commit`,
  `push`, `checkout` of others' branches, or conflict resolution is permitted without explicit
  human approval stated in the same turn.
- Never treat a merged PR alone as proof a story is done.
- Never overwrite or propose silent merges of parallel developers' artifact updates — flag
  conflicts for human resolution.
- Stop before Git conflict resolution; report the conflict, do not resolve it.
- Preserve documented blockers and partial-delivery boundaries from specs and deferred-work.
- Label every claim as **fact** (directly observed) or **inference** (reasoned from evidence).
- When `gh`/GitHub MCP is unavailable, say so under **Sync metadata → remote/PR visibility**
  and continue with local Git evidence only.

---

## 1. Git and remote state

Run these commands (read-only). Record stdout and timestamps.

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --porcelain=v1 -b
git fetch origin
```

`git fetch origin` is permitted here because it only synchronizes remote-tracking refs. Record
the fetch time (UTC). Confirm that the working tree and local branch history were not changed by
the fetch; stop and report if they were.

```bash
git rev-list --left-right --count origin/main...HEAD
git log --oneline origin/main..HEAD
git log --oneline HEAD..origin/main
git branch -r --list 'origin/*' --no-merged origin/main
```

**Working tree:** classify as `clean`, `dirty` (list changed/untracked paths), or
`conflicted` (unmerged paths).

**Main divergence:** incoming count, outgoing count, and whether the branch is behind/ahead
of `origin/main` or the repo's default branch (use `origin/HEAD` when `main` is absent).

**Remote feature branches:** from `git branch -r`, list remote branches that look like active
feature work (exclude `origin/main`, `origin/HEAD`, release/hotfix patterns if obvious).
For each, note last commit date and author when available.

**Open PRs:** when `gh` or GitHub MCP is available:

```bash
gh pr list --state open --json number,title,headRefName,author,files
gh pr list --head "$(git rev-parse --abbrev-ref HEAD)" --state open --json number,title,url
```

If tooling is unavailable, state **remote/PR visibility: unavailable** and skip PR-derived
claims.

**Collision detection:** for the proposed story, read its `spec-*.md` (Acceptance criteria,
touchpoints, services named). Cross-reference:
- files changed on the current branch (`git diff --name-only origin/main...HEAD`);
- files in open PRs (when visible);
- files changed on other remote feature branches (`git log origin/main..origin/<branch> --name-only`).

Map paths to services (`services/<name>/`, `libs/contracts/`, `libs/config/`,
`docs/access-control/`) and flag **likely overlapping files and services**.

---

## 2. BMAD state

Read and summarize:

| Artifact | Path pattern |
|----------|--------------|
| Sprint tracking | `{implementation_artifacts}/sprint-status.yaml` |
| Story spec | `{implementation_artifacts}/spec-<story-key>.md` (and variants) |
| Deferred work | `{implementation_artifacts}/deferred-work.md` |
| Epics | `{planning_artifacts}/epics.md` |
| PRD | `{planning_artifacts}/prds/**/prd.md` |
| Architecture | `{planning_artifacts}/architecture/**/ARCHITECTURE-SPINE.md` |
| ADRs | `docs/decisions/*.md` |
| UX (when UI/API shape depends on it) | `{planning_artifacts}/ux-designs/**` |
| Section matrix (access-control stories) | `docs/access-control/section-matrix.md` |
| Epic context | `{implementation_artifacts}/epic-*-context.md` when present |

For the proposed story, extract:
- recorded status from `sprint-status.yaml`;
- predecessor stories and epic from `epics.md`;
- spec status frontmatter (`status`, `frozen-after-approval` blocks);
- open deferred-work entries whose `source_spec` or summary references this story;
- retrospective action items still `open` or `in-progress` in `sprint-status.yaml`.

---

## 3. Reconcile three status layers

For the proposed story (and any `in-progress` stories found), independently assess:

| Layer | Source of truth | How to assess |
|-------|-----------------|---------------|
| **BMAD recorded** | `sprint-status.yaml`, spec frontmatter | Read artifact values |
| **Delivery** | Commits, branch diffs, merged/open PRs | `git log`, diff stats, PR state, spec AC grep in code/tests |
| **Integration** | E2E/integration tests, cross-service wiring, manual test-plan items in spec | Test files present and passing locally if runnable; CI status when available; spec "verification" / "closing" sections |

**Rules:**
- A story in `review` or `done` in BMAD requires delivery evidence (implementation exists
  on a branch or main) **and** integration evidence (tests or explicit verification checklist
  items satisfied) — not just a merged PR.
- A merged PR with BMAD still `in-progress` is a **reconciliation mismatch**, not automatic
  completion.
- Partial delivery is valid when the spec documents phased scope or deferred-work carves out
  follow-ups — do not collapse partial delivery into "done".

---

## 4. Story readiness

For the **proposed story** and intent, verify:

**Predecessors:** every story listed as a dependency in `epics.md` or the spec must be
`done` in `sprint-status.yaml` unless the spec explicitly allows parallel start.

**Epic gates:** parent epic status; required planning artifacts for the epic (architecture,
UX) exist and are `final` when the story touches UI or cross-cutting design.

**External dependencies:** other services, `libs/contracts`, RabbitMQ/event contracts,
Keycloak/auth, migrations, CI workflows — note whether the dependency is implemented,
stubbed, or missing.

**Unowned work:** entries in `deferred-work.md` or open retrospective action items that
block this story and have no named owner.

**Parallel work:** another developer/branch/PR touching the same story key, spec file, or
high-overlap paths (from Section 1).

**Completeness dimensions:** list what the story requires among migrations, shared contracts,
CI, authentication, authorization, UI, API, and tests — and whether each is satisfiable
without waiting on unmerged external work.

**Independent completion:** can this story reach `review` on its own branch without
requiring another in-flight story to merge first? If not, name the blocker.

---

## 5. Planning-gap integration

Invoke or follow the canonical skill at
`{project-root}/.claude/skills/planning-gap-audit/SKILL.md`.

- Invoke the canonical dependency for the proposed story (or epic, when no story is named).
  Import its **gate-relative verdict** and **remediation guidance** into this report's
  **Verdict** and **Next actions** — do not duplicate or replace it with a reduced audit.
- If the canonical dependency is unexpectedly unavailable in the current environment, report
  **DECISION REQUIRED**, recommend restoring or installing
  `.claude/skills/planning-gap-audit/SKILL.md`, and stop this audit without running a reduced
  duplicate audit.

---

## 6. Artifact reconciliation

Detect stale or contradictory states. For each mismatch, emit one row with:

- **current recorded value** (from BMAD/spec);
- **repository evidence** (commit, branch, PR, missing file, test gap);
- **proposed value** (what the artifact should say if evidence is trusted);
- **confidence**: `high` | `medium` | `low`;
- **artifact/file requiring change** (exact path);
- **human approval required**: `yes` | `no` (always `yes` when another developer may have
  concurrently updated the same artifact).

**Mismatch patterns to check:**

| Pattern | Example |
|---------|---------|
| Backlog but implementation started | `sprint-status: backlog` + branch/commits referencing story |
| In-progress but no active implementation | `in-progress` + clean tree + no branch + no open PR |
| Review/done vs missing verification | `done` + spec verification checklist incomplete |
| Dependency done in code, backlog in YAML | predecessor merged but status not updated |
| Merged PR not reflected | PR merged to main, story still `in-progress` |
| Deleted/renamed story keys | key in `sprint-status.yaml` with no matching `spec-*.md` or epic entry |
| Parallel branch artifact drift | same story key updated differently on two branches |

Do **not** edit artifacts. Present proposed corrections for human approval.

---

## 7. BMAD workflow selection

1. Read `{project-root}/_bmad/_config/bmad-help.csv` (or `_bmad/module-help.csv`) for the
   installed catalog.
2. When the preferred workflow is uncertain, invoke `bmad-help` (read its SKILL.md and follow
   its routing) or recommend the user run it.
3. Distinguish:
   - **available** — installed but not the current best step;
   - **recommended** — the canonical next step for the reported state.
4. Do **not** recommend deprecated compatibility shims (`bmad-sprint-status`, `bmad-dev-story`,
   `bmad-create-story`, `bmad-quick-dev`, `bmad-dev-auto` unless explicitly invoked by name).
   Prefer: `bmad-sprint-planning`, `bmad-build`, `bmad-build-auto`, `bmad-code-review`,
   `planning-gap-audit`, `work-readiness-sync`.
5. For status repair, recommend `bmad-sprint-planning` (validate/fix intent), not manual
   YAML edits.

---

## Required output format

Present exactly these sections (tables may be empty with an explicit "none" note).

### Sync metadata

- branch
- commit (short + full)
- fetch time (UTC)
- working tree state
- main divergence (behind/ahead counts + summary)
- remote/PR visibility (`full` | `partial` | `unavailable` + reason)

### Active work

| Story | Developer/branch/PR | Status | Files/services | Collision risk |
|-------|---------------------|--------|----------------|----------------|

Collision risk: `none` | `low` | `medium` | `high` — with one-line rationale.

### Artifact reconciliation

| Story | BMAD status | Delivery status | Integration status | Evidence | Proposed correction |
|-------|---------------|-----------------|--------------------|-----------|--------------------|

For each proposed correction, append a sub-bullet block:

- confidence
- file requiring change
- human approval required

### Dependency readiness

| Dependency | Owner | Status | Blocking? | Required action |
|------------|-------|--------|-----------|-----------------|

### Verdict

Exactly one primary verdict:

| Verdict | Meaning |
|---------|---------|
| **READY** | Safe to proceed with the stated intent now |
| **READY WITH CONDITIONS** | Proceed only after named lightweight conditions |
| **NOT READY** | Preconditions or blockers prevent starting/completing |
| **SYNC REQUIRED** | Artifacts/Git/PR state are out of sync; fix before work |
| **DECISION REQUIRED** | Human must choose among documented options |

Add one paragraph tying the verdict to evidence. If `planning-gap-audit` ran, incorporate
its gate result (PASS/CONCERNS/FAIL) without restating its checklist.

### Next actions

Ordered, minimal sequence using **only currently recommended** BMAD commands/skills — each
line: skill name, intent, and why. Examples:

- `work-readiness-sync` — re-run after sync fixes
- `bmad-sprint-planning` (validate/fix) — repair `sprint-status.yaml` mismatches
- `planning-gap-audit` — close planning gaps before first build
- `bmad-build` — start/resume implementation when READY
- `bmad-code-review` — story in `review` with delivery complete

Do not include shell commands that mutate Git or artifacts unless the user has already
approved that specific action in the same conversation.

---

## Intent-specific gates

| Intent | Additional gate |
|--------|-----------------|
| **recommend** | Story is supported by synchronized status, dependencies, and planning evidence |
| **select** | Story is plannable; predecessors and planning artifacts sufficient |
| **start** | READY or READY WITH CONDITIONS; no high collision risk without coordination |
| **resume** | Branch/spec alignment; no newer main commits that invalidate the branch without rebase plan |
| **status-change** | Artifact reconciliation has no unresolved contradiction requiring approval |
| **complete** | All three status layers align; integration verification satisfied; reconciliation mismatches resolved or explicitly accepted |

---

## References

- `.claude/skills/planning-gap-audit/SKILL.md` — planning gate (invoke, do not duplicate)
- `.claude/skills/bmad-sprint-planning/SKILL.md` — sprint status validate/fix/generate
- `.claude/skills/bmad-help/SKILL.md` — workflow routing when uncertain
- `.claude/rules/parallel-work-boundaries.md` — shared-seam collision context
- `docs/requirements/project-requirements.md` Section 8 — parallel-work normative rule
