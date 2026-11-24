# @keystone/core

The kernel every part shares, as plain functions and types with no UI, no I/O and no platform code. It depends on no
other Keystone package. Tested in `test/kernel.test.ts`, including parity with the web prototype (amount in words,
numbering, blank lines dropped).

## What is in it

| File | What it holds |
|---|---|
| `src/kernel/schema.ts` | The saved-state shape (`dir`, `cv`, `bs`, `ids`, `log`, `ext`), kept compatible with the prototype |
| `src/kernel/money.ts`, `dates.ts`, `format.ts` | Centavos, Manila dates, weekdays and semi-monthly cut-offs, peso, date and period formats, amount in words, and `DASH`, what a missing value shows as |
| `src/kernel/state.ts` | `KeystoneError` (the sentence and the fields it is about) and `fieldsOf`, `Ctx` (the clock and who is signed in), `Change`, `logged`, `nextNumber`, `parseState` (the saved state, checked for its lists only, so one odd record never stops the rest from opening), `emptyState` (what a new computer or an empty cloud starts from: no records), `COMPANY` (the company itself, built in: name, address, contacts; docs/adr/0023) and `companyOf` (it, with what documents start from as saved, "" or 0 where not filled in; docs/adr/0018); a module's own data under `ext` (`moduleData`, `withModuleData`) and the decoders that read it back (`isJsonObject`, `jsonText`, `jsonNumber`, `jsonObjects`) |
| `src/kernel/backup.ts` | `parseBackup`: a backup to restore, with every record checked for the fields the screens show; one that fails is refused by name and nothing is restored |
| `src/kernel/live.ts` | Live updates (docs/adr/0049): `newEntries` (the Activity Log lines another computer added), `arrivalNotices` (what the person is told of them, naming who saved each, from `LogEntry.by`, which `logged` sets from `ctx.who`), `changedElsewhere` (a form's record changed under it), `LIVE_PAUSED` and `LIVE_REREAD_MS` (how often the records are read again while live updates are stopped) |
| `src/kernel/lines.ts` | Line-item drafts for documents: an amount per line (vouchers), or a quantity at a unit price (statements) |
| `src/kernel/insight.ts` | `Figure`, `Finding`, `WaitingItem`, `topFinding` |
| `src/kernel/directory.ts` | The shared directory: records, payees, codes, saving and removing |
| `src/kernel/connectors.ts` | The connector contract (a shortcut to another app), `desktopAppShortcut`, the same for every desktop app: `openDesktopApp` (start it, or fetch its installer) and `desktopAppUpdate` (its newer version, docs/adr/0035) |
| `src/kernel/services.ts` | Published service contracts: `SERVICES` names and their types (`StatementPayments`, `EmployeeAttendance`) |
| `sample/` | The tests' sample records, `@keystone/core/sample` (`sampleState`, `sampleText`): made-up records with APG's company details. `sample.json` is generated from `shared/data/sample.json` by `npm run sync`; don't edit it here. Only tests may import it (`npm run check:boundaries`): Keystone ships no records (docs/adr/0018) |

The rules for each area (vouchers, billing, IDs) are not here: they live in that area's module package, next to its
screen.

## Rules

- **Shape of a rule:** `(state, …, ctx) => { state, record, message }`. To refuse, throw `KeystoneError('The sentence to
  show.')`, naming the draft fields it is about after the sentence (`KeystoneError('Enter the client.', 'client')`,
  a line's cell as `lines.0.amount`), so the form can mark them (docs/adr/0044). Never mutate the state you were given.
- **Time:** comes from `ctx.now()`, never `new Date()`, so tests can pin it (they use 30 Oct 2026, 09:05, Manila).
- **What belongs here:** only what two or more parts need. Something one module needs belongs in that module.
- **A new service:** add its name to `SERVICES`, its types to `services.ts` and a line to `ServiceContracts` (name →
  contract), so the provider is checked against the contract. The provider and the consumer both
  import only these, never each other.
