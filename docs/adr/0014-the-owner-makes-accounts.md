# 0014. The owner makes accounts in Keystone

Status: Accepted · Date: 2026-11-11

## Context

- **Since 0009 the records in the cloud open only to members.** A member needs two things: a sign-in (Firebase Auth,
  email and password) and a member document, `keystone/apg/members/{uid}` with `role` and `name`. Both were made by
  hand in the Firebase console (docs/FIREBASE.md), and the second needs the uid copied from the first.
- **The owner wants to make staff accounts from Keystone, and nobody else should.** `firestore.rules` already let only an
  owner write a member document. Nothing in Keystone used that.
- **Keystone has no server of its own** (0009), so it cannot use the Firebase Admin SDK, which makes an account for
  someone else. The client SDK makes an account only as a sign-up, and a sign-up signs the new account in.

## Decision

- **A new module, `accounts` (User Accounts),** first under Settings on the rail. It lists everyone who can open the
  records (name, email, role). The owner also gets **Make account**: name, email and the password the person first
  signs in with, which the owner hands over; Keystone sends nothing. Staff see the list only. A build that keeps its
  records on the computer has no sign-in, and the screen says so. Each account made is logged under `ACCT`, naming
  the person and their email, never the password.
- **The accounts live with the sign-in, not in the saved state.** The kit's `Platform` gains an optional
  `accounts: AppAccounts` (`list()`, `create({ name, email, password })`), as it has `session` (0012). The cloud
  platform provides it; a local build does not.
- **Making one leaves the owner signed in.** `platform/firestore.ts` makes the sign-up in a second Firebase app with
  its own sign-in kept in memory, writes the member document (`role: 'staff'`, `name`, `email`) as the owner, and
  deletes the second app. If the member document is refused, the new sign-in is deleted again, so no sign-in is left
  without a member and the email can be used again.
- **Only the owner, held three times:** the screen offers Make account only to an owner, the rule `checkAccount`
  refuses anyone else, and `firestore.rules` refuse a member document written by anyone but an owner. The last is the
  one that matters: a sign-up made outside Keystone, by anyone with the project's web config, is a sign-in that opens
  nothing.
- **Staff only.** A second owner, or a change of role, is still made in the console.
- `@keystone/ui`'s `TextInput` gains `autoComplete`, so the new account's password field is never filled with the
  owner's saved password.

## Consequences

- **Good:**
  - The owner makes a staff account in one step, without the console or a uid, and the person signs in at once.
  - Who can open the records is on a screen every member can read.
  - The rules did not change: the owner was always the only one who could make a member.
- **Cost and limits:**
  - Sign-up stays allowed on the Firebase project, since that is how Keystone makes an account. Turning it off (on
    Identity Platform) stops Make account too. A stranger's sign-up opens nothing, but it is an account in the
    project until someone deletes it.
  - The owner knows each starting password. Nobody can change their own password in Keystone yet, nor reset a
    forgotten one; both are follow-ups.
  - Keystone does not remove accounts, or turn them off, yet. Someone leaving is removed in the console
    (docs/FIREBASE.md › Someone leaving). (0015 adds removing a staff account.)
  - Members added by hand before this have no `email`; the list shows a dash for them until it is added in the
    console.
