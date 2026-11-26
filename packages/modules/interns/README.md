# Interns

HR's register of OJT interns, batch by batch, and the weekly cleaning schedule, which Ma'am Jean kept in a spreadsheet
("INTERNS ALPHA PREMIER GROUP", one tab per batch and one for the cleaners) and keeps here now. The batches in the
spreadsheet were brought over once, each record with the row it came from; there is no importer (docs/adr/0056, 0057).

## Owns
- `src/index.tsx`: the screen, in three tabs.
  - **Register:** every intern, the newest batch first, a page at a time. Filters for status (Ongoing, Completed,
    Incomplete requirements, Terminated, and Dates to check while any record has one), for the batch, and a search by
    name, school or ID number. A row opens the intern; its menu marks a requirement handed in today, or removes them.
  - **Requirements:** who still owes the endorsement letter, medical certificate, police clearance or MOA, each dated
    or "Not yet".
  - **Cleaning schedule:** who cleans on each day of the week, with a field to add someone (it offers the interns on
    OJT) and Remove beside each name.
  - **Add intern** opens the form: name, school, batch, ID number (the next one), dates, schedule, OJT hours, the four
    requirements (a date, or not needed), status, proof of completion, volunteer, and notes. A record brought over from
    the spreadsheet also shows the row it came from, every cell as written, and a date the sheet wrote that is not a
    date is kept, and said, until a date is typed over it.
- `src/rules.ts`: the records and their rules, tested in `test/rules.test.ts`:
  - `IN-0001` and on is Keystone's own key; the intern's ID number (`APG-2026-127`) is the next after the highest
    given, in whatever way it was written;
  - saving needs a name and a batch; hours are a number; dates are dates; the end is not before the start; an ID
    number is not someone else's. A refusal names its field;
  - which requirements are owed, which dates to check (not a date, or a requirement dated after today);
  - the cleaning schedule;
  - the sentence under the title, the finding and the Overview figure.

## Contributes
- **Home:** a tile, with the number on OJT.
- **Overview:** the "Interns on OJT" figure, with how many owe requirements and the certificates to issue; the
  "Add an intern" button.
- **Finding:** an intern past their end date and still on OJT; else who owes requirements; else a completed intern
  with no certificate issued yet.
- **Activity:** log tag `INT`.

## Needs
Nothing but the kernel.

## Removing it
The screen, its tile, its figure, its finding, its button and its log filter disappear. The interns and the cleaning
schedule stay in `state.json` under `ext.interns`, and in the cloud in `ext/interns`, until a build with this module
opens them again.
