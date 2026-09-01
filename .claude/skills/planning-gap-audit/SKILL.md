---
name: planning-gap-audit
description: 'Audit planning artifacts against code, dependencies, and end-to-end completeness before recommending stories, approving specs, starting implementation, marking stories done, or reordering epics/sprint. Use when /planning-gap-audit is invoked or when planning-gap-check rules apply.'
---

# Planning Gap Audit

## Purpose

Find gaps between **what the product must do** (PRD, architecture, UX, ADRs, epics) and **what is
actually plannable, buildable, and completable** (stories, specs, sprint status, code, PRs,
contracts, infra) before any planning or implementation decision ships.

This skill complements BMAD — it does not replace `bmad-build`, `bmad-code-review`, or other
installed BMAD workflows. Run it **before** those skills when the trigger conditions below apply.
Before naming a specific BMAD command in output, verify it exists in the installed BMAD skill set
(see **Hard constraints**).

## BMAD command selection

- An explicit `/planning-gap-audit` invocation always selects this canonical skill.
- Do not substitute `bmad-help`, `bmad-sprint-planning`, `bmad-build`, or another BMAD workflow
  for an explicit `/planning-gap-audit` invocation.
- When a planning-gap trigger applies without an explicit command, run this skill first; only
  recommend or invoke another BMAD workflow after this audit and after verifying that workflow
  exists in the installed skill set.
- Distinguish **available** commands from **currently recommended** commands. Treat the installed
  BMAD catalog as the source of truth for availability, then select the recommended workflow from
  the installed version's current phase, prerequisites, sequencing, and task fit.
- Each action in **Suggested next planning moves** must have exactly one currently recommended
  BMAD command. Never list deprecated, legacy, or compatibility-shim commands as alternatives.
- Available-but-not-recommended commands may appear only in a separate informational note, when
  useful, and must not appear in the recommendation table.
- For this installation, `bmad-build` is the canonical Phase 4 workflow for Story 1.4
  specification and implementation. Stop after the specification phase for explicit human
  approval before making application changes, then continue with implementation.
- Use `bmad-code-review` after implementation. Use `bmad-help` when the correct planning workflow
  for adding a new story is uncertain.
- Recommend each workflow in a fresh context window.

## When to run (mandatory)

Run a planning-gap audit before:

1. **Recommending the next story** (including `/bmad-help` next-step advice grounded in sprint
   status).
2. **Approving a story specification** (`spec-*.md`, BMAD build intent, or "ready for dev").
3. **Starting implementation** of a story or epic slice.
4. **Marking a story complete** (`done` in `sprint-status.yaml`, spec sign-off, PR merge
   narrative).
5. **Changing epic or sprint order** (re-prioritization, parallelization, or skipping stories).

## Gate selection and authentication handling

- Select exactly one primary gate for the verdict. Do not combine next-story recommendation
  with implementation, specification-approval, completion, or reordering readiness unless the
  user explicitly requests multiple gates.
- For **Gate 1 — recommend next story**, issue `STOP` only when no safe story can be recommended
  or when planning itself would violate a critical requirement. A story may be recommended with
  explicit conditions when its isolated work is safe but its production integration is blocked.
- Missing authentication does not block recommending Story 1.4, creating its specification, or
  implementing isolated Access Control persistence/API work with test seams.
- Missing authentication does block production permission decisions based on a real caller,
  Administration UI end-to-end completion, Story 1.4 `done` sign-off, and Story 1.3
  end-to-end completion.
- For Gate 1, classify missing authentication as **High/out-of-gate** when assessing whether to
  recommend Story 1.4. For secure deployment or a `done` sign-off, classify it as
  **Critical/in-gate**.
- Recommended order: begin Story 1.4 specification with `bmad-build`; assign authentication
  ownership in parallel; require authentication before Story 1.4 integration or `done`
  sign-off; and never use caller-controlled actor identity in the interim.

## Hard constraints

- **Facts vs inference** — label every finding `[FACT]` (directly cited from a file, commit, or
  PR) or `[INFERENCE]` (reasoned from evidence; state assumptions).
- **Never silently invent or modify stories** — do not create, rename, split, or renumber epics/
  stories, edit `epics.md`, `sprint-status.yaml`, or specs without **explicit user approval**.
- **Stop on critical blockers (gate-relative)** — issue **STOP** only when a finding is
  **Critical for the single audited gate** (see **Severity**) and meets that gate's STOP rule.
  In particular, a Critical authentication gap is not an in-gate STOP for Gate 1 merely because
  Story 1.4 cannot yet complete its production integration.
- **Planning-artifact edits require approval** — recommended actions may include "add story",
  "update sprint status", or "record ADR"; propose only; never apply without confirmation.
