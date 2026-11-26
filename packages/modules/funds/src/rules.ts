import {
  addDays, changeEach, count, isISODate, isJsonObject, isOwner, jsonNumber, jsonObjects, jsonText, KeystoneError, lineDraft, lineDraftOf, linesBlank, linesFromDraft, logged,
  moduleData, nameOf, newestFirst, nextNumber, parseAmount, payees, peso, recordOf, shortDate, stamp, sumCentavos, thisYear,
  toCentavos, toPesos, today, withModuleData, type Centavos, type Change, type Ctx, type Editing, type Figure, type Finding,
  type ISODate, type JsonObject, type JsonValue, type LineDraft, type RecordDocuments, type Reference, type TerminalState, type Tone,
  type VoucherDrafts, type WaitingItem,
} from '@keystone/core';

// Requests for funds (docs/adr/0011, 0021): staff list the expenses they need money for, the CEO approves or
// declines, and an approval either makes the fund transfer request, for a transfer to the account the request names,
// or drafts the check voucher through Check Vouchers' service. Only the CEO, signed in to the records in the cloud,
// decides; firestore.rules holds the same line. Every member reads every request (0051). Once approved, the
// requester uploads the receipts or other proof of what the money paid for, and that marks the request paid (0050).

/** This module's id, written once: its route, its ModuleDef.id, its key under state.ext and its draft key. */
export const ID = 'funds';
export const TAG = 'RF';

export const REQUEST_STATUSES = ['For Approval', 'Approved', 'Paid', 'Declined', 'Withdrawn'] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

const TONES: Record<RequestStatus, Tone> = { 'For Approval': 'warn', Approved: 'good', Paid: 'good', Declined: 'bad', Withdrawn: 'neutral' };

export const requestTone = (s: RequestStatus): Tone => TONES[s];

/**
 * A request's transaction state, as the register shows it: the CEO's decision. Pending until the CEO decides, then
 * Processing once approved, paid or not; a declined or withdrawn request says so. The saved status is unchanged.
 */
const STATES: Record<RequestStatus, string> = { 'For Approval': 'Pending', Approved: 'Processing', Paid: 'Processing', Declined: 'Declined', Withdrawn: 'Withdrawn' };

export const transactionState = (s: RequestStatus): string => STATES[s];

/**
 * Whether the money is accounted for: Paid once its requester uploads the receipts (docs/adr/0050), Pending until then,
 * and null for a request that will never be paid, declined or withdrawn.
 */
export function paymentStatus(s: RequestStatus): { label: 'Paid' | 'Pending'; tone: Tone } | null {
  if (s === 'Paid') return { label: 'Paid', tone: 'good' };

  return s === 'For Approval' || s === 'Approved' ? { label: 'Pending', tone: 'warn' } : null;
}

/** The deadline: as soon as possible, or a date. */
export const ASAP = 'ASAP';

/** The CEO's answer. */
export type Decision = {
  /** The CEO's name, as on their member document. */
  by: string;
  uid: string;
  /** Local time, "yyyy-MM-dd HH:mm". */
  at: string;
  note?: string;
}

/** How an approved request is paid: by a bank transfer to an account, or by a check to a payee in the directory. */
const PAY_METHODS = ['transfer', 'check'] as const;

export type PayMethod = (typeof PAY_METHODS)[number];

/** One expense a request lists: what it is, and its amount in pesos. A line as a voucher has one. */
export type Expense = { desc: string; amt: number };

/** The account a transfer goes to, as the requester typed it. */
export type TransferAccount = {
  bank: string;
  /** Optional. */
  branch: string;
  /** The account name, as the bank holds it. */
  name: string;
  /** As printed: "0012 3456 7890". */
  number: string;
}

/** A receipt, or other proof of what an approved request paid for: the file's name, and the file as a data URL. */
export type Receipt = { name: string; data: string };

/**
 * The most the receipts of one request may come to, in characters of their data URLs. A request is one document in the
 * cloud, its body under 900,000 characters, and the rest of it is a few thousand (docs/adr/0050).
 */
export const RECEIPTS_MOST = 700_000;

/** The kinds of file a receipt may be: a photo, or a PDF. */
export const RECEIPT_TYPES = ['data:image/jpeg;', 'data:image/png;', 'data:image/webp;', 'data:application/pdf;'] as const;

