# 0009. Keystone's records live in Firebase

Status: Accepted · Date: 2026-11-11

## Context

- **Each computer kept its own `state.json`.** Sir Mark (CEO) is Keystone's main user, and HR, accounting and the IT
  team prepare the records he approves: vouchers, statements, IDs, time and payroll. With one file per computer, a
  voucher prepared on one machine cannot be approved on another, and a lost laptop loses the records.
- **The store already saves the whole state through `Platform.loadState/saveState`**, so where the records live is a
  platform concern. No rule and no screen has to change.
- **Firebase was chosen for the backend** (Jira AID-65, AID-66): Firestore keeps a copy on each computer and works
  offline, which the office connection needs, and Firebase Auth gives sign-in without a server of our own.

## Decision

- **Firestore holds the records and Firebase Auth signs people in** (email and password), when the build names a
  Firebase project with `VITE_FIREBASE_*` variables (`apps/keystone/.env.example`; the Actions variables of the same
  names for release builds). Without them, a build keeps its records on the computer, exactly as before.
- **One document per record** (`packages/core/src/kernel/documents.ts`). Every directory entry, voucher, statement and
  ID is a document keyed by its code or number, and so is each log entry and each module's `ext` data:
  `keystone/apg/{dir|cv|bs|ids|log|ext}/{id}` holding `{ pos, body }`. `body` is the record's JSON exactly as in
  `state.json`, so the schema (0003) is unchanged and a record reads back exactly as saved. `pos` keeps each list's
  order; lists only grow at one end, so a new record moves no other. A save writes only the documents that changed.
- **The cloud platform wraps the local one** (`apps/keystone/src/platform/cloud.ts`). It reads and writes the records,
  keeps a copy of each save in the local `state.json`, and leaves photos, files and the operating system to the local
  platform. Firebase is imported only in `apps/keystone/src/platform/firestore.ts`, loaded only when configured.
- **Moving in happens once.** The first computer to open a Firebase build with records of its own moves them in under
  a marker (`keystone/apg`, `moving` then `ready`) claimed in a transaction. A computer with no records, or a damaged
  file, moves nothing in and says so, so the sample data can never take the records' place.
- **A failed read stops Keystone** with the reason, instead of opening the sample data (the store no longer swallows a
  `loadState` error), and every save is refused until a read has succeeded.
- **Who may open the records** is `firestore.rules`: members listed under `keystone/apg/members/{uid}`, with role
  `owner` (may add members) or `staff`. The first owner is added by hand in the console (docs/FIREBASE.md).
- **Offline:** Firestore's persistent cache keeps the records on each computer. Keystone opens from it and queues
  saves until the connection is back. Moving in needs a connection.

Changes 0007 for the records only: Keystone still reads nothing from the other APG systems. It now talks to its own
Firebase project, as well as to its updater.

## Consequences

- **Good:**
  - Every signed-in computer opens the same records, and a lost machine loses nothing.
  - Only signed-in members open the records, which answers the missing sign-in 0008 named as a cost.
  - The modules, the rules and the backups are unchanged. Turning the variables off returns a build to local records,
    starting from the copy each save left in `state.json`.
- **Cost and limits, each a follow-up in Jira (AID-66):**
  - Two computers do not yet see each other's changes live; the other one sees them on its next start. Two people
    numbering a new record at the same moment can take the same number, and the later save wins. Until live updates
    and numbering in a transaction land, one person at a time prepares each kind of record.
  - Signing out is offered only when Keystone cannot open. A sign-out in the app comes next.
  - Payroll is readable by every member. Payroll-only access (AID-70) needs payroll in its own documents and rules.
  - Photos stay on each computer.
  - Firebase is a Google bill. A save writes only the records it changed, so the free daily quota should cover
    APG's use, but the project needs an owner at APG, not one person's account.
