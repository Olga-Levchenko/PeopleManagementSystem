---
name: People Management Platform
description: Internal HR/people-management platform for a 500+-person engineering org; shadcn/ui (radix-nova) on React + Vite + Tailwind v4. This DESIGN.md mirrors the tokens already committed in services/frontend/src/index.css and components.json, plus the product-specific severity/status layer those files don't yet have.
status: final
updated: 2026-09-01
colors:
  # Zinc base - light (verbatim from index.css)
  background: 'oklch(1 0 0)'
  foreground: 'oklch(0.145 0.004 286)'
  card: 'oklch(1 0 0)'
  card-foreground: 'oklch(0.145 0.004 286)'
  popover: 'oklch(1 0 0)'
  popover-foreground: 'oklch(0.145 0.004 286)'
  secondary: 'oklch(0.961 0.003 286)'
  secondary-foreground: 'oklch(0.205 0.008 286)'
  muted: 'oklch(0.961 0.003 286)'
  muted-foreground: 'oklch(0.556 0.012 286)'
  accent: 'oklch(0.961 0.003 286)'
  accent-foreground: 'oklch(0.205 0.008 286)'
  border: 'oklch(0.898 0.003 286)'
  input: 'oklch(0.898 0.003 286)'
  # Blue accent - light
  primary: 'oklch(0.488 0.243 264.376)'
  primary-foreground: 'oklch(0.985 0 0)'
  destructive: 'oklch(0.577 0.245 27.325)'
  destructive-foreground: 'oklch(0.985 0 0)'
  ring: 'oklch(0.488 0.243 264.376)'
  # Chart - generic data visualization, NOT severity (see severity-* below)
  chart-1: 'oklch(0.646 0.222 264.376)'
  chart-2: 'oklch(0.6 0.118 184.704)'
  chart-3: 'oklch(0.398 0.07 227.392)'
  chart-4: 'oklch(0.828 0.189 84.429)'
  chart-5: 'oklch(0.769 0.188 70.08)'
  # Sidebar - light
  sidebar: 'oklch(0.985 0 0)'
  sidebar-foreground: 'oklch(0.145 0.004 286)'
  sidebar-primary: 'oklch(0.205 0.008 286)'
  sidebar-primary-foreground: 'oklch(0.985 0 0)'
  sidebar-accent: 'oklch(0.961 0.003 286)'
  sidebar-accent-foreground: 'oklch(0.205 0.008 286)'
  sidebar-border: 'oklch(0.898 0.003 286)'
  sidebar-ring: 'oklch(0.398 0.045 286)'
  # Dark-mode pairs (verbatim from index.css .dark block; CSS variables exist and are
  # ready to use, but no UI toggle switches the .dark class yet - see EXPERIENCE.md State Patterns)
  background-dark: 'oklch(0.145 0.008 286)'
  foreground-dark: 'oklch(0.985 0.001 286)'
  card-dark: 'oklch(0.145 0.008 286)'
  card-foreground-dark: 'oklch(0.985 0.001 286)'
  popover-dark: 'oklch(0.145 0.008 286)'
  popover-foreground-dark: 'oklch(0.985 0.001 286)'
  secondary-dark: 'oklch(0.205 0.012 286)'
  secondary-foreground-dark: 'oklch(0.985 0.001 286)'
  muted-dark: 'oklch(0.205 0.012 286)'
  muted-foreground-dark: 'oklch(0.708 0.012 286)'
  accent-dark: 'oklch(0.205 0.012 286)'
  accent-foreground-dark: 'oklch(0.985 0.001 286)'
  border-dark: 'oklch(0.269 0.015 286)'
  input-dark: 'oklch(0.269 0.015 286)'
  primary-dark: 'oklch(0.646 0.222 264.376)'
  primary-foreground-dark: 'oklch(0.145 0.008 286)'
  destructive-dark: 'oklch(0.45 0.18 27.325)'
  destructive-foreground-dark: 'oklch(0.985 0 0)'
  ring-dark: 'oklch(0.646 0.222 264.376)'
  sidebar-dark: 'oklch(0.19 0.01 286)'
  sidebar-foreground-dark: 'oklch(0.985 0.001 286)'
  sidebar-primary-dark: 'oklch(0.646 0.222 264.376)'
  sidebar-primary-foreground-dark: 'oklch(0.145 0.008 286)'
  sidebar-accent-dark: 'oklch(0.205 0.012 286)'
  sidebar-accent-foreground-dark: 'oklch(0.985 0.001 286)'
  sidebar-border-dark: 'oklch(1 0 0 / 10%)'
  sidebar-ring-dark: 'oklch(0.708 0.012 286)'
  # Severity ramp - NEW, product-specific (risk levels: low/need-attention/medium/high/leaver).
  # Not derived from chart-1..5 (those are generic data-viz, unrelated meaning).
  severity-low: 'oklch(0.65 0.15 145)'
  severity-low-dark: 'oklch(0.75 0.15 145)'
  severity-attention: 'oklch(0.75 0.15 90)'
  severity-attention-dark: 'oklch(0.8 0.15 90)'
  severity-medium: 'oklch(0.75 0.18 60)'
  severity-medium-dark: 'oklch(0.8 0.18 60)'
  severity-high: 'oklch(0.577 0.245 27.325)'
  severity-high-dark: 'oklch(0.45 0.18 27.325)'
  severity-leaver: 'oklch(0.55 0.20 310)'
  severity-leaver-dark: 'oklch(0.65 0.20 310)'
