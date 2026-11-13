# 0020. Changing your own name, on Profile

Status: Accepted · Date: 2026-11-12

## Context

- **The name Keystone shows for whoever is signed in comes from their member document** (`keystone/apg/members/{uid}`:
  `name`), which the owner writes when making the account (docs/adr/0014) or by hand in the Firebase console for the
  first owner. It shows in the rail, as who prepared a voucher or asked for funds, and in the activity log.
- **Nobody could change it in Keystone.** A name typed wrong, or the console's name for the first owner, stayed until
  someone edited the document in the Firebase console.

## Decision

- **A Profile screen, released, first under Settings.** Whoever is signed in sees **Your name** and **Save name**, and
  their role, which only the owner changes. It links to User Accounts for the password. With records kept on one
  computer, nobody signs in, and the screen says there is no profile.
- **`Platform.accounts.rename(name)`** changes the member signed in's own name (`platform/firestore.ts` updates the
  `name` field only). The name is kept on one line, 1 to 80 characters, and must differ from the one shown.
- **firestore.rules let a member change their own name and nothing else** of their member document: an `update` whose
  only changed key is `name`, a string of 1 to 80 characters. The owner still writes every other field.
- **The rail shows the new name at once.** The kit's store takes it (`KeystoneStore.renamed`), and the log line that
  says "… changed their name to …" (tag `PROF`) re-renders the screens. Every other computer reads it at its next
  sign-in.

## Consequences

- **Good:** a member fixes their own name without the owner or the Firebase console; the role stays the owner's.
- **Cost and limits:**
  - What was saved earlier keeps the name it was saved with: a voucher's "Prepared by" is text on the voucher.
  - Another computer already open shows the old name until it signs in again.
  - The owner cannot rename someone else in Keystone; that is still the Firebase console.
