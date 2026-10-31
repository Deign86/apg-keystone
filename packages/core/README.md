# @keystone/core

The kernel every part shares, as plain functions and types with no UI, no I/O and no platform code. It depends on no
other Keystone package. Tested in `test/kernel.test.ts`, including parity with the web prototype (amount in words,
numbering, blank lines dropped).

## What is in it

| File | What it holds |
|---|---|
| `src/kernel/schema.ts` | The saved-state shape (`dir`, `cv`, `bs`, `ids`, `log`, `ext`), kept compatible with the prototype |
| `src/kernel/money.ts`, `dates.ts`, `format.ts` | Centavos, Manila dates, peso and date formats, amount in words |
| `src/kernel/state.ts` | `KeystoneError`, `Ctx`, `Change`, `logged`, `nextNumber`, `parseState` |
| `src/kernel/lines.ts` | Line-item drafts for documents |
| `src/kernel/insight.ts` | `Figure`, `Finding`, `WaitingItem`, `topFinding` |
| `src/kernel/directory.ts` | The shared directory: records, payees, codes, saving and removing, importing people from a connected system |
| `src/kernel/connectors.ts` | The connector contract and `withDeadline` |
| `src/kernel/services.ts` | Published service contracts: `SERVICES` names and their types (`StatementPayments`) |
| `src/seed.json` | The sample data. Generated from `shared/data/seed.json` by `npm run sync`; don't edit it here |

The rules for each area (vouchers, billing, IDs) are not here: they live in that area's module package, next to its
screen.

## Rules

- **Shape of a rule:** `(state, …, ctx) => { state, record, message }`. To refuse, throw `KeystoneError('The sentence to
  show.')`. Never mutate the state you were given.
- **Time:** comes from `ctx.now()`, never `new Date()`, so tests can pin it (they use 30 Oct 2026, 09:05, Manila).
- **What belongs here:** only what two or more parts need. Something one module needs belongs in that module.
- **A new service:** add its name to `SERVICES`, its types to `services.ts` and a line to `ServiceContracts` (name →
  contract), so the provider is checked against the contract. The provider and the consumer both
  import only these, never each other.
