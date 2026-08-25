# PeopleForce integration

Status: **research pending** — no investigation has happened yet. This is a template for
capturing findings as the foundation-phase owner does the work, not a record of findings.

Source requirement: `docs/requirements/project-requirements.md` Section 5.2. PeopleForce is the
recruiting system of record; the platform pulls candidate info for external candidates proposed
in resourcing (4.7) and treats it as the source of truth for vacancies. API docs:
https://developer.peopleforce.io (machine-readable index at
https://developer.peopleforce.io/llms.txt, worth pulling into this repo per the spec).

Fallback explicitly allowed by the spec: if this integration can't be completed in time, an
external link to the candidate in PeopleForce is acceptable for this iteration. Record which
path was chosen and why, once decided.

## Owner

Not yet assigned. Whoever owns this should fill in name + date here once claimed.

## What to investigate and record here

### Authentication
Auth mechanism (API key, OAuth2, etc.), token lifetime/rotation, and where credentials are
stored/configured (must not be committed to the repo — see general secrets handling, this isn't
a pseudonymised-data concern but the same "never commit" discipline applies).

### Candidate endpoints
- Shape of a candidate record: what fields are available, which map to the platform's resourcing
  flow (4.7) needs (name, contact, resume/CV link, stage, source).
- How a specific candidate is looked up/linked to a resourcing request proposal.

### Vacancy endpoints
- Shape of a vacancy record, and how/whether the platform needs to create or only read vacancies.
- Relationship between a PeopleForce vacancy and this platform's resourcing request (4.7) — are
  they the same entity from two systems, or does the platform's request stay independent and
  just reference a vacancy?

### Custom fields
PeopleForce supports custom fields on candidates — record whether the platform needs to read
these, and if so, how they map (or don't) to this platform's own custom-field system (4.1),
since the two are separate mechanisms serving similar purposes and could get confused.

### Rate limits and webhooks
Record documented limits, and whether webhooks are available/needed (vs. polling) for keeping
candidate data reasonably fresh during an active resourcing request.

### Identity resolution
Per Section 6: a person may exist as a PeopleForce candidate, then later as an employee in this
system. Record the decision on how (or whether) a hired candidate's PeopleForce record is linked
to their eventual employee record — note that pre-onboarding linkage is explicitly out of scope
for this iteration (spec Section 10), so this may only need to cover the "still a candidate,
proposed in resourcing" case, not full lifecycle linkage.

### Failure handling
Per Section 7 and 4.7: if PeopleForce is unreachable, the resourcing flow's candidate-proposal
step must degrade gracefully — record the actual fallback behavior decided (e.g., falling back
to an external link, per the spec's explicit allowance) rather than the request/approval flow
breaking entirely.

## Decision log

<!-- As decisions are made, append entries here in the ADR-lite style used in docs/decisions/:
     what was decided, why, and date. Cross-link to a full ADR in docs/decisions/ if the decision
     is significant enough to warrant one on its own (e.g. "real integration vs. external-link
     fallback for this iteration"). -->

## Open questions

<!-- Anything raised but not yet resolved. -->

## Related

- `docs/requirements/project-requirements.md` Sections 4.7, 5.2, 6, 7, 10
- `.claude/rules/pseudonymized-data-only.md` — applies to any candidate data pulled during
  research or testing
- `docs/integrations/timetracker.md` — the sibling integration doc