export type FundsRequest = {
  no: string;
  /** The day it was filed. */
  date: ISODate;
  /** What the money is for, in a line. */
  purpose: string;
  /** The expenses it covers, each a description and its amount. Requests filed before 0021 have none. */
  lines: Expense[];
  /** Pesos: the expenses' total. */
  amount: number;
  /** Requests filed before 0021 are checks. */
  pay: PayMethod;
  /** Transfers: the account to transfer to. */
  account?: TransferAccount;
  /** Checks: directory code of the payee. */
  payee: string;
  /** The deadline: ASAP, or the date it must be paid by. */
  settle: string;
  /** Who asked, by name. */
  requester: string;
  /** Who asked, when they were signed in to the cloud: only they and the CEO may read it there. */
  uid?: string;
  status: RequestStatus;
  decision?: Decision;
  /** Checks: the voucher drafted when it was approved. */
  voucher?: string;
  /** Paid: the receipts or other proof its requester uploaded. */
  receipts?: Receipt[];
  /** Paid: when its requester uploaded them, local time, "yyyy-MM-dd HH:mm". */
  paid?: string;
}

export type FundsData = {
  requests: FundsRequest[];
  /**
   * The last number given out, kept in the module's shared document, so a number is never given twice even after a
   * request is removed. Before 0051 staff read only their own requests, and their lists could not say which was next.
   */
  last: string;
}

/**
 * In the cloud each request is its own document (keystone/apg/rf/{no}), with the fields the rules check beside it. Every
 * member reads every request (docs/adr/0051); only its requester changes it, and only the CEO decides it. Locally
 * nothing changes.
 */
export const requestDocuments: RecordDocuments = { collection: 'rf', list: 'requests', key: 'no', fields: ['status', 'uid', 'decision'] };

const statusOf = (v: JsonValue | undefined): RequestStatus => REQUEST_STATUSES.find((s) => s === v) ?? 'For Approval';

function accountOf(v: JsonValue | undefined): TransferAccount | undefined {
  if (!isJsonObject(v)) return undefined;

  return { bank: jsonText(v.bank), branch: jsonText(v.branch), name: jsonText(v.name), number: jsonText(v.number) };
}

function decisionOf(v: JsonObject): Decision | undefined {
  if (!isJsonObject(v.decision)) return undefined;
  const d = v.decision;
  const decision: Decision = { by: jsonText(d.by), uid: jsonText(d.uid), at: jsonText(d.at) };

  if (jsonText(d.note)) decision.note = jsonText(d.note);

  return decision;
}

/** The module's data, read leniently: a record that is damaged or from an older build reads as what it can. */
export function dataOf(s: TerminalState): FundsData {
  const raw = moduleData(s, ID);

  if (!isJsonObject(raw)) return { requests: [], last: '' };

  const requests = jsonObjects(raw.requests).map((r): FundsRequest => {
    const request: FundsRequest = {
      no: jsonText(r.no), date: jsonText(r.date), purpose: jsonText(r.purpose),
      lines: jsonObjects(r.lines).map((l) => ({ desc: jsonText(l.desc), amt: jsonNumber(l.amt) })), amount: jsonNumber(r.amount),
      pay: r.pay === 'transfer' ? 'transfer' : 'check', payee: jsonText(r.payee), settle: jsonText(r.settle) || ASAP,
      requester: jsonText(r.requester), status: statusOf(r.status),
    };

    const decision = decisionOf(r);
    const account = request.pay === 'transfer' ? accountOf(r.account) : undefined;

    if (account) request.account = account;

    if (jsonText(r.uid)) request.uid = jsonText(r.uid);

    if (decision) request.decision = decision;

    if (jsonText(r.voucher)) request.voucher = jsonText(r.voucher);
    const receipts = jsonObjects(r.receipts).map((x) => ({ name: jsonText(x.name), data: jsonText(x.data) })).filter((x) => x.data);

    if (receipts.length) request.receipts = receipts;

    if (jsonText(r.paid)) request.paid = jsonText(r.paid);

    return request;
  });

  return { requests, last: jsonText(raw.last) };
}

