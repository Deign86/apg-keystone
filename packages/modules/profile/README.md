# Profile

Whoever is signed in changing the name Keystone shows for them (docs/adr/0020): in the rail, as who prepared a voucher
or asked for funds, and in the activity log. First under Settings on the rail, before User Accounts.

## Owns
- `src/index.tsx`: the screen.
  - **Signed in to the cloud:** **Your name**, filled in with the name now shown, and **Save name**. The rail shows
    the new name at once, and a refusal stays on the form with its reason. The role is shown, not changed: only the
    owner changes roles. With User Accounts installed, a link there for changing the password.
  - **Records kept on this computer:** nobody signs in, so the screen says there is no profile to change.
- `src/rules.ts`: its rules, tested in `test/rules.test.ts`:
  - a new name is kept on one line with single spaces, needs at least one character and at most 80, and differs from
    the name now shown (`checkName`);
  - the log line names the old name and the new (`nameChanged`).
- The screen against a stand-in sign-in is tested in `test/screen.test.tsx`.

The name is not in the saved state. It lives with the sign-in, in the member document (`keystone/apg/members/{uid}`:
`name`), which the kit offers to change as `Platform.accounts.rename` when the build keeps its records in the cloud;
the app's `platform/firestore.ts` writes it. `firestore.rules` let a member change their own name and nothing else of
their member document. The kit's store then shows the member under the new name (`KeystoneStore.renamed`).

## Contributes
- **Activity:** log tag `PROF` (filter "Profile"): each name changed.

## Needs
Nothing from another part. Changing the name needs a cloud build (`Platform.accounts`); without one, the screen says
there is no profile. The link to change the password is shown only when User Accounts is installed.

## Removing it
The screen and its log filter disappear. Names are changed in the Firebase console again (docs/FIREBASE.md › Members),
or by the owner making the account again.
