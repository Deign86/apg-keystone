import { desktopAppShortcut, type AppLocator, type Connector, type DesktopApp, type MemberGrant } from '@keystone/core';
import logo from './logo.png';

// Alpha Premier Attendance (Deign86/alpha-premier-attendance): the RFID time-in kiosk at the front desk. Its shortcut
// on Home opens the app. Keystone finds it by its bundle id com.alphapremier.attendance on macOS ("Alpha Premier
// Attendance.app"), and on Windows by the Uninstall registry key "Alpha Premier Attendance" that its NSIS installer
// writes, with alpha-premier-attendance.exe. Not installed: Keystone fetches its installer from its latest release and
// opens it. Installed and older than that release: "Update to …" shows under its shortcut (docs/adr/0035). The app also
// updates itself (Tauri's updater), but only while it is open, so Home is where a newer version is seen first.

export const ATTENDANCE_APP: AppLocator = {
  macBundleId: 'com.alphapremier.attendance',
  macAppName: 'Alpha Premier Attendance',
  windowsUninstallKey: 'Alpha Premier Attendance',
  windowsExe: 'alpha-premier-attendance.exe',
};

const ATTENDANCE: DesktopApp = {
  name: 'Alpha Premier Attendance',
  locator: ATTENDANCE_APP,
  repo: 'Deign86/alpha-premier-attendance',
  installers: { windows: /_x64-setup\.exe$/, macArm: /_aarch64\.dmg$/, macIntel: /_x64\.dmg$/ },
};

/**
 * The CEO lets a staff member open the attendance tracker's admin screens with their own Keystone account
 * (docs/adr/0030). The tracker reads `attendanceAdmin` from the member's own document when they sign in there, so the
 * field's name is its contract with Keystone: never rename it here alone.
 */
export const ATTENDANCE_ADMIN: MemberGrant = {
  field: 'attendanceAdmin',
  label: 'Attendance admin',
  as: 'an attendance admin',
  opens: 'the attendance tracker\'s admin screens',
  asks: {
    give: (who) => `${who} will open the attendance tracker's admin screens with their own email and password: interns, attendance, payroll and its settings.`,
    take: (who) => `${who} will no longer open the attendance tracker's admin screens with this account. An admin card they hold still works there.`,
  },
};

export const attendanceConnector: Connector = {
  id: 'attendance',
  name: 'Attendance Tracker',
  tag: 'RFID',
  logo,
  ...desktopAppShortcut(ATTENDANCE),
  memberGrant: ATTENDANCE_ADMIN,
};