const saved = (s: TerminalState, data: FundsData) => withModuleData(s, ID, {
  requests: data.requests.map((r) => ({
    ...r, lines: r.lines.map((l) => ({ ...l })), ...(r.account && { account: { ...r.account } }), ...(r.receipts && { receipts: r.receipts.map((x) => ({ ...x })) }),
  })),
  last: data.last,
});

export const requestsNewestFirst = (s: TerminalState) => newestFirst(dataOf(s).requests);
export const requestOf = (s: TerminalState, no: string) => dataOf(s).requests.find((r) => r.no === no);

/** A request paid by check names its payee by directory code; that record is kept. Every member reads every request. */
export const refersTo: Reference = { tag: TAG, codes: (s) => dataOf(s).requests.map((r) => r.payee) };
export const requestTotal = (r: Pick<FundsRequest, 'amount'>): Centavos => toCentavos(r.amount);

/** The expenses a request lists; one filed before it listed them is its purpose for its amount. */
export const expensesOf = (r: Pick<FundsRequest, 'lines' | 'purpose' | 'amount'>): Expense[] => (r.lines.length ? r.lines : [{ desc: r.purpose, amt: r.amount }]);

/** How an account reads in a sentence or a list: "BDO · Liza Ramos · 0012 3456 7890". */
export const accountLabel = (a: TransferAccount) => [a.bank, a.name, a.number].join(' · ');

/** Whether the request's fund transfer request can be printed and saved: a transfer, once the CEO approved it. */
export const transferReady = (r: FundsRequest) => r.pay === 'transfer' && (r.status === 'Approved' || r.status === 'Paid');

/** The next number after the highest given out: RF-2026-0003. */
export function nextRequestNo(s: TerminalState, ctx: Ctx): string {
  const data = dataOf(s);

  return nextNumber([...data.requests.map((r) => r.no), data.last], `RF-${thisYear(ctx)}-`);
}

/** Waiting for the CEO, the ones to settle as soon as possible first, then by the date they are needed. */
export function waitingRequests(s: TerminalState): FundsRequest[] {
  const key = (r: FundsRequest) => (r.settle === ASAP ? '' : r.settle);

  return dataOf(s).requests.filter((r) => r.status === 'For Approval').sort((a, b) => key(a).localeCompare(key(b)) || a.no.localeCompare(b.no));
}

/** "ASAP" or "Dec 15, 2026". */
export const settleText = (r: Pick<FundsRequest, 'settle'>) => (r.settle === ASAP ? 'ASAP' : shortDate(r.settle));

// ---------- who may do what ----------

/** Whether this person decides requests: the CEO, signed in to the cloud. */
export const decides = (ctx: Ctx) => isOwner(ctx.who);

const SIGNED_OUT = 'Only the CEO approves or declines requests, signed in to APG\'s records in the cloud. This copy of Keystone keeps its records on this computer, where nobody signs in.';
const NOT_OWNER = 'Only the CEO approves or declines requests. The answer shows here once it is given.';

/** Why this person cannot decide requests, or null when they can. */
export const decideRefusal = (ctx: Ctx): string | null => (!ctx.who ? SIGNED_OUT : decides(ctx) ? null : NOT_OWNER);

/** Whether this person filed the request: always true locally, where nobody signs in. */
const filedBy = (r: FundsRequest, ctx: Ctx) => !ctx.who || r.uid === ctx.who.uid;

/** Why a request can no longer be changed by this person, or null while they may still edit or withdraw it. */
export function requestLock(r: FundsRequest, ctx: Ctx): string | null {
  if (r.status !== 'For Approval') return `${r.no} is ${r.status.toLowerCase()} and can no longer be changed.`;

  if (!filedBy(r, ctx)) return `Only ${r.requester || 'the person who filed it'} can change ${r.no}.`;

  return null;
}

// ---------- filing ----------

export interface RequestDraft extends Editing {
  purpose: string;
  /** The expenses, as typed. */
  lines: LineDraft[];
  pay: PayMethod;
  /** Checks: the payee's directory code. */
  payee: string;
  /** Transfers: the account, as typed. */
  account: TransferAccount;
  /** ASAP, or "date" to settle by `by`. */
  when: typeof ASAP | 'date';
  by: string;
  /** Who is asking, typed in when nobody is signed in. */
  requester: string;
}

