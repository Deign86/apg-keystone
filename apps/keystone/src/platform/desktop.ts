import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { DEADLINES, sentenceOf, type AppRelease, type InstalledApp } from '@keystone/core';
import type { AppUpdater, Platform } from '@keystone/kit';
import commands from '../../src-tauri/src/commands.json';

// The desktop app (Tauri). Reading and writing files and finding and starting the other APG apps are small Rust
// commands in src-tauri/src/lib.rs, named once in src-tauri/src/commands.json: the page asks for them by that file's
// names, and a test on each side holds the file to what the native side registers.

// Keystone's own updates, the way the attendance app does it: Tauri's updater reads latest.json from the latest
// GitHub release (plugins.updater in tauri.conf.json), checks the download against the public key there, installs
// it, and the app restarts into the new version.
const updater: AppUpdater = {
  currentVersion: () => getVersion(),
  async check() {
    const update = await check({ timeout: DEADLINES.updateCheckMs });

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

const readBytes = async (path: string) => new Uint8Array(await invoke<ArrayBuffer>(commands.readFile, { path }));
const writeBytes = (path: string, bytes: Uint8Array) => invoke<void>(commands.writeFile, bytes, { headers: { path: encodeURIComponent(path) } });
const dataPath = async (...parts: string[]) => join(await appDataDir(), ...parts);

/**
 * A text file's contents, or null when there is no such file yet. A file that is there and cannot be read (no
 * permission, a failing disk, another program holding it) throws the sentence to show: answering null would open
 * Keystone with no records, and its first save would replace the file that could not be read.
 */
export async function readText(path: string): Promise<string | null> {
  let there: boolean;

  try {
    there = await invoke<boolean>(commands.fileExists, { path });
  } catch (e) {
    throw new Error(`Keystone could not look for its saved records, so it did not open with none in their place. ${sentenceOf(e)}`);
  }

  if (!there) return null;

  try {
    return new TextDecoder().decode(await readBytes(path));
  } catch (e) {
    throw new Error(`Keystone could not read its saved records, so it did not open with none in their place. ${sentenceOf(e)}`);
  }
}

// An app's latest release, asked of GitHub at most once in ten minutes: Home asks each time it opens, and GitHub
// answers 60 such questions an hour from one office address. A failed question is not remembered.
const RELEASE_TTL_MS = 10 * 60_000;
const releases = new Map<string, { at: number; release: Promise<AppRelease> }>();

function latestRelease(repo: string): Promise<AppRelease> {
  const known = releases.get(repo);

  if (known && Date.now() - known.at < RELEASE_TTL_MS) return known.release;

  const release = invoke<AppRelease>(commands.latestRelease, { repo });

  releases.set(repo, { at: Date.now(), release });
  release.catch(() => releases.delete(repo));

  return release;
}

// Which installer a Mac needs. Asked once at start; until it answers, Apple silicon is assumed.
let arch: 'arm64' | 'x64' | undefined;

export const desktopPlatform = (os: 'macos' | 'windows' | 'linux'): Platform => {
  void invoke<string>(commands.cpuArch).then((a) => { arch = a === 'aarch64' ? 'arm64' : 'x64'; }, () => {});

  return platformFor(os);
};

const platformFor = (os: 'macos' | 'windows' | 'linux'): Platform => ({
  kind: 'desktop',
  platform: os,
  get arch() { return arch; },
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
  locateApp: (locator) => invoke<InstalledApp | null>(commands.locateApp, { locator }),
  launchApp: (app) => invoke(commands.launchApp, { app }),
  // Installing the other APG apps (docs/adr/0029). The Rust side accepts only Deign86's repositories and files on
  // github.com, checks the download against GitHub's digest, and hands the file to the operating system to open.
  latestRelease,
  installFrom: (asset) => invoke(commands.installFrom, { asset }),
  openUrl: (url) => openUrl(url),
  updater,
});
