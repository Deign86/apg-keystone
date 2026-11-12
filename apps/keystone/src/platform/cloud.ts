import {
  diffDocuments, emptyState, fromDocuments, parseState, toDocuments, type DocumentChanges, type DocumentLayout, type Member,
  type StateDocument, type TerminalState,
} from '@keystone/core';
import type { Platform } from '@keystone/kit';
import { pendingSaves } from './pending';
import { webStorage, type StoredText } from './web-storage';

/** The company's records in the cloud, one document per record (docs/adr/0009): Firestore in the app, a fake in tests. */
export interface RemoteDocs {
  /** Every document, or null while nobody has started the records yet. Throws when the cloud cannot be read. */
  readAll(): Promise<StateDocument[] | null>;
  /** Marks the records as started, with nothing in them yet: the owner's first sign-in (docs/adr/0018). */
  start(): Promise<void>;
  /**
   * Writes new and changed documents and deletes removed ones. The writes are handed over before this returns, in the
   * order the saves were made; the promise settles when the cloud has them (later, when offline). A page that closes
   * before then can lose them, so the cloud platform notes each save on this computer first (pending.ts).
   */
  write(change: DocumentChanges): Promise<void>;
}

export const NOT_STARTED = 'APG\'s records are not set up in the cloud yet. The owner signs in first, and Keystone starts them, empty.';
export const NOT_READ = 'Keystone has not read the records from the cloud, so it did not save over them. Reopen Keystone.';

/**
 * The platform with the saved state in the cloud, its only source (docs/adr/0018): nothing saved on this computer is
 * read, copied in or written beside it. Photos, files and the system stay with the local platform. `layout` names the
 * lists modules keep as documents of their own (docs/adr/0011); `who` is the member signed in, which the rules see as
 * `ctx.who`. `kept` is where this computer notes the member's saves the cloud has not confirmed yet (docs/adr/0013).
 */
export function cloudPlatform(
  local: Platform, remote: RemoteDocs, layout: DocumentLayout = {}, who?: Member,
  kept: StoredText = webStorage(`keystone-pending-saves${who ? `:${who.uid}` : ''}`),
): Platform {
  // What the cloud holds, as far as this computer knows: the documents read or last written. Null until a read
  // succeeds, and every save is refused until then, so a failed read can never be followed by a save over the records.
  let synced: StateDocument[] | null = null;
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

    // Nothing in the cloud yet. The records are only ever what people save there: the owner starts them empty, and
    // whatever this computer holds, records of its own or made-up ones, is never copied in.
    if (who?.role !== 'owner') throw new Error(NOT_STARTED);
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

  return { ...local, loadState, saveState, ...(who && { who }) };
}
