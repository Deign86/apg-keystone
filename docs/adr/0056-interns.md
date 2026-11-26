# 0056. Interns, brought over from HR's spreadsheet

Status: Accepted, its importer superseded by 0057 · Date: 2026-11-26

## Context

- **The ask:** a module for Ma'am Jean, the HR staff, for the spreadsheet she keeps the interns in ("INTERNS ALPHA
  PREMIER GROUP.xlsx", in the company's Google Drive), and to bring everything in it over so nothing is lost.
- **The spreadsheet** has a tab per batch of OJT interns ("BATCH 2" to "BATCH 10", 89 rows) and a weekly cleaning
  schedule ("CLeaners"). A row is an intern: name, school, start and end dates, schedule, total hours, the four
  requirements and the date each was handed in (endorsement letter, medical certificate, police clearance, MOA), the
  proof of completion issued, a serial or ID number, and notes or remarks.
- **It grew as it was used:**
  - the first batches have only some of the columns, and "Serial Number" became "ID Number";
  - a row's status is in its remarks (completed, Complete/Volunteer, terminated, inc), or only in its colour, with a
    legend under the later batches (COMPLETED, INCOMPLETE, TERMINATED);
  - dates are cells, or typed as text ("10/15/2025", "Sept. 9 2026"), and a few are slips ("70-03-2026", a year of
    1900 or 2027);
  - the same person can be in two batches.
- **Keystone keeps no records in the code (0018)**, and the repository is public. So the interns cannot be written
  into Keystone; they have to come in through Keystone itself.

## Decision

- **A new part, `@keystone/module-interns`** (route `#interns`, log tag `INT`), after Payroll. A register with
  filters, the requirements owed, the cleaning schedule, and a form in a sheet.
- **An import, not a copy.** Import from spreadsheet… reads the .xlsx in the browser (`fflate` for the zip, the
  browser's XML parser for the rest), says what it found and what it will add, and adds it when confirmed. The file is
  read the way a person reads it: columns by their headers, status by remarks or colour, dates in the ways they were
  typed.
- **Nothing is lost:**
  - every cell of every row is kept on the record as it was written, with the tab, the row and its colour, and the form
    shows it;
  - a date that is not one stays as written, is marked "Check dates", and stays until a date is typed over it;
  - a tab that is neither a batch nor the cleaning schedule is named in the confirmation as not brought in.
- **Importing again is safe.** Only an intern not already here (the same name in the same batch) is added, so a
  record changed in Keystone is never overwritten, and a second stint in a later batch is its own record. The
  cleaning schedule comes in only while Keystone has none.
- **Where they are kept:** `state.ext.interns` (`{ interns, roster }`), one `ext` document in the cloud, as
  Acknowledgement Receipts are (0054). All 89 rows with every cell come to about 84 KB, well under the 900 KB a
  document holds. No new collection, so `firestore.rules` and the cloud layout do not change.
- **Released (0017):** it is in `RELEASED`, because it was asked for for use.

## Consequences

- **Good:**
  - HR's records move into Keystone in one step, and can be checked against the spreadsheet row by row;
  - the requirements owed, the past end dates and the certificates to issue are said on Home and Overview, not
    looked for in colours;
  - the next ID number is worked out, whatever way the earlier ones were written.
- **Bad:**
  - Keystone does not read the spreadsheet in Drive itself: someone downloads it as .xlsx and imports it;
  - an intern whose name is spelled differently on a second import is added again, and is removed by hand;
  - the cleaning schedule is names as typed, not linked to the interns' records.
