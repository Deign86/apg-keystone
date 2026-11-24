# Keystone on the web: Vercel, phones and tablets

The same Keystone as the desktop app, served as a web app that installs on a phone, a tablet or a computer
(docs/adr/0046). It keeps its records in the Firebase project, behind the same sign-in (docs/FIREBASE.md). This page is
for the owner of APG's Vercel and Firebase accounts: the steps that need those accounts, done once.

## What is already in the repository

- `vercel.json` builds the web app (`npm ci`, then `npm run build:web`, into `apps/keystone/dist`), sends every address
  to `index.html`, and sets the caching: the page and `sw.js` are never kept stale (`no-cache`), the files under
  `/assets/`, named by their content, are kept for a year (`immutable`).
- The manifest, the icons (maskable ones for Android) and the iPhone tags, so Chrome, Edge and Safari install it.
- A service worker that keeps the app itself, never the records, so it opens fast and offline. A newer deployment shows
  in the rail as "Keystone <commit> is ready" with **Update and restart**.

## 1. Link the repository to Vercel

1. Sign in at <https://vercel.com> with the account that should own the project, and choose **Add New… › Project**.
2. **Import** `Deign86/apg-keystone` (give Vercel's GitHub app access to it if it asks).
3. Leave **Root Directory** as `./` (the repository root, where `vercel.json` is). Vercel reads the framework, install
   and build commands and the output folder from `vercel.json`; leave those fields as Vercel fills them in.
4. Under **Settings › Build and Deployment › Node.js Version**, choose **22.x** (what CI uses).
5. Add the environment variables in step 2 *before* the first deploy, then **Deploy**.

## 2. Environment variables

**Settings › Environment Variables.** The values are the same as the desktop app's Actions variables (the repository's
**Settings › Secrets and variables › Actions › Variables**), from the Firebase console: **Project settings › Your apps
› Web app**. They name the project; they are not secrets (`apps/keystone/.env.example`). Never commit them.

| Name | Production | Preview | What it is |
|---|---|---|---|
| `VITE_FIREBASE_API_KEY` | the web app's API key | leave unset | The Firebase project's web config |
| `VITE_FIREBASE_PROJECT_ID` | `apg-keystone` | leave unset | |
| `VITE_FIREBASE_APP_ID` | the web app's app id | leave unset | |
| `VITE_FIREBASE_AUTH_DOMAIN` | `apg-keystone.firebaseapp.com` (optional, this is the default) | leave unset | |
| `VITE_KEYSTONE_CHANNEL` | `stable` | `beta` | `stable` opens only the released screens; `beta` every screen (docs/adr/0017) |

Set the Firebase variables for **Production only**. A preview of a pull request is then built without the Firebase
project: it opens as the browser preview, keeping made-up records in that browser, and can never read or change APG's
records, whatever the pull request changes. A variable changed later takes effect on the next deployment: **Deployments
› ⋯ › Redeploy**.

## 3. Let the Vercel address sign in to Firebase

1. In the Firebase console (project `apg-keystone`): **Authentication › Settings › Authorized domains › Add domain**.
2. Add the production address: the project's `<name>.vercel.app` from Vercel's **Domains** settings, and any custom
   domain (say `keystone.alphapremiergroup.com`). One domain per entry, no `https://`.
3. If the web API key is restricted (Google Cloud console › **APIs & Services › Credentials** › the Browser key ›
   **Website restrictions**), add `https://<the address>/*` there too. Unrestricted, nothing to do.

Nothing else changes in Firebase: the rules and the accounts are the same as the desktop app's.

## 4. Deploy previews of pull requests

Once the repository is linked, Vercel builds every pull request and comments its preview address on it, by itself
(**Settings › Git**, on by default). The previews use the **Preview** variables above: a browser preview, never the
records. Leave **Vercel Authentication** on (**Settings › Deployment Protection**), so only the team's Vercel accounts
open them.

## 5. A custom domain (optional)

**Settings › Domains › Add**, then the DNS record Vercel names at the domain's registrar. Add the domain to Firebase's
authorized domains (step 3).

## Installing it

- **iPhone and iPad (Safari):** open the address, tap **Share**, then **Add to Home Screen**. The rail says so too.
- **Android (Chrome) and computers (Chrome, Edge):** the rail shows **Install Keystone**; or the browser's menu ›
  **Install app** / **Add to Home screen**.

Installed, Keystone opens full screen with its own icon, and from what it keeps when there is no signal (it still needs
the network to read and save the records).

## What works differently from the desktop app

Everything a screen does works the same: the forms, drafts, registers, papers, signatures, Print, Export PDF, backups.
Where the desktop app talks to the computer, the web app does what a browser can:

- **Files:** Export PDF, backups and print files download through the browser; choosing a photo, a signature or a
  backup opens the device's file picker (and the camera, on a phone).
- **Export PDF** draws the paper onto A4 pages (docs/adr/0043); only the Windows desktop app prints it as text.
- **Connected systems:** the APG desktop apps (attendance, ID maker, Branding Studio) run on a computer, so their
  shortcut opens their download page; the website opens as on the desktop.
- **Updates** come with each deployment, as above, instead of an installer.

## Checking a deployment

- Open the address on a phone; sign in; the rail (behind **Menu** on a phone) names who is signed in.
- Chrome on a computer: DevTools › **Application** › **Manifest** shows no installability errors, and **Service workers**
  shows `sw.js` running. **Lighthouse** › Best practices should be 100.
- The repository's own checks of all of this: `apps/keystone/src/test/pwa.test.ts` (the worker's rules, the manifest,
  `vercel.json`) and the mobile end-to-end suite (`npm run test:e2e:mobile`).
