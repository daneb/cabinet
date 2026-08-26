---
id: TASKS-0001
slug: remove-pattern-drill
schema: keel.tasks/1
---

# Tasks

Each task must name the criteria it satisfies, the files it touches, a line
budget and an exit condition. G1 checks all four, and checks that every
criterion in the spec is covered by at least one task.

Add `- depends_on: T-1` where order matters. Tasks with no dependency on
each other form a wave; `keel tasks` shows them.

### T-1 Mark endgame and mate categories not drillable
- criteria: AC-1, AC-2
- files: slices/patterns/patterns-data.js, tests/patterns/patterns-data.test.js
- budget: 30
- exit: add `drillable: false` to the `mate` and `endgame` entries in
  `CATEGORIES`; `node --test tests/patterns/patterns-data.test.js` passes,
  including the two new tests asserting each category's `drillable` is
  `false`.

### T-2 Hide the Drill button for non-drillable categories
- criteria: AC-3
- files: slices/patterns/patterns-panel.jsx
- budget: 15
- depends_on: T-1
- exit: the per-pattern action row renders "View" unconditionally and
  "Drill" only when `window.Patterns.CATEGORIES.find(c => c.id ===
  p.category)?.drillable` is truthy; manual check in the running app shows
  no "Drill" button under "Checkmate patterns" or "Endgame technique".

