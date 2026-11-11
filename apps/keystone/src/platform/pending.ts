import { isJsonObject, jsonObjects, jsonText, type DocumentChanges, type DocumentRef, type JsonValue, type StateDocument } from '@keystone/core';
import type { StoredText } from './web-storage';

// The saves this computer handed to the cloud that the cloud has not confirmed yet (docs/adr/0013). Firestore takes a
// write asynchronously, so a page that reloads or closes just after a save can go before the write reaches even
// Firestore's own copy on this computer. Each save is noted here first, in web storage, which is written at once, and
// the cloud's answer clears the note. On the next start what is still noted goes back on top of what the cloud holds,
// one document at a time, and only where the cloud still holds what this computer built on: a record another computer
// changed since stays as the cloud has it.

/** One document whose last save here the cloud has not confirmed. */
interface Pending {
  collection: string;
  id: string;
  /** The cloud's version of the document (`version`) before this computer changed it, or null when it had none. */
  was: string | null;
  /** The document as this computer last saved it, or null when it removed it. */
  now: StateDocument | null;
  /** The save that wrote it last: only that save's answer clears it. */
  save: string;
}

export interface PendingSaves {
  /**
   * Notes a change before it goes to the cloud, and names the save. `before` is the cloud's documents, as far as this
   * computer knows.
   */
  sent(change: DocumentChanges, before: StateDocument[]): string;
  /** The cloud has this save. A document a later save changed again stays pending, now built on this one. */
  confirmed(change: DocumentChanges, save: string): void;
  /** The cloud refused this save, so the next start does not write it. The next save writes it again, as it always has. */
  refused(change: DocumentChanges, save: string): void;
  /**
   * The cloud's documents with what is still pending put back, or null when nothing is. A document goes back only
   * where the cloud still holds the version this computer changed; one the cloud already has, or one changed there
   * since, is no longer pending.
   */
  restore(cloud: StateDocument[]): StateDocument[] | null;
}

const refKey = (d: DocumentRef) => `${d.collection}/${d.id}`;

/**
 * A document's place and record as a short fingerprint (cyrb53, 53 bits), or null for no document. Two versions of a
 * document that read the same have the same fingerprint, and two that differ almost never do.
 */
function version(d: StateDocument | null | undefined): string | null {
  if (!d) return null;
  const text = `${d.pos}\n${d.body}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;

  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);

    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** A document read back from web storage, or null when it is not one. */
function documentOf(v: JsonValue | undefined): StateDocument | null {
  if (!isJsonObject(v) || !Number.isInteger(v.pos)) return null;
  const collection = jsonText(v.collection);
  const id = jsonText(v.id);
  const body = jsonText(v.body);

  if (!collection || !id || !body) return null;

  return { collection, id, pos: Number(v.pos), body, ...(isJsonObject(v.fields) && { fields: v.fields }) };
}

/** What is pending, by document. A note that cannot be read (edited by hand, or damaged) counts as nothing pending. */
function read(store: StoredText): Map<string, Pending> {
  let saved: JsonValue = null;

  try {
    saved = JSON.parse(store.get() ?? 'null');
  } catch {
    saved = null;
  }

  const pending = new Map<string, Pending>();

  for (const p of jsonObjects(saved)) {
    const collection = jsonText(p.collection);
    const id = jsonText(p.id);
    const save = jsonText(p.save);
    const now = documentOf(p.now);

    if (!collection || !id || !save || (p.now !== null && !now)) continue;
    pending.set(refKey({ collection, id }), { collection, id, was: jsonText(p.was) || null, now, save });
  }

  return pending;
}

/** What is pending, kept on this computer. */
export function pendingSaves(store: StoredText): PendingSaves {
  // Names each save, unique to this page, so an answer clears only what its own save wrote.
  const page = Math.random().toString(36).slice(2, 10);
  let saves = 0;

  /** Reads what is pending, changes it, and writes it back at once. */
  const update = (edit: (pending: Map<string, Pending>) => void) => {
    const pending = read(store);

    edit(pending);
    store.set(pending.size ? JSON.stringify([...pending.values()]) : null);
  };

  /** Each document a change touches, with what it is now: the document, or null when it was removed. */
  const each = (change: DocumentChanges, visit: (key: string, ref: DocumentRef, now: StateDocument | null) => void) => {
    for (const d of change.set) visit(refKey(d), d, d);

    for (const r of change.remove) visit(refKey(r), r, null);
  };

  return {
    sent(change, before) {
      const cloud = new Map(before.map((d) => [refKey(d), d]));

      saves += 1;
      const save = `${page}.${saves}`;

      update((pending) => each(change, (key, { collection, id }, now) => {
        const earlier = pending.get(key);

        // Still waiting on an earlier save of it: the cloud may hold neither yet, so this one builds on what it held
        // before both.
        pending.set(key, { collection, id, was: earlier ? earlier.was : version(cloud.get(key)), now, save });
      }));

      return save;
    },

    confirmed(change, save) {
      update((pending) => each(change, (key, _ref, now) => {
        const p = pending.get(key);

        if (p?.save === save) pending.delete(key);
        else if (p) p.was = version(now);
      }));
    },

    refused(change, save) {
      update((pending) => each(change, (key) => {
        if (pending.get(key)?.save === save) pending.delete(key);
      }));
    },

    restore(cloud) {
      const docs = new Map(cloud.map((d) => [refKey(d), d]));
      let restored = false;

      update((pending) => {
        for (const [key, p] of pending) {
          const there = version(docs.get(key));

          // The cloud has it already (the page closed before the cloud said so), or another computer changed it since.
          if (there === version(p.now) || there !== p.was) {
            pending.delete(key);
            continue;
          }

          if (p.now) docs.set(key, p.now);
          else docs.delete(key);
          restored = true;
        }
      });

      return restored ? [...docs.values()] : null;
    },
  };
}
