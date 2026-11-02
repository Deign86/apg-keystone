import { describe, expect, it } from 'vitest';
import type { SystemBridge } from '@keystone/core';
import { websiteConnector } from '../src';

describe('the website shortcut', () => {
  it('opens the admin portal in the browser, on the desktop and in the preview alike', async () => {
    for (const platform of ['macos', 'windows', 'web'] as const) {
      const opened: string[] = [];

      const system: SystemBridge = {
        platform,
        locateApp: async () => null,
        launchApp: async () => {},
        openUrl: async (u) => { opened.push(u); },
      };

      await websiteConnector.open({ system });

      expect(opened).toEqual(['https://alphapremiergroup.com/admin']);
    }
  });

  it('shows the website’s own logo', () => {
    expect(websiteConnector.logo).toMatch(/logo\.png$/);
  });
});
