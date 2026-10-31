# Attendance tracker ↔ Keystone: the one open decision

## Today (no change to the attendance app)

- **Live figures:** read from the kiosk's LAN viewer, the same feed the `/attendance` dashboard uses.
- **Employees and photos:** come from the attendance app's own backup (`.apbackup`), which it writes on every clean
  exit.
  - On the kiosk PC, Keystone finds the newest backup by itself.
  - On another PC, point Settings › Connections › Backup folder at a shared folder the kiosk's backups are copied to,
    or choose the file.

This works now. The cost is that the directory is only as fresh as the last backup.

## The option: a read-only roster on the LAN

The attendance app's LAN viewer **deliberately** serves attendance rows only. Its docs say "The LAN surface never
exposes admin, payroll, setup, photo, RFID, sync, or mutation routes" (`docs/lan-dashboard-deployment.md`). Keystone
does not get around that rule.

If you want Keystone to see new hires the moment they are registered at the kiosk, the attendance app would need
two new GET routes. They would sit behind their own integration token, separate from the viewer token, plus the
existing subnet check:

| Route | Returns |
|---|---|
| `GET /api/integration/users` | `[{ userId, fullName, department, designation, status }]`, only ACTIVE EMPLOYEE cards, no RFID UIDs |
| `GET /api/integration/users/:id/photo` | the photo (`photos/<id>.webp`) |

**Where the change goes in `alpha-premier-attendance`:**
- The routes go in the router in `src-tauri/src/lan_server.rs`.
- The token hash goes in a new `integration_token_hash` in `LanConfig` (`src-tauri/src/config.rs`).
- The data comes from the same query `admin_users` already runs.

**What it costs:** it changes the LAN policy written in that repo, so it is your call, not Keystone's. The Keystone
side would be a few lines in `packages/connectors/attendance/src/index.ts`: try the integration route first,
fall back to the backup.
