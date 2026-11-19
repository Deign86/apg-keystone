import { describe, expect, it } from 'vitest';
import type { AppLocator, AppRelease, InstalledApp, ReleaseAsset, SystemBridge } from '@keystone/core';
import { brandingStudioConnector, STUDIO_APP } from '../src';

/** What the shortcut asked the computer to do. */
interface Calls {
  located: AppLocator[];
  launched: InstalledApp[];
  opened: string[];
}

function computer(installed: InstalledApp | null) {
  const did: Calls = { located: [], launched: [], opened: [] };

  const system: SystemBridge = {
    platform: 'macos',
    locateApp: async (l) => { did.located.push(l);

 return installed; },
    launchApp: async (a) => { did.launched.push(a); },
    openUrl: async (u) => { did.opened.push(u); },
  };

  return { system, did };
}

describe('the Branding Studio shortcut', () => {
  it('finds the studio by its bundle id and Windows uninstall key, and starts it', async () => {
    const app = { path: '/Applications/Alpha Branding Studio.app' };
    const { system, did } = computer(app);

    await brandingStudioConnector.open({ system });

    expect(did.located).toEqual([{
      macBundleId: 'com.alphapremier.brandingstudio', macAppName: 'Alpha Branding Studio',
      windowsUninstallKey: 'Alpha Premier Realty Branding Studio', windowsExe: 'Alpha.Branding.exe',
    }]);
    expect(did.located[0]).toBe(STUDIO_APP);
    expect(did.launched).toEqual([app]);
  });

  it('opens the latest release when the studio is not installed', async () => {
    const { system, did } = computer(null);

    expect(await brandingStudioConnector.open({ system })).toBe('Alpha Branding Studio is not on this computer, so its download page is open.');
    expect(did.opened).toEqual(['https://github.com/Deign86/Alpha_Branding/releases/latest']);
  });

  it('not installed: fetches the installer for this computer from its latest release', async () => {
    // The file names of a real release, so a renamed asset fails here and not on someone's desk.
    const assets = ['Alpha.Branding.Setup.exe', 'Alpha.Branding-v1.0.0-win-x64.zip', 'Alpha.Branding-v1.0.0-macos.zip'].map((name) => ({ name, url: `https://github.com/Deign86/Alpha_Branding/releases/download/v1/${name}` }));

    for (const [platform, arch, file] of [['windows', undefined, 'Alpha.Branding.Setup.exe'], ['macos', 'arm64', 'Alpha.Branding-v1.0.0-macos.zip'], ['macos', 'x64', 'Alpha.Branding-v1.0.0-macos.zip']] as const) {
      const { system } = computer(null);
      const fetched: string[] = [];

      const said = await brandingStudioConnector.open({ system: {
        ...system, platform, arch,
        latestRelease: async (repo) => { expect(repo).toBe('Deign86/Alpha_Branding');

 return { version: '1', assets }; },
        installFrom: async (asset) => { fetched.push(asset.name); },
      } });

      expect(fetched).toEqual([file]);
      expect(said).toMatch(/Its installer is open/);
    }
  });

  it('shows the studio’s own logo', () => {
    expect(brandingStudioConnector.logo).toMatch(/logo\.png$/);
  });
});

// The real file names of release v2.8.1 (Deign86/Alpha_Branding).
const asset = (name: string): ReleaseAsset => ({ name, url: `https://github.com/Deign86/Alpha_Branding/releases/download/v2.8.1/${name}`, digest: 'sha256:00' });

const V281: AppRelease = {
  version: '2.8.1',
  assets: ['Alpha.Branding-v2.8.1-macos.pkg', 'Alpha.Branding-v2.8.1-macos.zip', 'Alpha.Branding-v2.8.1-win-x64.zip', 'Alpha.Branding.Setup.exe', 'SHA256SUMS.txt'].map(asset),
};

/** An installed studio of `version`, on a Windows computer that asks GitHub with `latestRelease`. */
function installedAt(version: string | undefined, latestRelease: SystemBridge['latestRelease'] = async () => V281) {
  const did: string[] = [];

  const system: SystemBridge = {
    platform: 'windows',
    locateApp: async () => ({ path: 'C:\\Users\\APG\\AppData\\Local\\Alpha Premier Realty\\Branding Studio\\Alpha.Branding.exe', version }),
    launchApp: async () => {},
    openUrl: async () => {},
    latestRelease: async (repo) => { did.push(`ask ${repo}`);

 return latestRelease(repo); },
    installFrom: async (a) => { did.push(`install ${a.name}`); },
  };

  return { env: { system }, did };
}

// docs/adr/0035: the studio updates itself only while it is open, so Home says when a newer version is out.
describe('the Branding Studio’s updates, on Home', () => {
  it('update found: an installed studio older than the latest release is offered it, and its setup program is fetched', async () => {
    const { env, did } = installedAt('2.7.0.0');
    const update = await brandingStudioConnector.update?.(env);

    expect(update?.version).toBe('2.8.1');
    expect(await update?.install(env)).toBe('The installer for Alpha Branding Studio 2.8.1 is open. Close Alpha Branding Studio first, then finish the installer.');
    expect(did).toEqual(['ask Deign86/Alpha_Branding', 'install Alpha.Branding.Setup.exe']);
  });

  it('up to date: nothing is offered, though Windows writes the version with a fourth number (2.8.1.0)', async () => {
    for (const version of ['2.8.1.0', '2.8.1', '2.9.0', undefined]) expect(await brandingStudioConnector.update?.(installedAt(version).env)).toBeNull();
  });

  it('check failed: says why, so the shortcut keeps what it last knew', async () => {
    // The native side refuses with a plain sentence, not an Error.
    const { env } = installedAt('2.7.0.0', async () => { throw 'GitHub answered 403 for Deign86/Alpha_Branding\'s latest release.'; });

    await expect(brandingStudioConnector.update?.(env)).rejects.toBe('GitHub answered 403 for Deign86/Alpha_Branding\'s latest release.');
  });
});
