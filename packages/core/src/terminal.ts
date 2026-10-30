import { addDays, addYears, localDate, type ISODate } from './dates';
import { amountInWords, count, shortDate, stamp } from './format';
import { parseAmount, peso, percent, sumCentavos, toCentavos, toPesos, type Centavos } from './money';
import {
  CODE_PREFIX, USED_IN,
  type DirectoryRecord, type IDRecord, type IDStatus, type LineItem, type LogEntry, type ModuleTag, type RecordType,
  type Seed, type Statement, type StatementStatus, type TerminalState, type Voucher, type VoucherStatus,
} from './models';

// Every rule of the terminal as plain functions over an immutable state. Each change
// returns the new state, the record it touched and the sentence to show, or throws a
// KeystoneError with the reason. The UI only draws what these return.

export class KeystoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeystoneError';
  }
}

/** What every rule needs from outside: the reference data and the time. */
export interface Ctx {
  seed: Seed;
  now: () => Date;
}

export interface Change<T> {
  state: TerminalState;
  record: T;
  message: string;
}

const today = (ctx: Ctx): ISODate => localDate(ctx.now());
const year = (ctx: Ctx) => ctx.now().getFullYear();

// ---------- lookups ----------

export const recordOf = (s: TerminalState, code: string) => s.dir.find((d) => d.code === code);
export const recordsOf = (s: TerminalState, type: RecordType) => s.dir.filter((d) => d.type === type);
export const nameOf = (s: TerminalState, code: string) => recordOf(s, code)?.name ?? code;

/** Vouchers can pay anyone in the directory: vendors first, then clients, then employees. */
export const payees = (s: TerminalState) => [...recordsOf(s, 'Vendor'), ...recordsOf(s, 'Client'), ...recordsOf(s, 'Employee')];

/** Which modules refer to a directory record, as log tags. */
export function usedBy(s: TerminalState, code: string): ModuleTag[] {
  const used: ModuleTag[] = [];
  if (s.cv.some((v) => v.payee === code)) used.push('CV');
  if (s.bs.some((b) => b.client === code)) used.push('BS');
  if (s.ids.some((i) => i.emp === code)) used.push('ID');
  return used;
}

export const voucherTotal = (v: Pick<Voucher, 'lines'>): Centavos => sumCentavos(v.lines, (l) => toCentavos(l.amt));

export interface StatementTotals { subtotal: Centavos; vat: Centavos; ewt: Centavos; due: Centavos }
export const VAT_RATE = 12;
export const EWT_RATE = 5;

/** VAT is added and EWT withheld, both on the subtotal. */
export function statementTotals(b: Pick<Statement, 'lines' | 'vat' | 'ewt'>): StatementTotals {
  const subtotal = sumCentavos(b.lines, (l) => toCentavos(l.amt));
  const vat = b.vat ? percent(subtotal, VAT_RATE) : 0;
  const ewt = b.ewt ? percent(subtotal, EWT_RATE) : 0;
  return { subtotal, vat, ewt, due: subtotal + vat - ewt };
}

const newestFirst = <T extends { no: string }>(xs: T[]) => [...xs].sort((a, b) => b.no.localeCompare(a.no));
export const vouchersNewestFirst = (s: TerminalState) => newestFirst(s.cv);
export const statementsNewestFirst = (s: TerminalState) => newestFirst(s.bs);
export const idsNewestFirst = (s: TerminalState) => newestFirst(s.ids);

// ---------- numbering ----------

