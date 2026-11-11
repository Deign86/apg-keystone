import type { JsonValue, TerminalState } from './schema';
import { isJsonObject, KeystoneError, parseState, type JsonObject } from './state';

// Restoring a backup replaces everything Keystone holds, so a backup is read more strictly than the saved state: every
// record must have the fields the screens show, of the kind the prototype and every Keystone build write (schema.ts).
// A record a screen could not show is refused by name, and nothing is restored. The saved state itself (state.json,
// the cloud) is read with parseState alone: one odd record there must never stop the others from opening.

interface RecordList {
  key: 'dir' | 'cv' | 'bs' | 'ids' | 'log';
  /** What one record is called in a sentence. */
  noun: string;
  /** The field that names the record. */
  name: string;
  text: string[];
  flags?: string[];
  /** Vouchers and statements: their particulars, each with a description and an amount. */
  lines?: boolean;
}

const LISTS: RecordList[] = [
  { key: 'dir', noun: 'directory record', name: 'code', text: ['code', 'type', 'name', 'tin', 'detail'] },
  { key: 'cv', noun: 'voucher', name: 'no', text: ['no', 'date', 'payee', 'check', 'status', 'prepared', 'checked', 'approved'], lines: true },
  { key: 'bs', noun: 'statement', name: 'no', text: ['no', 'date', 'due', 'client', 'status'], flags: ['vat', 'ewt'], lines: true },
  {
    key: 'ids',
    noun: 'ID',
    name: 'no',
    text: ['no', 'emp', 'name', 'pos', 'dept', 'issued', 'valid', 'blood', 'iceName', 'iceNo', 'signatory', 'status'],
  },
  { key: 'log', noun: 'log entry', name: 'when', text: ['when', 'mod', 'text'] },
];

const isText = (v: JsonValue | undefined) => v === String(v);

const isLine = (v: JsonValue) => isJsonObject(v) && isText(v.desc) && Number.isFinite(v.amt);

function readable(list: RecordList, r: JsonObject) {
  return list.text.every((f) => isText(r[f]))
    && (list.flags ?? []).every((f) => r[f] === true || r[f] === false)
    && (!list.lines || (Array.isArray(r.lines) && r.lines.every(isLine)));
}

/** A backup to restore: what parseState checks, then every record. Throws the sentence to show. */
export function parseBackup(text: string): TerminalState {
  const state = parseState(text);
  // The file again as plain JSON, so each record is checked as what it holds rather than what its list promises.
  const json: JsonValue = JSON.parse(text);

  for (const list of LISTS) {
    const records = isJsonObject(json) ? json[list.key] : undefined;

    if (!Array.isArray(records)) continue;

    records.forEach((r, i) => {
      if (isJsonObject(r) && readable(list, r)) return;
      const name = isJsonObject(r) && isText(r[list.name]) && r[list.name] ? String(r[list.name]) : `number ${i + 1} in the file`;

      throw new KeystoneError(`That backup has a ${list.noun} Keystone cannot read (${name}), so nothing was restored.`);
    });
  }

  return state;
}
