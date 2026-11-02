import type { FileFilter, SystemBridge } from '@keystone/core';

/**
 * Everything Keystone needs from the machine. Modules and connectors talk only to this,
 * never to Tauri directly, so the same code runs in the desktop app and in the browser
 * preview used for development and screenshots.
 */
export interface Platform extends SystemBridge {
  readonly kind: 'desktop' | 'browser';

  /** The saved state as JSON text, or null when there is none yet. */
  loadState(): Promise<string | null>;
  saveState(json: string): Promise<void>;

  /** Card photos, kept beside the saved state. */
  putPhoto(name: string, bytes: Uint8Array): Promise<void>;
  photoUrl(name: string): Promise<string | null>;

  /** Asks where to save, then writes. Returns the file's name, or null if cancelled. */
  saveFile(suggestedName: string, bytes: Uint8Array, filters: FileFilter[]): Promise<string | null>;
  /** Asks for one file and reads it. Null if cancelled. */
  openFile(filters: FileFilter[]): Promise<{ name: string; bytes: Uint8Array } | null>;

  /** Keystone's own updates, from its signed GitHub releases. The desktop app only; absent in the browser. */
  readonly updater?: AppUpdater;
}

export interface AppUpdater {
  /** The version running now ("0.2.0"). */
  currentVersion(): Promise<string>;
  /** A newer published version, or null when this one is the latest. Throws when the check cannot run (offline). */
  check(): Promise<AppUpdate | null>;
}

export interface AppUpdate {
  version: string;
  /** Where to read what changed. */
  notesUrl?: string;
  /** Downloads and installs it, reporting the share done (0 to 1, null while the size is unknown), then restarts Keystone. */
  install(onProgress: (done: number | null) => void): Promise<void>;
}
