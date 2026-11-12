# Keystone on Firebase

How to set up the Firebase project that holds Keystone's records (docs/adr/0009). A build without the
`VITE_FIREBASE_*` variables ignores all of this and keeps its records on the computer.

## With Claude Code and the Firebase MCP server

`.mcp.json` lists the Firebase MCP server (`npx -y firebase-tools@latest mcp`). It acts as whoever is signed in to the
Firebase CLI on that machine, so it works in a local Claude Code session, not in a cloud one:

```bash
npx -y firebase-tools@latest login
```

Then ask Claude to do the steps below. The server can create the project and the web app, read the web config, set
up Auth and Firestore, and deploy `firestore.rules`.

## The steps

1. **Project:** create one under APG's Google account (for example `apg-keystone`), not a personal one.
2. **Web app:** add a Web app to the project. Its config gives the four values for `apps/keystone/.env.local` (copy
   `apps/keystone/.env.example`): `apiKey`, `projectId`, `appId`, and optionally `authDomain`.
3. **Auth:** turn on the Email/Password sign-in method (`firebase.json` declares it, so
   `npx -y firebase-tools@latest deploy --only auth` does this). Add the first owner's account under
   Authentication › Users; the owner makes everyone else's in Keystone (step 6). Keystone makes an account as a
   sign-up, so leave sign-up allowed (on a project upgraded to Identity Platform: Authentication › Settings › User
   actions › Enable create). An account the owner did not make opens nothing: only members open the records.
   **Forgot password?** emails a link from Firebase (docs/adr/0016): set the project's public-facing name to
   `Keystone` (Project settings › General), and, if you like, the sender name and wording under Authentication ›
   Templates › Password reset.
4. **Firestore:** create the database in production mode, in `asia-southeast1` (Singapore), the region nearest
   Manila. The region cannot be changed later.
5. **Rules:** deploy them from the repository root:

   ```bash
   npx -y firebase-tools@latest deploy --only firestore:rules --project <project id>
   ```

   `.firebaserc` names `apg-keystone` as the default project, so `--project` is only needed for another one.

6. **Members:** in Firestore, create `keystone/apg/members/<uid>` for the first owner, with the uid from
   Authentication › Users, and the fields `role` (`owner`), `name` and `email`. `name` is how Keystone shows the
   person (who asked for funds, who decided). After that, the owner makes each staff member's account in Keystone:
   **Settings › User Accounts › Make account**, with their name, email and the password they first sign in with,
   which the owner hands over (docs/adr/0014). It makes the sign-in and the member document together. A second owner,
   or a change of role, is still made here in the console. Only an owner approves or declines requests for funds and
   reads everyone's; staff read only their own (docs/adr/0011).
7. **Start the records:** sign in to a build with the variables set as an owner. Keystone starts APG's records in
   the cloud, empty: the cloud is their only source, and nothing a computer holds is ever copied in (docs/adr/0018).
   Staff who sign in before then are told the owner signs in first. Then fill in **Settings › Company Details** (the
   letterhead, signatories, payment instructions) and **Settings › Bank Accounts**; every document prints from them.
   Records kept on a computer by an older build come in only on purpose: back them up there (**Settings › Data ›
   Back up data…**, in a build without the variables) and restore that file here as an owner.
8. **Release builds:** add the same four values as repository variables (Settings › Secrets and variables › Actions
   › Variables): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` and
   `VITE_FIREBASE_AUTH_DOMAIN`. The next release then ships with the cloud records. Set them as **Variables**, not
   Secrets: the workflow refuses to make a release without the first three (docs/adr/0017), since such a copy would
   open on "Administrator access" with no sign-in.
9. **On a phone (Firebase Hosting):** Sir Mark decides requests for funds from his phone's browser too. With the four
   values in `apps/keystone/.env.local`, build the web app and deploy it from the repository root:

   ```bash
   npm run build:web
   npx -y firebase-tools@latest deploy --only hosting --project <project id>
   ```

   It is served at `https://<project id>.web.app`, behind the same sign-in. Never deploy a build without the
   variables: it would keep its records in each visitor's browser. CI does not deploy it.

## Good to know

- **The config is not a secret.** It names the project; access is decided by signing in and by `firestore.rules`.
  It still stays out of the code, in `.env.local` (ignored by git) or the Actions variables.
- **Someone leaving:** the owner removes a staff member in Keystone: **Settings › User Accounts**, the ⋯ menu on
  their row, **Remove…** (docs/adr/0015). That deletes their document under `keystone/apg/members`, and they open
  nothing from then on. Their sign-in stays, since Keystone cannot delete it; turn it off or delete it under
  Authentication › Users if you like. To let them back in, add their document again here with their uid, `role` and
  `name`: making an account with the same email in Keystone is refused while the sign-in exists. An owner is removed
  here, by deleting their document.
- **Passwords:** anyone signed in changes their own on **Settings › User Accounts › Change password**, after typing
  the current one. A forgotten one is reset from the sign-in screen with **Forgot password?**: Firebase emails a link
  to choose a new one, from `noreply@<project id>.firebaseapp.com`, so tell people to look in spam (docs/adr/0016).
- **Signing out:** "Sign out" is in the rail. Keystone also signs out by itself after 10 minutes unused, with a
  minute's warning, and asks for the account again when it is opened after sitting unused that long (docs/adr/0012).
- **API key restrictions:** if you restrict the key to websites, allow `tauri://localhost`, `http://tauri.localhost`,
  `http://127.0.0.1:5174` (development) and `https://<project id>.web.app` (the phone), or leave it unrestricted and
  rely on the rules.
- **Turning it off:** build without the variables, by hand (`npm run build`); a release cannot be made without
  them. Each computer then opens the copy its last save left in `state.json`.
- **Starting over:** delete the `keystone/apg` document and its collections, but not `members`. The owner's next
  sign-in starts the records again, empty.
- **Rules:** deploy `firestore.rules` after changing them (step 5). Only an owner starts the records and changes
  `keystone/apg/company/details`, which every document prints, payment instructions included.
- **Tests never touch the project.** The end-to-end cloud suite (`npm run test:e2e:cloud`, `e2e/cloud/`) runs the
  cloud build against the Firebase Auth and Firestore emulators with `firestore.rules`, as the demo project
  `demo-keystone`, which exists only in the emulators. A build connects to emulators only for a `demo-` project
  (`VITE_FIREBASE_AUTH_EMULATOR` and `VITE_FIREBASE_FIRESTORE_EMULATOR`, set by `e2e.cloud.config.ts`), so the
  variables can never point a real build at one.