const NO_ACCOUNT: TransferAccount = { bank: '', branch: '', name: '', number: '' };

/**
 * A blank request. It is paid as this person's last request was, by a transfer when they have filed none, and a
 * transfer starts with the account their last transfer went to: the fund they keep is topped up into the same account
 * each time, and nothing about it is built in (docs/adr/0018).
 */
export function newRequest(s: TerminalState, ctx: Ctx): RequestDraft {
  const mine = newestFirst(dataOf(s).requests).filter((r) => filedBy(r, ctx));
  const account = mine.find((r) => r.account)?.account;

  return {
    purpose: '', lines: [lineDraft()], pay: mine[0]?.pay ?? 'transfer',
    payee: mine.find((r) => r.pay === 'check' && recordOf(s, r.payee))?.payee ?? payees(s)[0]?.code ?? '',
    account: account ? { ...account } : { ...NO_ACCOUNT }, when: ASAP, by: '', requester: ctx.who?.name ?? '',
  };
}

/**
 * Nothing typed worth keeping as a draft (docs/adr/0041): a new request with nothing said of what it is for, and no
 * expense. One editing a saved request is never blank.
 */
export const requestDraftBlank = (d: RequestDraft) => !d.editing && !d.purpose.trim() && linesBlank(d.lines);

/** What the Drafts list calls a saved request draft: what the money is for, and how much so far. */
export const requestDraftTitle = (s: TerminalState, d: RequestDraft, ctx: Ctx) =>
  `${d.purpose.trim() || 'No purpose yet'} · ${peso(requestTotal(requestPreview(s, d, ctx)))}`;

/**
 * A saved draft back in the form (docs/adr/0041): what was saved over a new request, so a field it lacks starts as a new
 * one's does, with its expenses as typed. A request is numbered only when it is filed, so a draft never had a number.
 * Its drafts are private (`private` on useSavedDrafts): a request is read only by its requester and the CEO.
 */
export function requestDraftFrom(s: TerminalState, ctx: Ctx, saved: Partial<RequestDraft>): RequestDraft {
  const fresh = newRequest(s, ctx);

  return { ...fresh, ...saved, account: { ...fresh.account, ...saved.account }, lines: linesFromDraft(saved.lines) };
}

export const requestDraftOf = (r: FundsRequest): RequestDraft => ({
  editing: r.no, purpose: r.purpose, lines: expensesOf(r).map(lineDraftOf), pay: r.pay, payee: r.payee,
  account: r.account ? { ...r.account } : { ...NO_ACCOUNT }, when: r.settle === ASAP ? ASAP : 'date', by: r.settle === ASAP ? '' : r.settle,
  requester: r.requester,
});

/**
 * The expenses as typed, each with its amount. A line left blank is dropped; a line with only a description or only an
 * amount is refused, naming the line as the form numbers it.
 */
function expensesTyped(lines: LineDraft[]): Expense[] {
  const expenses = lines.flatMap((l, i) => {
    const desc = l.desc.trim();
    const amount = parseAmount(l.amount) ?? 0;

    if (!desc && !l.amount.trim()) return [];

    if (!desc) throw new KeystoneError(`Say what line ${i + 1} is for.`, `lines.${i}.desc`);

    if (amount <= 0) throw new KeystoneError(`Enter the amount for line ${i + 1}, ${desc}.`, `lines.${i}.amount`);

    return [{ desc, amt: toPesos(amount) }];
  });

  if (!expenses.length) throw new KeystoneError('List the expenses, each with its amount.', 'lines.0.desc');

  return expenses;
}

/** The account to transfer to, as typed, or the sentence that says what it is missing. */
function accountTyped(a: TransferAccount): TransferAccount {
  const account = { bank: a.bank.trim(), branch: a.branch.trim(), name: a.name.trim(), number: a.number.trim() };

  if (!account.bank) throw new KeystoneError('Enter the bank of the account to transfer to.', 'account.bank');

  if (!account.name) throw new KeystoneError('Enter the account name, as the bank holds it.', 'account.name');

  if (!/\d/.test(account.number)) throw new KeystoneError('Enter the account number to transfer to.', 'account.number');

  return account;
}

