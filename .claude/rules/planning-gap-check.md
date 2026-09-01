---
description: Run planning-gap-audit before story recommendations, spec approval, implementation, done, or sprint reorder
globs:
alwaysApply: true
---

# Planning gap check

Before **recommending the next story**, **approving a story spec**, **starting implementation**,
**marking a story complete**, or **changing epic/sprint order**, read and follow:

`.claude/skills/planning-gap-audit/SKILL.md`

Do not proceed on that action until the audit completes and reports a Gap Register with verdict
(`PROCEED`, `PROCEED WITH CONDITIONS`, or `STOP`). **Stop** on Critical unowned or blocking gaps.

Never invent or edit epics, stories, `sprint-status.yaml`, or specs without explicit user approval.
Detailed checklist and output format live in the skill only.

Cursor mirror: `.cursor/rules/planning-gap-check.mdc` — keep both in sync by hand if either changes.
