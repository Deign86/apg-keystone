import {
  addDays, count, isISODate, isJsonObject, isOwner, jsonNumber, jsonObjects, jsonText, KeystoneError, lineDraft, lineDraftOf, logged,
  moduleData, nameOf, newestFirst, nextNumber, parseAmount, payees, peso, recordOf, shortDate, stamp, sumCentavos, thisYear,
  toCentavos, toPesos, today, withModuleData, type Centavos, type Change, type Ctx, type Editing, type Figure, type Finding,
  type ISODate, type JsonObject, type JsonValue, type LineDraft, type RecordDocuments, type Reference, type TerminalState, type Tone,
  type VoucherDrafts, type WaitingItem,
} from '@keystone/core';

// Requests for funds (docs/adr/0011, 0021): staff list the expenses they need money for, the CEO approves or
// declines, and an approval either makes the fund transfer request, for a transfer to the account the request names,
// or drafts the check voucher through Check Vouchers' service. Only the CEO, signed in to the records in the cloud,
// decides; firestore.rules holds the same line, and lets staff read only their own requests.

/** This module's id, written once: its route, its ModuleDef.id, its key under state.ext and its draft key. */
export const ID = 'funds';
export const TAG = 'RF';

export const REQUEST_STATUSES = ['For Approval', 'Approved', 'Declined', 'Withdrawn'] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

const TONES: Record<RequestStatus, Tone> = { 'For Approval': 'warn', Approved: 'good', Declined: 'bad', Withdrawn: 'neutral' };

export const requestTone = (s: RequestStatus): Tone => TONES[s];

/** Settle by: as soon as possible, or a date. */
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
  /** ASAP, or the date it must be settled by. */
  settle: string;
  /** Who asked, by name. */
  requester: string;
  /** Who asked, when they were signed in to the cloud: only they and the CEO may read it there. */
  uid?: string;
  status: RequestStatus;
  decision?: Decision;
  /** Checks: the voucher drafted when it was approved. */
  voucher?: string;
}

export type FundsData = {
  requests: FundsRequest[];
  /**
   * The last number given out. Staff read only their own requests in the cloud, so the numbers in their list cannot
   * say which is next; this is kept in the module's shared document, which every member reads.
   */
  last: string;
}

/**
 * In the cloud each request is its own document (keystone/apg/rf/{no}), with the fields the rules check beside it, and
 * read only by its requester and the CEO. Locally nothing changes.
 */
export const requestDocuments: RecordDocuments = { collection: 'rf', list: 'requests', key: 'no', fields: ['status', 'uid', 'decision'], readBy: 'uid' };

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

    return request;
  });

  return { requests, last: jsonText(raw.last) };
}

const saved = (s: TerminalState, data: FundsData) => withModuleData(s, ID, {
  requests: data.requests.map((r) => ({ ...r, lines: r.lines.map((l) => ({ ...l })), ...(r.account && { account: { ...r.account } }) })), last: data.last,
});

export const requestsNewestFirst = (s: TerminalState) => newestFirst(dataOf(s).requests);
export const requestOf = (s: TerminalState, no: string) => dataOf(s).requests.find((r) => r.no === no);

/**
 * A request paid by check names its payee by directory code; that record is kept. In the cloud a staff member reads
 * only their own requests, so only the CEO's Keystone knows every request that names a record.
 */
export const refersTo: Reference = { tag: TAG, codes: (s) => dataOf(s).requests.map((r) => r.payee) };
export const requestTotal = (r: Pick<FundsRequest, 'amount'>): Centavos => toCentavos(r.amount);

/** The expenses a request lists; one filed before it listed them is its purpose for its amount. */
export const expensesOf = (r: Pick<FundsRequest, 'lines' | 'purpose' | 'amount'>): Expense[] => (r.lines.length ? r.lines : [{ desc: r.purpose, amt: r.amount }]);

/** How an account reads in a sentence or a list: "BDO · Liza Ramos · 0012 3456 7890". */
export const accountLabel = (a: TransferAccount) => [a.bank, a.name, a.number].join(' · ');

/** Whether the request's fund transfer request can be printed and saved: a transfer, once the CEO approved it. */
export const transferReady = (r: FundsRequest) => r.pay === 'transfer' && r.status === 'Approved';

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

    if (!desc) throw new KeystoneError(`Say what line ${i + 1} is for.`);

    if (amount <= 0) throw new KeystoneError(`Enter the amount for line ${i + 1}, ${desc}.`);

    return [{ desc, amt: toPesos(amount) }];
  });

  if (!expenses.length) throw new KeystoneError('List the expenses, each with its amount.');

  return expenses;
}

/** The account to transfer to, as typed, or the sentence that says what it is missing. */
function accountTyped(a: TransferAccount): TransferAccount {
  const account = { bank: a.bank.trim(), branch: a.branch.trim(), name: a.name.trim(), number: a.number.trim() };

  if (!account.bank) throw new KeystoneError('Enter the bank of the account to transfer to.');

  if (!account.name) throw new KeystoneError('Enter the account name, as the bank holds it.');

  if (!/\d/.test(account.number)) throw new KeystoneError('Enter the account number to transfer to.');

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

  if (!purpose) throw new KeystoneError('Say what the money is for.');
  const lines = expensesTyped(d.lines);
  const account = d.pay === 'transfer' ? accountTyped(d.account) : undefined;

  if (d.pay === 'check' && !recordOf(s, d.payee)) throw new KeystoneError('Choose a payee from the directory.');

  if (d.when === 'date' && !isISODate(d.by)) throw new KeystoneError('Choose the date it must be settled by, or ASAP.');

  if (d.when === 'date' && d.by < today(ctx)) throw new KeystoneError(`${shortDate(d.by)} has passed. Choose a later date, or ASAP.`);

  if (!requester) throw new KeystoneError('Enter your name, so the CEO knows who is asking.');

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

  return `${r.status} by ${r.decision.by} on ${shortDate(r.decision.at.slice(0, 10))}${noteEnd(r.decision.note)}`;
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

  if (r.pay === 'transfer') return `${r.no} was approved; open it to print or save its fund transfer request.`;

  return `${r.no} was approved${r.voucher ? `; ${r.voucher} is drafted.` : '.'}`;
}

export function fundsFinding(s: TerminalState, ctx: Ctx): Finding | null {
  // A staff member's own answer comes first: it is what they are waiting for.
  if (ctx.who && !decides(ctx)) {
    const news = answered(s, ctx)[0];

    if (news) return { priority: 40, text: answerText(news) };
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
    status: 'For Approval', tone: requestTone('For Approval'), rank: r.settle === ASAP ? -1 : 5,
  }));
}