/**
 * The request as the form shows it now, for the fund transfer request's preview: nothing checked, and a line still
 * being typed shown as far as it goes.
 */
export function requestPreview(s: TerminalState, d: RequestDraft, ctx: Ctx): FundsRequest {
  const saved = d.editing ? requestOf(s, d.editing) : undefined;

  const lines = d.lines.flatMap((l) => {
    const amt = toPesos(parseAmount(l.amount) ?? 0);

    return l.desc.trim() || amt ? [{ desc: l.desc.trim(), amt }] : [];
  });

  return {
    no: saved?.no ?? nextRequestNo(s, ctx), date: saved?.date ?? today(ctx), purpose: d.purpose.trim(), lines,
    amount: toPesos(sumCentavos(lines, (l) => toCentavos(l.amt))), pay: d.pay, account: { ...d.account }, payee: d.payee,
    settle: d.when === 'date' ? d.by : ASAP, requester: ctx.who?.name ?? d.requester.trim(), status: saved?.status ?? 'For Approval',
  };
}

/**
 * Files a request For Approval, or saves changes to one still waiting. Signed in, the requester is the member; with
 * nobody signed in, the name typed. The activity log, which every member reads, names the request and who filed it,
 * never what it is for or how much.
 */
export function fileRequest(s: TerminalState, d: RequestDraft, ctx: Ctx): Change<FundsRequest> {
  const purpose = d.purpose.trim();
  const requester = ctx.who?.name ?? d.requester.trim();

  if (!purpose) throw new KeystoneError('Say what the money is for.', 'purpose');
  const lines = expensesTyped(d.lines);
  const account = d.pay === 'transfer' ? accountTyped(d.account) : undefined;

  if (d.pay === 'check' && !recordOf(s, d.payee)) throw new KeystoneError('Choose a payee from the directory.', 'payee');

  if (d.when === 'date' && !isISODate(d.by)) throw new KeystoneError('Choose the deadline date, or ASAP.', 'by');

  if (d.when === 'date' && d.by < today(ctx)) throw new KeystoneError(`${shortDate(d.by)} has passed. Choose a later date, or ASAP.`, 'by');

  if (!requester) throw new KeystoneError('Enter your name, so the CEO knows who is asking.', 'requester');

  const data = dataOf(s);
  const amount = toPesos(sumCentavos(lines, (l) => toCentavos(l.amt)));
  // A transfer names no payee and a check no account, so a request switched from one to the other keeps neither.
  const fields = { purpose, lines, amount, pay: d.pay, payee: account ? '' : d.payee, settle: d.when === ASAP ? ASAP : d.by, ...(account && { account }) };
  const original = d.editing ? data.requests.find((r) => r.no === d.editing) : undefined;

  if (original) {
    const lock = requestLock(original, ctx);

    if (lock) throw new KeystoneError(lock);
    const { account: _before, ...kept } = original;
    // Signed in, the requester stays the member who filed it; on a computer with no sign-in, the name typed is theirs.
    const updated: FundsRequest = { ...kept, ...fields, ...(!ctx.who && { requester }) };

    return {
      state: logged(saved(s, { ...data, requests: data.requests.map((r) => (r.no === original.no ? updated : r)) }), TAG, `${original.no} edited by ${requester}.`, ctx),
      record: updated, message: `${original.no} updated.`,
    };
  }

  const request: FundsRequest = { no: nextRequestNo(s, ctx), date: today(ctx), ...fields, requester, status: 'For Approval' };

  if (ctx.who) request.uid = ctx.who.uid;

  return {
    state: logged(saved(s, { requests: [...data.requests, request], last: request.no }), TAG, `${request.no} filed by ${requester}.`, ctx),
    record: request, message: `${request.no} sent to the CEO for approval.`,
  };
}

/** Takes back a request still waiting, by the person who filed it. It stays on record as withdrawn. */
export function withdrawRequest(s: TerminalState, no: string, ctx: Ctx): Change<FundsRequest> {
  const data = dataOf(s);
  const r = data.requests.find((x) => x.no === no);

  if (!r) throw new KeystoneError(`${no} is not among the requests.`);
  const lock = requestLock(r, ctx);

  if (lock) throw new KeystoneError(lock);
  const updated: FundsRequest = { ...r, status: 'Withdrawn' };

  return {
    state: logged(saved(s, { ...data, requests: data.requests.map((x) => (x.no === no ? updated : x)) }), TAG, `${no} withdrawn by ${ctx.who?.name ?? r.requester}.`, ctx),
    record: updated, message: `${no} withdrawn.`,
  };
}