- **BMAD-compatible** — use `_bmad-output/` paths, `sprint-status.yaml`, `deferred-work.md`,
  `spec-*.md`, and `uv run _bmad/scripts/resolve_config.py` when resolving BMAD output locations.
- **Production identity** — never recommend trusting `actorPersonId` or any caller-supplied actor/
  subject identity from an external request (body, query string, or client-controlled header).
  Explicit IDs are allowed **only** in unit/integration test seams (mocks, fixtures, in-process
  adapters). Production identity must come from a **verified principal** (e.g. JWT `sub` after
  BFF validation) or **trusted service-to-service identity** established by the platform — not
  from parameters the caller chooses.
- **BMAD command recommendations** — before recommending a BMAD workflow command, verify the skill
  exists in the installed BMAD set (e.g. `.agents/skills/bmad-<name>/SKILL.md` or the project's
  BMAD skill index). If the correct planning workflow for adding a new story is uncertain,
  recommend **`bmad-help`**. For Story 1.4 specification and implementation, recommend
  **`bmad-build`**; after implementation, recommend **`bmad-code-review`**. Do not recommend
  `bmad-create-story`, `bmad-spec`, `bmad-dev-story`, or `bmad-quick-dev` while `bmad-build` is
  the canonical Phase 4 workflow.
- **Three status layers** — keep BMAD story status, implementation delivery status, and end-to-end
  integration verification status separate (see **Status layers**). Do not collapse them into a
  single judgment.
- **BMAD status is a recorded fact** — quote the status from `sprint-status.yaml` or the spec as
  recorded. **Never relabel it** in audit output (e.g. do not write "effectively incomplete" or
  substitute a different BMAD status). If acceptance or delivery evidence contradicts the recorded
  status, report a **status contradiction**, cite both sides, recommend human review (e.g.
  `bmad-sprint-planning` if installed), and **preserve the recorded BMAD status** unless the user
  explicitly approves a planning-artifact change.

## Status layers

Report these **independently** — never substitute one for another:

| Layer | What it means | Primary evidence |
| --- | --- | --- |
| **BMAD story status** | Recorded lifecycle in planning artifacts — **quoted as-is, never relabeled** | `sprint-status.yaml`, spec `status` field |
| **Implementation delivery status** | Code/shipped work on the audited branch | Commits, merged PRs, files on branch |
| **End-to-end integration verification status** | Cross-service or user journeys proven, not merely built in isolation | Integration/e2e tests, spec verification sections, live pipeline evidence |

**Rules:**

- **BMAD status is read-only in audits.** Always show the recorded value (e.g. `done`,
  `in-progress`). Never change it in the Gap Register, verdict, or recommendations.
- If recorded BMAD status **contradicts** acceptance or delivery evidence, add a finding typed
  **status contradiction** — cite the recorded status and the contradicting evidence separately;
  recommend review; do not resolve the contradiction by relabeling the story in output.
- Report **missing integration evidence** separately (label findings as *integration gap* or *E2E
  verification gap*). Integration gaps do not change recorded BMAD status.
- Contradictions **between layers** (e.g. `done` in sprint-status but no merge on audited branch)
  are valid **status contradiction** findings — cite evidence for each layer, preserve recorded
  BMAD status, recommend review.

## Data sources (read what applies to scope)

| Layer | Primary paths |
| --- | --- |
| Normative requirements | `docs/requirements/project-requirements.md`, `docs/requirements/Spec_Changelog_v1.2_to_v1.5.md` |
| Product | `_bmad-output/planning-artifacts/prds/**/prd.md` |
| Epics & stories | `_bmad-output/planning-artifacts/epics.md` |
| Architecture | `_bmad-output/planning-artifacts/architecture/**/ARCHITECTURE-SPINE.md`, `docs/decisions/ADR-*.md` |
| UX | `_bmad-output/planning-artifacts/ux-designs/**/EXPERIENCE.md`, `DESIGN.md`, mockups |
| Sprint & specs | `_bmad-output/implementation-artifacts/sprint-status.yaml`, `spec-*.md`, `deferred-work.md`, `epic-*-context.md` |
| Access control | `docs/access-control/section-matrix.md`, `.cursor/rules/access-control-invariants.mdc` |
| Contracts & code | `libs/contracts/`, affected `services/*`, `infra/` |
| Delivery state | Audited branch, open/merged PRs (if relevant), service `CLAUDE.md` / README |
| BMAD skill index | `.agents/skills/bmad-*/SKILL.md` (verify commands before recommending) |

Inspect **code and PRs** when judging completeness, blocked ACs, or contradictions — not
planning files alone.

## Audit dimensions

Work through every dimension that applies to the **scoped story, epic, or recommendation**. Skip
irrelevant rows; say "not in scope" briefly.

1. **Requirements traceability** — PRD FR/NFR, architecture ADs, UX journeys: mapped to an epic/
   story AC, or explicitly deferred with evidence?
