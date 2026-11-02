import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import type { InstalledApp } from '@keystone/core';
import type { AppUpdater, Platform } from '@keystone/kit';

// The desktop app (Tauri). Reading and writing files and finding and starting the other APG apps are small Rust
// commands in src-tauri/src/lib.rs.

// Keystone's own updates, the way the attendance app does it: Tauri's updater reads latest.json from the latest
// GitHub release (plugins.updater in tauri.conf.json), checks the download against the public key there, installs
// it, and the app restarts into the new version.
const updater: AppUpdater = {
  currentVersion: () => getVersion(),
  async check() {
    const update = await check({ timeout: 10_000 });

    if (!update) return null;

    return {
      version: update.version,
      notesUrl: `https://github.com/Deign86/apg-keystone/releases/tag/v${update.version}`,
      async install(onProgress) {
        let total = 0;
        let done = 0;

        await update.downloadAndInstall((event) => {
          if (event.event === 'Started') total = event.data.contentLength ?? 0;
          else if (event.event === 'Progress') {
            done += event.data.chunkLength;
            onProgress(total ? Math.min(1, done / total) : null);
          } else onProgress(1);
        });
        await relaunch();
      },
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
  loadState: async () => readText(await dataPath('state.json')),
  saveState: async (json) => writeBytes(await dataPath('state.json'), new TextEncoder().encode(json)),
  putPhoto: async (name, bytes) => writeBytes(await dataPath('photos', name), bytes),
  photoUrl: async (name) => {
    try {
      const bytes = await readBytes(await dataPath('photos', name));

      return URL.createObjectURL(new Blob([bytes.slice()]));
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
  launchApp: (app) => invoke('launch_app', { app }),
  openUrl: (url) => openUrl(url),
  updater,
});
