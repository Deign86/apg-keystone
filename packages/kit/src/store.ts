import { bundledSeed, KeystoneError, parseState, type Change, type Ctx, type TerminalState } from '@keystone/core';
import type { Platform } from './platform';

export type Outcome<T> = { ok: true; record: T; message: string } | { ok: false; error: string };

/**
 * Holds the one saved state, applies changes through the core rules and writes them to
 * disk shortly after. Screens read it with useKeystone(); nothing else mutates it.
 */
export class KeystoneStore {
  state: TerminalState;
  readonly ctx: Ctx = { seed: bundledSeed, now: () => new Date() };
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** Form drafts by key, so a half-filled form survives switching screens. */
  private drafts = new Map<string, unknown>();
  saveError: string | null = null;

  constructor(readonly platform: Platform, initial: TerminalState) {
    this.state = initial;
  }

  /** Loads the saved state, then runs each installed module's housekeeping (overdue, expired). */
  static async open(platform: Platform, housekeeping: ((s: TerminalState, ctx: Ctx) => TerminalState)[] = []): Promise<KeystoneStore> {
    let state = structuredClone(bundledSeed.state);
    const saved = await platform.loadState().catch(() => null);

    if (saved) {
      try {
        state = parseState(JSON.parse(saved));
      } catch {
        // A damaged file: start from the sample data but never overwrite the old file
        // until the person changes something.
      }
    }

    const store = new KeystoneStore(platform, state);
    let tidied = state;

    for (const step of housekeeping) {
      try {
        tidied = step(tidied, store.ctx);
      } catch (e) {
        console.error('Housekeeping step failed; skipped.', e);
      }
    }

    if (tidied !== state) store.commit(tidied);

    return store;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);

    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  commit(next: TerminalState) {
    this.state = next;
    this.listeners.forEach((fn) => fn());
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.platform.saveState(JSON.stringify(this.state, null, 2)).then(
        () => { this.saveError = null; },
        (e) => { this.saveError = `Could not save: ${String(e)}`; this.listeners.forEach((fn) => fn()); },
      );
    }, 250);
  }

  /** Runs a core rule. A refusal comes back as the sentence to show, never as a crash. */
  run<T>(rule: (s: TerminalState, ctx: Ctx) => Change<T>): Outcome<T> {
    try {
      const r = rule(this.state, this.ctx);

      if (r.state !== this.state) this.commit(r.state);

      return { ok: true, record: r.record, message: r.message };
    } catch (e) {
      if (e instanceof KeystoneError) return { ok: false, error: e.message };
      console.error(e);

      return { ok: false, error: `Something went wrong: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  draft<T>(key: string, make: () => T): T {
    if (!this.drafts.has(key)) this.drafts.set(key, make());

    return this.drafts.get(key) as T;
  }

  setDraft<T>(key: string, value: T) {
    this.drafts.set(key, value);
  }

  replaceAll(next: TerminalState) {
    this.drafts.clear();
    this.commit(next);
  }
}
