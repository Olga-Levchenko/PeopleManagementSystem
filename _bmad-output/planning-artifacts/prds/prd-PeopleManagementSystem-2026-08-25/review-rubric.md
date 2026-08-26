# PRD Quality Review — People Management Platform (prd-PeopleManagementSystem-2026-08-25)

> **Superseded as of 2026-08-26.** Every finding below has since been fixed in `prd.md` (verified
> directly against the live document, not just re-asserted from the party-mode session that first
> flagged this as stale):
> - **High** — bare citation ambiguity (spec §X.Y vs. this PRD's own §X.Y): fixed. Glossary and UJ
>   citations now consistently use the "spec §X.Y; this PRD's §X.Y" dual form throughout.
> - **High** — People Partner had a JTBD but no User Journey: fixed. UJ-6 (Chidi, PP) was added,
>   plus UJ-7 (Priya).
> - **Medium** — FR-31/34 cross-reference looked like a typo: fixed. The note now correctly reads
>   FR-31/32.
> - **Medium** — Accessibility NFR had no bound ("baseline" undefined): fixed. WCAG 2.1 AA is now
>   the explicit `[ASSUMPTION]` baseline target (§6.2, Cross-Cutting NFRs, Assumptions Index).
> - **Low** — Open Question 4 was an out-of-place staffing question: moot. §8 Open Questions has
>   since been restructured/renumbered and no longer contains it.
>
> Kept as a historical record of the first review pass, not as live findings — re-verify against
> the current `prd.md` before acting on anything below.

## Overall verdict

This PRD is decision-ready and unusually disciplined for its stakes: the thesis (kill all-or-nothing
access, kill integration drift) is carried consistently from Vision through FRs into success
metrics, nearly every FR has a genuinely testable consequence, and omissions are tagged and
indexed rather than smuggled in silently. The two real risks are self-inflicted downstream-usability
hazards, not correctness problems: Glossary and UJ cross-references silently switch between the
PRD's own §4.x numbering and the source spec's §4.x numbering with no marker distinguishing them,
and the People Partner — one of the two most data-privileged roles in the whole access model — has
a JTBD entry but no User Journey, leaving `bmad-ux` without a scripted flow for PP-heavy screens.
Neither undermines the spec-level guarantees this document is graded on, but both will cost the
downstream chain (`bmad-architecture`, `bmad-ux`, `bmad-create-epics-and-stories`) real time
untangling references this PRD could have made unambiguous.

## Decision-readiness — strong

Trade-offs are named, not smoothed. §1 Vision states plainly that process wins over shipped
functionality "where the two are in tension" — and the Risk Register (R-1) operationalizes that
into an explicit cut order (DESIGN FREEDOM before NORMATIVE) rather than leaving it as a slogan.
Open Questions in §8 are genuinely open — none of the five come pre-answered in the next sentence —
and the counter-metrics SM-C1/SM-C2 exist specifically to stop the team from gaming SM-1/SM-3,
which is exactly the kind of self-aware NFR/SM pairing the rubric looks for.

### Findings
- **low** Open Question 4 is a staffing question, not a product one (§8) — "Who is the 4th
  foundation-phase contributor and what topic are they researching?" is process logistics, not a
  decision this PRD needs to carry. It's harmless but out of place next to four genuinely
  product-shaped open questions. *Fix:* move to a team/process tracker (e.g. a foundation-phase
  status doc) rather than the PRD's Open Questions list, or drop if already tracked elsewhere.

## Substance over theater — strong

Seven JTBD personas (§2.1) exceeds the rubric's ">4 personas" theater flag on its face, but each
one maps to a functional role with genuinely different section-matrix entitlements and drives
distinct FRs (Employee → FR-13-15, UM → FR-17/20/26, DM → FR-18/27, PM → FR-18/25, PP → FR-19/34,
HR Admin → FR-3) — this is role differentiation doing real work, not persona padding. The Vision
statement (§1) is specific to this org's two failure modes and would not swap into another
company's PRD unchanged. Cross-Cutting NFRs mostly avoid boilerplate: Performance has a hard
number (2s at 500+ records), Availability is defined per-integration in the feature-specific NFRs
under §4.15/§4.16 rather than left as "must be reliable." The one soft spot (Accessibility) is
flagged under Done-ness clarity below rather than here, since it's honestly scoped down rather than
falsely claimed.

## Strategic coherence — strong

The thesis is explicit and the feature set follows it: §4.1/§4.2 (access resolution) and
§4.15/§4.16 (real integrations) are called out in "Why Now" as equally load-bearing as any
user-facing feature, and §6.1 MVP scope mirrors the spec's own NORMATIVE/DESIGN
FREEDOM/GOOD-TO-HAVE gradient rather than inventing an independent prioritization. Success metrics
validate the thesis directly (SM-1 access-control correctness, SM-2 real integrations, SM-3 process
quality) rather than measuring activity — there is no DAU/MAU-shaped metric standing in for a
harder-to-measure outcome. Counter-metrics are real (SM-C1 specifically targets UI-only test
theater, SM-C2 specifically protects SM-3 from being deprioritized under feature pressure).

## Done-ness clarity — strong, one thin spot

FRs are consistently written with testable consequences rather than adjectives — e.g. FR-4's
"not the field, not an empty placeholder revealing its existence," FR-21's "resolved recipient list
is frozen at activation," FR-38's "refused without it" for ending a mentorship pair without final
feedback. This is the dimension the rubric says to be least forgiving on, and the FR set mostly
earns it.

### Findings
- **medium** Accessibility NFR has no bound (Cross-Cutting NFRs; §6.2) — "Responsive layout and
  accessibility for list, profile, and dashboard pages... Scope reduced to baseline for this
  iteration" never defines what "baseline" means operationally (no WCAG level, no specific
  keyboard-navigation criteria, no assistive-tech target). Every other NFR in this section has a
  number or an explicit degraded-mode description; this one is the exception. *Fix:* replace
  "baseline" with a concrete bar — e.g. "keyboard-operable for all interactive elements, visible
  focus states, WCAG 2.1 A for the pages in scope" — even if the full audit is still deferred.

