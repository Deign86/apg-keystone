import { CODE_PREFIX, type DirectoryRecord, type ModuleTag, type RecordType, type TerminalState } from './schema';
import { KeystoneError, logged, nextNumber, type Change, type Ctx, type Editing } from './state';

// The directory: vendors, clients and employees every other domain refers to by code.
// Other domains may read it (recordOf, nameOf); it reads no other domain.

/** The tag the directory's activity-log lines carry. */
export const DIRECTORY_TAG = 'DIR';

export const recordOf = (s: TerminalState, code: string) => s.dir.find((d) => d.code === code);
export const recordsOf = (s: TerminalState, type: RecordType) => s.dir.filter((d) => d.type === type);
export const nameOf = (s: TerminalState, code: string) => recordOf(s, code)?.name ?? code;

/** A request paid by check can pay anyone in the directory: vendors first, then clients, then employees. */
export const payees = (s: TerminalState) => [...recordsOf(s, 'Vendor'), ...recordsOf(s, 'Client'), ...recordsOf(s, 'Employee')];

/**
 * The names a signatory can be picked from: every employee in the directory, and `others` (names already signing,
 * such as Company Details' and those on saved documents). Each name once, whatever its capitals or spacing, as first
 * given; blanks left out; in alphabetical order.
 */
export function signatoryNames(s: TerminalState, others: Iterable<string> = []): string[] {
  const names = new Map<string, string>();

  for (const raw of [...recordsOf(s, 'Employee').map((d) => d.name), ...others]) {
    const name = raw.trim().replace(/\s+/g, ' ');
    const key = name.toUpperCase();

    if (name && !names.has(key)) names.set(key, name);
  }

  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * How a part says that its records name a directory record by code (`ModuleDef.refersTo`). The directory knows no
 * part's records; it asks each installed part.
 */
export interface Reference {
  /** The part's log tag, shown beside a record it names: "CV". */
  tag: ModuleTag;
  /**
   * The codes of the directory records its saved records name. Pure. A part answers by reading everything it has
   * saved, so whoever asks does so once for a state, never once for each directory record.
   */
  codes(s: TerminalState): Iterable<string>;
}

/**
 * Which parts' saved records refer to each directory record: code to tags, in the order given, each tag once. A code
 * nobody names is absent. Each part is asked once. Only an installed part can say so: a record that a part's data
 * names is protected while that part is installed.
 */
export function usedByCode(s: TerminalState, references: readonly Reference[]): Map<string, ModuleTag[]> {
  const used = new Map<string, ModuleTag[]>();

  for (const r of references) {
    for (const code of new Set(r.codes(s))) {
      const tags = used.get(code);

      if (!tags) used.set(code, [r.tag]);
      else if (!tags.includes(r.tag)) tags.push(r.tag);
    }
  }

  return used;
}

/** The tags of the parts whose saved records refer to one directory record. For a whole list, use `usedByCode`. */
export function usedBy(s: TerminalState, code: string, references: readonly Reference[]): ModuleTag[] {
  return usedByCode(s, references).get(code) ?? [];
}

export const nextCode = (s: TerminalState, type: RecordType) =>
  nextNumber(recordsOf(s, type).map((d) => d.code), CODE_PREFIX[type], 3);

export interface DirectoryDraft extends Editing {
  type: RecordType; name: string; tin: string; detail: string; dept: string; email: string; phone: string;
  vat: boolean; ewt: boolean; attention: string;
}

export const newDirectoryDraft = (type: RecordType = 'Vendor'): DirectoryDraft => ({
  type, name: '', tin: '', detail: '', dept: '', email: '', phone: '', vat: type === 'Client', ewt: false, attention: '',
});

export const directoryDraftOf = (d: DirectoryRecord): DirectoryDraft => ({
  editing: d.code, type: d.type, name: d.name, tin: d.tin, detail: d.detail, dept: d.dept ?? '',
  email: d.email ?? '', phone: d.phone ?? '', vat: d.vat ?? false, ewt: d.ewt ?? false, attention: d.attention ?? '',
});

const clean = (x: string) => x.trim();

/** "A", "A and B", "A, B and C". */
const listed = (names: readonly string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(''));

/**
 * Adds a record, or saves a change to one. `selectableIn` names the screens a new record of this type can now be
 * picked on, as the installed modules say (`ModuleDef.selects`); the message tells the person so.
 */
export function saveDirectoryRecord(s: TerminalState, d: DirectoryDraft, ctx: Ctx, selectableIn: readonly string[] = []): Change<DirectoryRecord> {
  const name = clean(d.name);

  if (!name) throw new KeystoneError('Enter a name for the record.');
  const clash = s.dir.find((x) => x.type === d.type && x.code !== d.editing && x.name.toLowerCase() === name.toLowerCase());

  if (clash) throw new KeystoneError(`${clash.code} already has that name.`);

  const original = d.editing ? recordOf(s, d.editing) : undefined;

  if (original && original.type !== d.type) {
    throw new KeystoneError(`${original.code} is a ${original.type.toLowerCase()}; add a new record to change its type.`);
  }

  const base: DirectoryRecord = {
    code: original?.code ?? nextCode(s, d.type), type: d.type, name, tin: clean(d.tin), detail: clean(d.detail),
  };

  const dept = clean(d.dept);
  const email = clean(d.email);
  const phone = clean(d.phone);
  const attention = clean(d.attention);

  if (d.type === 'Employee' && dept) base.dept = dept;

  if (d.type === 'Client') {
    base.vat = d.vat;
    base.ewt = d.ewt;

    if (attention) base.attention = attention;
  }

  if (email) base.email = email;

  if (phone) base.phone = phone;

  if (original?.links) base.links = original.links;

  if (original?.photo) base.photo = original.photo;

  if (original) {
    return {
      state: logged({ ...s, dir: s.dir.map((x) => (x.code === original.code ? base : x)) }, DIRECTORY_TAG, `${base.code} ${base.name} updated.`, ctx),
      record: base, message: `${base.code} updated.`,
    };
  }

  return {
    state: logged({ ...s, dir: [...s.dir, base] }, DIRECTORY_TAG, `${base.code} ${base.name} added to the directory as ${d.type.toLowerCase()}.`, ctx),
    record: base, message: selectableIn.length ? `${base.code} added. It is now selectable in ${listed(selectableIn)}.` : `${base.code} added.`,
  };
}

/**
 * Removes a record. One that an installed part's records refer to (`references`, from `ModuleDef.refersTo`) is refused
 * unless `anyway`, given once the person has been told what names it: those records keep what was saved on them, and
 * where they name it only by its code, they show the code from then on.
 */
export function removeDirectoryRecord(s: TerminalState, code: string, ctx: Ctx, references: readonly Reference[], anyway = false): Change<DirectoryRecord> {
  const d = recordOf(s, code);

  if (!d) throw new KeystoneError(`${code} is not in the directory.`);
  const used = usedBy(s, code, references);

  if (used.length && !anyway) throw new KeystoneError(`${code} is used by ${used.join(', ')} records and cannot be removed.`);

  return {
    state: logged({ ...s, dir: s.dir.filter((x) => x.code !== code) }, DIRECTORY_TAG, `${code} ${d.name} removed from the directory.`, ctx),
    record: d, message: `${code} removed.`,
  };
}
