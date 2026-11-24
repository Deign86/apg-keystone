import { localDate, type ISODate } from './dates';
import { shortDate, stamp, DASH } from './format';
import type { Company, CompanyDetails, JsonValue, ModuleTag, SignatureOffset, TerminalState } from './schema';

// What every domain builds on: the refusal type, the context a rule runs in, the shape
// of a change, the activity log, numbering, and loading a saved state. Nothing here
// knows about vouchers, statements or IDs.

/**
 * A rule's refusal: the sentence to show, and the fields it is about, if any (docs/adr/0044). A field is named as the
 * draft names it (`client`, `sqm`), a line's cell as `lines.<index>.<key>` (`lines.0.amount`), so the screen can mark
 * the field that is wrong or missing. A refusal about no one field (a number already used, a record gone) names none.
 */
export class KeystoneError extends Error {
  readonly fields: readonly string[];

  constructor(message: string, ...fields: string[]) {
    super(message);
    this.name = 'KeystoneError';
    this.fields = fields;
  }
}

/**
 * The sentence to show for whatever was thrown: an Error's message, and anything else as text (the native side and
 * some libraries refuse with a plain sentence, not an Error).
 */
export const sentenceOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

/** The fields a refusal is about: a KeystoneError's, and none for anything else. */
export const fieldsOf = (cause: unknown): readonly string[] => (cause instanceof KeystoneError ? cause.fields : []);

/** Who is signed in to the company's records in the cloud: their member document (docs/adr/0009, 0010). */
export interface Member {
  uid: string;
  name: string;
  /** An owner, shown as the CEO, adds members and decides requests for funds; staff do neither. */
  role: 'owner' | 'staff';
}

/**
 * What Keystone calls a member's role. The owner is the CEO; the role stays saved as `owner` in the cloud, where
 * firestore.rules and every member document read it.
 */
export const roleLabel = (m: Pick<Member, 'role'>) => (m.role === 'owner' ? 'CEO' : 'Staff');

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

/**
 * One rule applied to several records in turn, as one change: every one of them, or none if any is refused (the rule's
 * own sentence is thrown). For the actions a register takes on the rows selected in it.
 */
export function changeEach<K, T>(s: TerminalState, keys: readonly K[], one: (s: TerminalState, key: K) => Change<T>, message: (records: T[]) => string): Change<T[]> {
  const records: T[] = [];
  let state = s;

  for (const key of keys) {
    const r = one(state, key);

    state = r.state;
    records.push(r.record);
  }

  return { state, record: records, message: message(records) };
}

export const thisYear = (ctx: Ctx) => ctx.now().getFullYear();

/**
 * Adds a line to the activity log, naming who is signed in, if anyone, so others told of it live know who saved it
 * (docs/adr/0047). Domains, modules and connectors all log through this.
 */
export function logged(s: TerminalState, mod: ModuleTag, text: string, ctx: Ctx): TerminalState {
  return { ...s, log: [{ when: stamp(ctx.now()), mod, text, ...(ctx.who && { by: ctx.who.name }) }, ...s.log] };
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
  /** The id this form's draft saves under (docs/adr/0041), given when the form shows: saving the form for real takes the draft away. */
  savedDraft?: string;
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
    ...signaturesOf(raw.signatures),
    ...signatureSizesOf(raw.signatureSizes),
    ...signatureOffsetsOf(raw.signatureOffsets),
  };
}

/** Signature offsets read back: only pairs of numbers within the signatory's area, under the names they were kept for. */
function signatureOffsetsOf(raw: JsonValue | undefined): Pick<CompanyDetails, 'signatureOffsets'> {
  if (raw === undefined || !isJsonObject(raw)) return {};

  const kept = Object.entries(raw).flatMap(([name, value]) => {
    if (!isJsonObject(value)) return [];
    const offset = { x: jsonNumber(value.x), y: jsonNumber(value.y) };

    return offset.x === clampOffset(offset).x && offset.y === clampOffset(offset).y ? [[signatureKey(name), offset] as const] : [];
  });

  return kept.length ? { signatureOffsets: Object.fromEntries(kept) } : {};
}

