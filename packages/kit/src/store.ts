import {
  applyDocumentChanges, diffDocuments, emptyState, fromDocuments, KeystoneError, newEntries, parseState, sentenceOf, toDocuments, type Change,
  type Ctx, type LogEntry, type TerminalState,
} from '@keystone/core';
import type { Platform } from './platform';

/** Shown in the rail when the saved state was read but is not a Keystone state. */
export const DAMAGED = 'Keystone could not open its saved records: they are damaged. It started with none, and keeps the damaged records as they are until you change something.';

/**
 * What a rule did: its record, its sentence and the state after it; or the sentence that refused it and the fields that
 * sentence is about (none when it is about no one field), for the screen to mark.
 */
export type Outcome<T> = { ok: true; record: T; message: string; state: TerminalState } | { ok: false; error: string; fields: readonly string[] };

/**
 * Holds the one saved state, applies changes through the core rules and writes them to
 * disk shortly after. Screens read it and run rules on it through useKeystone(); they are never handed the store.
 */
export class KeystoneStore {
  state: TerminalState;
  /** The rules' context: the clock, and who is signed in, if anyone. */
  ctx: Ctx;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  /** Form drafts by key, so a half-filled form survives switching screens. */
  private drafts = new Map<string, unknown>();
  saveError: string | null = null;
  /** Why Keystone opened with no records although something was saved: the saved state is damaged. Null otherwise. */
  loadError: string | null = null;
  /**
   * The saved state as last read or handed to the platform: what a change made here and not saved yet is measured from,
   * when someone else's save arrives first (receive).
   */
  private base: TerminalState;
  /** Stops the live updates, where the platform has them. */
  private unwatch: (() => void) | undefined;
  /**
   * Where the state's last change came from: a rule run here, or someone else's save that arrived (receive). A form
   * that holds a record reads it to tell its own saves from others' (useChangedElsewhere).
   */
  lastChange: 'here' | 'elsewhere' = 'here';
  /**
   * Whether others' saves arrive as they are made. False while the platform's live updates have stopped and it reads the
   * records again from time to time instead (docs/adr/0047); the rail says so.
   */
  live = true;
  /** Who hears the Activity Log lines of the changes that arrived from elsewhere (onArrival). */
  private arrivalListeners = new Set<(entries: LogEntry[]) => void>();

  constructor(readonly platform: Platform, initial: TerminalState) {
    this.state = initial;
    this.base = initial;
    this.ctx = { now: () => new Date(), ...(platform.who && { who: platform.who }) };
  }

  /**
   * Loads the saved state, then runs each installed module's housekeeping (overdue, expired). Nothing saved yet: no
   * records, never made-up ones (docs/adr/0018). When the platform cannot read it (the cloud is unreachable and nothing
   * is cached, or the file is there and will not open), this throws: starting empty instead would show no records as if
   * the company had none, and the first save would be written over or beside the real records without them. A saved state
   * that was read but is damaged opens with no records and says so (`loadError`).
   */
  static async open(platform: Platform, housekeeping: ((s: TerminalState, ctx: Ctx) => TerminalState)[] = []): Promise<KeystoneStore> {
    let state = emptyState();
    let damaged = false;
    const saved = await platform.loadState();

    if (saved) {
      try {
        state = parseState(saved);
      } catch (e) {
        // A damaged file: start with no records, but never overwrite the old file until the person changes something.
        console.error('The saved state is damaged; Keystone opened with no records.', e);
        damaged = true;
      }
    }

    const store = new KeystoneStore(platform, state);

    if (damaged) store.loadError = DAMAGED;
    let tidied = state;

    for (const step of housekeeping) {
      try {
        tidied = step(tidied, store.ctx);
      } catch (e) {
        console.error('Housekeeping step failed; skipped.', e);
      }
    }

    if (tidied !== state) store.commit(tidied);
    // Where others save to the same records (the cloud), their changes show here as they are made.
    store.unwatch = platform.watchState?.((json) => store.receive(json), (live) => store.setLive(live));

    return store;
  }

