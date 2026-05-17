# ADR-0004: Study state and drill mode

**Status**: Proposed
**Date**: 2026-05-17
**Depends on**: ADR-0001 (move tree), ADR-0003 (PGN import)

## Context

Loading *The Iron English* as a PGN tree gets the content in. It does not get the content into the user's head. The tool's purpose is to **let the user play the white repertoire from memory** — to convert a tree on disk into recall. That is a fundamentally different interaction from analysis-board navigation. The questions the user needs answered are:

1. **Where am I in the chapter?** The book has many lines; opening it cold means "which sub-chapter am I supposed to be reviewing today?"
2. **What have I not seen yet?** Unstudied lines are invisible in a flat tree view.
3. **What did I get wrong last time?** Mistakes deserve more attention than mastered lines.
4. **Can I play the line from memory?** The only honest test.

A linear move list can't answer these. Status badges, a chapter index, and a drill mode can.

The user is already doing this work mentally while reading the paper book — fingering the page, trying to recall the next move, flipping back when wrong. The tool's job is to externalise that loop so it's faster, less error-prone, and tracked.

## Decision

Three pieces, layered:

1. **Per-node study state** — already provisioned in the ADR-0001 schema as `status`, `lastSeenAt`, `reviewCount`. Wire it up.
2. **A drill mode** — given a side and a subtree root, the user plays the tree from memory; the tool grades each reply.
3. **A chapter/section overlay** — group subtrees of the tree under named sections so "where am I" becomes answerable.

### Per-node study state

Three statuses, in order of mastery:

| Status | Meaning | Visual in move list |
|---|---|---|
| `unseen` (or null) | User has never confirmed they know this move | (default styling) |
| `reviewing` | User has played the move at least once but missed it recently or hasn't drilled it enough | amber dot beside the SAN |
| `known` | Confirmed via drill mode, recently | small ✓ beside the SAN |

Plus two timestamps and a counter:

- `lastSeenAt`: epoch ms of the most recent time this node was "visited" (drilled, navigated to, or reviewed).
- `lastDrilledAt`: epoch ms of the most recent drill attempt at this node.
- `reviewCount`: total successful drills.

Status transitions:

- **unseen → reviewing**: user navigates to the node manually (passive viewing); or fails the node in drill mode.
- **reviewing → known**: user drills the node successfully twice in a row OR three times total with the most recent within 7 days.
- **known → reviewing**: drill attempt fails OR `lastDrilledAt` older than 30 days (decay).

These thresholds are deliberately simple. **No SM-2, no FSRS, no spaced-repetition scheduler in v1.** Real spaced repetition assumes atomic facts; chess lines are sequential and shared (a node deep in a sub-line is only reachable by playing its ancestors correctly). Proper SR for opening study is a research problem; a simple "what's stale, what's failed" filter solves 80% of the value for 5% of the work. Revisit if the simple version proves insufficient.

### Drill mode

A modal mode that takes over the board UI. Three settings:

- **Side**: which color the user is playing as. For Iron English study, this is white.
- **Root**: which subtree to drill. Defaults to the tree root; can be set to any node (right-click → "Drill from here").
- **Strictness**:
  - *Mainline only* — accept only `childIds[0]` as correct.
  - *Any book move* — accept any of `childIds`, treat them all as legitimate book moves.
  - *Default*: any book move. The book itself recommends multiple moves in some positions.

The drill loop:

```
current = rootOfDrill
loop:
  if it is the user's turn (currentNode's child belongs to user's color):
    show board, accept input
    on move:
      if move matches a child SAN that satisfies strictness:
        mark that child as success → tick reviewCount, update lastDrilledAt, transition status
        current = that child
      else:
        mark current's mainline child as failure → status drops to 'reviewing'
        show the correct move(s)
        wait for user to play one of them
        current = that child
        do NOT count this as success
  else (it's the book's turn / opponent's turn):
    pick a child (mainline by default; optionally random among children to vary responses)
    auto-play it after a 400ms pause so user sees it
    current = chosen child

  if current is a leaf (no children): drill complete for this branch
```

Two important design decisions:

