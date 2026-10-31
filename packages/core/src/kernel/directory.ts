import type { ExternalPerson } from './connectors';
import { count } from './format';
import { CODE_PREFIX, USED_IN, type DirectoryRecord, type ModuleTag, type RecordType, type TerminalState } from './schema';
import { KeystoneError, logged, nextNumber, type Change, type Ctx, type Editing } from './state';

// The directory: vendors, clients and employees every other domain refers to by code.
// Other domains may read it (recordOf, nameOf); it reads no other domain.

export const recordOf = (s: TerminalState, code: string) => s.dir.find((d) => d.code === code);
export const recordsOf = (s: TerminalState, type: RecordType) => s.dir.filter((d) => d.type === type);
export const nameOf = (s: TerminalState, code: string) => recordOf(s, code)?.name ?? code;

/** Vouchers can pay anyone in the directory: vendors first, then clients, then employees. */
export const payees = (s: TerminalState) => [...recordsOf(s, 'Vendor'), ...recordsOf(s, 'Client'), ...recordsOf(s, 'Employee')];

/**
 * Which saved documents refer to a record, as log tags. This reads the data, not the
 * installed modules: a record a voucher points to stays protected even in a build
 * without the vouchers screen.
 */
export function usedBy(s: TerminalState, code: string): ModuleTag[] {
  const used: ModuleTag[] = [];

  if (s.cv.some((v) => v.payee === code)) used.push('CV');

  if (s.bs.some((b) => b.client === code)) used.push('BS');

  if (s.ids.some((i) => i.emp === code)) used.push('ID');

  return used;
}

export const nextCode = (s: TerminalState, type: RecordType) =>
  nextNumber(recordsOf(s, type).map((d) => d.code), CODE_PREFIX[type], 3);

export interface DirectoryDraft extends Editing {
  type: RecordType; name: string; tin: string; detail: string; dept: string; email: string; phone: string;
  vat: boolean; ewt: boolean;
}

export const newDirectoryDraft = (type: RecordType = 'Vendor'): DirectoryDraft => ({
  type, name: '', tin: '', detail: '', dept: '', email: '', phone: '', vat: type === 'Client', ewt: false,
});

export const directoryDraftOf = (d: DirectoryRecord): DirectoryDraft => ({
  editing: d.code, type: d.type, name: d.name, tin: d.tin, detail: d.detail, dept: d.dept ?? '',
  email: d.email ?? '', phone: d.phone ?? '', vat: d.vat ?? false, ewt: d.ewt ?? false,
});

const clean = (x: string) => x.trim();

export function saveDirectoryRecord(s: TerminalState, d: DirectoryDraft, ctx: Ctx): Change<DirectoryRecord> {
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

  if (d.type === 'Employee' && dept) base.dept = dept;

  if (d.type === 'Client') {
    base.vat = d.vat;
    base.ewt = d.ewt;
  }

  if (email) base.email = email;

  if (phone) base.phone = phone;

  if (original?.links) base.links = original.links;

  if (original?.photo) base.photo = original.photo;

  if (original) {
    return {
      state: logged({ ...s, dir: s.dir.map((x) => (x.code === original.code ? base : x)) }, 'DIR', `${base.code} ${base.name} updated.`, ctx),
      record: base, message: `${base.code} updated.`,
    };
  }

  return {
    state: logged({ ...s, dir: [...s.dir, base] }, 'DIR', `${base.code} ${base.name} added to the directory as ${d.type.toLowerCase()}.`, ctx),
    record: base, message: `${base.code} added. It is now selectable in ${USED_IN[d.type]}.`,
  };
}

/** Removes a record no document refers to. */
export function removeDirectoryRecord(s: TerminalState, code: string, ctx: Ctx): Change<DirectoryRecord> {
  const d = recordOf(s, code);

  if (!d) throw new KeystoneError(`${code} is not in the directory.`);
  const used = usedBy(s, code);

  if (used.length) throw new KeystoneError(`${code} is used by ${used.join(', ')} records and cannot be removed.`);

  return {
    state: logged({ ...s, dir: s.dir.filter((x) => x.code !== code) }, 'DIR', `${code} ${d.name} removed from the directory.`, ctx),
    record: d, message: `${code} removed.`,
  };
}

export interface ImportResult { added: DirectoryRecord[]; updated: DirectoryRecord[]; unchanged: number }

/**
 * Brings a connected system's people into the directory as employees. A person already
 * linked (or with the same name) is updated, never duplicated, and keeps their code.
 */
export function importEmployees(s: TerminalState, source: { id: string; name: string }, people: ExternalPerson[], ctx: Ctx): Change<ImportResult> {
  const dir = [...s.dir];
  const result: ImportResult = { added: [], updated: [], unchanged: 0 };

  for (const p of people) {
    const name = clean(p.name);

    if (!name) continue;
    const i = dir.findIndex((d) => d.type === 'Employee' && (d.links?.[source.id] === p.externalId || d.name.toLowerCase() === name.toLowerCase()));

    const fields: Pick<DirectoryRecord, 'name' | 'detail' | 'dept' | 'email' | 'phone' | 'photo'> = {
      name, detail: clean(p.position ?? '') || (i >= 0 ? dir[i].detail : ''),
    };

    const dept = clean(p.department ?? '');

    if (dept) fields.dept = dept;

    if (p.email) fields.email = p.email;

    if (p.phone) fields.phone = p.phone;

    if (p.photo) fields.photo = p.photo;

    if (i >= 0) {
      const merged: DirectoryRecord = { ...dir[i], ...fields, links: { ...dir[i].links, [source.id]: p.externalId } };

      if (JSON.stringify(merged) === JSON.stringify(dir[i])) { result.unchanged++; continue; }

      dir[i] = merged;
      result.updated.push(merged);
    } else {
      const rec: DirectoryRecord = { code: nextCode({ ...s, dir }, 'Employee'), type: 'Employee', tin: '', ...fields, links: { [source.id]: p.externalId } };
      dir.push(rec);
      result.added.push(rec);
    }
  }

  const changed = result.added.length + result.updated.length;

  const summary = changed
    ? `${count(result.added.length, 'employee')} added and ${count(result.updated.length, 'employee')} updated from ${source.name}.`
    : `Employees already match ${source.name}.`;

  return { state: changed ? logged({ ...s, dir }, 'DIR', summary, ctx) : s, record: result, message: summary };
}
