# 0032. A module owns its id, its statuses and what it refers to

Status: Accepted · Date: 2026-11-18

## Context

- Core held things that belong to single modules: the status lists and tone table of vouchers, statements and IDs,
  the titles of three screens (for the Directory's "now selectable in …" sentence), and `usedBy`, which listed the
  three kinds of record that may name a directory record. Adding a status, renaming a screen or adding a module that
  refers to the directory meant editing the kernel.
- `usedBy` knew only `cv`, `bs` and `ids`. A vendor named by a request for funds, or an employee with a pay setup, a
  closed cut-off or a recorded day, could be removed from the directory, leaving those records pointing at nothing.
- A module's id was typed several times in it (the `ModuleDef`, the key under `state.ext`, the draft key, its own
  `go` calls), with nothing tying them together. `ModuleDef.section` was required and read by nothing.
- The owner was away when this was decided and asked for the work to be finished; it is listed for him in
  `docs/untangle/decision-log.md` under "Calls made without the owner".

## Decision

- **A module writes its id once**, as `ID` in its `rules.ts`, and uses it for `ModuleDef.id`, its `ext` key, its
  draft key and its own `go` calls. The values are unchanged, so saved data loads as before.
- **`ModuleDef.section` is dropped.** A screen's eyebrow is written where it is rendered, and nowhere else.
- **Statuses and tones live in their module.** `Voucher.status`, `Statement.status` and `IDRecord.status` are the
  saved string in core's types; `VOUCHER_STATUSES`, `STATEMENT_STATUSES`, `ID_STATUSES` and a tone function each are
  in the vouchers, billing and ID maker modules. A waiting item carries its status as text and the tone its module
  gives it. No saved word changes.
- **`ModuleDef.selects`** says which directory records a person picks on a screen and how a sentence names that
  screen. The Directory builds "It is now selectable in …" from the installed modules.
- **`ModuleDef.refersTo`** says whether a module's saved records name a directory record, and the tag to show.
  `usedBy` and `removeDirectoryRecord` take these references from the caller; core lists none. Vouchers, billing, the
  ID maker, funds, payroll and timekeeping each contribute one.

## Consequences

- **Good:** a new module that refers to the directory protects its records without a change to core; a new status
  is a change to one module; a record that funds, payroll or timekeeping data names can no longer be removed.
- **Cost and limits:**
  - **Behaviour:** a directory record named by a request for funds paid by check, a pay setup, a closed cut-off or a
    recorded day was removable and now is not. Its row shows `RF`, `PAY` or `DTR` under "Used by".
  - Protection now follows the installed modules, not the saved data alone. A build with the vouchers module taken
    out would let a record that only old vouchers name be removed. Every shipped build installs all of them ("Coming
    soon" screens included), so this is a limit on a build nobody ships.
  - In the cloud a staff member reads only their own requests for funds, so their Keystone protects a vendor only
    from their own requests. The CEO's knows them all.
  - Core no longer checks a status against a list; a module that builds a record gives it one of its own statuses.
