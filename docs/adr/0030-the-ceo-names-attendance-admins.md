# 0030. The CEO names who opens the attendance tracker's admin screens

Status: Accepted · Date: 2026-11-18

## Context

- The attendance tracker's admin screens (interns, attendance, payroll, settings) opened with an admin RFID card or
  one PIN shared by everyone who needed them. A shared PIN names nobody in the audit log and cannot be taken from
  one person.
- The owner decided (2026-11-18): Keystone is the one place accounts are made, switched off, marked "attendance
  admin" and reset. The attendance tracker lets a person in with their own Keystone account; admin cards keep
  working there and nowhere else.

## Decision

- **A member document may hold `attendanceAdmin: true`.** The CEO sets and clears it from User Accounts, in a staff
  row's menu, after a question that says what the person will be able to open. It shows beside their role.
- **A CEO needs no tick.** An owner opens the attendance tracker's admin screens already; the menu offers nothing
  for a CEO's row.
- **Nobody gives it to themselves.** `firestore.rules` already let a member change only their own `name`, and only
  an owner write another member's document, so no rule changes. `e2e/cloud/accounts.e2e.ts` now asks exactly this.
- **The attendance tracker reads it, as the person.** It signs the person in with Firebase, reads their own member
  document, and opens the admin screens when `role` is `owner` or `attendanceAdmin` is true. Keystone does nothing
  at that moment. Removing the tick, or the account, stops the next sign-in there.
- **Forgotten password:** the attendance tracker asks Firebase to send its reset email, the same one Keystone's
  sign-in screen sends (docs/adr/0016).

## Consequences

- **Good:** each admin signs in as themselves; the audit log names them; one person's access is taken away without
  changing anyone else's.
- **Cost and limits:**
  - The attendance tracker remembers a successful sign-in for seven days so an admin can get in while the internet
    is down. A tick removed here is therefore only certain to bite the next time the kiosk is online.
  - The tick is a field the app reads, not a rule: it guards the kiosk's own screens. What an account can read in
    Firestore is still decided by `role` alone.
  - An older Keystone ignores the field and writes around it (`updateDoc` changes only the field named).
