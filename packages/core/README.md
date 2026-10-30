# @keystone/core

Every rule in Keystone, as plain functions with no UI, no I/O and no platform code. Tested in `test/core.test.ts`,
including parity with the web prototype (amount in words, totals, the ID verification pattern).

## Layout

| Folder | Kind | What is in it |
|---|---|---|
| `src/kernel/` | Kernel: everything may use it | `schema.ts` (the saved-state shape), `money.ts` (centavos), `dates.ts`, `format.ts`, `state.ts` (`KeystoneError`, `Ctx`, `Change`, `logged`, `nextNumber`, `parseState`), `lines.ts` (line-item drafts), `insight.ts` (`Figure`, `Finding`, `WaitingItem`), `connectors.ts` (the connector contract) |
| `src/domains/` | Parts: one file per area | `directory.ts`, `vouchers.ts`, `billing.ts`, `ids.ts`, `verification.ts` |

## Rules

- **Shape of a rule:** `(state, …, ctx) => { state, record, message }`. To refuse, throw `KeystoneError('The sentence to
  show.')`. Never mutate the state you were given.
- **Time:** comes from `ctx.now()`, never `new Date()`, so tests can pin it (they use 30 Oct 2026, 09:05, Manila).
- **Imports:**
  - The kernel never imports a domain.
  - A domain imports the kernel and, at most, `domains/directory`.
  - `scripts/check-boundaries.mjs` enforces both.
- **Contributions:** each domain also exports what its module contributes: `xFigure`, `xFinding`, `xWaiting`, and
  housekeeping such as `markOverdue`.

## Removing a domain

1. Delete its file and its `export *` line in `src/index.ts`.
2. Delete the module that used it.

No other domain refers to it. The directory is the only shared domain.

## Tests

`npm test -w packages/core`
