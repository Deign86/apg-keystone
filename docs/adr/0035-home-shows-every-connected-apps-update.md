# 0035. Home shows every connected app's newer version

Status: Accepted · Date: 2026-11-19 · Changes [0029](0029-keystone-installs-the-connected-apps.md)

## Context

- The owner's report (2026-11-19): the attendance tracker had a newer version out, and it showed only once the
  attendance app itself was opened. Keystone's Home, the launcher for the APG apps, said nothing.
- That was 0029 working as written: "Keystone never asks GitHub about an app that is installed and updates itself."
  Only the ID Maker's connector had `update`; the attendance tracker and Alpha Branding Studio left it out. On the
  computer that reported it, the attendance tracker was 0.2.20 (its Uninstall key's `DisplayVersion`) while its latest
  GitHub release was 0.2.57.
- An app that updates itself does so only while it is open: Tauri's updater for the attendance tracker, the studio's
  `UpdateService` and `Updater.swift`. An app opened rarely, or never left open, stays behind, and nothing says so.
- Nothing was wrong with where the releases are: the attendance tracker's own updater reads `latest.json` from
  `https://github.com/Deign86/alpha-premier-attendance/releases/latest/download/`, the same latest release Keystone
  reads, tagged `v0.2.57`, not a prerelease. The studio's latest release is `v2.8.1`. No other repository has to change.
- The one check there was (the ID Maker's) ran once when Home opened, never again while Home stayed open, and a failed
  check read the same as "up to date": `desktopAppUpdate` answered null for both.

## Decision

- **Every connected desktop app has its newer version shown under its shortcut on Home**, whether or not the app
  also updates itself. One helper builds the shortcut of every APG desktop app, `desktopAppShortcut` in core: `open`
  starts the app or fetches its installer (0029), `update` compares the version installed here with the latest
  release.
- **Installing the newer version works as for the ID Maker:** "Update to 0.2.57" fetches the release's installer for
  this computer, checks it against GitHub's digest and opens it (0029). The person closes the app and finishes the
  installer. The app's own updater, when it is opened, finds nothing left to do.
- **A check is asked when Home shows a shortcut, then every hour while it stays** (`CONNECTOR_CHECK_EVERY_MS` in the
  kit). The desktop platform answers a repeated question about one repository from memory for ten minutes, so opening
  Home again costs GitHub nothing.
- **A check that fails says so, and changes nothing on screen.** `update` rejects when Keystone cannot tell (offline,
  GitHub's limit); the shortcut keeps what the last check found, notes the reason in the console, and asks again
  within the hour. It answers null only for an app that is up to date, not installed, of a version the computer does
  not say, or where Keystone cannot install (the browser preview).
- **The website has no `update`:** it is served, so whoever opens the admin portal has the latest.
- `apps/keystone/src/test/connected-apps.test.ts` holds every connector that installs an app to offering its newer
  version too, on Windows and both kinds of Mac, so a new desktop connector cannot leave it out again.

## Consequences

- **Good:** Home says which APG app is behind, the same way for each, without opening each app to find out.
- **Cost and limits:**
  - Keystone now asks GitHub about three repositories when Home opens and every hour after, instead of one. With the
    ten-minute memory that is at most 18 an hour from one computer, under GitHub's 60 an hour per office address for a
    few computers at once. Past the limit no offer shows until the next hour, and the shortcuts still open.
  - Two updaters can now offer the same version. Both install the same file from the same release, so whichever runs
    first leaves the other nothing to do.
  - The attendance tracker's installer replaces a per-machine copy (Program Files), so Windows asks for an
    administrator, as it does for its own updater.
  - On a Mac, Alpha Branding Studio's release has a `.zip` (the file 0029 fetches for it), not an installer: opening it
    unpacks the new studio beside the download, and the person moves it into Applications. Its release also has a
    `.pkg`; fetching that instead is a change to the connector and its test, not to this decision.
  - The installed version is what the computer says: `DisplayVersion` on Windows, `CFBundleShortVersionString` on a
    Mac. An installer that stops writing it leaves that app without an offer, never with a wrong one.
