---
id: CONV-0001
scope: repo
owner: human
verified_at: 2026-08-26
---

# Conventions

House rules that apply to every change in this repository. Keep this list short
and specific: a rule nobody can violate mechanically is a rule that will be
violated. Where a rule can be checked by a command, say so — in Phase 3 those
become gate checks and stop costing context.

## Working agreement

- Match the surrounding code. Naming, comment density and idiom are local
  conventions, not global ones.
- Change the smallest surface that solves the problem. If a fix needs a wider
  blast radius, say so before making it, not after.
- A test that mocks away the behaviour under test is worse than no test.

## Rules

_Add rules as you find yourself repeating them. One line each, imperative mood._

- Write an ADR in `docs/adrs/NNNN-short-kebab-title.md` for any feature,
  architectural change, or non-obvious fix — release notes are generated
  from ADRs. Skip only for small cosmetic fixes.
- Edit slices under `slices/`, never the older root-level copies
  (`chess.js`, `board.jsx`, `panel.jsx`).
