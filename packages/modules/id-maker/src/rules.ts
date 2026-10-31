import {
  addDays, addYears, count, KeystoneError, logged, newestFirst, nextNumber, recordOf, thisYear, today,
  toneOf, type Change, type Ctx, type Editing, type Figure, type Finding, type IDRecord, type IDStatus,
  type TerminalState, type WaitingItem
} from '@keystone/core';

// Employee ID cards. Reads the directory to fill a card from an employee record.

export const idsNewestFirst = (s: TerminalState) => newestFirst(s.ids);
export const nextIDNo = (s: TerminalState, ctx: Ctx) => nextNumber(s.ids.map((i) => i.no), `APG-${thisYear(ctx)}-`);
export const queuedForPrinting = (s: TerminalState) => s.ids.filter((i) => i.status === 'For printing');
export const issuedThisMonth = (s: TerminalState, ctx: Ctx) => s.ids.filter((i) => i.issued.startsWith(today(ctx).slice(0, 7)));

export interface IDDraft extends Editing {
  no: string; emp: string; name: string; pos: string; dept: string; issued: string; valid: string;
  blood: string; iceName: string; iceNo: string; signatory: string; photo?: string;
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

/** Picking an employee fills the card from the directory, photo included. */
export function withEmployee(s: TerminalState, d: IDDraft, emp: string): IDDraft {
  const e = recordOf(s, emp);
  if (!e) return { ...d, emp };
  return { ...d, emp, name: e.name, pos: e.detail, dept: e.dept ?? '', ...(e.photo ? { photo: e.photo } : {}) };
}

export function issueID(s: TerminalState, d: IDDraft, ctx: Ctx, asNew = false): Change<IDRecord> {
  const i = idOf(d);
  if (!i.name) throw new KeystoneError('Enter the name to print on the card.');
  if (i.valid <= i.issued) throw new KeystoneError('The card must be valid past the day it is issued.');

  const original = d.editing ? s.ids.find((x) => x.no === d.editing) : undefined;
  if (original && !asNew) {
    if (original.status !== 'For printing') throw new KeystoneError(`${original.no} has been printed. Issue a new ID instead.`);
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

/** Run on open: active cards past their date become Expired. */
export function markExpired(s: TerminalState, ctx: Ctx): TerminalState {
  const t = today(ctx);
  return s.ids.filter((i) => i.status === 'Active' && i.valid < t).reduce((acc, i) => setIDStatus(acc, i.no, 'Expired', ctx).state, s);
}

// ---------- what the IDs domain tells Overview and Home ----------

export function idFigure(s: TerminalState, ctx: Ctx): Figure {
  return { label: 'IDs issued this month', value: String(issuedThisMonth(s, ctx).length), caption: `${queuedForPrinting(s).length} queued for printing` };
}

export function idFinding(s: TerminalState): Finding | null {
  const q = queuedForPrinting(s);
  if (!q.length) return null;
  return { priority: 10, text: `${count(q.length, 'ID')} ${q.length === 1 ? 'is' : 'are'} waiting to be printed.` };
}

export function idWaiting(s: TerminalState): WaitingItem[] {
  return queuedForPrinting(s).map((i) => ({ no: i.no, who: `${i.name} · ID card`, amount: null, status: i.status, tone: toneOf(i.status), rank: 20 }));
}
