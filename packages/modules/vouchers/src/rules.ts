import {
  addDays, changeEach, companyOf, count, isOwner, KeystoneError, lineDraft, lineDraftOf, lineItemsOf, logged, nameOf, newestFirst, nextNumber,
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
export const refersTo: Reference = { tag: TAG, codes: (s) => s.cv.map((v) => v.payee) };

/** Voucher numbers run 888-001, 888-002 and on, with no year. */
const SERIES = '888-';

/**
 * The next voucher number in the 888- series: one past the highest still in the register, so deleting the last
 * vouchers brings the count back down and their numbers are given out again. Older vouchers (CV-2026-0141, 8888-001)
 * keep theirs and do not count.
 */
export const nextVoucherNo = (s: TerminalState) => nextNumber(s.cv.flatMap((v) => (v.no.startsWith(SERIES) ? [v.no] : [])), SERIES, 3);

/** Whether deleting this voucher gives its number back: it is the highest of the series left. */
export const freesNumber = (s: TerminalState, no: string) => nextVoucherNo({ ...s, cv: s.cv.filter((v) => v.no !== no) }) === no;

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
  return capsDraft(blankVoucher(s, ctx, bank));
}

/** The draft with its names in capitals, as the form shows them. */
const capsDraft = (d: VoucherDraft): VoucherDraft => ({ ...d, ...Object.fromEntries(NAMED.map((k) => [k, caps(d[k])])) });

