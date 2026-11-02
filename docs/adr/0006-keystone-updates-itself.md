# 0006. Keystone updates itself from its signed GitHub releases

Status: Accepted · Date: 2026-11-02

## Context

- **Every update was a manual install.** Each new version meant downloading the `.dmg` or setup `.exe` again. On a
  Mac that also meant allowing it again under Privacy & Security, since Keystone is not notarized.
- **The attendance app already updates itself.** It uses Tauri's updater plugin with a signed `latest.json` on its
  GitHub releases. It checks a few seconds after start and every 8 hours, offers the update in a banner, installs
  it, and restarts.
- **Releases are automatic** (README › Making a release), so updates should be too.

## Decision

Keystone updates itself the way the attendance app does:
- **The Tauri side:** `tauri-plugin-updater` and `tauri-plugin-process`.
  - `plugins.updater` in `tauri.conf.json` holds Keystone's public key and the endpoint
    `releases/latest/download/latest.json`.
  - The capabilities allow `updater:default` and `process:allow-restart`.
- **The kernel:** `Platform` gains an optional `updater` (`AppUpdater`: `currentVersion()`, `check()`, and an
  `AppUpdate` that installs, then restarts).
  - The desktop platform implements it with the plugins; the browser preview has none.
  - Only `apps/keystone/src/platform/desktop.ts` imports the plugins (rule 8).
- **The shell:** `UpdateNotice` (`packages/kit`) sits at the foot of the rail.
  - It shows the running version.
  - It checks 4 seconds after start and every 8 hours, and stays quiet when offline.
  - When a newer version is out, it offers Update and restart, with What's new. Before installing, it writes any
    pending save (`KeystoneStore.flush`).
- **Releases:**
  - With the `TAURI_SIGNING_PRIVATE_KEY` secret set, a release build also makes the signed update files: the macOS
    app as `.app.tar.gz`, and the Windows setup `.exe`, each with a `.sig`.
  - `scripts/updater-manifest.mjs` verifies every signature against the app's public key, then writes
    `latest.json`.
  - Without the secret, the release publishes its installers and warns that installed copies can't update to it.

## Consequences

- **Good:** after one manual install of a version with the updater, every later release reaches each computer by
  itself.
  - The installed copy downloads the update itself, so a Mac does not quarantine it and there is no Open Anyway step.
  - A release the app would refuse (wrong key, a changed file) fails in CI, not on someone's desk.
- **Cost:**
  - The private key must live in the repository's secrets and be kept somewhere safe. Copies that trust one key
    cannot update to releases signed with another.
  - Keystone on a Mac stays ad-hoc signed, so after an update macOS may ask once more for its keychain items (the
    website and kiosk passwords); choose Always Allow.
- **Not covered:** Linux has no update target; Keystone ships for macOS and Windows.
