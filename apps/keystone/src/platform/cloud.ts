import {
  diffDocuments, emptyState, fromDocuments, isOwner, LIVE_REREAD_MS, parseState, toDocuments, type DocumentChanges, type DocumentLayout, type Member,
  type StateDocument, type TerminalState,
} from '@keystone/core';
import type { Platform } from '@keystone/kit';
import { pendingSaves } from './pending';
import { webStorage, type StoredText } from './web-storage';

/** The company's records in the cloud, one document per record (docs/adr/0009): Firestore in the app, a fake in tests. */
export interface RemoteDocs {
  /** Every document, or null while nobody has started the records yet. Throws when the cloud cannot be read. */
  readAll(): Promise<StateDocument[] | null>;
  /** Marks the records as started, with nothing in them yet: the CEO's first sign-in (docs/adr/0018). */
  start(): Promise<void>;
  /**
   * Writes new and changed documents and deletes removed ones. The writes are handed over before this returns, in the
   * order the saves were made; the promise settles when the cloud has them (later, when offline). A page that closes
   * before then can lose them, so the cloud platform notes each save on this computer first (pending.ts).
   */
  write(change: DocumentChanges): Promise<void>;
  /**
   * Listens to every collection the records are read from (docs/adr/0047). Absent where the documents cannot be
   * watched.
   */
  watch?(listener: RemoteListener): RemoteWatch;
}

export interface RemoteListener {
  /**
   * Some collections changed, by anyone, this computer's saves included: each one named holds these documents now,
   * and the others are as they were.
   */
  change(lists: ReadonlyMap<string, StateDocument[]>): void;
  /** False when a collection's listener stopped (it is listened to again shortly), true again when all are back. */
  live(on: boolean): void;
}

export interface RemoteWatch {
  stop(): void;
  /** Listens again now to every collection whose listener stopped, instead of waiting. */
  retry(): void;
}

/**
 * Calls `fn` each time the person may be back after a while away: Keystone's window regains focus, its page shows again
 * or the network comes back. Returns the way to stop.
 */
export type Wake = (fn: () => void) => () => void;

export const browserWake: Wake = (fn) => {
  const shown = () => { if (document.visibilityState === 'visible') fn(); };

  addEventListener('focus', fn);
  addEventListener('online', fn);
  document.addEventListener('visibilitychange', shown);

  return () => {
    removeEventListener('focus', fn);
    removeEventListener('online', fn);
    document.removeEventListener('visibilitychange', shown);
  };
};

/** The least time between two re-reads asked for by the person coming back, so switching windows does not read the records each time. */
const WAKE_REREAD_MS = 15_000;

export const NOT_STARTED = 'APG\'s records are not set up in the cloud yet. The CEO signs in first, and Keystone starts them, empty.';
export const NOT_READ = 'Keystone has not read the records from the cloud, so it did not save over them. Reopen Keystone.';

/**
 * The platform with the saved state in the cloud, its only source (docs/adr/0018): nothing saved on this computer is
 * read, copied in or written beside it. Photos, files and the system stay with the local platform. `layout` names the
 * lists modules keep as documents of their own (docs/adr/0011); `who` is the member signed in, which the rules see as
 * `ctx.who`. `kept` is where this computer notes the member's saves the cloud has not confirmed yet (docs/adr/0013).
 * `wake` says when the person may be back, for live updates that have stopped (docs/adr/0047).
 */
