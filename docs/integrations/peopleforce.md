# PeopleForce integration

Status: **research pending** — no API investigation has happened yet. The v1.5 spec changelog
(`docs/requirements/Spec_Changelog_v1.2_to_v1.5.md`) has already resolved the *scope* question this
doc used to leave fully open, even though the API-shape investigation itself hasn't started.

Source requirement: `docs/requirements/project-requirements.md` Section 5.2, as amended by v1.5.
**As of v1.5, PeopleForce is explicitly good-to-have, not required** — the timetracker is the only
required integration. This is a significant scope reduction from v1.2: PeopleForce is no longer
the source of truth for vacancies at all (the vacancy entity now lives entirely in the platform —
see the Resourcing changes in the changelog), and candidate-pull is reduced to a single feature:
**a prefill-by-candidate-ID button** on the resourcing candidate-proposal flow, not a general
sync. API docs: https://developer.peopleforce.io (machine-readable index at
https://developer.peopleforce.io/llms.txt, worth pulling into this repo per the spec) — still worth
reading to scope the one button, just a much smaller surface than v1.2 implied.

Fallback explicitly allowed by the spec: if even the prefill button can't be completed in time, an
external link to the candidate in PeopleForce is acceptable for this iteration. Record which path
was chosen and why, once decided.

## What v1.5 already decided (not open questions any more)

- **Scope: one button.** Given a PeopleForce candidate ID, prefill resourcing-candidate profile
  fields from that candidate's PeopleForce record, with **per-field preview and per-field
  confirmation** — never silently overwrite a field the user already filled in.
- **Never-prefill field list (fixed):** grade, seniority, employee type, department, manager,
  people partner, contract data, employment status, risk. These must never be populated from a
  PeopleForce pull regardless of what the API returns — they're either access-sensitive or
  platform-owned facts that shouldn't be overwritten from an external, less-trusted source.
- **Store the PeopleForce candidate ID on every external candidate, unconditionally** — whether or
  not the pull integration itself ships in time. This is the anchor for whatever cross-system
  identity resolution gets decided later (see Identity resolution below), so it must be captured
  from day one even in the external-link-fallback mode.
- **No PeopleForce vacancy sync in either direction.** The resourcing request/vacancy entity is
  platform-native only (v1.5) — do not build a PeopleForce-vacancy read or write path at all.

## Owner

Not yet assigned. Whoever owns this should fill in name + date here once claimed.

## What to investigate and record here

### Authentication
Auth mechanism (API key, OAuth2, etc.), token lifetime/rotation, and where credentials are
stored/configured (must not be committed to the repo — see general secrets handling, this isn't
a pseudonymised-data concern but the same "never commit" discipline applies).

### Candidate endpoints
- Shape of a candidate record: what fields are available, which map to the platform's resourcing
  flow (4.7) needs (name, contact, resume/CV link, stage, source) — scoped down to just what the
  one prefill button needs as of v1.5, not a general candidate sync.
- How a specific candidate is looked up by candidate ID for the prefill button, and confirm the
  per-field preview/confirmation UX is achievable from whatever shape the lookup endpoint returns.

### Vacancy endpoints
**No longer needed (v1.5).** The vacancy entity lives entirely in the platform now — there is no
PeopleForce vacancy sync in either direction. Skip this investigation entirely; it was based on
the v1.2 assumption that PeopleForce was the source of truth for vacancies, which the changelog
explicitly reverses.

### Custom fields
PeopleForce supports custom fields on candidates — record whether the platform needs to read
these, and if so, how they map (or don't) to this platform's own custom-field system (4.1),
since the two are separate mechanisms serving similar purposes and could get confused.

### Rate limits and webhooks
Record documented limits, and whether webhooks are available/needed (vs. polling) for keeping
candidate data reasonably fresh during an active resourcing request.

### Identity resolution
Per Section 6: a person may exist as a PeopleForce candidate, then later as an employee in this
system. **v1.5 has already decided the anchor for this**: the PeopleForce candidate ID is stored
on every external candidate unconditionally (see above), independent of whether the pull
integration ships. What's still open: how (or whether) a hired candidate's stored PeopleForce ID
gets linked forward to their eventual employee record once they're onboarded — pre-onboarding
linkage is explicitly out of scope for this iteration (spec Section 10), so this may only need to
cover the "still a candidate, proposed in resourcing" case, not full lifecycle linkage.

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
- `docs/requirements/Spec_Changelog_v1.2_to_v1.5.md` — source of the good-to-have scope reduction,
  the prefill-button design, and the never-prefill field list recorded above
- `.claude/rules/pseudonymized-data-only.md` — applies to any candidate data pulled during
  research or testing
- `docs/integrations/timetracker.md` — the sibling integration doc (now the only *required*
  integration as of v1.5)
