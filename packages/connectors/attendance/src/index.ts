import { openDesktopApp, type AppLocator, type Connector, type DesktopApp } from '@keystone/core';
import type { ConnectorPlugin } from '@keystone/kit';
import logo from './logo.png';

// Alpha Premier Attendance (Deign86/alpha-premier-attendance): the RFID time-in kiosk at the front desk. Its shortcut
// on Home opens the app. Keystone finds it by its bundle id com.alphapremier.attendance on macOS ("Alpha Premier
// Attendance.app"), and on Windows by the Uninstall registry key "Alpha Premier Attendance" that its NSIS installer
// writes, with alpha-premier-attendance.exe. Not installed: its latest release page opens instead.

export const ATTENDANCE_APP: AppLocator = {
  macBundleId: 'com.alphapremier.attendance',
  macAppName: 'Alpha Premier Attendance',
  windowsUninstallKey: 'Alpha Premier Attendance',
  windowsExe: 'alpha-premier-attendance.exe',
};

export const ATTENDANCE: DesktopApp = {
  name: 'Alpha Premier Attendance',
  locator: ATTENDANCE_APP,
  downloads: 'https://github.com/Deign86/alpha-premier-attendance/releases/latest',
};

export const attendanceConnector: Connector = {
  id: 'attendance',
  name: 'Attendance Tracker',
  tag: 'RFID',
  logo,
  open: ({ system }) => openDesktopApp(system, ATTENDANCE),
};

export const attendancePlugin: ConnectorPlugin = { connector: attendanceConnector };
