# 0016. Changing your password, and resetting a forgotten one

Status: Accepted · Date: 2026-11-12

## Context

- **Since 0014 the owner makes each staff account with a starting password** and hands it over, so the owner knows
  every starting password. Nobody could change their own password in Keystone, and a forgotten one could only be
  reset in the Firebase console.
- **Firebase Auth can do both from the client.** It changes the password of the person signed in, but only after a
  recent sign-in, so it asks for the current password again. And it emails a link for choosing a new password, to a
  page Firebase hosts for the project, so Keystone needs no server and no mail service of its own.

## Decision

- **Change password, on User Accounts, for anyone signed in** (staff and owners). It asks for the current password,
  then the new one twice (at least 8 characters, matching, and not the current one). Firebase checks the current one
  by signing in again with it, then changes the password; the person stays signed in on that computer. Each change is
  logged under `ACCT` as "<name> changed their password.", never with the password.
- **Forgot password? on the sign-in screen.** It asks for the email (the one typed so far comes along), and Firebase
  emails that address a link to choose a new password. Keystone answers the same whether or not the email has an
  account, so the screen cannot be used to learn who has one. The person then signs in with the new password.
- **Where it lives:**
  - The kit's `AppAccounts` gains `changePassword(current, next)`. The accounts module owns the form and its rules
    (`checkPasswordChange`, `passwordChanged`).
  - Forgot password is part of signing in, which is the composition root's (`apps/keystone/src/Gate.tsx`, `SignIn`
    takes `sendReset`). `platform/firestore.ts` provides both through `CloudSession.sendPasswordReset`.
- **Builds without a sign-in are unchanged:** records kept on the computer have no passwords.

## Consequences

- **Good:**
  - A staff member can replace the starting password the owner handed over, so the owner no longer knows it.
  - Someone who forgot their password gets back in without the owner or IT.
- **Cost and limits:**
  - The reset email comes from Firebase (`noreply@<project>.firebaseapp.com`, in Firebase's template), so it can land
    in spam. Its sender name, wording and the project's public-facing name are set in the console
    (docs/FIREBASE.md).
  - Anyone can ask for a reset link for any email. The link only goes to that address, and Firebase limits how often
    it is sent.
  - A removed member (0015) can still reset their password: their sign-in stays, and it still opens nothing.
  - Firebase ends a sign-in's refresh tokens when its password changes, so another computer signed in as that person
    stops reaching the records once its current token lapses, and asks for the password when Keystone next opens.
