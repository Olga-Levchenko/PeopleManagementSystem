# Pseudonymized data only

Per `docs/requirements/project-requirements.md` Section 7: the system holds personal data of
real people. **Never put real personal data anywhere in this repo, in logs, or in agent
context.** This is a hard rule, not a style preference — a leak here is treated the same as an
access-control leak.

## What counts as real personal data

Names, personal emails/phones, residential addresses, birthdays, photos, emergency contacts, or
any other identifying detail belonging to an actual person — whether an employee, a candidate
pulled from PeopleForce, or a timetracker user. This includes data pasted from Teams calls, Jira
tickets, spreadsheets, or screenshots, not just data typed directly into code.

## What to use instead

Pseudonymised data: **real structure and volume, substituted names and contacts.** Seed data,
fixtures, and test cases should look like production in shape (500+ employees, realistic org
depth, realistic project fan-out) but every identifying field must be fabricated.

## Where this applies

- **Committed files**: seed scripts, fixtures, test data, ADRs, integration research notes,
  meeting-note summaries in `docs/decisions/`.
- **Logs**: application logs, error traces, and any debug output — real request payloads must be
  scrubbed before they're logged, not just before they're committed.
- **Agent context**: do not paste real employee/candidate records into a prompt, a plan, or a
  subagent task description, even transiently. If you're debugging against real integration data
  (PeopleForce, timetracker) during foundation-phase research, summarize the *shape* of the
  response (field names, types, pagination behavior) rather than pasting real records.
- **Screenshots and exports**: any screenshot or `.xlsx` export attached to a PR, ticket, or doc
  must use pseudonymised data, same as the underlying test fixtures.

## Integration research specifically

Section 5 requires investigating the real PeopleForce and timetracker APIs during the foundation
phase. When recording findings in `docs/integrations/`, capture endpoint shapes, auth flows, rate
limits, and field lists — not real candidate or employee records returned during exploration.

## Related

- `docs/requirements/project-requirements.md` Section 7 — normative source of this rule.
- `.claude/rules/access-control-invariants.md` — the adjacent, larger concern this rule protects
  data for.
