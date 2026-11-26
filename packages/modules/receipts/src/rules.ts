import {
  count, earlier, isISODate, isJsonObject, jsonNumber, jsonObjects, jsonText, KeystoneError, lineDraft, lineDraftOf, lineItemsOf, linesBlank, linesFromDraft,
  logged, moduleData, nextNumber, parseAmount, peso, rememberedLines, sumCentavos, thisYear, toCentavos, toPesos, today, withModuleData,
  type Centavos, type Change, type Ctx, type Editing, type ISODate, type LineDraft, type LineItem, type RememberedLine, type TerminalState,
} from '@keystone/core';

// Acknowledgement receipts (docs/adr/0054): the company's receipt for a payment received, on the company's form. Who
// paid, the particulars and their total, how it was paid, any remarks, and who received it. It is proof of payment,
// not an official receipt or invoice for tax purposes, and says so. Kept under state.ext.receipts.

/** This module's id, written once: its route, its ModuleDef.id, its key under state.ext and its draft key. */
export const ID = 'receipts';

/** The tag its activity-log lines carry. */
export const TAG = 'AR';

/** How a payment was made, as the form ticks it. */
export const PAY_MODES = ['Cash', 'Bank transfer', 'Check'] as const;

export type PayMode = (typeof PAY_MODES)[number];

export interface Receipt {
  /** "AR-2026-0001". */
  no: string;
  date: ISODate;
  /** The transaction it acknowledges, and any reference, as typed. Optional. */
  transaction: string;
  reference: string;
  /** Who paid. */
  payor: string;
  /** Optional: the payor's company, contact number and email. */
  company: string;
  contact: string;
  email: string;
  /** The particulars paid for, each with its amount. */
  lines: LineItem[];
  /** Pesos: the particulars' total. */
  amount: number;
  mode: PayMode;
  /** Bank transfers and checks: the payment reference or transaction ID, and the bank or payment channel. Optional. */
  paymentRef: string;
  channel: string;
  /** Checks: the check's number and date. */
  check: string;
  checkDate: string;
  remarks: string;
  /** Who received it for the company, their position, and when. */
  receivedBy: string;
  position: string;
  receivedOn: string;
}

interface ReceiptsData { receipts: Receipt[] }

const modeOf = (v: string): PayMode => PAY_MODES.find((m) => m === v) ?? 'Cash';

/** The receipts in the order they were saved, read leniently. None saved: none (docs/adr/0018). */
export function receiptsOf(s: TerminalState): Receipt[] {
  const raw = moduleData(s, ID);

  if (!isJsonObject(raw)) return [];

  return jsonObjects(raw.receipts).map((r): Receipt => ({
    no: jsonText(r.no), date: jsonText(r.date), transaction: jsonText(r.transaction), reference: jsonText(r.reference),
    payor: jsonText(r.payor), company: jsonText(r.company), contact: jsonText(r.contact), email: jsonText(r.email),
    lines: jsonObjects(r.lines).map((l) => ({ desc: jsonText(l.desc), amt: jsonNumber(l.amt) })), amount: jsonNumber(r.amount),
    mode: modeOf(jsonText(r.mode)), paymentRef: jsonText(r.paymentRef), channel: jsonText(r.channel), check: jsonText(r.check),
    checkDate: jsonText(r.checkDate), remarks: jsonText(r.remarks), receivedBy: jsonText(r.receivedBy), position: jsonText(r.position),
    receivedOn: jsonText(r.receivedOn),
  })).filter((r) => r.no);
}

const saved = (s: TerminalState, receipts: Receipt[]) => withModuleData(s, ID, { receipts: receipts.map((r) => ({ ...r, lines: r.lines.map((l) => ({ ...l })) })) } satisfies ReceiptsData);

export const receiptsNewestFirst = (s: TerminalState) => [...receiptsOf(s)].reverse();
export const receiptTotal = (r: Pick<Receipt, 'amount'>): Centavos => toCentavos(r.amount);

