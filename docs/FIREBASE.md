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
3. **Auth:** turn on the Email/Password sign-in method. Add an account for each person under Authentication › Users.
4. **Firestore:** create the database in production mode, in `asia-southeast1` (Singapore), the region nearest
   Manila. The region cannot be changed later.
5. **Rules:** deploy them from the repository root:

   ```bash
   npx -y firebase-tools@latest deploy --only firestore:rules --project <project id>
   ```

6. **Members:** in Firestore, create `keystone/apg/members/<uid>` for each person, with the uid from
   Authentication › Users, and the fields `role` (`owner` or `staff`) and `name`. The first owner has to be added in
   the console; after that, owners can add members.
7. **Move the records in:** run Keystone with the variables set (`npm run dev` or `npm run desktop`) **on the
   computer that holds the real records**, and sign in as an owner. Keystone moves that computer's records in once.
   Any other computer then opens the same records. A computer with no records of its own refuses to move anything in.
8. **Release builds:** add the same four values as repository variables (Settings › Secrets and variables › Actions
   › Variables): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` and
   `VITE_FIREBASE_AUTH_DOMAIN`. The next release then ships with the cloud records.

## Good to know

- **The config is not a secret.** It names the project; access is decided by signing in and by `firestore.rules`.
  It still stays out of the code, in `.env.local` (ignored by git) or the Actions variables.
- **API key restrictions:** if you restrict the key to websites, allow `tauri://localhost`, `http://tauri.localhost`
  and `http://127.0.0.1:5174` (development), or leave it unrestricted and rely on the rules.
- **Turning it off:** build without the variables. Each computer then opens the copy its last save left in
  `state.json`.
- **Starting over:** delete the `keystone/apg` document and its collections. The next computer to open a Firebase
  build with records of its own moves them in again.
