import type { Connector, HttpResponse } from '@keystone/core';
import type { Platform } from '../src/platform';

/** A platform held in memory, so the kit's tests need no browser storage and no desktop. */
export function memoryPlatform(saved: string | null = null) {
  const files = {
    state: saved,
    settings: {} as Record<string, Record<string, string>>,
    secrets: new Map<string, string>(),
    writes: 0,
  };
  const needsDesktop = async (): Promise<never> => { throw new Error('Not in tests.'); };
  const platform: Platform = {
    kind: 'browser',
    platform: 'web',
    http: { native: false, request: needsDesktop },
    loadState: async () => files.state,
    saveState: async (json) => { files.state = json; files.writes += 1; },
    loadSettings: async () => structuredClone(files.settings),
    saveSettings: async (s) => { files.settings = structuredClone(s); },
    secret: async (key) => files.secrets.get(key) ?? null,
    setSecret: async (key, value) => { if (value === null) files.secrets.delete(key); else files.secrets.set(key, value); },
    putPhoto: async () => {},
    photoUrl: async () => null,
    saveFile: async (name) => name,
    openFile: async () => null,
    locateApp: async () => null,
    launchApp: needsDesktop,
    openUrl: async () => {},
    pickFiles: async () => [],
    readFile: needsDesktop,
    listFiles: async () => [],
    appDataFolder: async () => null,
  };
  return { platform, files };
}

/** A connector that is always ready, to be overridden per test. */
export const okConnector = (id: string, extra: Partial<Connector> = {}): Connector => ({
  id, name: id, about: '', platforms: ['web'], settings: [], health: async () => ({ state: 'ready', detail: 'fine' }), ...extra,
});

export function response(status: number, body: unknown): HttpResponse {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body), json: async <T,>() => body as T, bytes: async () => new Uint8Array() };
}
