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

  it('not installed: fetches the installer for this computer from its latest release, and offers no update of its own', async () => {
    // The file names of a real release, so a renamed asset fails here and not on someone's desk.
    const assets = ['Alpha.Premier.Attendance_0.2.51_aarch64.dmg', 'Alpha.Premier.Attendance_0.2.51_x64-setup.exe', 'Alpha.Premier.Attendance_0.2.51_x64-setup.exe.sig', 'Alpha.Premier.Attendance_0.2.51_x64.dmg', 'Alpha.Premier.Attendance_aarch64.app.tar.gz', 'Alpha.Premier.Attendance_x64.app.tar.gz', 'latest.json'].map((name) => ({ name, url: `https://github.com/Deign86/alpha-premier-attendance/releases/download/v1/${name}` }));

    for (const [platform, arch, file] of [['windows', undefined, 'Alpha.Premier.Attendance_0.2.51_x64-setup.exe'], ['macos', 'arm64', 'Alpha.Premier.Attendance_0.2.51_aarch64.dmg'], ['macos', 'x64', 'Alpha.Premier.Attendance_0.2.51_x64.dmg']] as const) {
      const { system } = computer(null);
      const fetched: string[] = [];

      const said = await attendanceConnector.open({ system: {
        ...system, platform, arch,
        latestRelease: async (repo) => { expect(repo).toBe('Deign86/alpha-premier-attendance');

 return { version: '1', assets }; },
        installFrom: async (asset) => { fetched.push(asset.name); },
      } });

      expect(fetched).toEqual([file]);
      expect(said).toMatch(/Its installer is open/);
    }

    // It updates itself once installed, so Keystone leaves its updates alone.
    expect(attendanceConnector.update).toBeUndefined();
  });

  it('shows the app’s own logo', () => {
    expect(attendanceConnector.logo).toMatch(/logo\.png$/);
  });
});
