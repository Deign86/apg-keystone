import { describe, expect, it } from 'vitest';
import type { AppLocator, AppRelease, InstalledApp, ReleaseAsset, SystemBridge } from '@keystone/core';
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

  it('not installed: fetches the installer for this computer from its latest release', async () => {
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
  });

  it('shows the app’s own logo', () => {
    expect(attendanceConnector.logo).toMatch(/logo\.png$/);
  });
});

// The real file names of release v0.2.57 (Deign86/alpha-premier-attendance), the one this computer's 0.2.20 missed.
const asset = (name: string): ReleaseAsset => ({ name, url: `https://github.com/Deign86/alpha-premier-attendance/releases/download/v0.2.57/${name}`, digest: 'sha256:00' });

const V0257: AppRelease = {
  version: '0.2.57',
  assets: [
    'Alpha.Premier.Attendance_0.2.57_aarch64.dmg', 'Alpha.Premier.Attendance_0.2.57_x64-setup.exe', 'Alpha.Premier.Attendance_0.2.57_x64-setup.exe.sig',
    'Alpha.Premier.Attendance_0.2.57_x64.dmg', 'Alpha.Premier.Attendance_aarch64.app.tar.gz', 'Alpha.Premier.Attendance_aarch64.app.tar.gz.sig',
    'Alpha.Premier.Attendance_x64.app.tar.gz', 'Alpha.Premier.Attendance_x64.app.tar.gz.sig', 'latest.json',
  ].map(asset),
};

/** An installed attendance app of `version`, on a computer that asks GitHub with `latestRelease`. */
function installedAt(version: string | undefined, latestRelease: SystemBridge['latestRelease'] = async () => V0257, over: Partial<SystemBridge> = {}) {
  const did: string[] = [];

  const system: SystemBridge = {
    platform: 'windows',
    locateApp: async () => ({ path: 'C:\\Program Files\\Alpha Premier Attendance\\alpha-premier-attendance.exe', version }),
    launchApp: async () => {},
    openUrl: async (u) => { did.push(`open ${u}`); },
    latestRelease: async (repo) => { did.push(`ask ${repo}`);

 return latestRelease(repo); },
    installFrom: async (a) => { did.push(`install ${a.name}`); },
    ...over,
  };

  return { env: { system }, did };
}

// docs/adr/0035: the app updates itself only while it is open, so Home says when a newer version is out.
describe('the attendance app’s updates, on Home', () => {
  it('update found: an installed app older than the latest release is offered it, and its setup program is fetched', async () => {
    const { env, did } = installedAt('0.2.20');
    const update = await attendanceConnector.update?.(env);

    expect(update?.version).toBe('0.2.57');
    expect(did).toEqual(['ask Deign86/alpha-premier-attendance']);
    expect(await update?.install(env)).toBe('The installer for Alpha Premier Attendance 0.2.57 is open. Close Alpha Premier Attendance first, then finish the installer.');
    expect(did.at(-1)).toBe('install Alpha.Premier.Attendance_0.2.57_x64-setup.exe');
  });

  it('update found on a Mac: the disk image for its processor', async () => {
    for (const [arch, file] of [['arm64', 'Alpha.Premier.Attendance_0.2.57_aarch64.dmg'], ['x64', 'Alpha.Premier.Attendance_0.2.57_x64.dmg']] as const) {
      const { env, did } = installedAt('0.2.56', undefined, { platform: 'macos', arch });

      await (await attendanceConnector.update?.(env))?.install(env);
      expect(did.at(-1)).toBe(`install ${file}`);
    }
  });

  it('up to date: nothing is offered, nor for a version the computer does not say', async () => {
    for (const version of ['0.2.57', '0.2.58', undefined]) expect(await attendanceConnector.update?.(installedAt(version).env)).toBeNull();
  });

  it('check failed: says why, so the shortcut keeps what it last knew', async () => {
    const { env } = installedAt('0.2.20', async () => { throw new Error('Could not reach GitHub. Check the internet connection.'); });

    await expect(attendanceConnector.update?.(env)).rejects.toThrow('Could not reach GitHub. Check the internet connection.');
  });
});

// docs/adr/0030: the attendance tracker reads `attendanceAdmin` from a member's own document, and firestore.rules and
// the kiosk both name that field. These are the words User Accounts shows for it, pinned where they are written.
describe('what the attendance tracker lets the CEO give a staff member', () => {
  const grant = attendanceConnector.memberGrant;

  it('is kept under the field the kiosk reads, which is never renamed here alone', () => {
    expect(grant?.field).toBe('attendanceAdmin');
  });

  it('is worded as User Accounts has always shown it', () => {
    expect(grant).toMatchObject({ label: 'Attendance admin', as: 'an attendance admin', opens: 'the attendance tracker\'s admin screens' });
    expect(grant?.asks.give('Ana Cruz (ana.cruz@alphapremiergroup.com)'))
      .toBe('Ana Cruz (ana.cruz@alphapremiergroup.com) will open the attendance tracker\'s admin screens with their own email and password: interns, attendance, payroll and its settings.');
    expect(grant?.asks.take('Ana Cruz'))
      .toBe('Ana Cruz will no longer open the attendance tracker\'s admin screens with this account. An admin card they hold still works there.');
  });
});
