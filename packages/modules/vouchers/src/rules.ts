import {
  companyOf, count, KeystoneError, lineDraft, lineDraftOf, lineItemsOf, logged, nameOf, newestFirst, nextNumber, payees,
  peso, recordOf, sumCentavos, toCentavos, today, toneOf, type Centavos, type Change, type Ctx,
  type Editing, type Figure, type Finding, type LineDraft, type TerminalState, type Voucher, type VoucherDrafts,
  type VoucherStatus, type WaitingItem
} from '@keystone/core';

// Check vouchers: disbursements routed for signatures, printed as the company's
// Check Voucher. Reads the directory for payees.

export const voucherTotal = (v: Pick<Voucher, 'lines'>): Centavos => sumCentavos(v.lines, (l) => toCentavos(l.amt));
export const vouchersNewestFirst = (s: TerminalState) => newestFirst(s.cv);

/** Voucher numbers run 888-001, 888-002 and on, with no year. */
const SERIES = '888-';

/** The next voucher number in the 888- series. Older vouchers (CV-2026-0141, 8888-001) keep theirs and do not count. */
export const nextVoucherNo = (s: TerminalState) => nextNumber(s.cv.flatMap((v) => (v.no.startsWith(SERIES) ? [v.no] : [])), SERIES, 3);
export const awaitingApproval = (s: TerminalState) => s.cv.filter((v) => v.status === 'For Approval');

export interface VoucherDraft extends Editing {
  no: string; date: string; payee: string;
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
 * The TIN starts blank: it prints only when someone types it.
 */
export function newVoucher(s: TerminalState, ctx: Ctx, bank = ''): VoucherDraft {
  const d = companyOf(s);
  const last = s.cv.at(-1);

  return {
    no: nextVoucherNo(s), date: today(ctx), payee: payees(s)[0]?.code ?? '', tin: '', check: '', checkDate: '',
    bank: last?.bank || bank, issuer: last?.issuer ?? '',
    lines: [lineDraft()], prepared: ctx.who?.name ?? last?.prepared ?? d.preparedBy, checked: last?.checked ?? d.checkedBy,
    approved: last?.approved ?? d.approvedBy,
    preparedPos: last?.preparedPos ?? '', checkedPos: last?.checkedPos ?? '', approvedPos: last?.approvedPos ?? '',
  };
}

export const voucherDraftOf = (v: Voucher): VoucherDraft => ({
  editing: v.no, no: v.no, date: v.date, payee: v.payee, tin: v.tin ?? '', check: v.check, checkDate: v.checkDate ?? '',
  bank: v.bank ?? '', issuer: v.issuer ?? '',
  lines: v.lines.map(lineDraftOf), prepared: v.prepared, checked: v.checked, approved: v.approved,
  preparedPos: v.preparedPos ?? '', checkedPos: v.checkedPos ?? '', approvedPos: v.approvedPos ?? '',
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
    no: nextVoucherNo(s), date: today(ctx), payee: d.payee, tin: d.tin, check: '', checkDate: '', bank: d.bank, issuer: d.issuer,
    lines: d.lines, prepared: d.prepared, checked: d.checked, approved: d.approved,
    preparedPos: d.preparedPos, checkedPos: d.checkedPos, approvedPos: d.approvedPos,
  };
}

/** The optional fields a voucher keeps only when they are filled in. */
const OPTIONAL = ['tin', 'bank', 'issuer', 'preparedPos', 'checkedPos', 'approvedPos'] as const;

export function voucherOf(d: VoucherDraft, status: VoucherStatus = 'For Approval'): Voucher {
  const v: Voucher = {
    no: d.no, date: d.date, payee: d.payee, check: d.check.trim(), lines: lineItemsOf(d.lines, 'amount'),
    status, prepared: d.prepared, checked: d.checked, approved: d.approved,
  };

  if (d.checkDate) v.checkDate = d.checkDate;

  for (const key of OPTIONAL) {
    const value = d[key].trim();

    if (value) v[key] = value;
  }

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

  const saved = { ...v, no: nextVoucherNo(s) };

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

/**
 * The vouchers.drafts service (SERVICES.voucherDrafts): a voucher for spending approved elsewhere, saved For Approval
 * like any other, with one particular and no check yet. Accounting adds the check and it is approved as usual.
 */
export const voucherDrafts: VoucherDrafts = {
  draft: (s, r, ctx) => saveVoucher(s, { ...newVoucher(s, ctx), payee: r.payee, lines: [lineDraft({ desc: r.particulars, amount: String(r.amount) })] }, ctx),
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
    no: v.no, who: `${nameOf(s, v.payee)} · voucher`, amount: voucherTotal(v), status: v.status, tone: toneOf(v.status), rank: 0,
  }));
}
