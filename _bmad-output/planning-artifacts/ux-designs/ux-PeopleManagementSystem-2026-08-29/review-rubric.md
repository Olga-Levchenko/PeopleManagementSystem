# Spine Pair Review — PeopleManagementSystem

## Overall verdict

Strong on flow coverage, token completeness, visual reference coverage, and shape fit — this
spine traces cleanly to the spec's own section numbers throughout, and the four mocks are all
linked, none orphaned. The one real weak spot is state coverage: patterns are defined once and
reused (correctly, for a spine), but not walked per-surface, so implementers will still hit
surface-specific edge cases the spine doesn't call out by name. Nothing here blocks moving
forward; the state-coverage gap is worth a follow-up pass once implementation starts surfacing
real edge cases, not before.

## 1. Flow coverage — strong

All 7 Key Flows in EXPERIENCE.md trace to a named protagonist (Chidi, Olena, Diana, Oleh, Anton,
Viktor+Dmytro, Vagif), numbered steps, an explicit **Climax** beat, and a **Failure path**. Every
flow ties to specific spec sections (2.1, 2.3, 2.4, 3.2, 3.3, 4.3–4.17) rather than restating them
generically.

### Findings
None.

## 2. Token completeness — strong

Every color, typography, rounded, spacing, and component token in DESIGN.md's frontmatter is
defined with a value (OKLCH, verbatim from `services/frontend/src/index.css`); light/dark pairs
exist for every color that needs one. Every `{path.to.token}` reference inside the `components`
block resolves to a real frontmatter entry.

### Findings
- **low** Contrast for `severity-attention` and `severity-medium` against `background` is flagged
  as needing an explicit AA check, not confirmed passing (DESIGN.md/EXPERIENCE.md Accessibility
  Floor). *Fix:* run a real contrast check once these render in code; tracked, not silent.

## 3. Component coverage — adequate

SeverityBadge, StatusPill, and FlagIndicator each have a real visual-spec row in DESIGN.md and a
real behavioral-spec paragraph in EXPERIENCE.md's Component Patterns — not one-word descriptions.

### Findings
- **low** `button` has a DESIGN.md row ("inherits stock shadcn, no overrides") but no
  corresponding EXPERIENCE.md Component Patterns entry. *Fix:* defensible as-is since there's no
  behavioral delta to specify, but a one-line "no behavioral delta from stock shadcn" entry would
  close the gap for a downstream reader scanning Component Patterns for completeness.

## 4. State coverage — thin

State Patterns names real, reused states (Empty, Cold-load, Stale-integration banner,
Focus/keyboard, Permission-adjacent absence, Offline/request failure, Dark mode-not-yet-toggled)
grounded in actual spec requirements (the 5.1 stale-data banner, the "no permission-denied
message" rule). What it doesn't do is walk each of the 10 Information Architecture surfaces and
confirm which states apply to which — e.g., "All Employees: 0 results after filtering" vs. "All
Employees: first load, no saved views yet" are two different empty states this spine doesn't
distinguish.

### Findings
- **medium** No per-surface state matrix exists; State Patterns is pattern-level only. *Fix:* a
  follow-up Update pass, once implementation surfaces real per-surface edge cases, should walk
  each IA row and confirm/extend which of the seven named patterns applies and where a
  surface-specific state (e.g., "resourcing request with 0 candidates proposed yet" vs. "1
  proposed") needs its own line.

## 5. Visual reference coverage — strong

Four mocks in `mockups/`: `key-employee-profile.html`, `key-dm-dashboard.html`,
`key-all-employees.html`, `key-risk-dashboard.html`. Every one is linked inline at the spine
section it illustrates (three in Key Flows, one in Component Patterns). No orphans, no unspecific
references — each link states exactly what it shows.

### Findings
None.

## 6. Bloat & overspecification — strong

No pixel-level specs where tokens already cover it, no restated FRs/personas, no decorative
narrative untied to an actual decision. DESIGN.md's Brand & Style carries editorial voice
appropriately (the spec explicitly allows this); EXPERIENCE.md prose stays factual/behavioral
throughout, matching its own Voice and Tone rules for the product it describes.

### Findings
None.

## 7. Inheritance discipline — adequate

`sources` frontmatter resolves to real files (five of the six actually cited across the spine's
own prose; the sixth, `epics.md`, is listed but not directly quoted from — it informed IA
indirectly via the confirmed journeys rather than being cited by section number the way the spec
is). Component names are consistent in *meaning* across both files, though DESIGN.md uses
kebab-case YAML keys (`severity-badge`) while EXPERIENCE.md prose uses PascalCase
(`SeverityBadge`) — the standard convention split between a YAML key and an eventual React
component/file name, not an inconsistency.

### Findings
- **low** `epics.md` is listed in `sources` but never cited by name/section inside the spine body,
  unlike the other five sources. *Fix:* no action needed — it shaped which journeys got picked
  (the IA surfaces map to epics that already existed), it just doesn't have its own section
  numbers to cite the way the spec does.

## 8. Shape fit — strong

DESIGN.md sections are in canonical order (Brand & Style → Colors → Typography → Layout & Spacing
→ Elevation & Depth → Shapes → Components → Do's and Don'ts), none out of order, none missing that
apply here. EXPERIENCE.md carries all eight required-default sections plus Responsive & Platform
(correctly triggered by the confirmed multi-breakpoint decision). Inspiration & Anti-patterns is
correctly omitted — no reference products or rejected directions came up in Discovery to document.

### Findings
None.

## Mechanical notes

No broken cross-references found (all four mockup links resolve to files that exist). No Mermaid
diagrams in either spine. Frontmatter parses as valid YAML in both files. No name inconsistencies
found beyond the kebab-case/PascalCase convention split noted in §7, which is expected, not a
defect.