/** Numbers run on within the year: "AR-2026-0001". */
export const nextReceiptNo = (s: TerminalState, ctx: Ctx) =>
  nextNumber(receiptsOf(s).map((r) => r.no).filter((no) => no.startsWith(`AR-${thisYear(ctx)}-`)), `AR-${thisYear(ctx)}-`);

// ---------- the form ----------

export type ReceiptDraft = Editing & Omit<Receipt, 'lines' | 'amount'> & { lines: LineDraft[] };

/**
 * A blank receipt, dated today and received today. Whoever is signed in receives it; nobody signed in, the last
 * receipt's receiver does, and each starts with the last receipt's position.
 */
export function newReceipt(s: TerminalState, ctx: Ctx): ReceiptDraft {
  const last = receiptsNewestFirst(s)[0];

  return {
    no: nextReceiptNo(s, ctx), date: today(ctx), transaction: '', reference: '', payor: '', company: '', contact: '', email: '',
    lines: [lineDraft()], mode: 'Cash', paymentRef: '', channel: '', check: '', checkDate: '', remarks: '',
    receivedBy: ctx.who?.name ?? last?.receivedBy ?? '', position: last?.position ?? '', receivedOn: today(ctx),
  };
}

export const receiptDraftOf = (r: Receipt): ReceiptDraft => ({ ...r, editing: r.no, lines: r.lines.map(lineDraftOf) });

/** Nothing typed worth keeping as a draft (docs/adr/0041): a new receipt with no payor and no particular. */
export const receiptDraftBlank = (d: ReceiptDraft) => !d.editing && !d.payor.trim() && linesBlank(d.lines);

/** What the Drafts list calls a saved receipt draft: who paid, and how much so far. */
export const receiptDraftTitle = (d: ReceiptDraft) => `${d.payor.trim() || 'No payor yet'} · ${peso(receiptTotal(receiptOf(d)))}`;

/** A saved draft back in the form: over a new receipt, with the next number unless it edits a saved one. */
export function receiptDraftFrom(s: TerminalState, ctx: Ctx, kept: Partial<ReceiptDraft>): ReceiptDraft {
  const fresh = newReceipt(s, ctx);

  return { ...fresh, ...kept, lines: linesFromDraft(kept.lines), no: kept.editing ?? fresh.no };
}

/** The receipt as the form shows it now, for its paper: nothing checked, a line still being typed shown as far as it goes. */
export function receiptOf(d: ReceiptDraft): Receipt {
  const lines = lineItemsOf(d.lines, 'amount').map((l) => ({ desc: l.desc.trim(), amt: l.amt }));

  return {
    no: d.no.trim(), date: d.date, transaction: d.transaction.trim(), reference: d.reference.trim(), payor: d.payor.trim(), company: d.company.trim(),
    contact: d.contact.trim(), email: d.email.trim(), lines, amount: toPesos(sumCentavos(lines, (l) => toCentavos(l.amt))), mode: d.mode,
    paymentRef: d.paymentRef.trim(), channel: d.channel.trim(), check: d.check.trim(), checkDate: d.checkDate, remarks: d.remarks.trim(),
    receivedBy: d.receivedBy.trim(), position: d.position.trim(), receivedOn: d.receivedOn,
  };
}

/**
 * Saves a receipt, or the changes to one. It needs who paid, at least one particular with its amount, and, for a check,
 * the check's number. A new receipt keeps the number typed on it unless it is taken; Save as new takes the next one.
 */