/** Signature sizes read back: only numbers in range, under the names they were saved for. */
function signatureSizesOf(raw: JsonValue | undefined): Pick<CompanyDetails, 'signatureSizes'> {
  if (raw === undefined || !isJsonObject(raw)) return {};

  const kept = Object.entries(raw).flatMap(([name, value]) => {
    const size = jsonNumber(value);

    return size >= SIGNATURE_SIZE.least && size <= SIGNATURE_SIZE.most ? [[signatureKey(name), size] as const] : [];
  });

  return kept.length ? { signatureSizes: Object.fromEntries(kept) } : {};
}

/** Signatures read back: only images, under the names they were saved for. */
function signaturesOf(raw: JsonValue | undefined): Pick<CompanyDetails, 'signatures'> {
  if (raw === undefined || !isJsonObject(raw)) return {};

  const kept = Object.entries(raw).flatMap(([name, value]) => {
    const image = jsonText(value);

    return image.startsWith('data:image/') ? [[signatureKey(name), image] as const] : [];
  });

  return kept.length ? { signatures: Object.fromEntries(kept) } : {};
}

/** How a signature is kept and found: the name in capitals with single spaces, so "A. Bautista" and "A.  BAUTISTA" are one. */
export const signatureKey = (name: string) => name.trim().replace(/\s+/g, ' ').toUpperCase();

/** The signature Company Details keeps for whoever is named, if any. */
export const signatureOf = (company: Pick<CompanyDetails, 'signatures'>, name: string): string | undefined =>
  (name.trim() ? company.signatures?.[signatureKey(name)] : undefined);

/** How small and how large a signature may be drawn, as a share of the standard height. */
export const SIGNATURE_SIZE = { least: 0.5, most: 2 } as const;

/** How far a signature may be moved from its place on its line, in rem: across either way, up, and a little down. */
export const SIGNATURE_OFFSET = { across: 8, up: 4, down: 1 } as const;

/** An offset kept within the signatory's area, to the nearest twentieth of a rem. */
export const clampOffset = ({ x, y }: SignatureOffset): SignatureOffset => {
  const round = (n: number) => Math.round(n * 20) / 20 || 0;

  return {
    x: round(Math.min(SIGNATURE_OFFSET.across, Math.max(-SIGNATURE_OFFSET.across, x))),
    y: round(Math.min(SIGNATURE_OFFSET.down, Math.max(-SIGNATURE_OFFSET.up, y))),
  };
};

/** Where whoever is named has their signature moved to from its place on its line: none unless it was moved. */
export const signatureOffsetOf = (company: Pick<CompanyDetails, 'signatureOffsets'>, name: string): SignatureOffset =>
  (name.trim() ? company.signatureOffsets?.[signatureKey(name)] : undefined) ?? { x: 0, y: 0 };

/** How large whoever is named has their signature drawn: a share of the standard height, 1 unless it was resized. */
export const signatureSizeOf = (company: Pick<CompanyDetails, 'signatureSizes'>, name: string): number =>
  (name.trim() ? company.signatureSizes?.[signatureKey(name)] : undefined) ?? 1;

/** Whose signatures Company Details keeps, by name as kept (in capitals), in alphabetical order. */
export const signedNames = (company: Pick<CompanyDetails, 'signatures'>): string[] =>
  Object.keys(company.signatures ?? {}).sort((a, b) => a.localeCompare(b));

/**
 * The company itself, built in (docs/adr/0023): every document, the rail and every new record print these, whatever
 * was saved before. Changing them is a code change and a release.
 */
export const COMPANY: Company = {
  name: 'ALPHA PREMIER GROUP OF COMPANIES OPC',
  address: 'Suites 3104, Philippine Stock Exchange Centre, Tektite East Tower, Exchange Road, Ortigas Center, Pasig City 1605',
  contact: '0915 888 9482 / 02 8650 2540 / www.alphapremiergroup.com',
  shortAddress: 'Tektite East Tower, Ortigas Center, Pasig',
  phone: '02 8650 2540',
  billingEmail: 'billing@alphapremiergroup.com',
};

/**
 * The company's details: the built-in company (`COMPANY`), and what documents start from as saved on Company Details,
 * with "" or 0 for anything not filled in yet.
 */
export const companyOf = (s: TerminalState): CompanyDetails => ({ ...companyDetails({}), ...s.company, ...COMPANY });

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
export const lastEntryDate = (s: TerminalState) => (s.log.length ? shortDate(s.log[0].when.slice(0, 10)) : DASH);
