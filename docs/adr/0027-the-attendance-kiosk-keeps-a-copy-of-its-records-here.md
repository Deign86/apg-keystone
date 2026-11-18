# 0027. The attendance kiosk keeps a copy of its records here

Status: Accepted · Date: 2026-11-18

## Context

- **The attendance tracker keeps everything in one SQLite file** on the kiosk PC: interns, taps, daily pay, cut-offs,
  the bathroom log, the audit log. It also copies some of it to a Google Sheet.
- **The programs are separate but are to share a backend**, with Keystone as the place they are opened from. Keystone
  cannot read a file on another computer.
- **A tap must never wait on the internet.** The kiosk works offline today and must keep doing so.
- A kiosk already signs in here as a device to read the ID register (docs/adr/0026).

## Decision

- **The kiosk's database stays the source of truth.** It sends a copy of each business record here, one document a
  row, under `keystone/apg/att_<table>/<id>`: `att_users`, `att_attendance`, `att_intern_grace`, `att_payroll`,
  `att_payroll_profiles`, `att_payroll_cutoffs`, `att_payroll_snapshots`, `att_bathroom_log`, `att_audit_logs`.
- **One way only.** Nothing is read back into the kiosk from here, and Keystone never writes these documents.
- **A device writes them and cannot read them; only an owner reads them.** They hold pay. A member who is not an
  owner sees none of it until a screen needs it and a rule is written for exactly that.
- **Left on the kiosk on purpose:** its settings (the admin PIN hash, sign-in tokens), the Sheets queue, export jobs,
  every TIN and bank account number, and photos.

## Consequences

- **Good:** a lost or broken kiosk is not lost records; Keystone can show attendance and payroll without a second
  entry; the kiosk still works with no internet and catches up later.
- **Cost and limits:**
  - This is a copy, not a second master. A change made here would be overwritten or ignored. Anything that needs to
    change attendance does it on the kiosk.
  - The first backup is about 7,000 writes and a normal day a few hundred, inside the free plan's 20,000 a day. A
    much larger history would need the paid plan or a slower first backup.
  - `firestore.rules` now also serves the kiosk's writes. A change to `device()` or to the `att_…` block is checked
    against `e2e/cloud/kiosk-backup.e2e.ts` and the kiosk's `docs/shared-backend.md`.
  - The rules do not check the shape of a backup document. The kiosk is the only writer and its own tests hold the
    shape; a reader here treats a missing field as missing.