  /**
   * The saved state as it is now, after someone's save (live updates). Shown at once; a change made here and not saved
   * yet is kept, put back on top (the last save of a record wins), and saved as usual. Nothing is saved because of it:
   * what arrived is already saved, so it never goes back. The Activity Log lines it brings that this computer did not
   * write are told to whoever listens (onArrival). A state that does not read is passed over.
   */
  receive(json: string) {
    let remote: TerminalState;

    try {
      remote = parseState(json);
    } catch (e) {
      console.warn('A live update could not be read; kept what is shown.', e);

      return;
    }

    let next = remote;

    if (this.saveTimer !== undefined) {
      const mine = diffDocuments(toDocuments(this.base), toDocuments(this.state));

      next = fromDocuments(applyDocumentChanges(toDocuments(remote), mine));
    }

    this.base = remote;

    if (JSON.stringify(next) === JSON.stringify(this.state)) return;
    // Lines this computer has not got, its own unsaved ones included, came from someone else's save.
    const arrived = newEntries(this.state.log, remote.log);

    this.state = next;
    this.lastChange = 'elsewhere';
    this.listeners.forEach((fn) => fn());

    if (arrived.length) this.arrivalListeners.forEach((fn) => fn(arrived));
  }

  /** Hears the Activity Log lines of each change that arrives from elsewhere, oldest first. Returns the way to stop. */
  onArrival = (fn: (entries: LogEntry[]) => void) => {
    this.arrivalListeners.add(fn);

    return () => { this.arrivalListeners.delete(fn); };
  };

  /** The platform says whether live updates are running. */
  private setLive(live: boolean) {
    if (live === this.live) return;
    this.live = live;
    this.listeners.forEach((fn) => fn());
  }

  /** Stops the live updates (signing out, or a test done with the store). */
  close() {
    this.unwatch?.();
    this.unwatch = undefined;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);

    return () => this.listeners.delete(fn);
  };

  getState = () => this.state;

  commit(next: TerminalState) {
    this.state = next;
    this.lastChange = 'here';
    this.listeners.forEach((fn) => fn());
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), 250);
  }

  /**
   * Writes a change still waiting out its 250 ms now. The app calls it when the window is hidden or the page goes
   * away (a reload, closing the window), so a save made just before is not lost. Nothing waiting: nothing written.
   */
  flush(): Promise<void> {
    if (this.saveTimer === undefined) return Promise.resolve();
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.base = this.state;

    return this.platform.saveState(JSON.stringify(this.state, null, 2)).then(
      // The damaged file, if there was one, is the new records from here on.
      () => {
        const said = this.saveError ?? this.loadError;

        this.saveError = null;
        this.loadError = null;

        if (said) this.listeners.forEach((fn) => fn());
      },
      (e) => { this.saveError = `Could not save: ${String(e)}`; this.listeners.forEach((fn) => fn()); },
    );
  }

  /** Runs a core rule. A refusal comes back as the sentence to show and the fields it names, never as a crash. */
  run<T>(rule: (s: TerminalState, ctx: Ctx) => Change<T>): Outcome<T> {
    try {
      const r = rule(this.state, this.ctx);

      if (r.state !== this.state) this.commit(r.state);

      return { ok: true, record: r.record, message: r.message, state: r.state };
    } catch (e) {
      if (e instanceof KeystoneError) return { ok: false, error: e.message, fields: e.fields };
      console.error(e);

      return { ok: false, error: `Something went wrong: ${sentenceOf(e)}`, fields: [] };
    }
  }

  draft<T>(key: string, make: () => T): T {
    if (!this.drafts.has(key)) this.drafts.set(key, make());

    // SAFETY: each draft key belongs to one form, and that form's useDraft reads and writes it
    // with the same T. The entry was set from make() above if it was missing.
    return this.drafts.get(key) as T;
  }

  setDraft<T>(key: string, value: T) {
    this.drafts.set(key, value);
  }

  /** Everything replaced at once (a restored backup): the half-filled forms belonged to the old records, so they go. */
  replaceAll(next: TerminalState) {
    this.drafts.clear();
    this.commit(next);
  }
}
