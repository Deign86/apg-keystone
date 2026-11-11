import type { FileFilter, Member, SystemBridge } from '@keystone/core';

/**
 * Everything Keystone needs from the machine. Modules and connectors talk only to this,
 * never to Tauri directly, so the same code runs in the desktop app and in the browser
 * preview used for development and screenshots.
 */
export interface Platform extends SystemBridge {
  readonly kind: 'desktop' | 'browser';

  /** The member signed in to the records in the cloud (docs/adr/0009). Absent when the records are on this computer. */
  readonly who?: Member;
  /** Signing out of the records in the cloud, by hand or when Keystone sits unused (docs/adr/0012). Absent with no sign-in. */
  readonly session?: AppSession;
  /** Who may open the records in the cloud, and making accounts for them (docs/adr/0014). Absent with no sign-in. */
  readonly accounts?: AppAccounts;

  /** The saved state as JSON text, or null when there is none yet. Throws when it exists but cannot be read now. */
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

export interface AppSession {
  /** How long Keystone may sit unused, with no key press, click or scroll, before it signs out by itself (ms). */
  readonly idleMs: number;
  /** Notes that Keystone was used at this time (ms since 1970), so a restart knows how long it sat unused. */
  used(at: number): void;
  /** Ends the sign-in on this computer and reopens Keystone on the sign-in screen. Write the last save first. */
  signOut(): Promise<void>;
}

/** A member of the records in the cloud, with the email they sign in with ('' for one added by hand without it). */
export interface MemberAccount extends Member {
  email: string;
}

/** What the owner gives for a new account: the person's name, their email, and the password they first sign in with. */
export interface NewAccount {
  name: string;
  email: string;
  password: string;
}

export interface AppAccounts {
  /** Everyone who may open the records. Throws the sentence to show when they cannot be read. */
  list(): Promise<MemberAccount[]>;
  /**
   * Makes a sign-in with this email and password and makes it a staff member, leaving the owner signed in. Only an
   * owner may; throws the sentence to show when refused, with no sign-in left behind.
   */
  create(account: NewAccount): Promise<MemberAccount>;
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
