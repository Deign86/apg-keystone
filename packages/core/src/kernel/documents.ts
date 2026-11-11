import type { JsonValue, LogEntry, TerminalState } from './schema';
import { isJsonObject, jsonObjects, jsonText, parseState, type JsonObject } from './state';

// The saved state as one document per record, for a database that keeps documents (Firestore, docs/adr/0009).
// Each directory entry, voucher, statement and ID is its own document, keyed by its code or number. Each log entry
// and each module's data under `ext` is one too, and so is each record of a list a module keeps as documents of its
// own (docs/adr/0011). After a change, only the documents it touched are written.

export const COLLECTIONS = ['dir', 'cv', 'bs', 'ids', 'log', 'ext'] as const;

export type Collection = (typeof COLLECTIONS)[number];

/**
 * One list in a module's data kept as a document per record, in a collection of its own, instead of inside the
 * module's one `ext` document (docs/adr/0011). Each record is written alone, so two people adding records never save
 * over each other, and the fields named here sit beside its body, where firestore.rules can check them.
 */
export interface RecordDocuments {
  /** The collection: lowercase letters, not one of COLLECTIONS. firestore.rules must name it, or nothing in it is read or written. */
  collection: string;
  /** The key in the module's data that holds the list. */
  list: string;
  /** The record's field whose value names its document ("no"). */
  key: string;
  /**
   * Record fields also kept beside the body, each a string or an object of strings, for the rules to check. Read back,
   * they win over the body: a field missing beside it is missing from the record.
   */
  fields: string[];
  /** The field holding the uid of the one member, besides owners, who may read the record. Other members never get it. */
  readBy?: string;
}

/** The lists kept as documents of their own, by module id: the installed modules' `documents`. */
export type DocumentLayout = Record<string, RecordDocuments>;

/** One record as a document: its collection and id, its place in its list, and the record as JSON text. */
export interface StateDocument {
  /** One of COLLECTIONS, or a module's own (RecordDocuments). */
  collection: string;
  id: string;
  /**
   * The record's place in its list, counted from the oldest. Lists only grow at one end (records are appended, log
   * entries are put first), so a new record never moves the others and never rewrites their documents.
   */
  pos: number;
  /** The record as JSON text, exactly as it is saved in `state.json`. */
  body: string;
  /** A module's own record: the fields RecordDocuments names, as they are beside the body. */
  fields?: JsonObject;
}

export interface DocumentRef {
  collection: string;
  id: string;
}

export interface DocumentChanges {
  set: StateDocument[];
  remove: DocumentRef[];
}

/**
 * A key as a document id. A Firestore id cannot hold "/" and cannot be "." or ".." or look like "__name__", so the
 * key is percent-encoded and "." and "_" are encoded as well. "@" never survives encoding, so a repeated key is told
 * apart with "@2", "@3" and so on.
 */
