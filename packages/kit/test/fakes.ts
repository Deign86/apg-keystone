import type { Connector } from '@keystone/core';
import type { Platform } from '../src/platform';

/** A platform held in memory, so the kit's tests need no browser storage and no desktop. */
export function memoryPlatform(saved: string | null = null) {
  const files = { state: saved, writes: 0 };
  const opened: string[] = [];

  const platform: Platform = {
    kind: 'browser',
    platform: 'web',
    loadState: async () => files.state,
    saveState: async (json) => { files.state = json; files.writes += 1; },
    putPhoto: async () => {},
    photoUrl: async () => null,
    saveFile: async (name) => name,
    openFile: async () => null,
    locateApp: async () => null,
    launchApp: async () => { throw new Error('Not in tests.'); },
    openUrl: async (url) => { opened.push(url); },
  };

  return { platform, files, opened };
}

/** A connector that opens without a word, to be overridden per test. */
export const okConnector = (id: string, extra: Partial<Connector> = {}): Connector => ({
  id, name: id, logo: `${id}.png`, open: async () => {}, ...extra,
});
