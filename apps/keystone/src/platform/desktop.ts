import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { open, save } from '@tauri-apps/plugin-dialog';
import { fetch as nativeFetch } from '@tauri-apps/plugin-http';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { HttpClient, InstalledApp } from '@keystone/core';
import type { Platform } from '@keystone/kit';

// The desktop app (Tauri). HTTP goes through the native side: no CORS, a cookie jar per
// app, and headers a browser would refuse (Origin, User-Agent) can be set. File access
// and app launching are small Rust commands in src-tauri/src/lib.rs.

const USER_AGENT = 'Keystone/0.1 (Alpha Premier Group admin)';

const http: HttpClient = {
  native: true,
  async request(url, init = {}) {
    const r = await nativeFetch(url, {
      method: init.method ?? 'GET',
      headers: { 'User-Agent': USER_AGENT, ...init.headers },
      body: init.body,
      connectTimeout: init.timeoutMs ?? 10000,
    });

    return {
      status: r.status, ok: r.ok,
      text: () => r.text(),
      json: <T,>() => r.json() as Promise<T>,
      bytes: async () => new Uint8Array(await r.arrayBuffer()),
    };
  },
};

const readBytes = async (path: string) => new Uint8Array(await invoke<ArrayBuffer>('read_file', { path }));
const writeBytes = (path: string, bytes: Uint8Array) => invoke<void>('write_file', bytes, { headers: { path: encodeURIComponent(path) } });
const dataPath = async (...parts: string[]) => join(await appDataDir(), ...parts);

async function readText(path: string): Promise<string | null> {
  try {
    return new TextDecoder().decode(await readBytes(path));
  } catch {
    return null;
  }
}

export const desktopPlatform = (os: 'macos' | 'windows' | 'linux'): Platform => ({
  kind: 'desktop',
  platform: os,
  http,
  loadState: async () => readText(await dataPath('state.json')),
  saveState: async (json) => writeBytes(await dataPath('state.json'), new TextEncoder().encode(json)),
  loadSettings: async () => JSON.parse((await readText(await dataPath('connections.json'))) ?? '{}'),
  saveSettings: async (s) => writeBytes(await dataPath('connections.json'), new TextEncoder().encode(JSON.stringify(s, null, 2))),
  secret: (key) => invoke<string | null>('secret_get', { key }),
  setSecret: (key, value) => invoke('secret_set', { key, value }),
  putPhoto: async (name, bytes) => writeBytes(await dataPath('photos', name), bytes),
  photoUrl: async (name) => {
    try {
      const bytes = await readBytes(await dataPath('photos', name));

      return URL.createObjectURL(new Blob([bytes as BlobPart]));
    } catch {
      return null;
    }
  },
  saveFile: async (suggestedName, bytes, filters) => {
    const path = await save({ defaultPath: suggestedName, filters });

    if (!path) return null;
    await writeBytes(path, bytes);

    return path.split(/[\\/]/).pop() ?? path;
  },
  openFile: async (filters) => {
    const path = await open({ multiple: false, directory: false, filters });

    if (!path || Array.isArray(path)) return null;

    return { name: path.split(/[\\/]/).pop() ?? path, bytes: await readBytes(path) };
  },
  locateApp: (locator) => invoke<InstalledApp | null>('locate_app', { locator }),
  launchApp: (app, files = [], env = {}) => invoke('launch_app', { app, files, env }),
  openUrl: (url) => openUrl(url),
  pickFiles: async (title, filters, multiple) => {
    const picked = await open({ title, multiple, directory: false, filters });

    return picked === null ? [] : Array.isArray(picked) ? picked : [picked];
  },
  readFile: readBytes,
  listFiles: (folder) => invoke<{ path: string; modified: number }[]>('list_files', { folder }),
  appDataFolder: (identifier) => invoke<string | null>('app_data_folder', { identifier }),
});
