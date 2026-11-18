import {
  companyOf, count, KeystoneError, lineDraft, lineDraftOf, lineItemsOf, logged, nameOf, newestFirst, nextNumber,
  peso, recordOf, shortDate, sumCentavos, toCentavos, today, type Centavos, type Change, type Ctx,
  type Editing, type Figure, type Finding, type LineDraft, type Reference, type TerminalState, type Tone, type Voucher, type VoucherDrafts,
  type WaitingItem
} from '@keystone/core';

// Check vouchers: disbursements routed for signatures, printed as the company's
// Check Voucher. The payee is typed on each voucher; an older voucher's directory code is read through the directory.

/** This module's id, written once: its route, its ModuleDef.id and its draft key. */
export const ID = 'vouchers';

/** The tag its activity-log lines carry. */
export const TAG = 'CV';

export const VOUCHER_STATUSES = ['For Approval', 'Approved', 'Released', 'Void'] as const;

export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

const TONES: Record<VoucherStatus, Tone> = { 'For Approval': 'warn', Approved: 'good', Released: 'neutral', Void: 'neutral' };

/** How a voucher's status reads at a glance. One saved with a status this build does not know reads as neutral. */
export function voucherTone(status: string): Tone {
  const known = VOUCHER_STATUSES.find((s) => s === status);

  return known ? TONES[known] : 'neutral';
}

export const voucherTotal = (v: Pick<Voucher, 'lines'>): Centavos => sumCentavos(v.lines, (l) => toCentavos(l.amt));
export const vouchersNewestFirst = (s: TerminalState) => newestFirst(s.cv);

/** A voucher saved before payees were typed names its payee by directory code; that record is kept. */
export const refersTo: Reference = { tag: TAG, record: (s, code) => s.cv.some((v) => v.payee === code) };

/** Voucher numbers run 888-001, 888-002 and on, with no year. */
const SERIES = '888-';

/** The next voucher number in the 888- series. Older vouchers (CV-2026-0141, 8888-001) keep theirs and do not count. */
export const nextVoucherNo = (s: TerminalState) => nextNumber(s.cv.flatMap((v) => (v.no.startsWith(SERIES) ? [v.no] : [])), SERIES, 3);
export const awaitingApproval = (s: TerminalState) => s.cv.filter((v) => v.status === 'For Approval');

/** Who a voucher pays, as printed on it. */
export interface Payee { name: string; address: string }

/**
 * Who a voucher pays, as printed: the name and address typed on it, or, for a voucher saved before payees were typed,
 * the directory record its code names.
 */
export function payeeOf(s: TerminalState, v: Pick<Voucher, 'payee' | 'address'>): Payee {
  const record = recordOf(s, v.payee);

  return { name: record?.name ?? v.payee, address: v.address ?? record?.detail ?? '' };
}

export interface VoucherDraft extends Editing {
  no: string; date: string;
  /** The payee's name and address, typed in. */
  payee: string; address: string;
  /** The payee's TIN, printed only when typed in. */
  tin: string;
  check: string; checkDate: string;
  /** The account the check is drawn on, as printed: "BPI · 4011 0258 68". */
  bank: string;
  issuer: string;
  lines: LineDraft[]; prepared: string; checked: string; approved: string;
  preparedPos: string; checkedPos: string; approvedPos: string;
}

/**
 * A blank voucher. It is prepared by whoever is signed in. The other signatories and every position start as the last
 * voucher's (Company Details' names before the first), and so do the bank and its issuer, or `bank` (the first account
 * kept) before any. Nobody signed in, the preparer is the last voucher's too, typed in full by whoever prepares vouchers.
 * The payee, their address and TIN start blank, for whoever prepares the voucher to type.
 */
export function newVoucher(s: TerminalState, ctx: Ctx, bank = ''): VoucherDraft {
  const d = companyOf(s);
  const last = s.cv.at(-1);

  return {
    no: nextVoucherNo(s), date: today(ctx), payee: '', address: '', tin: '', check: '', checkDate: '',
    bank: last?.bank || bank, issuer: last?.issuer ?? '',
    lines: [lineDraft()], prepared: ctx.who?.name ?? last?.prepared ?? d.preparedBy, checked: last?.checked ?? d.checkedBy,
    approved: last?.approved ?? d.approvedBy,
    preparedPos: last?.preparedPos ?? '', checkedPos: last?.checkedPos ?? '', approvedPos: last?.approvedPos ?? '',
  };
}

export const voucherDraftOf = (s: TerminalState, v: Voucher): VoucherDraft => ({
  editing: v.no, no: v.no, date: v.date, payee: payeeOf(s, v).name, address: payeeOf(s, v).address, tin: v.tin ?? '', check: v.check, checkDate: v.checkDate ?? '',
  bank: v.bank ?? '', issuer: v.issuer ?? '',
  lines: v.lines.map(lineDraftOf), prepared: v.prepared, checked: v.checked, approved: v.approved,
  preparedPos: v.preparedPos ?? '', checkedPos: v.checkedPos ?? '', approvedPos: v.approvedPos ?? '',
});

