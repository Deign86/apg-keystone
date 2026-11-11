/**
 * A text kept on this computer under one name, which survives a restart. Reading and writing it never waits, so a
 * write made as the page closes is kept.
 */
export interface StoredText {
  get(): string | null;
  /** Null removes it. */
  set(value: string | null): void;
}

/** Text in this computer's web storage. Where there is none (a private window), nothing is kept and nothing fails. */
export function webStorage(key: string): StoredText {
  return {
    get() {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(value) {
      try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* private mode, or full */ }
    },
  };
}
