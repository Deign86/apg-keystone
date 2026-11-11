# User Accounts

Who can open APG's records in the cloud, and the owner making an account for each staff member (docs/adr/0013). First
under Settings on the rail, before Data.

## Owns
- `src/index.tsx`: the screen.
  - **Signed in to the cloud:** a register of everyone who can open the records (name, email, role; owners first,
    and "(you)" beside the person signed in).
  - **The owner** also gets **Make account**, a dialog with Name, Email and Password. The password is the one the
    person first signs in with: the owner hands it over, and Keystone sends nothing. A refusal stays on the form with
    its reason.
  - **Staff** see the register only.
  - **Records kept on this computer:** nobody signs in, so the screen says there are no accounts to make.
- `src/rules.ts`: its rules, tested in `test/rules.test.ts`:
  - only the owner signed in to the cloud makes accounts (`ctx.who.role === 'owner'`);
  - a new account needs a name (kept on one line), an email (kept in lower case, and refused when a member already
    has it, naming who) and a password of at least 8 characters (kept exactly as typed);
  - the log line names the person and their email, never the password.
- The screen against a stand-in sign-in is tested in `test/screen.test.tsx`.

The accounts themselves are not in the saved state. They live with the sign-in, which the kit offers as
`Platform.accounts` (`list`, `create`) when the build keeps its records in the cloud; the app's
`platform/firestore.ts` makes the sign-in and the member document (`keystone/apg/members/{uid}`: `role`, `name`,
`email`), and `firestore.rules` let only an owner write a member.

## Contributes
- **Activity:** log tag `ACCT` (filter "User Accounts"): each account made.

## Needs
Nothing from another part. Accounts to list and make need a cloud build (`Platform.accounts`); without one, the screen
says there are none.

## Removing it
The screen and its log filter disappear. Nobody's sign-in changes: everyone made an account keeps it, and the owner
makes new ones in the Firebase console again (docs/FIREBASE.md).