// ---------- deleting ----------

/** A request number's serial, as numbering counts it: 7 for RF-2026-0007. */
const serial = (no: string) => Number(/(\d+)$/.exec(no)?.[1] ?? 0);

/** Why this person cannot delete requests, or null when they can: the CEO signed in, or anyone where nobody signs in. */
export const deleteRefusal = (ctx: Ctx): string | null => (!ctx.who || decides(ctx) ? null : 'Only the CEO deletes requests for funds.');

/**
 * Deletes a request from the register, whatever its status. Its number is never given out again (`last`), and a
 * voucher its approval drafted stays in Check Vouchers. The log names the request and who deleted it.
 */
export function deleteRequest(s: TerminalState, no: string, ctx: Ctx): Change<FundsRequest> {
  const refusal = deleteRefusal(ctx);

  if (refusal) throw new KeystoneError(refusal);
  const data = dataOf(s);
  const r = data.requests.find((x) => x.no === no);

  if (!r) throw new KeystoneError(`${no} is not among the requests.`);
  // The highest number given out stays the last, so the next request never takes a deleted one's number.
  const last = [data.last, ...data.requests.map((x) => x.no)].reduce((a, b) => (serial(b) > serial(a) ? b : a), '');

  return {
    state: logged(saved(s, { requests: data.requests.filter((x) => x.no !== no), last }), TAG, `${no} deleted by ${ctx.who?.name ?? 'someone on this computer'}.`, ctx),
    record: r, message: `${no} deleted.`,
  };
}

/** Deletes several requests at once: every one, or none if any cannot be. */
export const deleteRequests = (s: TerminalState, nos: readonly string[], ctx: Ctx): Change<FundsRequest[]> =>
  changeEach(s, nos, (st, no) => deleteRequest(st, no, ctx), (rs) => `${count(rs.length, 'request')} deleted.`);

// ---------- deciding ----------

export type Verdict = 'Approved' | 'Declined';

/**
 * The CEO's answer. Approving a transfer makes its fund transfer request, ready to print or save as a PDF; approving
 * a check drafts the check voucher for the amount through Check Vouchers' service (`vouchers`, absent when Check
 * Vouchers is not installed), and the request keeps the voucher's number. A decision is final.
 */
export function decideRequest(s: TerminalState, no: string, verdict: Verdict, note: string, ctx: Ctx, vouchers?: VoucherDrafts): Change<FundsRequest> {
  const who = ctx.who;

  if (!who) throw new KeystoneError(SIGNED_OUT);

  if (!isOwner(who)) throw new KeystoneError(NOT_OWNER);
  const data = dataOf(s);
  const r = data.requests.find((x) => x.no === no);

  if (!r) throw new KeystoneError(`${no} is not among the requests.`);

  if (r.status !== 'For Approval') throw new KeystoneError(`${no} is already ${r.status.toLowerCase()}.`);

  const decision: Decision = { by: who.name, uid: who.uid, at: stamp(ctx.now()) };

  if (note.trim()) decision.note = note.trim();
  let updated: FundsRequest = { ...r, status: verdict, decision };
  let next = s;
  let outcome = '';

  if (verdict === 'Approved') {
    if (r.pay === 'transfer') {
      outcome = ' Its fund transfer request is ready to print or save as a PDF.';
    } else if (!vouchers) {
      outcome = ' Check Vouchers is not installed, so no voucher was drafted.';
    } else if (!recordOf(s, r.payee)) {
      outcome = ` ${r.payee} is no longer in the directory, so no voucher was drafted.`;
    } else {
      const voucher = vouchers.draft(s, { payee: r.payee, amount: r.amount, particulars: `${r.purpose} (${r.no})` }, ctx);
      next = voucher.state;
      updated = { ...updated, voucher: voucher.record.no };
      outcome = ` ${voucher.record.no} is drafted for accounting.`;
    }
  }

  const text = verdict === 'Approved'
    ? `${no} approved by ${who.name}${updated.voucher ? `; ${updated.voucher} drafted` : ''}.`
    : `${no} declined by ${who.name}.`;

  return {
    state: logged(saved(next, { ...data, requests: data.requests.map((x) => (x.no === no ? updated : x)) }), TAG, text, ctx),
    record: updated, message: `${no} ${verdict.toLowerCase()}.${outcome}`,
  };
}

