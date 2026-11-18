import { describe, expect, it } from 'vitest';
import type { AppRelease, InstalledApp, ReleaseAsset, SystemBridge } from '@keystone/core';
import { ID_MAKER_APP, idMakerAppConnector } from '../src';

// The real file names of release v2.0.4 (Deign86/apg-id-creator), so a renamed asset fails here and not on someone's desk.
const file = (name: string): ReleaseAsset => ({ name, url: `https://github.com/Deign86/apg-id-creator/releases/download/v2.0.4/${name}`, digest: 'sha256:00' });

const V204: AppRelease = {
  version: '2.0.4',
  assets: [
    'AlphaPremierIdMaker-Mac-AppleSilicon-v2.0.4.dmg', 'AlphaPremierIdMaker-Mac-Intel-v2.0.4.dmg', 'AlphaPremierIdMaker-Portable-v2.0.4.exe',
    'AlphaPremierIdMaker-Setup-v2.0.4.exe', 'SHA256SUMS-Mac.txt', 'SHA256SUMS.txt',
  ].map(file),
};

function computer(installed: InstalledApp | null, over: Partial<SystemBridge> = {}) {
  const did: string[] = [];
  const said: string[] = [];

  const system: SystemBridge = {
    platform: 'windows',
    locateApp: async (l) => { expect(l).toBe(ID_MAKER_APP);

 return installed; },
    launchApp: async (a) => { did.push(`launch ${a.path}`); },
    openUrl: async (u) => { did.push(`open ${u}`); },
    latestRelease: async (repo) => { did.push(`ask ${repo}`);

 return V204; },
    installFrom: async (a) => { did.push(`install ${a.name}`); },
    ...over,
  };

  return { env: { system, slow: (what: string) => { said.push(what); } }, did, said };
}

describe('the ID Maker shortcut', () => {
  it('finds the app by the bundle id and the uninstall key its installers write, and starts it without asking GitHub', async () => {
    const { env, did } = computer({ path: 'C:\\Program Files\\Alpha Premier ID Maker\\AlphaPremierIdMaker.exe', version: '2.0.4' });

    expect(await idMakerAppConnector.open(env)).toBeUndefined();
    expect(did).toEqual(['launch C:\\Program Files\\Alpha Premier ID Maker\\AlphaPremierIdMaker.exe']);
    expect(ID_MAKER_APP).toEqual({
      macBundleId: 'com.alphapremiergroup.idmaker', macAppName: 'Alpha Premier ID Maker',
      windowsUninstallKey: '{6F0E2B6C-4D53-4C0B-9A8E-2C7B1D5A9E41}_is1', windowsExe: 'AlphaPremierIdMaker.exe',
    });
  });

  it('not installed on Windows: fetches the setup program, never the portable one, and says what to do next', async () => {
    const { env, did, said } = computer(null);

    expect(await idMakerAppConnector.open(env)).toBe('Alpha Premier ID Maker 2.0.4 was not on this computer. Its installer is open: finish it, then open Alpha Premier ID Maker here again.');
    expect(did).toEqual(['ask Deign86/apg-id-creator', 'install AlphaPremierIdMaker-Setup-v2.0.4.exe']);
    expect(said).toEqual(['Getting Alpha Premier ID Maker…', 'Downloading Alpha Premier ID Maker 2.0.4…']);
  });

  it('not installed on a Mac: fetches the disk image for its processor', async () => {
    const arm = computer(null, { platform: 'macos', arch: 'arm64' });
    const intel = computer(null, { platform: 'macos', arch: 'x64' });

    await idMakerAppConnector.open(arm.env);
    await idMakerAppConnector.open(intel.env);
    expect(arm.did[1]).toBe('install AlphaPremierIdMaker-Mac-AppleSilicon-v2.0.4.dmg');
    expect(intel.did[1]).toBe('install AlphaPremierIdMaker-Mac-Intel-v2.0.4.dmg');
  });

  it('opens the download page when the installer cannot be fetched', async () => {
    const offline = computer(null, { latestRelease: async () => { throw new Error('Could not reach GitHub.'); } });
    const refused = computer(null, { installFrom: async () => { throw new Error('did not arrive as GitHub published it'); } });
    const older = computer(null, { latestRelease: undefined, installFrom: undefined });

    for (const { env, did } of [offline, refused, older]) {
      expect(await idMakerAppConnector.open(env)).toBe('Alpha Premier ID Maker is not on this computer, so its download page is open.');
      expect(did.at(-1)).toBe('open https://github.com/Deign86/apg-id-creator/releases/latest');
    }
  });

  it('offers a newer version, because the ID Maker has no updater of its own', async () => {
    const { env, did } = computer({ path: 'C:\\ID\\AlphaPremierIdMaker.exe', version: '2.0.3' });
    const update = await idMakerAppConnector.update?.(env);

    expect(update?.version).toBe('2.0.4');
    expect(did).toEqual(['ask Deign86/apg-id-creator']);
    expect(await update?.install(env)).toBe('The installer for Alpha Premier ID Maker 2.0.4 is open. Close Alpha Premier ID Maker first, then finish the installer.');
    expect(did).toEqual(['ask Deign86/apg-id-creator', 'install AlphaPremierIdMaker-Setup-v2.0.4.exe']);
  });

  it('offers nothing when up to date, newer, not installed, of unknown version, or offline', async () => {
    const none = [
      computer({ path: 'x', version: '2.0.4' }),
      computer({ path: 'x', version: '2.1.0' }),
      computer(null),
      computer({ path: 'x' }),
      computer({ path: 'x', version: '2.0.3' }, { latestRelease: async () => { throw new Error('offline'); } }),
      computer({ path: 'x', version: '2.0.3' }, { platform: 'linux' }),
    ];

    for (const { env } of none) expect(await idMakerAppConnector.update?.(env)).toBeNull();
  });

  it('shows the app’s own logo', () => {
    expect(idMakerAppConnector.logo).toMatch(/logo\.png$/);
  });
});
