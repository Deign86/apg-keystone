import { KeystoneError } from '@keystone/core';
import type { Platform } from '../src/platform';

// The kit's stand-ins for tests (`@keystone/kit/testing`), so a part's screen test does not write its own copy of the
// `Platform`. For tests only: `npm run check:boundaries` refuses this import anywhere but a test.

/**
 * A platform held in memory, so a test needs no browser storage and no desktop: `saved` is the state it starts with,
 * as saved text. `files` holds what was saved since and how often; `opened`, the URLs it was asked to open.
 */
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

/**
 * What a rule refused with: its sentence and the fields it named (KeystoneError's fields), or null when it did not
 * refuse. Anything else it throws is thrown on, so a crash never passes for a refusal.
 */
export function refusalOf<T>(rule: () => T): { error: string; fields: readonly string[] } | null {
  try {
    rule();

    return null;
  } catch (e) {
    if (!(e instanceof KeystoneError)) throw e;

    return { error: e.message, fields: e.fields };
  }
}
