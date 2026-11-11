import {
  count, KeystoneError, lineDraft, lineDraftOf, lineItemsOf, logged, nameOf, newestFirst, nextNumber, payees,
  peso, recordOf, sumCentavos, thisYear, toCentavos, today, toneOf, type Centavos, type Change, type Ctx,
  type Editing, type Figure, type Finding, type LineDraft, type TerminalState, type Voucher,
  type VoucherStatus, type WaitingItem
} from '@keystone/core';

// Check vouchers: disbursements routed for signatures, printed as the company's
// Disbursement Voucher. Reads the directory for payees.

export const voucherTotal = (v: Pick<Voucher, 'lines'>): Centavos => sumCentavos(v.lines, (l) => toCentavos(l.amt));
export const vouchersNewestFirst = (s: TerminalState) => newestFirst(s.cv);
export const nextVoucherNo = (s: TerminalState, ctx: Ctx) => nextNumber(s.cv.map((v) => v.no), `CV-${thisYear(ctx)}-`);
export const awaitingApproval = (s: TerminalState) => s.cv.filter((v) => v.status === 'For Approval');

export interface VoucherDraft extends Editing {
  no: string; date: string; payee: string; check: string; checkDate: string;
  lines: LineDraft[]; prepared: string; checked: string; approved: string;
}

export function newVoucher(s: TerminalState, ctx: Ctx): VoucherDraft {
  const d = ctx.seed.reference.defaults;

  return {
    no: nextVoucherNo(s, ctx), date: today(ctx), payee: payees(s)[0]?.code ?? '', check: '', checkDate: '',
    lines: [lineDraft()], prepared: d.preparedBy, checked: d.checkedBy, approved: d.approvedBy,
  };
}

export const voucherDraftOf = (v: Voucher): VoucherDraft => ({
  editing: v.no, no: v.no, date: v.date, payee: v.payee, check: v.check, checkDate: v.checkDate ?? '',
  lines: v.lines.map(lineDraftOf), prepared: v.prepared, checked: v.checked, approved: v.approved,
});

/**
 * Why a voucher can no longer be changed, or null while it is still For Approval. Once
 * approved, the voucher prints as it was approved; a change goes on a new voucher.
 */
export function voucherLock(v: Voucher): string | null {
  return v.status === 'For Approval' ? null : `${v.no} is ${v.status.toLowerCase()} and can no longer be changed. Copy it to a new voucher to change it.`;
}

/** A new voucher drafted from another: its payee, particulars and signatories, under the next number, dated today, with no check yet. */
export function copyVoucher(s: TerminalState, v: Voucher, ctx: Ctx): VoucherDraft {
  const d = voucherDraftOf(v);

  return {
    no: nextVoucherNo(s, ctx), date: today(ctx), payee: d.payee, check: '', checkDate: '',
    lines: d.lines, prepared: d.prepared, checked: d.checked, approved: d.approved,
  };
}

export function voucherOf(d: VoucherDraft, status: VoucherStatus = 'For Approval'): Voucher {
  const v: Voucher = {
    no: d.no, date: d.date, payee: d.payee, check: d.check.trim(), lines: lineItemsOf(d.lines, 'amount'),
    status, prepared: d.prepared, checked: d.checked, approved: d.approved,
  };

  if (d.checkDate) v.checkDate = d.checkDate;

  return v;
}

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
    const lock = voucherLock(original);

    if (lock) throw new KeystoneError(lock);

    const updated = { ...v, no: original.no, status: original.status };

    return {
      state: logged({ ...s, cv: s.cv.map((x) => (x.no === original.no ? updated : x)) }, 'CV', `${updated.no} for ${nameOf(s, v.payee)} edited (${peso(total)}).`, ctx),
      record: updated, message: `${updated.no} updated.`,
    };
  }

  const saved = { ...v, no: nextVoucherNo(s, ctx) };

  return {
    state: logged({ ...s, cv: [...s.cv, saved] }, 'CV', `${saved.no} for ${nameOf(s, v.payee)} saved and routed for approval (${peso(total)}).`, ctx),
    record: saved, message: `${saved.no} saved and routed for approval.`,
  };
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
    state: logged({ ...s, cv: s.cv.map((x) => (x.no === no ? updated : x)) }, 'CV', text, ctx),
    record: updated, message: `${no} marked ${status.toLowerCase()}.`,
  };
}

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
    no: v.no, who: `${nameOf(s, v.payee)} · voucher`, amount: voucherTotal(v), status: v.status, tone: toneOf(v.status), rank: 0,
  }));
}