/**
 * Why a voucher can no longer be changed, or null while it is still For Approval. Once
 * approved, the voucher prints as it was approved; a change goes on a new voucher. Only
 * the check, often written after approval, still goes on it until it is released.
 */
export function voucherLock(v: Voucher): string | null {
  if (v.status === 'For Approval') return null;

  if (takesCheck(v)) return `${v.no} is approved: only its check number and date of check can change until it is released. Copy it to a new voucher to change the rest.`;

  return `${v.no} is ${v.status.toLowerCase()} and can no longer be changed. Copy it to a new voucher to change it.`;
}

/** Whether an approved voucher still takes its check number and date of check: until the check is released. */
export const takesCheck = (v: Voucher) => v.status === 'Approved';

/** The voucher with the check number and date of check typed on `d`, and nothing else of `d`. */
export function withCheck(v: Voucher, d: Pick<VoucherDraft, 'check' | 'checkDate'>): Voucher {
  const out: Voucher = { ...v, check: d.check.trim() };

  if (d.checkDate) out.checkDate = d.checkDate;
  else delete out.checkDate;

  return out;
}

/** Whether a voucher saved by whoever is signed in is approved as it is saved: the CEO's are; everyone else's wait for approval. */
export const approvesOnSave = (ctx: Ctx) => ctx.who?.role === 'owner';

/** A new voucher drafted from another: its payee, particulars and signatories, under the next number, dated today, with no check yet. */
export function copyVoucher(s: TerminalState, v: Voucher, ctx: Ctx): VoucherDraft {
  const d = voucherDraftOf(s, v);

  return {
    no: nextVoucherNo(s), date: today(ctx), payee: d.payee, address: d.address, tin: d.tin, check: '', checkDate: '', bank: d.bank, issuer: d.issuer,
    lines: d.lines, prepared: d.prepared, checked: d.checked, approved: d.approved,
    preparedPos: d.preparedPos, checkedPos: d.checkedPos, approvedPos: d.approvedPos,
  };
}

/** The optional fields a voucher keeps only when they are filled in. */
const OPTIONAL = ['address', 'tin', 'bank', 'issuer', 'preparedPos', 'checkedPos', 'approvedPos'] as const;

export function voucherOf(d: VoucherDraft, status: VoucherStatus = 'For Approval'): Voucher {
  const v: Voucher = {
    no: d.no, date: d.date, payee: d.payee.trim(), check: d.check.trim(), lines: lineItemsOf(d.lines, 'amount'),
    status, prepared: d.prepared, checked: d.checked, approved: d.approved,
  };

  if (d.checkDate) v.checkDate = d.checkDate;

  for (const key of OPTIONAL) {
    const value = d[key].trim();

    if (value) v[key] = value;
  }

  return v;
}

/** The voucher on the form, refused without a particular with an amount or a payee. */
function checkedVoucher(d: VoucherDraft): Voucher {
  const v = voucherOf(d);

  if (!v.lines.length || voucherTotal(v) <= 0) throw new KeystoneError('Add at least one particular with an amount.');

  if (!v.payee) throw new KeystoneError('Enter the payee.');

  return v;
}

/** Adds a voucher under the next number: For Approval, or approved by the CEO who saved it. */
function addVoucher(s: TerminalState, v: Voucher, ctx: Ctx, approvedBy?: string): Change<Voucher> {
  const saved: Voucher = { ...v, no: nextVoucherNo(s), status: approvedBy ? 'Approved' : 'For Approval' };
  const routed = approvedBy ? `saved and approved by ${approvedBy}` : 'saved and routed for approval';

  return {
    state: logged({ ...s, cv: [...s.cv, saved] }, TAG, `${saved.no} for ${nameOf(s, v.payee)} ${routed} (${peso(voucherTotal(saved))}).`, ctx),
    record: saved, message: `${saved.no} ${approvedBy ? 'saved and approved' : 'saved and routed for approval'}.`,
  };
}

/**
 * Saves a voucher. A draft loaded from the register updates that voucher while it is
 * still For Approval, or only its check while it is approved; `asNew` (or a voucher
 * released or void) saves a copy under the next number. A new voucher waits for
 * approval, unless the CEO saves it: theirs is approved as it is saved.
 */
