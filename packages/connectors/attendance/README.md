# Attendance Tracker

The RFID time-in kiosk at the front desk (`Deign86/alpha-premier-attendance`: Tauri, React, Rust, SQLite).

## Owns
- `src/index.ts`: the connector. Its shortcut opens the attendance app.
- `src/logo.png`: the attendance app's own icon (from its `src-tauri/icons/icon.png`).
- `test/attendance.test.ts`: which app it looks for, that it starts it, and the download page when it is missing.

## How it opens the attendance app (nothing in the attendance app changes)
- **Finding it on this computer:**
  - macOS: bundle id `com.alphapremier.attendance` (`Alpha Premier Attendance.app`).
  - Windows: the Uninstall registry key `Alpha Premier Attendance` that its NSIS installer writes, with
    `alpha-premier-attendance.exe`.
- **Installed:** Keystone starts it.
- **Not installed:** Keystone opens its latest release page on GitHub to download it.
- **In the browser preview:** it says the desktop app is needed.

## Contributes
Its shortcut on Home: the attendance app's logo, named Attendance Tracker. Directory records linked to it earlier
keep the tag `RFID`.

## Needs
Nothing.

## Removing it
Delete its line in `apps/keystone/src/connectors.ts`, its entry in `apps/keystone/package.json` and
`e2e/connectors/attendance.e2e.ts`. The shortcut goes; nothing else changes.
