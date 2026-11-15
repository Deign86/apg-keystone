# 0021. A Home figure can count what the other modules contribute

Status: Accepted · Date: 2026-11-15

## Context

- **Every tile on Home shows one live figure at its foot** (`ModuleDef.stat`), except Overview's. Its tile had a blank
  foot where every other tile has a number, and the design inspector flagged the band (`panel-void`).
- **Overview owns no records.** Its screen only collects what the installed modules contribute (their `figure`,
  `finding`, `waiting` and `create`), reading them from the registry, as a collector screen may (docs/adr/0002, 0005).
- **A `stat` was given only the records and the clock** (`(state, ctx)`), so Overview's figure, the number of items
  waiting on you, could not be counted there without naming other modules, which a part never does.

## Decision

- **`stat` is also given the installed modules:** `stat(state, ctx, installed)`. Home passes `registry.modules`, the
  same list it builds its tiles from.
- **A module reads only what the others contribute,** never their records or packages, the same as a collector screen.
- **Overview's tile shows "Waiting on you"** and the number of items its own card lists. The tile and the card use
  one function to gather them, so they always agree.

## Consequences

- **Good:**
  - Home's Overview tile carries the CEO's headline number, like every other tile, and no part names another.
  - Removing a module removes its waiting items from the count, as it already did from the card.
- **Cost and limits:**
  - `stat` callers pass the installed modules: Home, the contract test, and a module's own tests (an empty list is
    enough for one that ignores them).
  - A module that counts others' contributions depends on them being well formed. The contract test already checks
    every installed module's `waiting` items, and now checks Overview's figure against them.
