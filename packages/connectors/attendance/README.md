# Attendance Tracker

The RFID time-in kiosk at the front desk (`Deign86/alpha-premier-attendance`: Tauri, React, Rust, SQLite).

## Owns
- `src/index.ts`: the connector. Its shortcut opens the attendance app.
- `src/logo.png`: the attendance app's own icon (from its `src-tauri/icons/icon.png`).
- `test/attendance.test.ts`: which app it looks for, that it starts it, the download page when it is missing, when
  it offers an update (the real file names of v0.2.57), and the field and words of "attendance admin".

## How it opens the attendance app (nothing in the attendance app changes)
- **Finding it on this computer:**
  - macOS: bundle id `com.alphapremier.attendance` (`Alpha Premier Attendance.app`).
  - Windows: the Uninstall registry key `Alpha Premier Attendance` that its NSIS installer writes, with
    `alpha-premier-attendance.exe`.
- **Installed:** Keystone starts it.
- **Not installed:** Keystone downloads its installer from its latest release, checks it against the digest GitHub
  publishes, and opens it; the person finishes the installer. If that cannot be done, the release page opens.
- **A newer version is out:** "Update to …" shows under the shortcut and does the same download (docs/adr/0035).
  The app also updates itself, but only while it is open, so Home is where it is seen first.
- **In the web app and the browser preview:** it opens the app's download page and says it runs on a computer
  (docs/adr/0047).

## Contributes
- Its shortcut on Home: the attendance app's logo, named Attendance Tracker. Directory records linked to it earlier
  keep the tag `RFID`.
- **"Attendance admin"** (`memberGrant`, docs/adr/0030): what the CEO gives a staff member on User Accounts so they
  open the attendance tracker's admin screens with their own account. The connector contributes the field
  (`attendanceAdmin`, which the kiosk reads from the member document and must never be renamed here alone) and every
  word User Accounts shows for it.

## Needs
Nothing.

## Removing it
Delete its line in `apps/keystone/src/connectors.ts`, its entry in `apps/keystone/package.json` and
`e2e/connectors/attendance.e2e.ts`. The shortcut goes, and User Accounts stops offering "attendance admin" (a member
who has it keeps the field; `e2e/cloud/accounts.e2e.ts` has one test that expects the offer). Nothing else changes.
