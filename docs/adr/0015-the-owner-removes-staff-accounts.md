# 0015. The owner removes staff accounts in Keystone

Status: Accepted · Date: 2026-11-12

## Context

- **Since 0014 the owner makes staff accounts on the User Accounts screen**, but someone leaving was still removed by
  hand in the Firebase console: delete their member document, and turn off their sign-in.
- **What lets a person open the records is their member document** (`keystone/apg/members/{uid}`, 0009).
  `firestore.rules` check it on every read and write, and already let only an owner delete one.
- **Keystone has no server** (0009), and the client SDK cannot delete or turn off someone else's sign-in; only the
  Admin SDK can.

## Decision

- **User Accounts gives the owner Remove… in each staff row's ⋯ menu.** It asks first, saying that the person can no
  longer open APG's records on any computer or phone, that what they filed keeps their name, and that their sign-in
  stays. Each removal is logged under `ACCT`.
- **Removing deletes the member document, and nothing else.** From then on `firestore.rules` refuse that person
  every read and write; signing in shows "This account may not open APG's records". Their requests for funds, the
  records they prepared and the log keep their name.
- **Staff only, and never yourself.** An owner's row and your own have no menu. Removing yourself, as the owner, would
  lock you out; another owner is still removed in the console. The rule `removeRefusal` holds this for the screen, the
  platform refuses an owner removing themselves and anyone but an owner, and `firestore.rules` (unchanged) refuse a
  member document deleted by anyone but an owner.
- **The kit's `AppAccounts` gains `remove(uid)`.** `@keystone/ui`'s `Register` gains `rowLabel`, so a row's ⋯ menu
  is named after the person rather than their uid, and a row with no actions gets no menu.

## Consequences

- **Good:**
  - The owner takes someone's access away in two clicks, and it holds at once on every computer, without the console.
  - The rules did not change.
- **Cost and limits:**
  - The person's sign-in stays, opening nothing. Making an account with the same email again is refused ("That email
    already has a sign-in"), so letting them back in, or deleting the sign-in, is done in the console
    (docs/FIREBASE.md › Someone leaving).
  - A computer the person used keeps Firestore's copy of the records it last read, as any offline copy does (0009).
    Removing stops what they read and write next, not what is already on their machine.
  - Removing cannot be undone from Keystone; the question before it says so.
