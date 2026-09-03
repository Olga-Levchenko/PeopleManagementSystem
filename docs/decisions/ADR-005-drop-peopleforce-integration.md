# ADR-005: Drop PeopleForce Integration

**Date:** 2026-09-03
**Status:** Accepted
**Deciders:** Ihor Tukalo (confirmed with course organizers/Natalia), team aligned in standup
**Jira:** O4-24 (Epic 15, now cancelled)

## Context

The v1.5 spec already downgraded PeopleForce from a required integration to "good-to-have" (PRD
§4.16), reducing scope to a single prefill-by-candidate-ID button on the resourcing flow with an
explicitly sanctioned external-link fallback. The original `project-requirements.md` §5.2 still
lists PeopleForce as a required integration — that text predates the v1.5 amendment.

During the 2026-09-03 standup, Ihor confirmed by asking the course organizers (Natalia) that
PeopleForce app integration is **not required** for this project at all. The integration research
(`docs/integrations/peopleforce.md`) and the scaffolded service (`services/integration-peopleforce`)
remain in the repository as reference material.

## Decision

Epic 15 (PeopleForce Integration, Story 15.1) is **dropped** — it will not be implemented.

Concrete consequences:
- `services/integration-peopleforce` is retained as a scaffold/reference but will not receive
  production implementation work.
- The PeopleForce candidate ID **is still stored** on every external resourcing candidate
  unconditionally (this is a data-model requirement in Epic 7, not an integration concern), so
  that a future integration is not precluded.
- The external-link fallback (a link to the candidate in PeopleForce) remains the only surface
  this platform provides — it requires no `services/integration-peopleforce` implementation.
- FR-45 is dropped. NFR-4 (PeopleForce availability) is superseded by this decision.

## Rationale

The integration is good-to-have at best. Given the bootcamp timeline and the team's remaining
story backlog, there is no benefit in investing time in a non-required, non-graded integration.

## Consequences

- Epic 15 / Story 15.1 removed from the active backlog (sprint-status.yaml updated to `dropped`).
- PRD §4.16 and epics.md updated to reflect `[DROPPED]` status.
- `docs/requirements/project-requirements.md` is the normative spec and is not edited here;
  this ADR records the superseding decision.
- If PeopleForce is required in a future iteration, this ADR and the retained scaffold are the
  starting point.
