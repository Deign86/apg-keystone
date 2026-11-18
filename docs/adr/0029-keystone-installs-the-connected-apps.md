# 0029. Keystone installs the connected apps, and updates the one that cannot update itself

Status: Accepted · Date: 2026-11-18 · Changes [0007](0007-connected-systems-are-shortcuts.md)

## Context

- The owner's statement (2026-11-17): the ID Maker, the attendance tracker and Keystone stay separate programs that
  share a backend, and **Keystone is the launcher for them: it handles installing and updating them, or reuses the
  updating each already has.**
- Under 0007 a shortcut started an installed app, and for a missing one only opened its release page: the person
  had to pick the right file out of six to nine.
- The ID Maker's desktop program had no shortcut at all.
- What each app already does about updates, read from its code:
  - attendance tracker: Tauri's updater, signed `latest.json` (updates itself);
  - Alpha Branding Studio: its own `UpdateService` (Windows) and `Updater.swift` (Mac) (updates itself);
  - Alpha Premier ID Maker: nothing. A new version is a new setup program on GitHub.

## Decision

- **Installing is Keystone's.** Clicking the shortcut of an app that is not on the computer downloads the installer
  for this computer from the app's latest GitHub release and opens it, as a double-click would. The person finishes
  the installer (administrator prompt on Windows, drag to Applications on a Mac). Keystone installs nothing silently.
- **Updating is reused where it exists.** An app that updates itself (`updatesItself: true`) is left to. Keystone
  never asks GitHub about an app that is installed and updates itself.
- **Keystone updates only what cannot update itself**: the ID Maker. When its installed version is older than the
  latest release, "Update to 2.0.5" shows under its shortcut and fetches the installer the same way. The shortcut
  itself still just opens the app: an update is offered, never forced on someone who needs to issue an ID now.
- **The ID Maker gets a shortcut** (`packages/connectors/id-maker-app`).
- **The native side decides what may be fetched**, not the page (`src-tauri/src/lib.rs`): only a repository of
  `Deign86`; only a file at `https://github.com/Deign86/<repo>/releases/download/<tag>/<file>`; only `.exe`, `.dmg`,
  `.zip`, `.pkg`; and it is opened only when its SHA-256 equals the digest GitHub publishes for it.
- **A download gets the time it needs.** A connector call has 15 seconds until it says it is doing something slow
  (`env.slow`), then 20 minutes; the shortcut shows what it is doing.
- Anything that stops this (offline, GitHub's limit, no installer for this computer) falls back to 0007: the release
  page opens.

## Consequences

- **Good:** a new computer needs Keystone and nothing else: every other APG app is one click from Home, and the
  right file is chosen for the person.
- **Cost and limits:**
  - Keystone now makes network calls besides its own updater: `api.github.com` (one for a missing app when clicked;
    one when Home opens, for the ID Maker's version) and the download. GitHub allows 60 such questions an hour from
    one office address without signing in; past that the release page opens and no update is offered.
  - The digest proves the file is the one GitHub holds, not who built it. The apps are not code-signed, so Windows
    SmartScreen and macOS still ask on first open. A file fetched this way is not quarantined by macOS.
  - A release with no digest (made before GitHub published them) is fetched unchecked. Every current release of the
    attendance tracker and the ID Maker has one.
  - A release that renames its installer is not found, and the release page opens. Each connector's test holds the
    real file names of a release.
  - A portable copy of the ID Maker is not found, so it is offered as "not installed".
  - The website is unchanged: it has nothing to install.
