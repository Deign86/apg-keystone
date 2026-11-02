import { describe, expect, it } from 'vitest';
import type { AppLocator, InstalledApp, SystemBridge } from '@keystone/core';
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

  it('shows the studio’s own logo', () => {
    expect(brandingStudioConnector.logo).toMatch(/logo\.png$/);
  });
});
