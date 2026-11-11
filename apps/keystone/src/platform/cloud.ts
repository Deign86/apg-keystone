import {
  diffDocuments, fromDocuments, parseState, toDocuments, type DocumentChanges, type DocumentLayout, type Member, type StateDocument,
  type TerminalState,
} from '@keystone/core';
import type { Platform } from '@keystone/kit';

/** The company's records in the cloud, one document per record (docs/adr/0009): Firestore in the app, a fake in tests. */
export interface RemoteDocs {
  /** Every document, or null while no computer has moved its records in yet. Throws when the cloud cannot be read. */
  readAll(): Promise<StateDocument[] | null>;
  /** Writes every document and marks the records as moved in. False, with nothing written, when another computer is first. */
  moveIn(docs: StateDocument[]): Promise<boolean>;
  /**
   * Writes new and changed documents and deletes removed ones. The writes must be handed over before this returns, so
   * a save is never lost while waiting; the promise settles when the cloud has them (later, when offline).
   */
  write(change: DocumentChanges): Promise<void>;
}

export const NOT_MOVED_IN = 'APG\'s records are not in the cloud yet. Open Keystone first on the computer that holds them: it moves them in.';
export const MOVING_ELSEWHERE = 'Another computer is moving its records to the cloud. Try again in a minute.';
export const NOT_READ = 'Keystone has not read the records from the cloud, so it did not save over them. Reopen Keystone.';

/**
 * The platform with the saved state in the cloud. Photos, files and the system stay with the local platform, and each
 * save also keeps a copy on this computer, as before. `layout` names the lists modules keep as documents of their own
 * (docs/adr/0011); `who` is the member signed in, which the rules see as `ctx.who`.
 */
export function cloudPlatform(local: Platform, remote: RemoteDocs, layout: DocumentLayout = {}, who?: Member): Platform {
  // What the cloud holds, as far as this computer knows: the documents read or last written. Null until a read
  // succeeds, and every save is refused until then, so a failed read can never be followed by a save over the records.
  let synced: StateDocument[] | null = null;

  const opened = (state: TerminalState) => {
    synced = toDocuments(state, layout);

    return JSON.stringify(state);
  };

  async function loadState(): Promise<string | null> {
    const docs = await remote.readAll();

    if (docs) return opened(fromDocuments(docs, layout));

    // Nothing in the cloud yet: this computer's records move in, once. A computer with none, or with a damaged file,
    // moves nothing in, so the sample data never takes the records' place.
    const text = await local.loadState();
    let state: TerminalState | null = null;

    try {
      state = text ? parseState(text) : null;
    } catch {
      state = null;
    }

    if (!state) throw new Error(NOT_MOVED_IN);

    if (await remote.moveIn(toDocuments(state, layout))) return opened(state);
    // Another computer was first: its records are the company's.
    const theirs = await remote.readAll();

    if (!theirs) throw new Error(MOVING_ELSEWHERE);

    return opened(fromDocuments(theirs, layout));
  }

  function saveState(json: string): Promise<void> {
    if (!synced) return Promise.reject(new Error(NOT_READ));
    const before = synced;
    const next = toDocuments(parseState(json), layout);
    const change = diffDocuments(before, next);

    // Worked out and handed over at once, in the order the saves were made; the next save builds on this one.
    synced = next;
    void local.saveState(json).catch(() => {});

    if (!change.set.length && !change.remove.length) return Promise.resolve();

    return remote.write(change).catch((cause: unknown) => {
      // The cloud refused it, so it may not hold these documents: the next save writes them again.
      synced = before;
      throw cause;
    });
  }

  return { ...local, loadState, saveState, ...(who && { who }) };
}
