# Interns

HR's register of OJT interns, batch by batch, and the weekly cleaning schedule, brought over from the spreadsheet
Ma'am Jean kept ("INTERNS ALPHA PREMIER GROUP", one tab per batch and one for the cleaners). See docs/adr/0056.

## Owns
- `src/index.tsx`: the screen, in three tabs.
  - **Register:** every intern, the newest batch first, a page at a time. Filters for status (Ongoing, Completed,
    Incomplete requirements, Terminated, and Dates to check while any record has one), for the batch, and a search by
    name, school or ID number. A row opens the intern; its menu marks a requirement handed in today, or removes them.
  - **Requirements:** who still owes the endorsement letter, medical certificate, police clearance or MOA, each dated
    or "Not yet".
  - **Cleaning schedule:** who cleans on each day of the week, with a field to add someone (it offers the interns on
    OJT) and Remove beside each name.
  - **Import from spreadsheet…** reads the .xlsx, says what it found and what it will add, and adds it once confirmed.
  - **Add intern** opens the form: name, school, batch, ID number (the next one), dates, schedule, OJT hours, the four
    requirements (a date, or not needed), status, proof of completion, volunteer, and notes. An imported intern's form
    also shows the spreadsheet row it came from, every cell as written, and a date the sheet wrote that is not a date
    is kept, and said, until a date is typed over it.
- `src/rules.ts`: the records and their rules, tested in `test/rules.test.ts`:
  - `IN-0001` and on is Keystone's own key; the intern's ID number (`APG-2026-127`) is the next after the highest
    given, in whatever way it was written;
  - saving needs a name and a batch; hours are a number; dates are dates; the end is not before the start; an ID
    number is not someone else's. A refusal names its field;
  - which requirements are owed, which dates to check (not a date, or a requirement dated after today);
  - the cleaning schedule;
  - the sentence under the title, the finding and the Overview figure.
- `src/import.ts`: reading the spreadsheet, tested in `test/import.test.ts` against `test/fixtures/sample-interns.xlsx`
  (made-up interns, laid out as HR's spreadsheet is):
  - each `BATCH n` tab is a batch; its columns are found by their headers, which changed over the batches;
  - a row's status is its Notes/Remarks, or else its colour read against the legend under the rows (and the reds and
    yellow the sheets use without one);
  - dates as cells, or typed as `10/15/2025`, `002/19/2026`, `Sept. 9 2026`; anything else is kept as written;
  - a tab with the days of the week across it is the cleaning schedule;
  - every cell of every row is kept on the record with its tab, row and colour;
  - importing again adds only who is not here yet (the same name in the same batch), and leaves what was changed in
    Keystone alone; the cleaning schedule comes in only while Keystone has none.
- `src/xlsx.ts`: reading an .xlsx into cells (text, number, fill colour), tested in `test/xlsx.test.ts`. It uses
  `fflate` to open the zip and the browser's `DOMParser` for its XML.

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
