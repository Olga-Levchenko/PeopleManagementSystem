# Validation Report — PeopleManagementSystem

- **DESIGN.md:** `DESIGN.md`
- **EXPERIENCE.md:** `EXPERIENCE.md`
- **Run at:** 2026-08-29

## Overall verdict

Strong on flow coverage, token completeness, visual reference coverage, and shape fit — this
spine traces cleanly to the spec's own section numbers throughout, and the four mocks are all
linked, none orphaned. The one real weak spot is state coverage: patterns are defined once and
reused (correctly, for a spine), but not walked per-surface, so implementers will still hit
surface-specific edge cases the spine doesn't call out by name.

The accessibility pass found three real, ordinary gaps (reduced-motion, table semantics,
FlagIndicator's accessible name) that the rubric walker wouldn't have caught on its own — all
three have already been fixed directly in EXPERIENCE.md rather than left as open findings, since
they were cheap and unambiguous. The one accessibility-adjacent thing that looked like a gap but
isn't: shared links dying mid-task with no warning is a deliberate access-control requirement from
the spec, not an oversight.

## Category verdicts

- Flow coverage — Strong
- Token completeness — Strong
- Component coverage — Adequate
- State coverage — Thin
- Visual reference coverage — Strong
- Bloat & overspecification — Strong
- Inheritance discipline — Adequate
- Shape fit — Strong

## Findings by severity

### Critical (0)
None.

### High (1)

**Accessibility review** — No `prefers-reduced-motion` consideration (DESIGN.md Do's and Don'ts /
EXPERIENCE.md)
The sidebar's width transition and the mobile drawer's slide-in are real functional motion; the
spine only addressed decorative motion.
Fix applied: added to Accessibility Floor — functional transitions collapse to instant under
`prefers-reduced-motion: reduce`.

### Medium (2)

**State coverage** — No per-surface state matrix (EXPERIENCE.md > State Patterns)
E.g. "All Employees: 0 results after filtering" vs. "first load, no saved views yet" are distinct
empty states this spine doesn't distinguish.
Fix: follow-up Update pass once implementation surfaces real per-surface edge cases.

**Accessibility review** — Dense-table semantics unspecified (EXPERIENCE.md > Interaction Primitives)
Sort state and inline-edit confirmation were asserted as "keyboard-operable" with no detail on how
a screen-reader user perceives either.
Fix applied: added `aria-sort` for column headers and an `aria-live` confirmation for inline edits.

**Accessibility review** — FlagIndicator's accessible name unconfirmed (EXPERIENCE.md > Component
Patterns > FlagIndicator)
A visually unambiguous toggle can still announce as a bare "button, not pressed" with no
indication of which S7 flag it is.
Fix applied: FlagIndicator's accessible name now states the flag itself, e.g. "Visible for
employee: Off."

### Low (3)

**Token completeness** — Contrast unconfirmed for two severity ramp steps (DESIGN.md /
EXPERIENCE.md Accessibility Floor)
`severity-attention` and `severity-medium` need an explicit AA check against `background`, not
confirmed passing.
Fix: run a real contrast check once these render in code. Tracked openly, not blocking.

**Component coverage** — Button had no EXPERIENCE.md Component Patterns row (EXPERIENCE.md >
Component Patterns)
Defensible (no behavioral delta) but unconfirmable without cross-checking DESIGN.md.
Fix applied: added a one-line Button entry.

**Inheritance discipline** — `epics.md` listed in sources but never cited by name (EXPERIENCE.md
frontmatter > sources)
Shaped which journeys got picked indirectly rather than being cited by section number.
Fix: none needed.

## Reviewer files
- `review-rubric.md`
- `review-accessibility.md`