export function cloudPlatform(
  local: Platform, remote: RemoteDocs, layout: DocumentLayout = {}, who?: Member,
  kept: StoredText = webStorage(`keystone-pending-saves${who ? `:${who.uid}` : ''}`), wake: Wake = browserWake,
): Platform {
  // What the cloud holds, as far as this computer knows: the documents read or last written. Null until a read
  // succeeds, and every save is refused until then, so a failed read can never be followed by a save over the records.
  let synced: StateDocument[] | null = null;
  // Saves handed over so far, so a re-read that a save overtook is not taken as what the cloud holds.
  let saves = 0;
  const pending = pendingSaves(kept);

  const opened = (state: TerminalState) => {
    synced = toDocuments(state, layout);
    // Saves made here that the cloud never confirmed, because Keystone closed first, go back on top and are written.
    const restored = pending.restore(synced);

    if (!restored) return JSON.stringify(state);
    const json = JSON.stringify(fromDocuments(restored, layout));

    void saveState(json).catch((cause: unknown) => console.warn('The cloud refused a save made before Keystone last closed.', cause));

    return json;
  };

  async function loadState(): Promise<string | null> {
    const docs = await remote.readAll();

    if (docs) return opened(fromDocuments(docs, layout));

    // Nothing in the cloud yet. The records are only ever what people save there: the CEO starts them empty, and
    // whatever this computer holds, records of its own or made-up ones, is never copied in.
    if (!isOwner(who)) throw new Error(NOT_STARTED);
    await remote.start();

    return opened(emptyState());
  }

  function saveState(json: string): Promise<void> {
    if (!synced) return Promise.reject(new Error(NOT_READ));
    const before = synced;
    const next = toDocuments(parseState(json), layout);
    const change = diffDocuments(before, next);

    // Worked out and handed over at once, in the order the saves were made; the next save builds on this one.
    synced = next;
    saves += 1;

    if (!change.set.length && !change.remove.length) return Promise.resolve();
    // Noted on this computer before the cloud gets it, so a page that closes first leaves it for the next start.
    const save = pending.sent(change, before);

    return remote.write(change).then(
      () => pending.confirmed(change, save),
      (cause: unknown) => {
        // The cloud refused it, so it may not hold these documents: the next save writes them again.
        synced = before;
        pending.refused(change, save);
        throw cause;
      },
    );
  }

  /**
   * Live updates (docs/adr/0047): each time some of the cloud's collections change, they replace what this computer
   * knew of them, are what the next save is measured from, and the store gets the whole state. Only once the records
   * have been read, so nothing is saved over them before. Nothing here writes: what arrives is already saved.
   *
   * While a listener has stopped, the records are read again instead: at once, every LIVE_REREAD_MS, and when the person
   * comes back to Keystone (wake), which also listens again at once.
   */
  const watchState = remote.watch && ((onChange: (json: string) => void, onLive?: (live: boolean) => void) => {
    let stopped = false;
    let live = true;
    let poll: ReturnType<typeof setInterval> | undefined;
    let lastReread = 0;
    const hand = (docs: StateDocument[]) => onChange(JSON.stringify(fromDocuments(docs, layout)));

    async function reread() {
      const before = saves;

      lastReread = Date.now();

      try {
        const docs = await remote.readAll();

        // A save made meanwhile is not in what was read; the next read, or the listeners, bring both.
        if (stopped || !docs || !synced || saves !== before) return;
        synced = docs;
        hand(docs);
      } catch (cause) {
        console.warn('Keystone could not read the records again; it tries again shortly.', cause);
      }
    }

    const watching = remote.watch!({
      change: (lists) => {
        if (!synced) return;
        synced = [...synced.filter((d) => !lists.has(d.collection)), ...[...lists.values()].flat()];
        hand(synced);
      },
      live: (on) => {
        if (stopped || on === live) return;
        live = on;
        onLive?.(on);
        clearInterval(poll);
        poll = undefined;

        if (on) return;
        poll = setInterval(() => void reread(), LIVE_REREAD_MS);
        void reread();
      },
    });

    const stopWake = wake(() => {
      if (live || Date.now() - lastReread < WAKE_REREAD_MS) return;
      watching.retry();
      void reread();
    });

    return () => {
      stopped = true;
      clearInterval(poll);
      stopWake();
      watching.stop();
    };
  });

  return { ...local, loadState, saveState, ...(watchState && { watchState }), ...(who && { who }) };
}