export function documentId(key: string): string {
  return encodeURIComponent(key).replace(/[._]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Ids for keys in list order, from the oldest: a repeated or empty key gets "@n", so no two documents share an id. */
function uniqueIds(keys: string[]): string[] {
  const seen = new Map<string, number>();

  return keys.map((key) => {
    const base = documentId(key);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);

    return base && n === 1 ? base : `${base}@${n}`;
  });
}

/** A short, stable fingerprint of a log entry (FNV-1a), so two entries in the same minute get different ids. */
function fingerprint(e: LogEntry): string {
  let h = 0x811c9dc5;

  for (const ch of `${e.when}\u0000${e.mod}\u0000${e.text}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }

  return (h >>> 0).toString(36);
}

function listDocuments<T>(collection: string, records: T[], key: (r: T) => string): StateDocument[] {
  const ids = uniqueIds(records.map(key));

  return records.map((r, pos) => ({ collection, id: ids[pos], pos, body: JSON.stringify(r) }));
}

/** A module's list as documents of its own, each with its checked fields beside it. */
function recordDocuments(own: RecordDocuments, records: JsonObject[]): StateDocument[] {
  return listDocuments(own.collection, records, (r) => jsonText(r[own.key])).map((d, pos) => {
    const fields: JsonObject = {};

    for (const f of own.fields) {
      const v = records[pos][f];

      if (v !== undefined) fields[f] = v;
    }

    return { ...d, fields };
  });
}

/** A record read back: the checked fields beside it win over its body, so a body edited past the rules changes nothing they hold. */
function withFields(body: JsonObject, own: RecordDocuments, fields: JsonObject = {}): JsonObject {
  const record = { ...body };

  for (const f of own.fields) {
    if (fields[f] === undefined) delete record[f];
    else record[f] = fields[f];
  }

  return record;
}

/**
 * The state as documents: one per record, per log entry and per module's data. A list a module keeps as documents of
 * its own (`layout`) leaves its module's `ext` document and gets one document per record.
 */
export function toDocuments(s: TerminalState, layout: DocumentLayout = {}): StateDocument[] {
  // The log is newest first, so its entries are counted from the end: putting a new entry first moves no other.
  const oldestFirst = [...s.log].reverse();
  const logIds = uniqueIds(oldestFirst.map((e) => `${e.when} ${fingerprint(e)}`));
  const log = oldestFirst.map((e, pos): StateDocument => ({ collection: 'log', id: logIds[pos], pos, body: JSON.stringify(e) }));

  const ext = Object.entries(s.ext ?? {}).flatMap(([moduleId, data], pos): StateDocument[] => {
    const own = layout[moduleId];
    const doc = (kept: JsonValue): StateDocument => ({ collection: 'ext', id: documentId(moduleId), pos, body: JSON.stringify({ module: moduleId, data: kept }) });

    if (!own || !isJsonObject(data)) return [doc(data)];
    const { [own.list]: list, ...rest } = data;

    return [doc(rest), ...recordDocuments(own, jsonObjects(list))];
  });

  return [
    ...listDocuments('dir', s.dir, (r) => r.code),
    ...listDocuments('cv', s.cv, (r) => r.no),
    ...listDocuments('bs', s.bs, (r) => r.no),
    ...listDocuments('ids', s.ids, (r) => r.no),
    ...log,
    ...ext,
  ];
}

function parseBody(body: string): JsonObject | null {
  try {
    const v: JsonValue = JSON.parse(body);

    return isJsonObject(v) ? v : null;
  } catch {
    return null;
  }
}

const byPlace = (a: StateDocument, b: StateDocument) => a.pos - b.pos || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The state back from its documents, in the order it was saved. A document whose body is not a JSON object (edited
 * by hand in the console) is left out, and since it is not part of the state, no save ever writes or deletes it.
 * Module data that is empty reads back as no `ext` at all, which every module already treats the same way. A list a
 * module keeps as documents of its own (`layout`) goes back into its module's data.
 */
export function fromDocuments(docs: StateDocument[], layout: DocumentLayout = {}): TerminalState {
  const sorted = (c: string) => docs.filter((d) => d.collection === c).sort(byPlace);

  const records = (c: string, read: (body: JsonObject, d: StateDocument) => JsonObject = (body) => body) => sorted(c).flatMap((d) => {
    const body = parseBody(d.body);

    return body ? [read(body, d)] : [];
  });

  const ext: JsonObject = {};

  for (const body of records('ext')) {
    const moduleId = jsonText(body.module);

    if (moduleId && body.data !== undefined) ext[moduleId] = body.data;
  }

  for (const [moduleId, own] of Object.entries(layout)) {
    const list = records(own.collection, (body, d) => withFields(body, own, d.fields));
    const data = ext[moduleId];

    // Data that is not an object has nowhere to keep a list; it is kept as it was.
    if (data !== undefined && !isJsonObject(data)) continue;

    if (data === undefined && !list.length) continue;
    ext[moduleId] = { ...data, [own.list]: list };
  }

  const state: JsonObject = { dir: records('dir'), cv: records('cv'), bs: records('bs'), ids: records('ids'), log: records('log').reverse() };

  if (Object.keys(ext).length) state.ext = ext;

  // Read back through parseState, the same check a backup or state.json gets.
  return parseState(JSON.stringify(state));
}

const refKey = (d: DocumentRef) => `${d.collection}/${d.id}`;

/** What to write to go from one set of documents to the next: new or changed documents, and those to delete. */
export function diffDocuments(prev: StateDocument[], next: StateDocument[]): DocumentChanges {
  const before = new Map(prev.map((d) => [refKey(d), d]));
  const after = new Set(next.map(refKey));

  return {
    set: next.filter((d) => {
      const old = before.get(refKey(d));

      return !old || old.pos !== d.pos || old.body !== d.body;
    }),
    remove: prev.flatMap(({ collection, id }) => (after.has(refKey({ collection, id })) ? [] : [{ collection, id }])),
  };
}
