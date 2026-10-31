import { describe, expect, it } from 'vitest';
import { installerFor, isNewer } from '../src';

describe('branding studio connector', () => {
  it('compares versions the way the installer writes them', () => {
    expect(isNewer('v2.6.0', '2.5.0.0')).toBe(true);
    expect(isNewer('v2.5.0', '2.5.0.0')).toBe(false);
    expect(isNewer('v2.5.0', '2.10.0')).toBe(false);
  });

  it('picks the installer for this platform', () => {
    const release = {
      tag_name: 'v2.5.0', html_url: 'https://github.com/Deign86/Alpha_Branding/releases/tag/v2.5.0',
      assets: [
        { name: 'Alpha.Branding.Setup.exe', browser_download_url: 'https://x/setup.exe' },
        { name: 'Alpha.Branding-v2.5.0-macos.pkg', browser_download_url: 'https://x/mac.pkg' },
      ],
    };

    expect(installerFor(release, 'windows')).toBe('https://x/setup.exe');
    expect(installerFor(release, 'macos')).toBe('https://x/mac.pkg');
    expect(installerFor(release, 'linux')).toBe(release.html_url);
  });
});
