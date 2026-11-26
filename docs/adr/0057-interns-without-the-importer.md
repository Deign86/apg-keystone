# 0057. HR keeps the interns in Keystone, with no importer

Status: Accepted · Date: 2026-11-26

## Context

- **0056** added Interns with **Import from spreadsheet…**, which read HR's .xlsx so that every batch in it could come
  over without losing a cell, and which could be run again to add new rows.
- **The ask now:** no sheet importing. Ma'am Jean uses Keystone for the interns from now on, and the spreadsheet stops
  being kept. What was imported from it is to stay in the records in the cloud.

## Decision

- **The importer goes:** the button, the workbook reader (`src/xlsx.ts`), the import (`src/import.ts`), their tests
  and fixture, and the `fflate` dependency.
- **The batches come over once, outside the screen.** The records read from the spreadsheet by 0056's importer, every
  cell of each row with it, are written once to the cloud's `ext/interns` document. Nothing else in the records is
  touched.
- **What a record brought over keeps stays:** its `source` (the tab, the row, its colour and every cell as written) is
  still read and shown in the form, and a date the sheet wrote that is not a date is still kept and marked until one
  is typed over it.
- **New interns are added by hand,** with the next ID number, as before.

## Consequences

- **Good:** one place for the interns; nothing on the screen invites a second copy from an old file.
- **Bad:** a later spreadsheet, if anyone keeps one, cannot be brought in; its rows are typed in.
