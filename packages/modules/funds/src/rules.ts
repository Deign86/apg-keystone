import {
  addDays, count, editText, isISODate, isJsonObject, jsonNumber, jsonObjects, jsonText, KeystoneError, logged, moduleData,
  nameOf, newestFirst, nextNumber, parseAmount, payees, peso, recordOf, shortDate, stamp, sumCentavos, thisYear,
  toCentavos, toPesos, today, withModuleData, type Centavos, type Change, type Ctx, type Editing, type Figure,
  type Finding, type ISODate, type JsonObject, type JsonValue, type RecordDocuments, type TerminalState, type Tone, type VoucherDrafts,
  type WaitingItem,
} from '@keystone/core';

// Requests for funds (docs/adr/0011): staff ask for money for a purpose, the owner approves or declines, and an
// approval drafts the check voucher through Check Vouchers' service. Only the owner, signed in to the records in the
// cloud, decides; firestore.rules holds the same line, and lets staff read only their own requests.

export const MODULE = 'funds';
export const TAG = 'RF';

export const REQUEST_STATUSES = ['For Approval', 'Approved', 'Declined', 'Withdrawn'] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

const TONES: Record<RequestStatus, Tone> = { 'For Approval': 'warn', Approved: 'good', Declined: 'bad', Withdrawn: 'neutral' };

export const requestTone = (s: RequestStatus): Tone => TONES[s];

/** Settle by: as soon as possible, or a date. */
export const ASAP = 'ASAP';

/** The owner's answer. */
export type Decision = {
  /** The owner's name, as on their member document. */
  by: string;
  uid: string;
  /** Local time, "yyyy-MM-dd HH:mm". */
  at: string;
  note?: string;
}

export type FundsRequest = {
  no: string;
  /** The day it was filed. */
  date: ISODate;
  /** What the money is for. */
  purpose: string;
  /** Pesos. */
  amount: number;
  /** Directory code of the payee. */
  payee: string;
  /** ASAP, or the date it must be settled by. */
  settle: string;
  /** Who asked, by name. */
  requester: string;
  /** Who asked, when they were signed in to the cloud: only they and the owner may read it there. */
  uid?: string;
  status: RequestStatus;
  decision?: Decision;
  /** The voucher drafted when it was approved. */
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
 * read only by its requester and the owner. Locally nothing changes.
 */
export const requestDocuments: RecordDocuments = { collection: 'rf', list: 'requests', key: 'no', fields: ['status', 'uid', 'decision'], readBy: 'uid' };

const statusOf = (v: JsonValue | undefined): RequestStatus => REQUEST_STATUSES.find((s) => s === v) ?? 'For Approval';

function decisionOf(v: JsonObject): Decision | undefined {
  if (!isJsonObject(v.decision)) return undefined;
  const d = v.decision;
  const decision: Decision = { by: jsonText(d.by), uid: jsonText(d.uid), at: jsonText(d.at) };

  if (jsonText(d.note)) decision.note = jsonText(d.note);

  return decision;
}

/** The module's data, read leniently: a record that is damaged or from an older build reads as what it can. */
export function dataOf(s: TerminalState): FundsData {
  const raw = moduleData(s, MODULE);

  if (!isJsonObject(raw)) return { requests: [], last: '' };

  const requests = jsonObjects(raw.requests).map((r): FundsRequest => {
    const request: FundsRequest = {
      no: jsonText(r.no), date: jsonText(r.date), purpose: jsonText(r.purpose), amount: jsonNumber(r.amount), payee: jsonText(r.payee),
      settle: jsonText(r.settle) || ASAP, requester: jsonText(r.requester), status: statusOf(r.status),
    };

    const decision = decisionOf(r);

    if (jsonText(r.uid)) request.uid = jsonText(r.uid);

    if (decision) request.decision = decision;

    if (jsonText(r.voucher)) request.voucher = jsonText(r.voucher);

    return request;
  });

  return { requests, last: jsonText(raw.last) };
}

const saved = (s: TerminalState, data: FundsData) => withModuleData(s, MODULE, { requests: data.requests.map((r) => ({ ...r })), last: data.last });

export const requestsNewestFirst = (s: TerminalState) => newestFirst(dataOf(s).requests);
export const requestOf = (s: TerminalState, no: string) => dataOf(s).requests.find((r) => r.no === no);
export const requestTotal = (r: Pick<FundsRequest, 'amount'>): Centavos => toCentavos(r.amount);

/** The next number after the highest given out: RF-2026-0003. */
export function nextRequestNo(s: TerminalState, ctx: Ctx): string {
  const data = dataOf(s);

  return nextNumber([...data.requests.map((r) => r.no), data.last], `RF-${thisYear(ctx)}-`);
}

/** Waiting for the owner, the ones to settle as soon as possible first, then by the date they are needed. */
export function waitingRequests(s: TerminalState): FundsRequest[] {
  const key = (r: FundsRequest) => (r.settle === ASAP ? '' : r.settle);

  return dataOf(s).requests.filter((r) => r.status === 'For Approval').sort((a, b) => key(a).localeCompare(key(b)) || a.no.localeCompare(b.no));
}

/** "ASAP" or "Dec 15, 2026". */
export const settleText = (r: Pick<FundsRequest, 'settle'>) => (r.settle === ASAP ? 'ASAP' : shortDate(r.settle));

// ---------- who may do what ----------

/** Whether this person decides requests: the owner, signed in to the cloud. */
export const decides = (ctx: Ctx) => ctx.who?.role === 'owner';

const SIGNED_OUT = 'Only the owner approves or declines requests, signed in to APG\'s records in the cloud. This copy of Keystone keeps its records on this computer, where nobody signs in.';
const NOT_OWNER = 'Only the owner approves or declines requests. The answer shows here once it is given.';

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
  /** As typed. */
  amount: string;
  payee: string;
  /** ASAP, or "date" to settle by `by`. */
  when: typeof ASAP | 'date';
  by: string;
  /** Who is asking, typed in when nobody is signed in. */
  requester: string;
}

