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
    if (original.status !== 'For Approval') {
      throw new KeystoneError(`${original.no} is ${original.status.toLowerCase()} and can no longer be changed. Save it as a new voucher instead.`);
    }

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

// ---------- what the vouchers domain tells Overview and Home ----------

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
