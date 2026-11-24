# 0046. The ID Maker screen is not installed; the ID Maker desktop app makes the IDs

Status: Accepted · Date: 2026-11-24

## Context

- **Employee IDs had two ways in.** Keystone's own ID Maker screen (`packages/modules/id-maker`) made and printed the
  cards, and Home › Connected systems has a shortcut to the Alpha Premier ID Maker desktop app (`Deign86/apg-id-creator`,
  the `id-maker-app` connector, docs/adr/0007, 0029, 0035), which makes them too and keeps the register of issued IDs
  in Keystone's Firebase project (docs/adr/0025).
- **The screen repeats what the desktop app does.** With the desktop app one click away on Home, the screen only added a
  second rail entry, tile and figure for the same work. It was not among the released screens (docs/adr/0017): a release showed it behind
  "Coming soon".

## Decision

- **The ID Maker screen is no longer installed.** As AGENTS.md › Removing a part says: its line in
  `apps/keystone/src/modules.ts`, its entry in `apps/keystone/package.json` and `e2e/modules/id-maker.e2e.ts` are
  removed.
- **The ID Maker desktop app is how IDs are made,** from its shortcut on Home, as before.

## Consequences

- **What disappears:** the ID Maker's rail entry (in every build; the shortcuts Ctrl+1 to Ctrl+9 move up one, so
  Payroll is Ctrl+9), its Home tile, its Overview figure ("IDs issued this month"), its finding (IDs waiting to be
  printed), its waiting items (cards for printing), the "New ID" button, and the "IDs" filter in the Activity Log. Active
  cards past their date are no longer marked Expired on open.
- **The Directory no longer speaks for IDs:** a saved ID no longer keeps the employee it names from being removed (only
  vouchers, statements, requests for funds, pay setups, closed cut-offs and recorded days do), and a new employee is
  "E-005 added." with no screen named after it.
- **What stays:** the saved IDs in the records (`state.ids`, and the `ids` collection in the cloud; the saved state's
  keys never change, AGENTS.md rule 9), with their entries in the Activity Log; the package folder
  `packages/modules/id-maker/`, with its tests, so the screen can be put back by adding its line, its entry and an
  end-to-end file again; and the `id-maker-app` connector, its shortcut and its updates.
- The tests that followed the ID Maker onto Home, Overview, the Directory and the Activity Log now check the parts that
  remain, and the stable suite's "Coming soon" example is Timekeeping.