export function saveReceipt(s: TerminalState, d: ReceiptDraft, ctx: Ctx, asNew = false): Change<Receipt> {
  const r = receiptOf(d);
  const all = receiptsOf(s);

  if (!r.payor) throw new KeystoneError('Enter who paid.', 'payor');

  // A line with only a description, or only an amount, is refused, naming the line as the form numbers it.
  d.lines.forEach((l, i) => {
    const desc = l.desc.trim();
    const amount = parseAmount(l.amount) ?? 0;

    if (desc && amount <= 0) throw new KeystoneError(`Enter the amount for line ${i + 1}, ${desc}.`, `lines.${i}.amount`);

    if (!desc && l.amount.trim()) throw new KeystoneError(`Say what line ${i + 1} is for.`, `lines.${i}.desc`);
  });

  if (!r.lines.length || r.amount <= 0) throw new KeystoneError('List what was paid for, each with its amount.', 'lines.0.desc');

  if (!isISODate(r.date)) throw new KeystoneError('Enter the receipt\'s date.', 'date');

  if (r.mode === 'Check' && !r.check) throw new KeystoneError('Enter the check number.', 'check');

  if (r.checkDate && !isISODate(r.checkDate)) throw new KeystoneError('Enter the check date as a date.', 'checkDate');

  if (r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) throw new KeystoneError('Enter a whole email address, like juan.delacruz@gmail.com, or leave it blank.', 'email');

  const what = `from ${r.payor}, ${peso(receiptTotal(r))} by ${r.mode.toLowerCase()}`;
  const original = d.editing && !asNew ? all.find((x) => x.no === d.editing) : undefined;

  if (d.editing && !asNew && !original) throw new KeystoneError(`${d.editing} is no longer saved.`);

  if (original) {
    const updated = { ...r, no: original.no };

    return {
      state: logged(saved(s, all.map((x) => (x.no === original.no ? updated : x))), TAG, `${updated.no} ${what} edited.`, ctx),
      record: updated, message: `${updated.no} updated.`,
    };
  }

  const no = d.editing || !r.no ? nextReceiptNo(s, ctx) : r.no;

  if (all.some((x) => x.no === no)) throw new KeystoneError(`${no} is already used. The next free one is ${nextReceiptNo(s, ctx)}.`, 'no');
  const record = { ...r, no };

  return {
    state: logged(saved(s, [...all, record]), TAG, `${no} ${what} received.`, ctx),
    record, message: `${no} saved.`,
  };
}

/** Removes a receipt from the register. A printed copy is not affected. */
export function removeReceipt(s: TerminalState, no: string, ctx: Ctx): Change<Receipt> {
  const all = receiptsOf(s);
  const r = all.find((x) => x.no === no);

  if (!r) throw new KeystoneError(`${no} is not saved.`);

  return {
    state: logged(saved(s, all.filter((x) => x.no !== no)), TAG, `${no} from ${r.payor} removed.`, ctx),
    record: r, message: `${no} removed.`,
  };
}

// ---------- repeated details (docs/adr/0053) ----------

const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** A payor who paid before brings their company, contact number and email from their last receipt into what is blank. */
export function withPayor(s: TerminalState, d: ReceiptDraft, payor: string): ReceiptDraft {
  const key = nameKey(payor);
  const last = key ? receiptsNewestFirst(s).find((r) => nameKey(r.payor) === key) : undefined;

  if (!last) return { ...d, payor };
  const blank = (typed: string, kept: string) => (typed.trim() ? typed : kept);

  return { ...d, payor, company: blank(d.company, last.company), contact: blank(d.contact, last.contact), email: blank(d.email, last.email) };
}

/** What the form's fields offer as they are typed, from the receipts saved before. */
export function earlierReceiptEntries(s: TerminalState) {
  const saved = receiptsNewestFirst(s);

  return {
    payors: earlier(saved.map((r) => r.payor)),
    companies: earlier(saved.map((r) => r.company)),
    channels: earlier(saved.map((r) => r.channel)),
    receivers: earlier(saved.map((r) => r.receivedBy)),
    positions: earlier(saved.map((r) => r.position)),
    remarks: earlier(saved.map((r) => r.remarks)),
  };
}

/** The particulars received before, each once, with their amounts. */
export const rememberedReceiptLines = (s: TerminalState): RememberedLine[] => rememberedLines(receiptsNewestFirst(s).flatMap((r) => r.lines));

// ---------- what it tells Home and Overview ----------

/** The sentence under the screen's title. */
export function receiptsLine(s: TerminalState): string {
  const all = receiptsOf(s);

  return all.length
    ? `${count(all.length, 'receipt')} issued, for ${peso(sumCentavos(all, receiptTotal))} received.`
    : 'No receipts yet. Each acknowledges a payment received, by cash, bank transfer or check.';
}
