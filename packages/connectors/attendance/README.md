# Attendance Tracker

The RFID time-in kiosk at the front desk (`Deign86/alpha-premier-attendance`: Tauri, React, Rust, SQLite).

## Owns
- `src/index.ts`: the connector. It covers health, live figures, the "Open attendance app", "Open live dashboard"
  and "Download latest" actions, and the employee import.
- `src/backup.ts`: reads the attendance app's portable backup (`.apbackup`), a ZIP holding
  `database/attendance.db` and `photos/<USER_ID>.webp`.
- `src/sql.ts`: SQLite in WebAssembly, loaded once.
- `test/attendance.test.ts`: the lateness rule, figures, kiosk health, and a backup built exactly as the attendance
  app writes one.

## How it reaches the attendance app (nothing in the attendance app changes)
- **The app on this computer**, found the way Branding Studio is:
  - macOS: bundle id `com.alphapremier.attendance` (`Alpha Premier Attendance.app`).
  - Windows: the Uninstall registry key `Alpha Premier Attendance` that its per-machine NSIS installer writes, with
    `alpha-premier-attendance.exe`.
  - Installed here counts as connected, with its version. "Open attendance app" starts it.
- **Its releases on GitHub** (`Deign86/alpha-premier-attendance`): the card offers the update when the installed copy
  is behind. "Download latest" fetches the Windows setup `.exe`; on a Mac it opens the release page, since there is one
  `.dmg` per chip (aarch64 for Apple silicon, x64 for Intel). The version check itself (`isNewer`, `latestRelease`) is
  shared with Branding Studio in `@keystone/core`.
- **Its read-only LAN viewer** (`src-tauri/src/lan_server.rs` there), on port 4173. It sends `X-Viewer-Token` when a
  token is set.
  - `GET /api/health`: kiosk online, and the number of live viewers.
  - `GET /api/attendance/today`: today's rows. Lateness uses the app's own rule: from 1 Oct 2026, 08:01 or later is
    late.
  - `/attendance`: the live dashboard, opened in the browser.
- **Its backups:** the newest `.apbackup` in `<LocalAppData>/com.alphapremier.attendance/backups`, in the folder set in
  the settings, or a file the person chooses.
  - Imports ACTIVE `EMPLOYEE` cards only; admin-assist and inactive cards are skipped.
  - Each person is linked by their attendance `user_id` (`links.attendance`), so a later import updates them and
    never duplicates them.

## Contributes
Its Home card (connected when the app is installed here or the kiosk answers), three live figures (In now, Late
arrivals, Timed out) when the kiosk's address is set, and an employee import that includes photos for the ID Maker.
Linked directory records carry the tag `RFID`.

## Needs
Nothing to see the installed app. For live figures: the kiosk's address. The attendance app's LAN viewer is off until
someone turns it on (Live attendance › Share on the LAN), and it binds to the office network address, never
`localhost`, so even on the kiosk PC Keystone needs that address. Optional: a viewer token (keychain), and a backup
folder when Keystone runs on another PC.

## Removing it
Delete its line in `apps/keystone/src/connectors.ts` and its entry in `apps/keystone/package.json`. Employees already imported stay in the directory with their links.

## Not possible today
The LAN viewer deliberately never serves the roster or photos. See `docs/ATTENDANCE-INTEGRATION.md` for the option
and who decides.