## Scope honesty — strong

Non-Goals (§5) does real work rather than restating the obvious — it explicitly separates "no
compensation section exists" from "rollout/migration planning is out of scope for this bootcamp
iteration," which are different kinds of omission. The `[ASSUMPTION]` / `[NOTE FOR PM]` mechanism
is used at genuine tensions (the Notifications deferral in §6.2 is flagged as "emotionally
load-bearing... even though not formally required," which is an honest admission that a
GOOD-TO-HAVE item still costs something to cut). All seven inline `[ASSUMPTION]` tags round-trip
cleanly into §9's index with no orphans in either direction (see Mechanical notes). Open-items
density (5 Open Questions + 7 Assumptions + 1 NOTE FOR PM) is appropriate for a PRD written on the
build's first day against real unresolved externals (timetracker API shape, cross-system identity
resolution) — this reads as honest uncertainty, not a green-light document dodging its own gaps.

## Downstream usability — thin

This is the dimension most at risk, and it matters most here because the PRD explicitly declares
itself chain-top (§0 Document Purpose: feeds `bmad-architecture`, `bmad-ux`,
`bmad-create-epics-and-stories`).

### Findings
- **high** Bare section-number citations silently mean two different documents. In the body
  (Features §4, Non-Goals §5, NFRs), citations consistently use "§4.X" for the PRD's own numbering
  or "spec §X" for the source spec — but the Glossary (§3) and one UJ citation drop the "spec"
  qualifier entirely while still citing spec numbers: "Resourcing request... (4.7)" and "Feedback
  record... (4.15)" point at spec §4.7/§4.15, but the PRD's *own* §4.7 is Risks and its own §4.15
  is Internal Timetracker Integration — the opposite features. Likewise UJ-2 cites "his UM
  dashboard (4.4.1)," which is spec §4.4.1, while the PRD's own §4.4 is Self-Service, not
  Dashboards (Dashboards is the PRD's §4.5). A reader or a downstream agent doing section-based
  extraction from this PRD alone — exactly the "pulled out alone" test in the rubric — will resolve
  these citations against the wrong section. *Fix:* pick one convention and apply it uniformly:
  either renumber every Glossary/UJ citation to the PRD's own §4.x scheme, or prefix every
  spec-numbered citation with "spec §" the way the rest of the document already does.
- **high** People Partner has a JTBD but no User Journey. §2.1 gives PP a full JTBD entry ("full HR
  visibility (profiles, CDS, feedback, risks)... without any resourcing clutter"), and PP is RW on
  more sections than any role except HR Admin (S2, S4-S9, S12 per the matrix) and is the primary
  actor for FR-19 (PP dashboard), FR-34 (CDS assessments/IDPs), FR-41 (feedback authoring), and
  FR-23 (risk records) — yet none of UJ-1 through UJ-5 has a PP protagonist; every "Realizes"
  tag across §4 points PP-heavy features at UJ-1 (Employee) or UJ-2 (UM) instead. `bmad-ux` will
  have a scripted flow for every other role's screens and none for the PP dashboard or the
  CDS/Feedback/Risk authoring screens PP uses most. *Fix:* add a sixth UJ with a named PP
  protagonist walking through the PP dashboard plus at least one authoring action (e.g. logging a
  risk escalation or authoring a management note), or explicitly note the omission as a scope
  decision if it's intentional.
- **medium** FR-31/34 cross-reference looks like a typo (§4.10 Career Timeline, Notes). The note
  says the time-bounded-records constraint "blocks FR-31/34 outright" — but FR-34 is under §4.11
  CDS (assessment log/IDP), unrelated to the grade/position/department temporal-modeling problem
  the note is actually about. The two FRs under the same feature (§4.10) are FR-31 and FR-32, which
  is almost certainly the intended pair, since this note is architecture-relevant and will be read
  literally by whatever consumes it next. *Fix:* change "FR-31/34" to "FR-31/32," or if FR-34 truly
  is affected, add a sentence explaining why CDS assessment logging depends on time-bounded
  employment records.

## Shape fit — strong

This is correctly built as a capability-spec-with-UJs hybrid rather than forced into either a pure
UJ-driven consumer-product shape or a bare capability list. Given the domain is genuinely
multi-stakeholder with access differing meaningfully by role (the whole point of §4.1/§4.2), named
UJs are load-bearing here rather than overhead — UJ-3 and UJ-5 in particular exist specifically to
exercise cross-role access edge cases (shared-link access before standing access arises; the S7
PM-exception), which is exactly the kind of scenario a bare FR list would leave implicit. The
absence of Monetization/market-positioning sections is correctly justified by the internal-tool
framing rather than silently dropped.

## Mechanical notes

- **Glossary drift**: see Downstream usability finding above — the citation-scheme ambiguity (spec
  §4.x vs. PRD's own §4.x, both written as bare "(4.X)") is the main mechanical issue in this PRD.
  Terminology itself (Access role, Functional role, Manager line, Colleague, Section, Shared link)
  is used identically everywhere it recurs in FRs and UJs — no synonym drift found.
- **ID continuity**: FR-1 through FR-45 are contiguous with no gaps or duplicates across all of §4.
  UJ-1 through UJ-5 are contiguous and each is referenced by ID in a feature's "Realizes" line. SM-1
  through SM-5 plus SM-C1/SM-C2 are contiguous and each SM's "Validates" line points at real FR
  ranges that exist. The one broken internal reference found is the FR-31/34 note above.
- **Assumptions Index roundtrip**: clean. All seven inline `[ASSUMPTION]` tags (§2.3 UJ intro,
  FR-2, FR-44, and three in §6.2) appear indexed in §9, and every §9 entry traces back to a real
  inline tag — no orphans in either direction.
- **UJ protagonist naming**: all five UJs (Priti, Marcus, Lena, Diane, Farah) carry a named
  protagonist with role and situational context inline, per the rubric's requirement — no floating
  UJs. The gap is coverage (no PP protagonist), not naming quality, per the Downstream usability
  finding above.
- **Required sections**: present and scaled appropriately for a launch-grade internal-tool PRD —
  Vision, Target User/JTBD, Glossary, Features/FRs, Non-Goals, MVP Scope, Success Metrics, Open
  Questions, and Assumptions Index are all populated with real content, plus enterprise-appropriate
  additions (Risk Register, Cross-Cutting NFRs, Constraints and Guardrails, Integration and
  Dependencies, Why Now) that the `(Adapt-In: ...)` annotations show were deliberately included for
  this PRD's shape rather than templated in by default.