export const newRequest = (s: TerminalState, ctx: Ctx): RequestDraft => ({
  purpose: '', amount: '', payee: payees(s)[0]?.code ?? '', when: ASAP, by: '', requester: ctx.who?.name ?? '',
});

export const requestDraftOf = (r: FundsRequest): RequestDraft => ({
  editing: r.no, purpose: r.purpose, amount: r.amount ? editText(r.amount) : '', payee: r.payee,
  when: r.settle === ASAP ? ASAP : 'date', by: r.settle === ASAP ? '' : r.settle, requester: r.requester,
});

/**
 * Files a request For Approval, or saves changes to one still waiting. Signed in, the requester is the member; with
 * nobody signed in, the name typed. The activity log, which every member reads, names the request and who filed it,
 * never what it is for or how much.
 */
export function fileRequest(s: TerminalState, d: RequestDraft, ctx: Ctx): Change<FundsRequest> {
  const purpose = d.purpose.trim();
  const amount = parseAmount(d.amount) ?? 0;
  const requester = ctx.who?.name ?? d.requester.trim();

  if (!purpose) throw new KeystoneError('Say what the money is for.');

  if (amount <= 0) throw new KeystoneError('Enter the amount needed.');

  if (!recordOf(s, d.payee)) throw new KeystoneError('Choose a payee from the directory.');

  if (d.when === 'date' && !isISODate(d.by)) throw new KeystoneError('Choose the date it must be settled by, or ASAP.');

  if (d.when === 'date' && d.by < today(ctx)) throw new KeystoneError(`${shortDate(d.by)} has passed. Choose a later date, or ASAP.`);

  if (!requester) throw new KeystoneError('Enter your name, so the owner knows who is asking.');

  const data = dataOf(s);
  const fields = { purpose, amount: toPesos(amount), payee: d.payee, settle: d.when === ASAP ? ASAP : d.by };
  const original = d.editing ? data.requests.find((r) => r.no === d.editing) : undefined;

  if (original) {
    const lock = requestLock(original, ctx);

    if (lock) throw new KeystoneError(lock);
    // Signed in, the requester stays the member who filed it; on a computer with no sign-in, the name typed is theirs.
    const updated: FundsRequest = { ...original, ...fields, ...(!ctx.who && { requester }) };

    return {
      state: logged(saved(s, { ...data, requests: data.requests.map((r) => (r.no === original.no ? updated : r)) }), TAG, `${original.no} edited by ${requester}.`, ctx),
      record: updated, message: `${original.no} updated.`,
    };
  }

  const request: FundsRequest = { no: nextRequestNo(s, ctx), date: today(ctx), ...fields, requester, status: 'For Approval' };

  if (ctx.who) request.uid = ctx.who.uid;

  return {
    state: logged(saved(s, { requests: [...data.requests, request], last: request.no }), TAG, `${request.no} filed by ${requester}.`, ctx),
    record: request, message: `${request.no} sent to the owner for approval.`,
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
 * The owner's answer. Approving drafts the check voucher for the amount through Check Vouchers' service (`vouchers`,
 * absent when Check Vouchers is not installed); the request keeps the voucher's number. A decision is final.
 */
export function decideRequest(s: TerminalState, no: string, verdict: Verdict, note: string, ctx: Ctx, vouchers?: VoucherDrafts): Change<FundsRequest> {
  const who = ctx.who;

  if (!who) throw new KeystoneError(SIGNED_OUT);

  if (who.role !== 'owner') throw new KeystoneError(NOT_OWNER);
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
    if (!vouchers) {
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

/** The end of a sentence that may carry the owner's note: ": Keep it under ₱40,000." or ".". */
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

  return `${r.no} was approved${r.voucher ? `; ${r.voucher} is drafted.` : '.'}`;
}

export function fundsFinding(s: TerminalState, ctx: Ctx): Finding | null {
  // A staff member's own answer comes first: it is what they are waiting for.
  if (ctx.who && !decides(ctx)) {
    const news = answered(s, ctx)[0];

    if (news) return { priority: 40, text: answerText(news) };
    const mine = waitingRequests(s).filter((r) => filedBy(r, ctx));

    if (!mine.length) return null;

    return { priority: 5, text: `${count(mine.length, 'request')} for funds ${mine.length === 1 ? 'waits' : 'wait'} for the owner's decision.` };
  }

  const waiting = waitingRequests(s);

  if (!waiting.length) return null;
  const asap = waiting.filter((r) => r.settle === ASAP).length;
  const whose = decides(ctx) ? 'your' : 'the owner\'s';
  const urgent = asap ? `, ${asap} of them ASAP` : '';

  const text = waiting.length === 1
    ? `${waiting[0].requester || 'Someone'} asks for ${peso(requestTotal(waiting[0]))}${waiting[0].settle === ASAP ? ' ASAP' : ` by ${shortDate(waiting[0].settle)}`}; it waits for ${whose} decision.`
    : `${count(waiting.length, 'request')} for funds worth ${peso(sumCentavos(waiting, requestTotal))} wait for ${whose} decision${urgent}.`;

  return { priority: decides(ctx) ? (asap ? 35 : 25) : 15, text };
}

/** The sentence under the screen's title. */
export const fundsLine = (s: TerminalState, ctx: Ctx) => fundsFinding(s, ctx)?.text ?? 'No request is waiting. Ask for funds here, and the owner approves or declines.';

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