export function saveVoucher(s: TerminalState, d: VoucherDraft, ctx: Ctx, asNew = false): Change<Voucher> {
  const v = checkedVoucher(d);
  const original = d.editing ? s.cv.find((x) => x.no === d.editing) : undefined;

  if (original && !asNew && takesCheck(original)) {
    const updated = withCheck(original, d);
    const dated = updated.checkDate ? `, dated ${shortDate(updated.checkDate)}` : '';

    if (updated.check === original.check && updated.checkDate === original.checkDate) return { state: s, record: original, message: `${original.no} is unchanged.` };

    return {
      state: logged({ ...s, cv: s.cv.map((x) => (x.no === original.no ? updated : x)) }, TAG, updated.check ? `${updated.no} check ${updated.check} entered${dated}.` : `${updated.no} check number cleared.`, ctx),
      record: updated, message: `${updated.no} updated.`,
    };
  }

  if (original && !asNew) {
    const lock = voucherLock(original);

    if (lock) throw new KeystoneError(lock);

    const updated = { ...v, no: original.no, status: original.status };

    return {
      state: logged({ ...s, cv: s.cv.map((x) => (x.no === original.no ? updated : x)) }, TAG, `${updated.no} for ${nameOf(s, v.payee)} edited (${peso(voucherTotal(v))}).`, ctx),
      record: updated, message: `${updated.no} updated.`,
    };
  }

  return addVoucher(s, v, ctx, approvesOnSave(ctx) ? ctx.who?.name : undefined);
}

/**
 * Moves a voucher along For Approval → Approved → Released. Approval can be taken back
 * until the check is released; after that the voucher can only be voided, and a void
 * voucher stays void.
 */
export function setVoucherStatus(s: TerminalState, no: string, status: VoucherStatus, ctx: Ctx): Change<Voucher> {
  const v = s.cv.find((x) => x.no === no);

  if (!v) throw new KeystoneError(`${no} is not in the register.`);

  if (v.status === status) return { state: s, record: v, message: `${no} is already ${status.toLowerCase()}.` };

  if (v.status === 'Void') throw new KeystoneError(`${no} is void and stays void.`);

  if (v.status === 'Released' && status !== 'Void') throw new KeystoneError(`${no} is released and stays released. Void it if the check is cancelled.`);

  if (status === 'Released' && v.status !== 'Approved') throw new KeystoneError(`Approve ${no} before releasing it.`);

  if (status === 'Released' && !v.check) throw new KeystoneError(`Enter the check number on ${no} before releasing it.`);
  const updated = { ...v, status };

  const text = status === 'Approved' ? `${no} approved by ${v.approved || 'the approver'}.`
    : status === 'Released' ? `${no} released; check ${v.check} to ${nameOf(s, v.payee)}.`
    : status === 'Void' ? `${no} voided (${peso(voucherTotal(v))}).`
    : `${no} returned for approval.`;

  return {
    state: logged({ ...s, cv: s.cv.map((x) => (x.no === no ? updated : x)) }, TAG, text, ctx),
    record: updated, message: `${no} marked ${status.toLowerCase()}.`,
  };
}

/**
 * The vouchers.drafts service (SERVICES.voucherDrafts): a voucher for spending approved elsewhere, saved For Approval
 * with one particular and no check yet, even when the CEO's decision drafts it. Accounting completes it and adds the
 * check, and it is approved as usual.
 */
export const voucherDrafts: VoucherDrafts = {
  draft: (s, r, ctx) => {
    const payee = recordOf(s, r.payee);

    if (!payee) throw new KeystoneError('Choose a payee from the directory.');

    return addVoucher(s, checkedVoucher({ ...newVoucher(s, ctx), payee: payee.name, address: payee.detail, lines: [lineDraft({ desc: r.particulars, amount: String(r.amount) })] }), ctx);
  },
};

// ---------- what the vouchers domain tells Overview and Home ----------

/** The sentence under the screen's title: the vouchers waiting for approval, or that none are. */
export const voucherLine = (s: TerminalState) => voucherFinding(s)?.text ?? 'Every voucher is signed. Record a disbursement and route it for signatures.';

export function voucherFigure(s: TerminalState): Figure {
  const pending = awaitingApproval(s);

  return { label: 'Vouchers awaiting approval', value: String(pending.length), caption: `${peso(sumCentavos(pending, voucherTotal))} pending signature` };
}

export function voucherFinding(s: TerminalState): Finding | null {
  const pending = awaitingApproval(s);

  if (!pending.length) return null;

  return { priority: 20, text: `${count(pending.length, 'voucher')} worth ${peso(sumCentavos(pending, voucherTotal))} ${pending.length === 1 ? 'waits' : 'wait'} for approval.` };
}

export function voucherWaiting(s: TerminalState): WaitingItem[] {
  return awaitingApproval(s).map((v) => ({
    no: v.no, who: `${nameOf(s, v.payee)} · voucher`, amount: voucherTotal(v), status: v.status, tone: voucherTone(v.status), rank: 0,
  }));
}
