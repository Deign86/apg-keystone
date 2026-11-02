import { describe, expect, it } from 'vitest';
import type { AppLocator, InstalledApp, SystemBridge } from '@keystone/core';
import { ATTENDANCE_APP, attendanceConnector } from '../src';

/** What the shortcut asked the computer to do. */
interface Calls {
  located: AppLocator[];
  launched: InstalledApp[];
  opened: string[];
}

function computer(installed: InstalledApp | null) {
  const did: Calls = { located: [], launched: [], opened: [] };

  const system: SystemBridge = {
    platform: 'windows',
    locateApp: async (l) => { did.located.push(l);

 return installed; },
    launchApp: async (a) => { did.launched.push(a); },
    openUrl: async (u) => { did.opened.push(u); },
  };

  return { system, did };
}

describe('the attendance app shortcut', () => {
  it('finds the app by the bundle id and Windows uninstall key its installers write, and starts it', async () => {
    const app = { path: 'C:\\Program Files\\Alpha Premier Attendance\\alpha-premier-attendance.exe' };
    const { system, did } = computer(app);

    await attendanceConnector.open({ system });

    expect(did.located).toEqual([{
      macBundleId: 'com.alphapremier.attendance', macAppName: 'Alpha Premier Attendance',
      windowsUninstallKey: 'Alpha Premier Attendance', windowsExe: 'alpha-premier-attendance.exe',
    }]);
    expect(did.located[0]).toBe(ATTENDANCE_APP);
    expect(did.launched).toEqual([app]);
  });

  it('opens the latest release when the app is not installed', async () => {
    const { system, did } = computer(null);

    expect(await attendanceConnector.open({ system })).toBe('Alpha Premier Attendance is not on this computer, so its download page is open.');
    expect(did.opened).toEqual(['https://github.com/Deign86/alpha-premier-attendance/releases/latest']);
  });

  it('shows the app’s own logo', () => {
    expect(attendanceConnector.logo).toMatch(/logo\.png$/);
  });
});