1. **Opponent variety**: optional toggle "Vary opponent responses" picks a non-mainline child with probability proportional to its sibling rank weighting. This is how Williams structures the book — black has many tries; white must know the answer to each. Default off (mainline only) for v1; turn on for advanced drill.

2. **Failure handling**: on a wrong move, do NOT advance until the user plays a correct move. Do NOT show the answer immediately; wait 5 seconds or until they hit `?`. This gives the brain a chance to recall before being told.

### Drill UI

When drill mode is active:

- Move list collapses to a status strip: "Drilling: King's English mainline · 7/12 nodes · 1 miss"
- Engine arrows hidden (no peeking).
- A small "give up" / "show answer" button.
- After a miss, a banner appears: "Expected: c4. You played: d4." with a `Next` button.
- On completion: summary modal — "Completed 12 nodes. 1 miss at move 4 (...c5)." with a button to drill just the misses again.

### Chapter / section overlay

Add a `tags` field to nodes (optional):

```js
{
  ...node,
  tags: { chapter?: string, section?: string }
}
```

A node tagged `chapter: "Chapter 3: The King's English"` marks the start of that chapter. All descendants belong to it unless overridden. PGN import can populate this from header comments (`{Chapter 3: ...}` at the top of a variation is a common convention) or the user sets it manually via right-click → "Mark as chapter start."

A new panel section "Chapters" lists all chapter tags found in the tree. Clicking jumps to that node. Each chapter shows aggregate stats: `42 nodes · 28 known · 9 reviewing · 5 unseen`. This answers question 1 (where am I) and question 2 (what have I not seen).

## Persistence

Study state lives in the same tree blob, in localStorage `chess_analysis_saves_v2` (per ADR-0001). No new storage. This is deliberate: deleting a saved line should also delete its study history. They are co-fated.

A future ADR may move saves to IndexedDB or a Tauri-backed SQLite file if the data grows past localStorage's ~5MB practical limit. For one repertoire book of ~500 nodes that limit is not in sight.

## Validation

A drill session is correct if:

1. Only nodes whose color-to-move matches the user's chosen side are presented for input.
2. Auto-played opponent moves are always legal children of the current node.
3. A successful drill of every node from root reaches every leaf reachable from root.
4. Status transitions match the table above. Unit test: feed a synthetic tree + a sequence of (drill, success) and (drill, fail) events, assert final statuses.

## Consequences

### Positive
- The tool now does what a paper book cannot: tell the user what they don't know.
- Drill mode is the closest analog to real over-the-board recall and is the highest-value workflow for repertoire memorisation.
- Status badges in the move list answer "what's left" at a glance.
- The simple status model is auditable and obvious; no black-box scheduler.

### Negative
- Drill mode is significant new UI surface. Estimate two sessions to build well.
- The "any book move" strictness setting means the success criterion is fuzzy in positions where the book gives 3 alternatives. Documented as a feature.
- Naive decay (30 days → reviewing) is wrong for material the user has practised heavily. Acceptable for v1; revisit when it bites.

### Neutral
- Tags on nodes are optional; trees imported without them work fine, just without chapter aggregation.

## Out of scope

- True spaced repetition (FSRS, SM-2). Would require treating each position as an atomic card and modelling forgetting curves; deferred until simple status proves insufficient.
- Drilling the opponent side. Possible but inverts every assumption; ship one direction first.
- Auto-generating practice positions from engine analysis ("Stockfish says here's a critical position you should know"). Belongs in a separate "analysis assistant" ADR.
- Cloud sync across devices. The user is on a single laptop. Defer.

## Open questions

1. **Should drill mode count time-to-move as a metric?** Tempting, but adds anxiety and rewards speed over understanding. Default off. Make it a toggle if requested.
2. **Should there be a "blunder check" mode** — drill, but with the engine running and flagging moves below the book recommendation? Probably yes, but as a separate mode, not a drill option. ADR-0006 fodder.
3. **What happens when the tree changes underneath the study state?** If the user deletes a subtree, the study state for those nodes goes with them (per "co-fated" decision). If the user adds a new variation, it's `unseen`. If they re-order siblings, study state is preserved (it's keyed on node id, not position).