/** The end of a sentence that may carry the CEO's note: ": Keep it under ₱40,000." or ".". */
const noteEnd = (note?: string) => (note ? `: ${note}${/[.!?]$/.test(note) ? '' : '.'}` : '.');

/** "Approved by Mark Reyes on Nov 11, 2026: Keep it under ₱40,000." */
export function decisionLine(r: FundsRequest): string | null {
  if (!r.decision) return null;

  // A paid request was approved first: the decision is the approval.
  return `${r.status === 'Paid' ? 'Approved' : r.status} by ${r.decision.by} on ${shortDate(r.decision.at.slice(0, 10))}${noteEnd(r.decision.note)}`;
}

// ---------- receipts ----------

/** A file's size as a person reads it, from the characters of its base64: "312 KB". */
const kb = (chars: number) => `${Math.max(1, Math.round((chars * 3) / 4 / 1024))} KB`;

/** A receipt's size as a person reads it, from its data URL: "312 KB". */
export const receiptSize = (data: string) => kb(data.length - data.indexOf(',') - 1);

/** Why this person cannot upload the receipts of a request, or null when they can: its requester, once it is approved. */
export function receiptsLock(r: FundsRequest, ctx: Ctx): string | null {
  if (r.status === 'Paid') return `${r.no} is paid; its receipts are kept with it.`;

  if (r.status !== 'Approved') return `The receipts for ${r.no} are uploaded once it is approved.`;

  if (!filedBy(r, ctx)) return `${r.no} is paid once ${r.requester || 'the person who asked for it'} uploads its receipts.`;

  return null;
}

/**
 * Marks an approved request paid, by its requester, with the receipts or other proof of what the money paid for: at
 * least one, each a photo or a PDF, all of them small enough to be kept with the request. The log names the request
 * and who paid it, never what for or how much.
 */
export function payRequest(s: TerminalState, no: string, receipts: Receipt[], ctx: Ctx): Change<FundsRequest> {
  const data = dataOf(s);
  const r = data.requests.find((x) => x.no === no);

  if (!r) throw new KeystoneError(`${no} is not among the requests.`);
  const lock = receiptsLock(r, ctx);

  if (lock) throw new KeystoneError(lock);

  if (!receipts.length) throw new KeystoneError(`Upload the receipt, or other proof of what ${no} paid for.`, 'receipts');
  const odd = receipts.find((x) => !RECEIPT_TYPES.some((t) => x.data.startsWith(t)));

  if (odd) throw new KeystoneError(`${odd.name || 'A receipt'} is not a photo or a PDF.`, 'receipts');
  const size = receipts.reduce((n, x) => n + x.data.length, 0);

  if (size > RECEIPTS_MOST) {
    throw new KeystoneError(`The receipts come to ${kb(size)}; ${no} keeps up to ${kb(RECEIPTS_MOST)}. Remove one, or upload a smaller photo or PDF.`, 'receipts');
  }

  const who = ctx.who?.name ?? r.requester;
  const updated: FundsRequest = { ...r, status: 'Paid', receipts: receipts.map((x) => ({ name: x.name.trim() || 'Receipt', data: x.data })), paid: stamp(ctx.now()) };

  return {
    state: logged(saved(s, { ...data, requests: data.requests.map((x) => (x.no === no ? updated : x)) }), TAG, `${no} paid; receipts uploaded by ${who}.`, ctx),
    record: updated, message: `${no} is paid. ${count(receipts.length, 'receipt')} kept with it.`,
  };
}

/** "Paid on Nov 5, 2026, with 2 receipts from Ana Cruz." */
export function paidLine(r: FundsRequest): string | null {
  if (r.status !== 'Paid') return null;

  return `Paid${r.paid ? ` on ${shortDate(r.paid.slice(0, 10))}` : ''}, with ${count(r.receipts?.length ?? 0, 'receipt')} from ${r.requester || 'its requester'}.`;
}

