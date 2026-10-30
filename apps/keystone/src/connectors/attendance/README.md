# Attendance Tracker

The RFID time-in kiosk at the front desk (`Deign86/alpha-premier-attendance`: Tauri, React, Rust, SQLite).

## Owns
- `index.ts`: the connector. It covers health, live figures, the "Open live dashboard" action and the employee import.
- `backup.ts`: reads the attendance app's portable backup (`.apbackup`), a ZIP holding
  `database/attendance.db` and `photos/<USER_ID>.webp`.
- `sql.ts`: SQLite in WebAssembly, loaded once.

## How it reaches the kiosk (nothing in the attendance app changes)
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
Its Home card, three live figures (In now, Late arrivals, Timed out), and an employee import that includes photos for
the ID Maker. Linked directory records carry the tag `RFID`.

## Needs
Settings: kiosk address, an optional viewer token (keychain), and a backup folder when Keystone runs on another PC.

## Removing it
Delete its line in `../index.ts`. Employees already imported stay in the directory with their links.

## Not possible today
The LAN viewer deliberately never serves the roster or photos. See `docs/ATTENDANCE-INTEGRATION.md` for the option
and who decides.
