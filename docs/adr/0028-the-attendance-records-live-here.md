# 0028. The attendance records live here; the kiosk keeps a working copy

Status: Accepted · Date: 2026-11-18 · Changes [0027](0027-the-attendance-kiosk-keeps-a-copy-of-its-records-here.md)

## Context

- Under 0027 the kiosk's SQLite file was the original and the documents here a one-way copy that the kiosk could not
  read. A dead kiosk PC meant an owner rebuilding the database by hand from the console.
- The owner decided (2026-11-18) that Firebase is to be the attendance tracker's real database, with the kiosk still
  working when the internet is down, and that TINs and bank account numbers move here too.

## Decision

- **The documents under `att_<table>` are the attendance records.** The kiosk's SQLite file is a working copy: every
  tap is written there first, so nothing waits on the internet, and sent here on the next pass.
- **The kiosk stays the only writer**, and there is one kiosk. So there is nothing to merge: the kiosk never has to
  ask what changed here.
- **A device now reads `att_…` back.** A kiosk whose database is empty (a new or reinstalled PC) fills it from here.
- **TINs and bank account numbers go under `attprivate_<table>/<id>`**, apart from the row they belong to: a device
  writes and reads them, an owner reads them, nobody else. They are apart so that a later rule letting, say, HR read
  `att_attendance` cannot show them by accident.
- Still left on the kiosk: settings (PIN hash, sign-in tokens), the Sheets queue, export jobs, photos.

## Consequences

- **Good:** a lost kiosk is replaced by installing the program and signing it in.
- **Cost and limits:**
  - A kiosk account that leaks can now read attendance, pay, TINs and bank account numbers, not only overwrite them.
    Its password is typed once on the kiosk and is in no build (attendance pull request 47).
  - A document changed here by hand is overwritten the next time the kiosk's row changes, and is otherwise only seen
    by a rebuilt kiosk. Corrections are still made on the kiosk.
  - Checked by `e2e/cloud/kiosk-backup.e2e.ts`.
