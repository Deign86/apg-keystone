import type { AppSession } from '@keystone/kit';
import { webStorage, type StoredText } from './web-storage';

// Signing out of the records in the cloud on this computer (docs/adr/0012). Keystone signs out after it sits unused for
// IDLE_MS while open (packages/kit › IdleSignOut), and on opening when it was last used longer ago than that: closed,
// or the computer asleep.

/** Ten minutes without a key press, click or scroll (Jira AID-73). */
export const IDLE_MS = 10 * 60 * 1000;

const KEY = 'keystone-last-used';

/** Where the time it was last used is kept. */
export type UseLog = StoredText;

/** This computer's web storage, which survives a restart. */
export const webStorageLog: UseLog = webStorage(KEY);

/** True when Keystone was last used here longer ago than it may sit unused. Never used here yet: false. */
export function unusedTooLong(log: UseLog, now: number, idleMs = IDLE_MS): boolean {
  const last = Number(log.get());

  return Number.isFinite(last) && last > 0 && now - last >= idleMs;
}

/** The session the rail and the idle timer use. `signOut` ends the sign-in and reopens Keystone on the sign-in screen. */
export function cloudSession(signOut: () => Promise<void>, log: UseLog = webStorageLog): AppSession {
  return {
    idleMs: IDLE_MS,
    used: (at) => log.set(String(at)),
    signOut: async () => {
      log.set(null);
      await signOut();
    },
  };
}