// ---------- what the funds domain tells Overview and Home ----------

/** How long a requester sees the answer on Home and Overview. */
const NEWS_DAYS = 7;

/** The requester's requests answered in the last week, newest answer first. */
function answered(s: TerminalState, ctx: Ctx): FundsRequest[] {
  const since = addDays(today(ctx), -NEWS_DAYS);

  return dataOf(s).requests
    .filter((r) => (r.status === 'Approved' || r.status === 'Declined') && filedBy(r, ctx) && (r.decision?.at.slice(0, 10) ?? '') >= since)
    .sort((a, b) => (b.decision?.at ?? '').localeCompare(a.decision?.at ?? ''));
}

function answerText(r: FundsRequest): string {
  if (r.status === 'Declined') return `${r.no} was declined${noteEnd(r.decision?.note)}`;

  if (r.pay === 'transfer') return `${r.no} was approved; open it to print or save its fund transfer request, and upload its receipts once the money is spent.`;

  return `${r.no} was approved${r.voucher ? `; ${r.voucher} is drafted` : ''}. Upload its receipts once the money is spent.`;
}

/** The requester's approved requests still waiting for their receipts. */
const unpaid = (s: TerminalState, ctx: Ctx) => newestFirst(dataOf(s).requests).filter((r) => r.status === 'Approved' && filedBy(r, ctx));

export function fundsFinding(s: TerminalState, ctx: Ctx): Finding | null {
  // A staff member's own answer comes first: it is what they are waiting for.
  if (ctx.who && !decides(ctx)) {
    const news = answered(s, ctx)[0];

    if (news) return { priority: 40, text: answerText(news) };
    const owed = unpaid(s, ctx);

    if (owed.length === 1) return { priority: 20, text: `${owed[0].no} waits for your receipts; upload them to mark it paid.` };

    if (owed.length) return { priority: 20, text: `${count(owed.length, 'approved request')} wait for your receipts; upload them to mark each paid.` };
    const mine = waitingRequests(s).filter((r) => filedBy(r, ctx));

    if (!mine.length) return null;

    return { priority: 5, text: `${count(mine.length, 'request')} for funds ${mine.length === 1 ? 'waits' : 'wait'} for the CEO's decision.` };
  }

  const waiting = waitingRequests(s);

  if (!waiting.length) return null;
  const asap = waiting.filter((r) => r.settle === ASAP).length;
  const whose = decides(ctx) ? 'your' : 'the CEO\'s';
  const urgent = asap ? `, ${asap} of them ASAP` : '';

  const text = waiting.length === 1
    ? `${waiting[0].requester || 'Someone'} asks for ${peso(requestTotal(waiting[0]))}${waiting[0].settle === ASAP ? ' ASAP' : ` by ${shortDate(waiting[0].settle)}`}; it waits for ${whose} decision.`
    : `${count(waiting.length, 'request')} for funds worth ${peso(sumCentavos(waiting, requestTotal))} wait for ${whose} decision${urgent}.`;

  return { priority: decides(ctx) ? (asap ? 35 : 25) : 15, text };
}

/** The sentence under the screen's title. */
export const fundsLine = (s: TerminalState, ctx: Ctx) => fundsFinding(s, ctx)?.text ?? 'No request is waiting. Ask for funds here, and the CEO approves or declines.';

export function fundsFigure(s: TerminalState): Figure {
  const waiting = waitingRequests(s);

  return { label: 'Requests for funds', value: String(waiting.length), caption: `${peso(sumCentavos(waiting, requestTotal))} waiting for a decision` };
}

export function fundsWaiting(s: TerminalState): WaitingItem[] {
  return waitingRequests(s).map((r) => ({
    no: r.no, who: `${r.requester || nameOf(s, r.payee)} · ${r.settle === ASAP ? 'ASAP' : `by ${shortDate(r.settle)}`}`, amount: requestTotal(r),
    status: transactionState('For Approval'), tone: requestTone('For Approval'), rank: r.settle === ASAP ? -1 : 5,
  }));
}