typography:
  display:
    fontFamily: 'Geist Variable'
    fontSize: 30px
    fontWeight: '700'
    lineHeight: '1.2'
  heading:
    fontFamily: 'Geist Variable'
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.3'
  body:
    fontFamily: 'Geist Variable'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label:
    fontFamily: 'Geist Variable'
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
    letterSpacing: 0.02em
  muted:
    fontFamily: 'Geist Variable'
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
rounded:
  sm: 6px
  md: 8px
  lg: 10px
  xl: 14px
  full: 9999px
  DEFAULT: 10px
spacing:
  # Tailwind default scale inherited (1=4px, 2=8px, 4=16px, ...) - no overrides.
  # Only these two layout-specific, non-Tailwind-scale dimensions are custom:
  header-height: 3rem
  sidebar-width: 15rem
  sidebar-collapsed-width: 3.75rem
components:
  button:
    note: 'Inherits stock shadcn Button unmodified - default/secondary/outline/ghost/destructive variants, no overrides.'
  severity-badge:
    dot-low: '{colors.severity-low}'
    dot-attention: '{colors.severity-attention}'
    dot-medium: '{colors.severity-medium}'
    dot-high: '{colors.severity-high}'
    dot-leaver: '{colors.severity-leaver}'
    dot-shape: '{rounded.full}'
    label-color: '{colors.foreground}'
    label-font: '{typography.label}'
    trend-icon-up: 'lucide:trending-up'
    trend-icon-down: 'lucide:trending-down'
  status-pill:
    background: '{colors.secondary}'
    foreground: '{colors.secondary-foreground}'
    background-overdue: '{colors.destructive}'
    foreground-overdue: '{colors.destructive-foreground}'
    radius: '{rounded.full}'
    font: '{typography.label}'
  flag-indicator:
    on-background: '{colors.primary}'
    on-foreground: '{colors.primary-foreground}'
    off-background: '{colors.muted}'
    off-foreground: '{colors.muted-foreground}'
    radius: '{rounded.md}'
    font: '{typography.label}'
  avatar:
    fallback-background: '{colors.muted}'
    fallback-foreground: '{colors.muted-foreground}'
    shape: '{rounded.full}'
    font: '{typography.label}'
    note: "Photo-first (S1 photo); initials on the fallback tokens above when no photo is set. Never a per-person hashed/random color - that reads as decorative, against Do's and Don'ts."
---

# People Management Platform — Design Spine

## Brand & Style

Quiet, precise, trustworthy. This is not a consumer product and not a corporate-cold enterprise
tool either — it's the system 500+ people's managers, HR partners, and the people themselves use
to handle genuinely sensitive information (personal contacts, risk assessments, management notes
about them). Restraint is the brand: no gamification language, no exclamation points, no
decorative flourishes competing with the data. Zinc + Blue already reads this way — a warm neutral
base with one confident accent color, nothing louder.

The one place the palette gets expressive is the **severity ramp** (below), and even there,
expressive means *legible*, not decorative — color is reinforcement, never the only signal.

## Colors

- **Zinc base** (`background`/`foreground`/`card`/`popover`/`secondary`/`muted`/`accent`/`border`/`input`)
  — the neutral surface everything sits on. Warm gray, not cold gray; OKLCH throughout so lightness
  steps stay visually even across light and dark.
- **Blue accent** (`primary`, `ring`) — the one color for calls to action and focus states. Used
  nowhere else; a page with three different "important" blues stops meaning anything.
- **`destructive`** — errors, rejections, delete actions, and (see below) risk level *high*
  specifically, because that's genuinely the same kind of signal.
