# 0017. Releases always sign in, and screens not released yet say "Coming soon"

Status: Accepted; what a screen coming soon shows superseded by docs/adr/0019 · Date: 2026-11-12

## Context

- **A release could be built without the Firebase project.** The workflow passed the repository's Actions variables
  to the build, and a build without them keeps its records on each computer (docs/adr/0009). It opens straight on
  "Administrator access", with no sign-in and nothing to sign out of. The repository had no such variables, so every
  release up to v0.11.0 was built that way, and a fresh install on a new PC opened as the administrator.
- **Only Check Vouchers and the connected systems are ready for everyone,** with User Accounts (0014), which a
  release that signs in needs: it is where the owner makes the staff's sign-ins. The other screens are still being
  tried out. They should stay in the app, and in the hands of whoever tries them, without being open to every user.

## Decision

- **No release without a sign-in.** The workflow's Version job refuses to make a release when
  `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID` or `VITE_FIREBASE_APP_ID` is not set as an Actions variable. A
  plain run, or a build made by hand, still builds without them, as before.
- **Two kinds of build: beta and stable.** `VITE_KEYSTONE_CHANNEL` (`beta` or `stable`) decides, read by
  `apps/keystone/src/platform/config.ts` › `isBeta`.
  - CI builds a **beta** for a release whose version has a pre-release part (`0.11.0-beta.1`) and for a run that
    releases nothing (the installers under Artifacts). Every other release is **stable**.
  - Without the variable the dev server is a beta and a built app is stable, so a release never opens a screen by
    accident.
  - A beta release is published as a GitHub pre-release. GitHub never makes a pre-release the latest, and installed
    copies update from the latest release, so a stable copy never updates to a beta. The automatic version counts
    from the last release that is not a beta.
- **A stable build opens only the released screens.** `apps/keystone/src/modules.ts` › `RELEASED` lists them: `home`
  (which holds the connected systems), `vouchers` and `accounts`. The connectors are all released. Every other module goes through
  the kit's `comingSoon`:
  - **It keeps its place in the rail**, marked "Soon", and its screen says "Coming soon".
  - **It keeps what it does for other parts:** the services it provides, `onOpen`, `requires` and `documents`.
    Check Vouchers still picks the bank accounts already kept, and the records in the cloud keep their layout, so a
    stable build never writes a list over another build's records.
  - **It drops what it shows:** no Home tile, Overview figure, finding, waiting item, "New …" action or Activity
    filter.
- **`ModuleDef` gains `soon`**, set only by `comingSoon`, which the rail reads.
- **The sign-out button gets an icon**, so it reads as one at the foot of the rail.

## Consequences

- **Good:**
  - Every release asks who is signing in, on a new PC too. Releasing without the variables fails at once, saying
    which are missing, instead of shipping an open copy.
  - Releasing a screen is one id added to `RELEASED`. Removing a module still works as before (docs/adr/0002).
  - A screen coming soon cannot lose its records: the layout and services are tested to be the same as in a beta
    (`apps/keystone/src/test/released.test.tsx`). `e2e/stable/` (`npm run test:e2e:stable`) runs a stable build in
    Chromium.
- **Cost and limits:**
  - Bank Accounts is not released. Check Vouchers lists the accounts already kept, but adding one opens "Coming
    soon".
  - A beta copy does not update to the next beta by itself. It updates to the next stable release once that is
    newer than it.
  - The main end-to-end suite runs a beta. Only `e2e/stable/` sees what a stable release shows.
