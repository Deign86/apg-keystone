import { localDate, type ISODate } from './dates';
import { shortDate, stamp } from './format';
import type { CompanyDetails, JsonValue, ModuleTag, TerminalState } from './schema';

// What every domain builds on: the refusal type, the context a rule runs in, the shape
// of a change, the activity log, numbering, and loading a saved state. Nothing here
// knows about vouchers, statements or IDs.

export class KeystoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeystoneError';
  }
}

/** Who is signed in to the company's records in the cloud: their member document (docs/adr/0009, 0010). */
export interface Member {
  uid: string;
  name: string;
  /** An owner adds members and decides requests for funds; staff do neither. */
  role: 'owner' | 'staff';
}

/** What every rule needs from outside: the time, and who is signed in. Everything else is in the records. */
export interface Ctx {
  now: () => Date;
  /** The member signed in to the cloud records. Absent when the records are on this computer, where nobody signs in. */
  who?: Member;
}

/** A rule's result: the new state, the record it touched, the sentence to show. */
export interface Change<T> {
  state: TerminalState;
  record: T;
  message: string;
}

export const today = (ctx: Ctx): ISODate => localDate(ctx.now());
export const thisYear = (ctx: Ctx) => ctx.now().getFullYear();

/** Adds a line to the activity log. Domains, modules and connectors all log through this. */
export function logged(s: TerminalState, mod: ModuleTag, text: string, ctx: Ctx): TerminalState {
  return { ...s, log: [{ when: stamp(ctx.now()), mod, text }, ...s.log] };
}

/** The next number after the highest in use, under this prefix: "CV-2026-0142". */
export function nextNumber(existing: string[], prefix: string, width = 4): string {
  const highest = existing.reduce((max, no) => {
    const m = /(\d+)$/.exec(no);

    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);

  return prefix + String(highest + 1).padStart(width, '0');
}

export const newestFirst = <T extends { no: string }>(xs: T[]) => [...xs].sort((a, b) => b.no.localeCompare(a.no));

/** Set on a draft that holds a saved record, so saving can update it in place. */
export interface Editing {
  editing?: string;
}

/** What a backup must hold to load: the four record lists. The log and module data may be missing. */
type Backup = Pick<TerminalState, 'dir' | 'cv' | 'bs' | 'ids'> & { log?: TerminalState['log']; ext?: Record<string, JsonValue> };

/** Only the four lists are checked; their records are taken as saved (parseBackup checks each one before a restore). */
function isBackup(json: JsonValue): json is JsonObject & Backup {
  return isJsonObject(json) && Array.isArray(json.dir) && Array.isArray(json.cv) && Array.isArray(json.bs) && Array.isArray(json.ids);
}

/** The file's JSON, or null when it is not JSON at all (a file cut off, or something else). */
function readJson(text: string): JsonValue {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * A state from a backup file or an older version (the file's text), checked enough to load
 * safely. Unknown keys under `ext` (data kept by modules this build does not have) are kept.
 */
export function parseState(text: string): TerminalState {
  const json = readJson(text);

  if (!isBackup(json)) throw new KeystoneError('That file is not a Keystone backup.');
  const state: TerminalState = { dir: json.dir, cv: json.cv, bs: json.bs, ids: json.ids, log: Array.isArray(json.log) ? json.log : [] };

  if (json.ext) state.ext = json.ext;

  if (isJsonObject(json.company)) state.company = companyDetails(json.company);

  return state;
}

/**
 * No records at all: what a new computer, a new browser and an empty cloud start from (docs/adr/0018). Keystone never
 * makes records up to fill it; everything shown comes from what was saved.
 */
export const emptyState = (): TerminalState => ({ dir: [], cv: [], bs: [], ids: [], log: [] });

/** Company details read back from a file or the cloud: each field as text, or a whole number of days or years. */
function companyDetails(raw: JsonObject): CompanyDetails {
  const text = (field: string) => jsonText(raw[field]);
  const whole = (field: string) => Math.max(0, Math.trunc(jsonNumber(raw[field])));

  return {
    name: text('name'), address: text('address'), contact: text('contact'), shortAddress: text('shortAddress'), phone: text('phone'),
    billingEmail: text('billingEmail'), preparedBy: text('preparedBy'), checkedBy: text('checkedBy'), approvedBy: text('approvedBy'),
    paymentInstructions: text('paymentInstructions'), billingNote: text('billingNote'), signatory: text('signatory'),
    billingTerms: text('billingTerms'), dueInDays: whole('dueInDays'), idValidYears: whole('idValidYears'),
  };
}

/** The company's details as saved (Company Details), with "" or 0 for anything not filled in yet. Never made up. */
export const companyOf = (s: TerminalState): CompanyDetails => ({ ...companyDetails({}), ...s.company });

/** What a module keeps under `state.ext[id]`, or undefined when it has kept nothing yet (rule 9 in AGENTS.md). */
export const moduleData = (s: TerminalState, id: string): JsonValue | undefined => s.ext?.[id];

/** The state with a module's own data replaced. Every other module's data is kept untouched. */
export const withModuleData = (s: TerminalState, id: string, data: JsonValue): TerminalState => ({ ...s, ext: { ...s.ext, [id]: data } });

// Decoding module data read back from a file: each field becomes the value it should be, or a safe fallback when the
// file holds something else (an older build's data, a hand-edited backup).

export type JsonObject = { [key: string]: JsonValue };

/** A JSON object: not null, not a list, not a string or number (Object() wraps those in a new object). */
export const isJsonObject = (v: JsonValue | undefined): v is JsonObject => v !== null && v !== undefined && !Array.isArray(v) && v === Object(v);

/** The string, or "" for anything else. */
export const jsonText = (v: JsonValue | undefined): string => (v === String(v) ? String(v) : '');

/** The finite number, or 0 for anything else. */
export const jsonNumber = (v: JsonValue | undefined): number => (Number.isFinite(v) ? Number(v) : 0);

/** The objects in a list; anything that is not a list, or not an object, is left out. */
export const jsonObjects = (v: JsonValue | undefined): JsonObject[] => (Array.isArray(v) ? v.filter(isJsonObject) : []);

/** The date of the newest log entry, or a dash. */
export const lastEntryDate = (s: TerminalState) => (s.log.length ? shortDate(s.log[0].when.slice(0, 10)) : '—');