2. **Story & epic dependencies** — `preceded-by` / cross-story deps in epics, ADRs, specs; circular
   or hidden deps?
3. **Authentication** — login/logout UI, IdP/Keycloak, `authentication-service`, token handling,
   BFF validation, `request.user.sub` / principal propagation. **Authn is often unstoried** — flag
   unowned work explicitly.
4. **Authorization** — access roles, functional permissions, permission-decision APIs, section
   matrix, server-side omission, UI route/surface visibility vs server enforcement.
5. **UI** — UX IA/mockups vs implemented routes; client-side hiding vs server omission; admin /
   feature screens without backend.
6. **API** — BFF and domain endpoints; consumer exists; versioned paths; error shapes.
7. **Data** — schema, migrations, seed data, ownership per service (AD-4).
8. **Events & contracts** — outbox, RabbitMQ, `libs/contracts`, producer/consumer ownership,
   idempotency (ADR-001, ADR-002).
9. **Migrations & operations** — EF/Prisma migrations, compose infra, Keycloak realm, env config.
10. **Observability** — correlation IDs, health checks, DLQ/alert gaps in `deferred-work.md`.
11. **Security** — fail-closed, no trusted headers, no caller-supplied production identity,
    pseudonymized data, access-control negative tests required by DoD.
12. **Testing** — unit/integration/e2e/manifest coverage for touched matrix cells; tests that
    claim E2E but use fail-closed stubs.
13. **Blocked acceptance criteria** — AC depending on unavailable adapter, endpoint, auth, or
    projection; cite spec "Blocked" / "Deferred" sections.
14. **Unowned work** — architecture/UX/ADR/deferred items with **no** epic/story owner.
15. **Contradictions** — per-layer status vs evidence (BMAD vs delivery vs integration); planning
    vs spec vs audited branch vs merged PR narrative.
16. **Cross-service integration** — who produces, who consumes, stub vs real, parallel-work
    boundary (`docs/decisions/`, ADR-002/003).
17. **End-to-end completability** — can a user/developer run the full path after this work, or
    only a vertical slice with explicit blocked integrations?

## Severity

Severity and **STOP** are **relative to the audited gate** (which of the five trigger conditions
applied). State the gate in scope and metadata.

| Level | Meaning (gate-relative) |
| --- | --- |
| **Critical** | For **this gate**: blocks the scoped action; is required unowned work with no story owner; violates normative access-control/privacy rules; or prevents honest spec approval / implementation / done sign-off **for the scoped story's acceptance criteria**. Triggers **STOP** only when the applicable gate-specific rule says so. |
| **High** | Scoped story or spec cannot meet its **scoped AC** without a dependency or new planning item; or a **status contradiction** needing human review |
| **Medium** | Partial delivery OK if explicitly scoped; integration/E2E gap not in the scoped story's AC; follow-up documentation in spec/deferred-work |
| **Low** | Hygiene, nice-to-have test gap, product-level concern outside the scoped gate |

**Gate-specific STOP rules:**

| Gate | STOP when Critical finding… |
| --- | --- |
| 1. Recommend next story | …no safe story can be recommended, or planning itself would violate a critical requirement. Missing authentication alone is High/out-of-gate when recommending Story 1.4; it does not prevent recommending isolated Story 1.4 specification or Access Control work with test seams |
| 2. Approve spec | …means the spec cannot be approved for dev (AC depend on missing/unowned work, security violation) |
| 3. Start implementation | …blocks the scoped story's AC or introduces a security/privacy violation |
| 4. Mark story complete | …shows the story's **scoped AC** are not met per acceptance evidence, including missing authentication where the story requires production caller identity (status contradiction → review, not automatic relabel) |
| 5. Reorder epic/sprint | …the proposed order would violate dependencies or create a critical unowned blocker |

**Out of scope for STOP:** A critical **product-level** gap must not STOP an independently
implementable story at Gate 1 unless planning the story itself would violate a critical
requirement. Missing authentication is High/out-of-gate for recommending Story 1.4, but becomes
Critical/in-gate for production permission decisions, secure deployment, or done sign-off.

Integration/E2E verification gaps on stories with recorded BMAD `done` should typically be
**Medium** (follow-up), reported separately from BMAD status — never as grounds to relabel status.

## Output format

Start every audit with an **Audit metadata** block:

```
**Audit metadata**
- Gate: <which trigger 1–5, or scoped story/epic>
- Branch: <name>
- Commit: <short SHA> (<full SHA if helpful>)
- Timestamp: <audit run time, with timezone if known>
- Remote refs: <fetched within this session — yes/no; if yes, note approximate time; if no, state "not fetched — local refs only" and flag that PR/remote divergence may be stale>
```

Produce a **Gap Register** table (one row per finding):