- **`chart-1..5`** — reserved for generic data visualization (analytics charts, if 4.14 gets built).
  Never used for severity — that's a different vocabulary with a different meaning, and reusing
  chart colors for risk would make both mean less.
- **`severity-*`** — the five-level risk ramp (low → need attention → medium → high → leaver),
  green through purple. `severity-high` is deliberately the *same value* as `destructive`, not a
  coincidentally similar red — high risk should read exactly like "something is wrong," full stop.
  `severity-leaver` is its own hue (purple, not a redder red) specifically so it's never visually
  confused with *high* or with the unrelated `dismissed` employment-status fact — the spec is
  explicit that leaver (a prediction) and dismissed (a fact) must never be conflated anywhere,
  including visually.

## Typography

One typeface, Geist (Variable), already an installed dependency but not yet wired into the app —
activating it is in scope for this pass. No second typeface; at this information density (dense
tables, multi-section profiles), font-switching adds noise, not hierarchy.

Scale: `display` (page titles — one per page, e.g. "Chidi Igwe" on a profile header) → `heading`
(section titles — "Personal contacts," "Risks") → `body` (default reading size, everywhere) →
`label` (table headers, form labels, badge/pill text — slightly letter-spaced, medium weight, reads
as UI chrome rather than content) → `muted` (secondary/supporting text, pairs with the
`muted-foreground` color token).

## Layout & Spacing

Tailwind's default spacing scale, unmodified — no product-specific gutter or margin tokens beyond
what Tailwind already ships. The only custom spacing values are structural layout dimensions that
aren't really "spacing" in the token sense: `header-height`, `sidebar-width`,
`sidebar-collapsed-width` — all already CSS variables in `index.css`, referenced by the sidebar's
collapse/expand transition.

## Elevation & Depth

Inherits shadcn's default shadow scale unmodified. Nothing in the codebase overrides it, and this
platform's information density (dense tables, stacked profile sections) calls for restraint here
too — elevation should separate a modal from its backdrop, not decorate every card.

## Shapes

One radius value, `0.625rem` (10px), drives everything via the standard shadcn derivation
(`sm` = radius − 4px, `md` = radius − 2px, `lg` = radius, `xl` = radius + 4px, `full` = 9999px for
pills/dots). Soft but not rounded-to-the-point-of-playful — consistent with the "precise, not
decorative" brand posture.

## Components

- **Button** — stock shadcn, all five variants, no customization.
- **SeverityBadge** — a colored dot (`severity-*` token) + text label (never color alone — a
  colorblind manager reading only the dot must not lose the signal) + an optional trend arrow,
  shown only when the level changed from the immediately previous record (per spec: no arrow on
  first record or an unchanged level). Used identically on the Risk Dashboard, a profile's S6
  section, and any dashboard summary counter that surfaces risk — one implementation, not five.
- **StatusPill** — a neutral lifecycle chip (open/completed/overdue/cancelled for action items;
  pending/approved/rejected/closed for resourcing requests; completed/pending/overdue for campaign
  recipients). Uses `secondary`/`muted`/`destructive` tokens, not the severity ramp — a status is
  not a risk level and must not borrow that vocabulary.
- **FlagIndicator** — the on/off control + state display for S7's two independent flags (visible
  for employee, visible for PM). Must read unambiguously as *off* by default — this gates real
  access, not a cosmetic preference, so it can't look like an inert checkbox someone might miss.
- **Avatar** — a small circle for any field that references another employee (a row's own name,
  or a Manager/People Partner/Mentor reference elsewhere): the person's own S1 photo when set,
  otherwise initials on the fallback tokens. Deliberately *not* a per-person random/hashed color —
  this platform's restraint posture (see Brand & Style) rules out decoration for its own sake, even
  where a denser list (e.g. All Employees) would visually benefit from more color variety.

## Do's and Don'ts

- **Do** use semantic tokens exclusively — `bg-background`, `text-foreground`, `bg-card`, etc.
  Never a raw Tailwind palette class, never a hex literal, never an inline style, never a manual
  `dark:` variant (the token pair already handles it).
- **Do** pair every severity/status color with a text label. Color is reinforcement.
- **Don't** introduce a second "red" or a second "important blue" — `destructive` and `primary`
  are each the one true answer for their meaning.
- **Don't** reuse `chart-*` tokens for severity, or vice versa (see Colors, above).
- **Don't** add decorative motion, gradients, or illustration. Nothing in this spec calls for it,
  and the brand posture (quiet, precise) actively argues against it.