function blankVoucher(s: TerminalState, ctx: Ctx, bank: string): VoucherDraft {
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

export const voucherDraftOf = (s: TerminalState, v: Voucher): VoucherDraft => capsDraft({
  editing: v.no, no: v.no, date: v.date, payee: payeeOf(s, v).name, address: payeeOf(s, v).address, tin: v.tin ?? '', check: v.check, checkDate: v.checkDate ?? '',
  bank: v.bank ?? '', issuer: v.issuer ?? '',
  lines: v.lines.map(lineDraftOf), prepared: v.prepared, checked: v.checked, approved: v.approved,
  preparedPos: v.preparedPos ?? '', checkedPos: v.checkedPos ?? '', approvedPos: v.approvedPos ?? '',
});

/**
 * Why a voucher can no longer be changed, or null while it can: For Approval or Approved, until its check is released.
 * An approved voucher stays open so a mistake on it can still be put right (saveVoucher says what that does to its
 * approval). Released or void, a change goes on a new voucher.
 */
export function voucherLock(v: Voucher): string | null {
  if (v.status === 'For Approval' || v.status === 'Approved') return null;

  return `${v.no} is ${v.status.toLowerCase()} and can no longer be changed. Copy it to a new voucher to change it.`;
}

/** Whether a voucher saved by whoever is signed in is approved as it is saved: the CEO's are; everyone else's wait for approval. */
export const approvesOnSave = (ctx: Ctx) => isOwner(ctx.who);

/** A new voucher drafted from another: its payee, particulars and signatories, under the next number, dated today, with no check yet. */
export function copyVoucher(s: TerminalState, v: Voucher, ctx: Ctx): VoucherDraft {
  const d = voucherDraftOf(s, v);

  return {
    no: nextVoucherNo(s), date: today(ctx), payee: d.payee, address: d.address, tin: d.tin, check: '', checkDate: '', bank: d.bank, issuer: d.issuer,
    lines: d.lines, prepared: d.prepared, checked: d.checked, approved: d.approved,
    preparedPos: d.preparedPos, checkedPos: d.checkedPos, approvedPos: d.approvedPos,
  };
}

/** The names on a voucher, all in capitals as typed and as printed: the payee, the issuer and the signatories. */
export const NAMED = ['payee', 'issuer', 'prepared', 'checked', 'approved'] as const;

/** A name as a voucher keeps and prints it: in capitals. */
export const caps = (name: string) => name.toUpperCase();

/** The optional fields a voucher keeps only when they are filled in. */
const OPTIONAL = ['address', 'tin', 'bank', 'issuer', 'preparedPos', 'checkedPos', 'approvedPos'] as const;

export function voucherOf(d: VoucherDraft, status: VoucherStatus = 'For Approval'): Voucher {
  const v: Voucher = {
    no: d.no, date: d.date, payee: caps(d.payee.trim()), check: d.check.trim(), lines: lineItemsOf(d.lines, 'amount'),
    status, prepared: caps(d.prepared), checked: caps(d.checked), approved: caps(d.approved),
  };

  if (d.checkDate) v.checkDate = d.checkDate;

  for (const key of OPTIONAL) {
    const value = key === 'issuer' ? caps(d[key].trim()) : d[key].trim();

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
 * A voucher as the form would save it back, as a list of its fields in one order, without its check: to tell whether
 * only the check changed. Read back through the form, a voucher saved before names were in capitals counts as unchanged.
 */
function withoutCheck(s: TerminalState, v: Voucher): string {
  const saved = { ...voucherOf(voucherDraftOf(s, v)), no: v.no, status: v.status, check: '', checkDate: '' };

  return JSON.stringify(Object.entries(saved).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Whether saving `d` over the approved voucher it was loaded from sends it back for approval: a change beyond the check
 * number and date of check (written once approved), saved by anyone but the CEO.
 */
export function returnsForApproval(s: TerminalState, d: VoucherDraft, ctx: Ctx): boolean {
  const original = d.editing ? s.cv.find((x) => x.no === d.editing) : undefined;

  if (original?.status !== 'Approved' || approvesOnSave(ctx)) return false;

  return withoutCheck(s, { ...voucherOf(d, 'Approved'), no: original.no }) !== withoutCheck(s, original);
}

/**
 * Saves a voucher. A draft loaded from the register updates that voucher while it is For Approval or Approved; `asNew`
 * saves a copy under the next number. An approved voucher keeps its approval when only its check is written in, or when
 * the CEO edits it; any other change goes back for approval, so what is approved is what the CEO saw. A new voucher waits for approval, unless the
 * CEO saves it: theirs is approved as it is saved.
 */
export function saveVoucher(s: TerminalState, d: VoucherDraft, ctx: Ctx, asNew = false): Change<Voucher> {
  const v = checkedVoucher(d);
  const original = d.editing ? s.cv.find((x) => x.no === d.editing) : undefined;

  if (original && !asNew) {
    const lock = voucherLock(original);

    if (lock) throw new KeystoneError(lock);

    const returned = returnsForApproval(s, d, ctx);
    const updated: Voucher = { ...v, no: original.no, status: returned ? 'For Approval' : original.status };

    if (original.status === 'Approved' && withoutCheck(s, updated) === withoutCheck(s, original)) return checkWritten(s, original, updated, ctx);
    const after = returned ? ' after approval, and returned for approval' : original.status === 'Approved' ? ' after approval' : '';

    return {
      state: logged({ ...s, cv: s.cv.map((x) => (x.no === original.no ? updated : x)) }, TAG, `${updated.no} for ${nameOf(s, v.payee)} edited${after} (${peso(voucherTotal(v))}).`, ctx),
      record: updated, message: returned ? `${updated.no} updated and returned for approval.` : `${updated.no} updated.`,
    };
  }

  return addVoucher(s, v, ctx, approvesOnSave(ctx) ? ctx.who?.name : undefined);
}

/** An approved voucher with only its check number or date of check changed: it stays approved. */
function checkWritten(s: TerminalState, original: Voucher, updated: Voucher, ctx: Ctx): Change<Voucher> {
  if (updated.check === original.check && updated.checkDate === original.checkDate) return { state: s, record: original, message: `${original.no} is unchanged.` };
  const dated = updated.checkDate ? `, dated ${shortDate(updated.checkDate)}` : '';

  return {
    state: logged({ ...s, cv: s.cv.map((x) => (x.no === original.no ? updated : x)) }, TAG, updated.check ? `${updated.no} check ${updated.check} entered${dated}.` : `${updated.no} check number cleared.`, ctx),
    record: updated, message: `${updated.no} updated.`,
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
  const updated: Voucher = { ...v, status };

  if (status === 'Released') updated.released = today(ctx);

  if (status === 'Void') updated.voided = today(ctx);

  const text = status === 'Approved' ? `${no} approved by ${v.approved || 'the approver'}.`
    : status === 'Released' ? `${no} released; check ${v.check} to ${nameOf(s, v.payee)}.`
    : status === 'Void' ? `${no} voided (${peso(voucherTotal(v))}).`
    : `${no} returned for approval.`;

  return {
    state: logged({ ...s, cv: s.cv.map((x) => (x.no === no ? updated : x)) }, TAG, text, ctx),
    record: updated, message: `${no} marked ${status.toLowerCase()}.`,
  };
}

// ---------- clearing void vouchers, and folding older ones away ----------

/** Days a void voucher stays in the register after it is voided, before it is cleared on its own. */
export const VOID_KEPT_DAYS = 7;

/** The day a void voucher is cleared from the register: VOID_KEPT_DAYS after it was voided (its date, if older). */
export const clearsOn = (v: Voucher) => addDays(v.voided ?? v.date, VOID_KEPT_DAYS);

/** The state without these vouchers. */
function withoutVouchers(s: TerminalState, gone: Voucher[]): TerminalState {
  const nos = new Set(gone.map((v) => v.no));

  return { ...s, cv: s.cv.filter((v) => !nos.has(v.no)) };
}

/**
 * The state without the highest deleted number an earlier build kept under state.ext.vouchers to hold numbers back.
 * Numbering follows the register now, so it is dropped, from the cloud too.
 */
export function withoutHeldNumber(s: TerminalState): TerminalState {
  if (!s.ext || !(ID in s.ext)) return s;
  const ext = { ...s.ext };

  delete ext[ID];

  return { ...s, ext };
}

/** Deletes a void voucher from the register now. Only a void one: every other voucher is a record of money paid or owed. */
export function deleteVoucher(s: TerminalState, no: string, ctx: Ctx): Change<Voucher> {
  const v = s.cv.find((x) => x.no === no);

  if (!v) throw new KeystoneError(`${no} is not in the register.`);

  if (v.status !== 'Void') throw new KeystoneError(`Only a void voucher can be deleted. Void ${no} first.`);

  return {
    state: logged(withoutVouchers(s, [v]), TAG, `${no} (void, ${peso(voucherTotal(v))}) deleted from the register.`, ctx),
    record: v, message: `${no} deleted.`,
  };
}

/** Deletes several void vouchers at once: every one, or none if any is not void. The numbering closes up behind them. */
export const deleteVouchers = (s: TerminalState, nos: readonly string[], ctx: Ctx): Change<Voucher[]> =>
  changeEach(s, nos, (st, no) => deleteVoucher(st, no, ctx), (vs) => `${count(vs.length, 'void voucher')} deleted.`);

/** Whether a voucher can be moved to `status` as it stands: the order setVoucherStatus keeps, the check aside. */
export function canMoveTo(v: Voucher, status: VoucherStatus): boolean {
  if (v.status === status || v.status === 'Void') return false;

  if (v.status === 'Released') return status === 'Void';

  return status !== 'Released' || v.status === 'Approved';
}

/** Moves several vouchers to one status at once: every one, or none if any is refused (its own sentence). */
export const setVouchersStatus = (s: TerminalState, nos: readonly string[], status: VoucherStatus, ctx: Ctx): Change<Voucher[]> =>
  changeEach(s, nos, (st, no) => setVoucherStatus(st, no, status, ctx), (vs) => `${count(vs.length, 'voucher')} marked ${status.toLowerCase()}.`);

/** On open: drops a number held back by an earlier build, and clears every void voucher VOID_KEPT_DAYS after it was voided, in one log line. */
export function clearVoided(open: TerminalState, ctx: Ctx): TerminalState {
  const s = withoutHeldNumber(open);
  const t = today(ctx);
  const due = s.cv.filter((v) => v.status === 'Void' && clearsOn(v) <= t);

  if (!due.length) return s;

  return logged(withoutVouchers(s, due), TAG, `${count(due.length, 'void voucher')} cleared from the register, ${VOID_KEPT_DAYS} days after voiding: ${due.map((v) => v.no).join(', ')}.`, ctx);
}

/** The month a released voucher folds away after: the month it was released in, or its own month if older. */
const releasedIn = (v: Voucher) => (v.released ?? v.date).slice(0, 7);

/** One earlier month's released vouchers, folded into a dropdown. */
export interface VoucherMonth { month: string; label: string; vouchers: Voucher[]; total: Centavos }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October 2026" for "2026-10". */
const monthLabel = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** The register as the screen shows it: see voucherRegister. */
export interface VoucherRegister { current: Voucher[]; earlier: VoucherMonth[] }

/**
 * The register, newest first, in two parts, so it does not grow without end. `earlier`: each voucher released before
 * this month, under the month it is dated, newest month first, each month folded into a dropdown. `current`: the rest,
 * every voucher still waiting for approval or release, every one released this month, and every void one until it is
 * cleared (VOID_KEPT_DAYS).
 */
export function voucherRegister(s: TerminalState, ctx: Ctx): VoucherRegister {
  const thisMonth = today(ctx).slice(0, 7);
  const current: Voucher[] = [];
  const months = new Map<string, Voucher[]>();

  for (const v of vouchersNewestFirst(s)) {
    const month = v.date.slice(0, 7);

    if (v.status !== 'Released' || releasedIn(v) >= thisMonth) current.push(v);
    else months.set(month, [...(months.get(month) ?? []), v]);
  }

  const earlier = [...months].sort(([a], [b]) => b.localeCompare(a))
    .map(([month, vouchers]) => ({ month, label: monthLabel(month), vouchers, total: sumCentavos(vouchers, voucherTotal) }));

  return { current, earlier };
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
