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
   `npx -y firebase-tools@latest deploy --only auth` does this). Add an account for each person under
   Authentication › Users.
4. **Firestore:** create the database in production mode, in `asia-southeast1` (Singapore), the region nearest
   Manila. The region cannot be changed later.
5. **Rules:** deploy them from the repository root:

   ```bash
   npx -y firebase-tools@latest deploy --only firestore:rules --project <project id>
   ```

   `.firebaserc` names `apg-keystone` as the default project, so `--project` is only needed for another one.

6. **Members:** in Firestore, create `keystone/apg/members/<uid>` for each person, with the uid from
   Authentication › Users, and the fields `role` (`owner` or `staff`) and `name`. The first owner has to be added in
   the console; after that, owners can add members. `name` is how Keystone shows the person (who asked for funds, who
   decided). Only an owner approves or declines requests for funds and reads everyone's; staff read only their own
   (docs/adr/0011).
7. **Move the records in:** run Keystone with the variables set (`npm run dev` or `npm run desktop`) **on the
   computer that holds the real records**, and sign in as an owner. Keystone moves that computer's records in once.
   Any other computer then opens the same records. A computer with no records of its own refuses to move anything in.
8. **Release builds:** add the same four values as repository variables (Settings › Secrets and variables › Actions
   › Variables): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` and
   `VITE_FIREBASE_AUTH_DOMAIN`. The next release then ships with the cloud records.
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
- **Signing out:** "Sign out" is in the rail. Keystone also signs out by itself after 10 minutes unused, with a
  minute's warning, and asks for the account again when it is opened after sitting unused that long (docs/adr/0012).
- **API key restrictions:** if you restrict the key to websites, allow `tauri://localhost`, `http://tauri.localhost`,
  `http://127.0.0.1:5174` (development) and `https://<project id>.web.app` (the phone), or leave it unrestricted and
  rely on the rules.
- **Turning it off:** build without the variables. Each computer then opens the copy its last save left in
  `state.json`.
- **Starting over:** delete the `keystone/apg` document and its collections. The next computer to open a Firebase
  build with records of its own moves them in again.
- **Tests never touch the project.** The end-to-end cloud suite (`npm run test:e2e:cloud`, `e2e/cloud/`) runs the
  cloud build against the Firebase Auth and Firestore emulators with `firestore.rules`, as the demo project
  `demo-keystone`, which exists only in the emulators. A build connects to emulators only for a `demo-` project
  (`VITE_FIREBASE_AUTH_EMULATOR` and `VITE_FIREBASE_FIRESTORE_EMULATOR`, set by `e2e.cloud.config.ts`), so the
  variables can never point a real build at one.
