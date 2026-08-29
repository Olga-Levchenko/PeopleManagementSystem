# Accessibility Review — PeopleManagementSystem

Scope: EXPERIENCE.md's Accessibility Floor + State Patterns + Interaction Primitives, against the
spec's own Section 7 NFR ("Accessibility and responsive layout"). Adversarial pass — assume the
spine's accessibility claims are optimistic until the text actually backs them up.

## Verdict: adequate, with three real gaps worth closing before this goes to implementation

The spine gets the hardest, most product-specific call right — color never alone for
severity/status — and that's the one a generic accessibility checklist wouldn't have caught for
you, because it required understanding what "severity" means in this domain. The gaps below are
the more ordinary ones a generic audit *would* catch, and the spine currently either doesn't
address them or asserts them without backing detail.

## Findings

- **high** No `prefers-reduced-motion` consideration anywhere, despite the sidebar having a real
  animated transition (`--transition-sidebar: width 200ms`) and the mobile drawer sliding in via
  `translate-x`. DESIGN.md's Do's and Don'ts bans *decorative* motion but says nothing about
  *functional* motion respecting a user's reduced-motion preference — those are different claims,
  and only the first is currently made. *Fix:* add a line to Accessibility Floor: functional
  transitions (sidebar width, drawer slide) collapse to instant/near-instant under
  `prefers-reduced-motion: reduce`.

- **medium** Table semantics for the two densest surfaces (All Employees, Risk Dashboard) aren't
  specified beyond "keyboard-operable." A sortable column needs its sort state announced
  (`aria-sort`), and a 500+-row table with inline editing needs a stated approach for how a screen
  reader user knows which row/column an edit landed in — right now the spine asserts inline
  editing "writes through" but says nothing about the confirmation signal beyond visual state.
  *Fix:* add to Interaction Primitives or Accessibility Floor: inline-edit confirmation is
  announced (e.g., `aria-live` region), not purely a visual checkmark/flash.

- **medium** FlagIndicator's Accessibility Floor claim ("must read unambiguously as off by
  default") is stated as a *visual* requirement in Component Patterns but never confirmed to also
  be a *text* label for screen readers. A toggle that's visually unambiguous (color, position) can
  still announce as just "button, not pressed" with no indication of *what* is off. This is the
  component gating real access-control-relevant information (S7 visibility) — it's the one place
  in the whole spine where an accessibility gap and an information-disclosure gap are almost the
  same bug. *Fix:* FlagIndicator's accessible name must state the flag itself: "Visible for
  employee: Off," not a bare toggle.

## What's already solid — not re-litigating

- Color-never-alone for severity/status (DESIGN.md, EXPERIENCE.md Accessibility Floor) — correctly
  identified as the domain-specific risk, not a generic checklist item.
- Icon-only controls carrying `aria-label` — stated explicitly, correctly scoped to the actual
  icon-only controls that exist (sidebar toggle, mobile hamburger, mark-complete).
- Focus-return-on-modal-close — stated, though see the contrast finding in `review-rubric.md` §2
  for the one open item this review defers to that file rather than duplicating.
- The shared-link's "access dies mid-task, no warning" behavior is **not** an accessibility gap
  despite superficially resembling one (WCAG generally wants session-timeout warnings) — the spec
  is explicit this is a deliberate access-control requirement (revocation must be immediate, not
  soft), and overriding a security requirement for a UX nicety would be the wrong call here. Not a
  finding.