| Requirement | Evidence | Owning epic/story | Status | Dependency | Identified gap | Severity | Recommended planning action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Short normative or AC text | `[FACT]` or `[INFERENCE]` + path/section/PR | e.g. `1.4` or **Unowned** | BMAD status and/or delivery/integration layer as relevant | What must land first | What's missing or contradictory | Critical–Low | Proposed action; **no edits without approval** |

Use the **Status** column to quote **recorded BMAD status** plus other layers — e.g. `done`
(BMAD, recorded) + *integration gap*; or `in-progress` (BMAD, recorded) + merged on branch.
Never substitute a different BMAD label. Use finding type **status contradiction** when layers
disagree.

After the table:

1. **Verdict** — `PROCEED`, `PROCEED WITH CONDITIONS`, or `STOP` (only for Critical findings
   **relative to the audited gate**).
2. **Conditions** (if any) — explicit scope boundaries for implementation or done-ness.
3. **Suggested next planning moves** — provide exactly one currently recommended BMAD command per
  action. Only name commands verified to exist. For Story 1.4, begin specification with
  `bmad-build`, then stop for explicit human approval before application changes. Assign
  authentication ownership in parallel, require it before Story 1.4 integration or `done`
  sign-off, and never use caller-controlled actor identity meanwhile. Use `bmad-code-review`
  after implementation. If the correct workflow for adding a new story is uncertain, use
  `bmad-help`. May also propose user-approved sprint-status repair, `deferred-work.md` updates,
  or new story proposals (text only until approved).

## Remediation Plan

Add a remediation plan for every **Critical** and **High** Gap Register finding. For
**Medium/Low** findings, include remediation only when it affects sequencing. Keep every
recommendation a proposal; never create or modify stories, epics, sprint status, specs, or other
planning artifacts automatically.

Use this concise table:

| Gap | Owner | Planning action | Minimum deliverable | Dependencies | Verification | Recommended order |
| --- | --- | --- | --- | --- | --- | --- |
| Gap identifier and short description | Epic/story plus service/team | Update existing story; create a new numbered story; create an epic; record deferred work; or obtain a product/architecture decision | Smallest work that closes the gate-relative gap | Required predecessors and safe parallel work | Required API, UI, migration, contract, unit/integration/e2e tests, and operational evidence | Immediate remediation or later hardening, with relative sequence |

For each remediation row, state:

1. **Root cause** — why the gap exists, supported by `[FACT]` evidence or marked
   `[INFERENCE]`.
2. **Recommended owner** — the owning epic/story and service/team. Provide options when ownership
   is genuinely ambiguous; do not expand a story merely to hide missing ownership.
3. **Planning action** — choose one of the actions listed in the table.
4. **Minimum deliverable** — the smallest implementation, contract, decision, or evidence needed
   to close the gap for the audited gate.
5. **Dependencies and safe parallel work** — distinguish blocking predecessors from work that can
   proceed independently using approved ports, stubs, or contracts.
6. **Acceptance evidence** — name the applicable API, UI, migration, contract,
   unit/integration/e2e test, and operational verification. Explicitly mark evidence types
   that are not applicable.
7. **Recommended implementation order** — distinguish immediate remediation from later hardening
   and keep the order relative to the audited gate.
8. **Currently recommended BMAD workflow** — exactly one command, verified through the installed
   catalog. Use `bmad-help` when the preferred planning workflow is uncertain.
9. **Approval required** — state that human approval is required before any planning-artifact
   change. Require explicit human spec approval before application changes when the remediation
   uses the Story 1.4 `bmad-build` specification/implementation flow.

The **Verification** cell may include the currently recommended BMAD workflow and approval
boundary when needed to keep the table concise, but it must still enumerate the required evidence
types. Do not present remediation as committed scope or as an automatic status change.

## Workflow

1. **Scope** — story ID, epic, or "next story recommendation"; name the **audited gate** (1–5
   above).
2. **Gather** — record audited branch, commit SHA, and timestamp; run `git fetch` (or note that
   remote refs were not refreshed). Read sources; check audited branch and PRs when judging delivery
   or contradictions. Assess BMAD status, implementation delivery, and integration verification
   **separately**.
3. **Register gaps** — one row per issue; prefer fewer, evidence-dense rows over noise.
4. **Verdict** — apply the single selected gate's STOP rule. Do not combine gates or STOP for
  out-of-gate product-level gaps; for Gate 1, report missing authentication as a condition on
  integration and completion rather than as a reason to stop recommending Story 1.4.
5. **Do not mutate planning artifacts** unless the user explicitly approves a listed action.

## Relationship to other skills

- **`bmad-build`** — canonical Phase 4 workflow for Story 1.4 specification and implementation;
  implementation must stop until the human approves the generated specification.
- **`bmad-code-review`** — run after implementation.
- **`bmad-help`** — use when the correct planning workflow for adding a new story is uncertain.