/** The next number after the highest in use, under this prefix: "CV-2026-0142". */
export function nextNumber(existing: string[], prefix: string, width = 4): string {
  const highest = existing.reduce((max, no) => {
    const m = /(\d+)$/.exec(no);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  return prefix + String(highest + 1).padStart(width, '0');
}

export const nextVoucherNo = (s: TerminalState, ctx: Ctx) => nextNumber(s.cv.map((v) => v.no), `CV-${year(ctx)}-`);
export const nextStatementNo = (s: TerminalState, ctx: Ctx) => nextNumber(s.bs.map((b) => b.no), `BS-${year(ctx)}-`);
export const nextIDNo = (s: TerminalState, ctx: Ctx) => nextNumber(s.ids.map((i) => i.no), `APG-${year(ctx)}-`);
export const nextCode = (s: TerminalState, type: RecordType) =>
  nextNumber(recordsOf(s, type).map((d) => d.code), CODE_PREFIX[type], 3);

// ---------- the activity log ----------

/** Adds a line to the activity log. Modules and connectors use this too. */
export function logged(s: TerminalState, mod: ModuleTag, text: string, ctx: Ctx): TerminalState {
  const entry: LogEntry = { when: stamp(ctx.now()), mod, text };
  return { ...s, log: [entry, ...s.log] };
}

// ---------- drafts: what the forms edit ----------

export interface LineDraft {
  id: string;
  desc: string;
  acct: string;
  ref: string;
  /** As typed. */
  amount: string;
}

let lineSeq = 0;
export const lineDraft = (init: Partial<Omit<LineDraft, 'id'>> = {}): LineDraft => ({
  id: `line-${++lineSeq}`, desc: '', acct: '', ref: '', amount: '', ...init,
});
const lineFrom = (l: LineItem) => lineDraft({
  desc: l.desc, acct: l.acct ?? '', ref: l.ref ?? '',
  amount: toCentavos(l.amt) % 100 === 0 ? String(Math.round(l.amt)) : l.amt.toFixed(2),
});

/** Lines with no description and no amount are dropped, as in the prototype. */
function linesOf(drafts: LineDraft[], kind: 'acct' | 'ref'): LineItem[] {
  return drafts
    .map((d) => ({ d, c: parseAmount(d.amount) ?? 0 }))
    .filter(({ d, c }) => d.desc.trim() !== '' || c !== 0)
    .map(({ d, c }) => (kind === 'acct' ? { desc: d.desc, acct: d.acct, amt: toPesos(c) } : { desc: d.desc, ref: d.ref, amt: toPesos(c) }));
}

/** Set when a form holds a saved record, so saving can update it in place. */
interface Editing { editing?: string }

export interface VoucherDraft extends Editing {
  no: string; date: ISODate; payee: string; bank: string; check: string;
  lines: LineDraft[]; prepared: string; checked: string; approved: string;
}

export interface StatementDraft extends Editing {
  no: string; date: ISODate; due: ISODate; client: string; period: string; ref: string;
  lines: LineDraft[]; vat: boolean; ewt: boolean; notes: string;
}

export interface IDDraft extends Editing {
  no: string; emp: string; name: string; pos: string; dept: string; issued: ISODate; valid: ISODate;
  blood: string; iceName: string; iceNo: string; signatory: string; photo?: string;
}

export interface DirectoryDraft extends Editing {
  type: RecordType; name: string; tin: string; detail: string; dept: string; email: string; phone: string;
  vat: boolean; ewt: boolean;
}

export function newVoucher(s: TerminalState, ctx: Ctx): VoucherDraft {
  const d = ctx.seed.reference.defaults;
  return {
    no: nextVoucherNo(s, ctx), date: today(ctx), payee: payees(s)[0]?.code ?? '', bank: ctx.seed.reference.banks[0] ?? '',
    check: '', lines: [lineDraft({ acct: ctx.seed.reference.accounts[0] ?? '' })],
    prepared: d.preparedBy, checked: d.checkedBy, approved: d.approvedBy,
  };
}

export const voucherDraftOf = (v: Voucher): VoucherDraft => ({
  editing: v.no, no: v.no, date: v.date, payee: v.payee, bank: v.bank, check: v.check,
  lines: v.lines.map(lineFrom), prepared: v.prepared, checked: v.checked, approved: v.approved,
});

export const voucherOf = (d: VoucherDraft, status: VoucherStatus = 'For Approval'): Voucher => ({
  no: d.no, date: d.date, payee: d.payee, bank: d.bank, check: d.check.trim(), lines: linesOf(d.lines, 'acct'),
  status, prepared: d.prepared, checked: d.checked, approved: d.approved,
});

export function newStatement(s: TerminalState, ctx: Ctx): StatementDraft {
  const d = ctx.seed.reference.defaults;
  const client = recordsOf(s, 'Client')[0];
  const t = today(ctx);
  return {
    no: nextStatementNo(s, ctx), date: t, due: addDays(t, d.dueInDays), client: client?.code ?? '',
    period: d.billingPeriod, ref: '', lines: [lineDraft({ desc: 'Monthly rent' }), lineDraft({ desc: 'Association dues' })],
    vat: client?.vat ?? false, ewt: client?.ewt ?? false, notes: d.paymentInstructions,
  };
}

export const statementDraftOf = (b: Statement, ctx: Ctx): StatementDraft => ({
  editing: b.no, no: b.no, date: b.date, due: b.due, client: b.client, period: b.period, ref: b.ref,
  lines: b.lines.map(lineFrom), vat: b.vat, ewt: b.ewt, notes: b.notes ?? ctx.seed.reference.defaults.paymentInstructions,
});

export const statementOf = (d: StatementDraft, status: StatementStatus = 'Sent'): Statement => ({
  no: d.no, date: d.date, due: d.due, client: d.client, period: d.period, ref: d.ref, lines: linesOf(d.lines, 'ref'),
  vat: d.vat, ewt: d.ewt, notes: d.notes, status,
});

/** Picking a client sets VAT and EWT from its directory record. */
export function withClient(s: TerminalState, d: StatementDraft, client: string): StatementDraft {
  const c = recordOf(s, client);
  return { ...d, client, vat: c?.vat ?? false, ewt: c?.ewt ?? false };
}

export function newID(s: TerminalState, ctx: Ctx): IDDraft {
  const d = ctx.seed.reference.defaults;
  const t = today(ctx);
  return {
    no: nextIDNo(s, ctx), emp: '', name: '', pos: '', dept: '', issued: t, valid: addDays(addYears(t, d.idValidYears), -1),
    blood: ctx.seed.reference.bloodTypes[0] ?? '', iceName: '', iceNo: '', signatory: d.signatory,
  };
}

export const idDraftOf = (i: IDRecord): IDDraft => ({
  editing: i.no, no: i.no, emp: i.emp, name: i.name, pos: i.pos, dept: i.dept, issued: i.issued, valid: i.valid,
  blood: i.blood, iceName: i.iceName, iceNo: i.iceNo, signatory: i.signatory, photo: i.photo,
});

export const idOf = (d: IDDraft, status: IDStatus = 'For printing'): IDRecord => ({
  no: d.no, emp: d.emp, name: d.name.trim(), pos: d.pos, dept: d.dept, issued: d.issued, valid: d.valid, blood: d.blood,
  iceName: d.iceName, iceNo: d.iceNo, signatory: d.signatory, status, ...(d.photo ? { photo: d.photo } : {}),
});

/** Picking an employee fills the card from the directory. */
export function withEmployee(s: TerminalState, d: IDDraft, emp: string): IDDraft {
  const e = recordOf(s, emp);
  if (!e) return { ...d, emp };
  return { ...d, emp, name: e.name, pos: e.detail, dept: e.dept ?? '', ...(e.photo ? { photo: e.photo } : {}) };
}

export const newDirectoryDraft = (type: RecordType = 'Vendor'): DirectoryDraft => ({
  type, name: '', tin: '', detail: '', dept: '', email: '', phone: '', vat: type === 'Client', ewt: false,
});

export const directoryDraftOf = (d: DirectoryRecord): DirectoryDraft => ({
  editing: d.code, type: d.type, name: d.name, tin: d.tin, detail: d.detail, dept: d.dept ?? '',
  email: d.email ?? '', phone: d.phone ?? '', vat: d.vat ?? false, ewt: d.ewt ?? false,
});

// ---------- vouchers ----------

/**
 * Saves a voucher. A draft loaded from the register updates that voucher while it is
 * still For Approval; `asNew` (or a voucher already approved) saves a copy under the
 * next number.
 */
export function saveVoucher(s: TerminalState, d: VoucherDraft, ctx: Ctx, asNew = false): Change<Voucher> {
  const v = voucherOf(d);
  const total = voucherTotal(v);
  if (!v.lines.length || total <= 0) throw new KeystoneError('Add at least one particular with an amount.');
  if (!recordOf(s, v.payee)) throw new KeystoneError('Choose a payee from the directory.');

  const original = d.editing ? s.cv.find((x) => x.no === d.editing) : undefined;
  if (original && !asNew) {
    if (original.status !== 'For Approval') {
      throw new KeystoneError(`${original.no} is ${original.status.toLowerCase()} and can no longer be changed. Save it as a new voucher instead.`);
    }
    const updated = { ...v, no: original.no, status: original.status };
    const next = { ...s, cv: s.cv.map((x) => (x.no === original.no ? updated : x)) };
    return {
      state: logged(next, 'CV', `${updated.no} for ${nameOf(s, v.payee)} edited (${peso(total)}).`, ctx),
      record: updated, message: `${updated.no} updated.`,
    };
  }
  const saved = { ...v, no: nextVoucherNo(s, ctx) };
  const next = { ...s, cv: [...s.cv, saved] };
  return {
    state: logged(next, 'CV', `${saved.no} for ${nameOf(s, v.payee)} saved and routed for approval (${peso(total)}).`, ctx),
    record: saved, message: `${saved.no} saved and routed for approval.`,
  };
}

export function setVoucherStatus(s: TerminalState, no: string, status: VoucherStatus, ctx: Ctx): Change<Voucher> {
  const v = s.cv.find((x) => x.no === no);
  if (!v) throw new KeystoneError(`${no} is not in the register.`);
  if (v.status === status) return { state: s, record: v, message: `${no} is already ${status.toLowerCase()}.` };
  if (v.status === 'Void') throw new KeystoneError(`${no} is void and stays void.`);
  if (status === 'Released' && !v.check) throw new KeystoneError(`Enter the check number on ${no} before releasing it.`);
  const updated = { ...v, status };
  const text = status === 'Approved' ? `${no} approved by ${v.approved || 'the approver'}.`
    : status === 'Released' ? `${no} released; check ${v.check} to ${nameOf(s, v.payee)}.`
    : status === 'Void' ? `${no} voided (${peso(voucherTotal(v))}).`
    : `${no} returned for approval.`;
  return {
    state: logged({ ...s, cv: s.cv.map((x) => (x.no === no ? updated : x)) }, 'CV', text, ctx),
    record: updated, message: `${no} marked ${status.toLowerCase()}.`,
  };
}

// ---------- billing statements ----------

export function saveStatement(s: TerminalState, d: StatementDraft, ctx: Ctx, asNew = false): Change<Statement> {
  const b = statementOf(d);
  const t = statementTotals(b);
  if (!b.lines.length || t.subtotal <= 0) throw new KeystoneError('Add at least one charge with an amount.');
  if (!recordOf(s, b.client)) throw new KeystoneError('Choose a client from the directory.');
  if (b.due < b.date) throw new KeystoneError('The due date is before the statement date.');

  const original = d.editing ? s.bs.find((x) => x.no === d.editing) : undefined;
  if (original && !asNew) {
    if (original.status !== 'Sent') {
      throw new KeystoneError(`${original.no} is ${original.status.toLowerCase()} and can no longer be changed. Save it as a new statement instead.`);
    }
    const updated = { ...b, no: original.no, status: original.status };
    return {
      state: logged({ ...s, bs: s.bs.map((x) => (x.no === original.no ? updated : x)) }, 'BS',
        `${updated.no} for ${nameOf(s, b.client)} edited (${peso(t.due)} due ${shortDate(b.due)}).`, ctx),
      record: updated, message: `${updated.no} updated.`,
    };
  }
  const saved = { ...b, no: nextStatementNo(s, ctx) };
  return {
    state: logged({ ...s, bs: [...s.bs, saved] }, 'BS', `${saved.no} sent to ${nameOf(s, b.client)} (${peso(t.due)} due ${shortDate(b.due)}).`, ctx),
    record: saved, message: `${saved.no} saved and marked as sent.`,
  };
}

export function setStatementStatus(s: TerminalState, no: string, status: StatementStatus, ctx: Ctx): Change<Statement> {
  const b = s.bs.find((x) => x.no === no);
  if (!b) throw new KeystoneError(`${no} is not in the register.`);
  if (b.status === status) return { state: s, record: b, message: `${no} is already ${status.toLowerCase()}.` };
  if (b.status === 'Void') throw new KeystoneError(`${no} is void and stays void.`);
  const updated = { ...b, status };
  const text = status === 'Paid' ? `${no} from ${nameOf(s, b.client)} marked paid (${peso(statementTotals(b).due)}).`
    : `${no} marked ${status.toLowerCase()}.`;
  return {
    state: logged({ ...s, bs: s.bs.map((x) => (x.no === no ? updated : x)) }, 'BS', text, ctx),
    record: updated, message: `${no} marked ${status.toLowerCase()}.`,
  };
}

export interface Payment {
  /** Pesos received. */
  amount: number;
  method?: string;
  reference?: string;
  /** Where the payment was reported: "the website (ticket APG-1A2B3C4D)". */
  source: string;
}

/**
 * Settles a statement with a payment someone reported. A payment short of the amount due
 * is refused, so a partial payment never marks a statement paid.
 */
export function recordPayment(s: TerminalState, no: string, p: Payment, ctx: Ctx): Change<Statement> {
  const b = s.bs.find((x) => x.no === no);
  if (!b) throw new KeystoneError(`${no} is not in the register.`);
  if (b.status === 'Paid' || b.status === 'Void') throw new KeystoneError(`${no} is already ${b.status.toLowerCase()}.`);
  const due = statementTotals(b).due;
  const paid = toCentavos(p.amount);
  if (paid < due) throw new KeystoneError(`${peso(paid)} is less than the ${peso(due)} due on ${no}. Record it when the balance is paid.`);
  const updated = { ...b, status: 'Paid' as const };
  const how = [p.method, p.reference && `ref ${p.reference}`].filter(Boolean).join(' ');
  return {
    state: logged({ ...s, bs: s.bs.map((x) => (x.no === no ? updated : x)) }, 'BS',
      `${no} from ${nameOf(s, b.client)} paid: ${peso(paid)}${how ? ` by ${how}` : ''}, reported on ${p.source}.`, ctx),
    record: updated, message: `${no} marked paid.`,
  };
}

// ---------- IDs ----------

export function issueID(s: TerminalState, d: IDDraft, ctx: Ctx, asNew = false): Change<IDRecord> {
  const i = idOf(d);
  if (!i.name) throw new KeystoneError('Enter the name to print on the card.');
  if (i.valid <= i.issued) throw new KeystoneError('The card must be valid past the day it is issued.');

  const original = d.editing ? s.ids.find((x) => x.no === d.editing) : undefined;
  if (original && !asNew) {
    if (original.status !== 'For printing') {
      throw new KeystoneError(`${original.no} has been printed. Issue a new ID instead.`);
    }
    const updated = { ...i, no: original.no };
    return {
      state: logged({ ...s, ids: s.ids.map((x) => (x.no === original.no ? updated : x)) }, 'ID', `${updated.no} for ${updated.name} edited before printing.`, ctx),
      record: updated, message: `${updated.no} updated.`,
    };
  }
  const saved = { ...i, no: nextIDNo(s, ctx) };
  return {
    state: logged({ ...s, ids: [...s.ids, saved] }, 'ID', `${saved.no} issued to ${saved.name}; queued for printing.`, ctx),
    record: saved, message: `${saved.no} issued and queued for printing.`,
  };
}

export function setIDStatus(s: TerminalState, no: string, status: IDStatus, ctx: Ctx): Change<IDRecord> {
  const i = s.ids.find((x) => x.no === no);
  if (!i) throw new KeystoneError(`${no} is not in the register.`);
  if (i.status === status) return { state: s, record: i, message: `${no} is already ${status.toLowerCase()}.` };
  const updated = { ...i, status };
  const text = status === 'Active' ? `${no} printed and handed to ${i.name}.` : `${no} for ${i.name} marked ${status.toLowerCase()}.`;
  return {
    state: logged({ ...s, ids: s.ids.map((x) => (x.no === no ? updated : x)) }, 'ID', text, ctx),
    record: updated, message: `${no} marked ${status.toLowerCase()}.`,
  };
}

// ---------- directory ----------

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
    ...(d.type === 'Employee' && clean(d.dept) ? { dept: clean(d.dept) } : {}),
    ...(d.type === 'Client' ? { vat: d.vat, ewt: d.ewt } : {}),
    ...(clean(d.email) ? { email: clean(d.email) } : {}),
    ...(clean(d.phone) ? { phone: clean(d.phone) } : {}),
    ...(original?.links ? { links: original.links } : {}),
    ...(original?.photo ? { photo: original.photo } : {}),
  };
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

/** A person as another system knows them. */
export interface ExternalPerson {
  externalId: string;
  name: string;
  position?: string;
  department?: string;
  email?: string;
  phone?: string;
  /** A photo already saved in the app's photo folder. */
  photo?: string;
}

export interface ImportResult { added: DirectoryRecord[]; updated: DirectoryRecord[]; unchanged: number }

/**
 * Brings a connected system's people into the directory as employees. A person already
 * linked (or with the same name) is updated, never duplicated, and keeps their code.
 */
export function importEmployees(s: TerminalState, source: { id: string; name: string }, people: ExternalPerson[], ctx: Ctx): Change<ImportResult> {
  let dir = [...s.dir];
  const result: ImportResult = { added: [], updated: [], unchanged: 0 };
  for (const p of people) {
    const name = clean(p.name);
    if (!name) continue;
    const i = dir.findIndex((d) => d.type === 'Employee' && (d.links?.[source.id] === p.externalId || d.name.toLowerCase() === name.toLowerCase()));
    const fields = {
      name, detail: clean(p.position ?? '') || (i >= 0 ? dir[i].detail : ''),
      ...(clean(p.department ?? '') ? { dept: clean(p.department ?? '') } : {}),
      ...(p.email ? { email: p.email } : {}), ...(p.phone ? { phone: p.phone } : {}),
      ...(p.photo ? { photo: p.photo } : {}),
    };
    if (i >= 0) {
      const merged: DirectoryRecord = { ...dir[i], ...fields, links: { ...dir[i].links, [source.id]: p.externalId } };
      if (JSON.stringify(merged) === JSON.stringify(dir[i])) { result.unchanged++; continue; }
      dir[i] = merged;
      result.updated.push(merged);
    } else {
      const rec: DirectoryRecord = { code: nextCode({ ...s, dir }, 'Employee'), type: 'Employee', tin: '', ...fields, links: { [source.id]: p.externalId } };
      dir = [...dir, rec];
      result.added.push(rec);
    }
  }
  const changed = result.added.length + result.updated.length;
  const summary = changed
    ? `${count(result.added.length, 'employee')} added and ${count(result.updated.length, 'employee')} updated from ${source.name}.`
    : `Employees already match ${source.name}.`;
  const next = changed ? logged({ ...s, dir }, 'DIR', summary, ctx) : s;
  return { state: next, record: result, message: summary };
}

// ---------- housekeeping ----------

/** Marks statements past due as overdue and cards past their date as expired. Run on open. */
export function applyDueDates(s: TerminalState, ctx: Ctx): TerminalState {
  const t = today(ctx);
  let next = s;
  for (const b of s.bs) {
    if (b.status === 'Sent' && b.due < t) {
      next = setStatementStatus(next, b.no, 'Overdue', ctx).state;
    }
  }
  for (const i of s.ids) {
    if (i.status === 'Active' && i.valid < t) {
      next = setIDStatus(next, i.no, 'Expired', ctx).state;
    }
  }
  return next;
}

/** A state from a backup file or an older version, checked enough to load safely. */
export function parseState(json: unknown): TerminalState {
  const x = json as Partial<TerminalState> | null;
  if (!x || typeof x !== 'object' || !Array.isArray(x.dir) || !Array.isArray(x.cv) || !Array.isArray(x.bs) || !Array.isArray(x.ids)) {
    throw new KeystoneError('That file is not a Keystone backup.');
  }
  return { dir: x.dir, cv: x.cv, bs: x.bs, ids: x.ids, log: Array.isArray(x.log) ? x.log : [], ...(x.ext ? { ext: x.ext } : {}) };
}

export { amountInWords };
