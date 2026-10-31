import {
  addDays, count, KeystoneError, lineDraft, lineDraftOf, lineItemsOf, logged, nameOf, newestFirst,
  percent, peso, recordOf, recordsOf, shortDate, sumCentavos, thisYear, toCentavos, today,
  toneOf, type Centavos, type Change, type Ctx, type Editing, type Figure, type Finding, type LineDraft,
  type LineItem, type Payment, type Statement, type StatementPayments, type StatementStatus,
  type TerminalState, type WaitingItem
} from '@keystone/core';

// Billing statements: receivables from clients, printed as the company's Billing
// Statement, with VAT and expanded withholding. Reads the directory for clients, their
// tax setup and who to address.

export interface StatementTotals { subtotal: Centavos; vat: Centavos; ewt: Centavos; due: Centavos }

export const VAT_RATE = 12;
export const EWT_RATE = 5;

/** VAT is added and EWT withheld, both on the subtotal. */
export function statementTotals(b: Pick<Statement, 'lines' | 'vat' | 'ewt'>): StatementTotals {
  const subtotal = sumCentavos(b.lines, (l) => toCentavos(l.amt));
  const vat = b.vat ? percent(subtotal, VAT_RATE) : 0;
  const ewt = b.ewt ? percent(subtotal, EWT_RATE) : 0;

  return { subtotal, vat, ewt, due: subtotal + vat - ewt };
}

/** A line's amount with VAT added, as the statement's last column shows it. */
export const lineWithTax = (b: Pick<Statement, 'vat'>, l: LineItem): Centavos => {
  const amount = toCentavos(l.amt);

  return amount + (b.vat ? percent(amount, VAT_RATE) : 0);
};

/** Invoice numbers: a six-digit running number and the year, "010100-2026". */
const INVOICE_NO = /^(\d{6})-\d{4}$/;

/** The next invoice number: one past the highest running number in use, with this year. */
export function nextStatementNo(s: TerminalState, ctx: Ctx): string {
  const highest = Math.max(0, ...s.bs.flatMap((b) => {
    const m = INVOICE_NO.exec(b.no);

    return m ? [Number(m[1])] : [];
  }));

  return `${String(highest + 1).padStart(6, '0')}-${thisYear(ctx)}`;
}

export const statementsNewestFirst = (s: TerminalState) => newestFirst(s.bs);
export const outstanding = (s: TerminalState) => s.bs.filter((b) => b.status === 'Sent' || b.status === 'Overdue');
export const overdue = (s: TerminalState) => s.bs.filter((b) => b.status === 'Overdue');
export const outstandingTotal = (s: TerminalState) => sumCentavos(outstanding(s), (b) => statementTotals(b).due);

export interface StatementDraft extends Editing {
  no: string; date: string; invoiceDate: string; due: string; client: string; attention: string;
  lines: LineDraft[]; vat: boolean; ewt: boolean; notes: string; note: string;
}

export function newStatement(s: TerminalState, ctx: Ctx): StatementDraft {
  const d = ctx.seed.reference.defaults;
  const client = recordsOf(s, 'Client')[0];
  const t = today(ctx);

  return {
    no: nextStatementNo(s, ctx), date: t, invoiceDate: t, due: addDays(t, d.dueInDays), client: client?.code ?? '',
    attention: client?.attention ?? '', lines: [lineDraft()], vat: client?.vat ?? false, ewt: client?.ewt ?? false,
    notes: d.paymentInstructions, note: d.billingNote,
  };
}

export const statementDraftOf = (b: Statement, ctx: Ctx): StatementDraft => ({
  editing: b.no, no: b.no, date: b.date, invoiceDate: b.invoiceDate ?? b.date, due: b.due, client: b.client,
  attention: b.attention ?? '', lines: b.lines.map(lineDraftOf), vat: b.vat, ewt: b.ewt,
  notes: b.notes ?? ctx.seed.reference.defaults.paymentInstructions, note: b.note ?? ctx.seed.reference.defaults.billingNote,
});

export const statementOf = (d: StatementDraft, status: StatementStatus = 'Sent'): Statement => ({
  no: d.no.trim(), date: d.date, invoiceDate: d.invoiceDate, due: d.due, client: d.client, attention: d.attention.trim(),
  lines: lineItemsOf(d.lines, 'unit'), vat: d.vat, ewt: d.ewt, notes: d.notes, note: d.note, status,
});

/** Picking a client sets VAT, EWT and who to address from its directory record. */
export function withClient(s: TerminalState, d: StatementDraft, client: string): StatementDraft {
  const c = recordOf(s, client);

  return { ...d, client, attention: c?.attention ?? '', vat: c?.vat ?? false, ewt: c?.ewt ?? false };
}

export function saveStatement(s: TerminalState, d: StatementDraft, ctx: Ctx, asNew = false): Change<Statement> {
  const b = statementOf(d);
  const t = statementTotals(b);

  if (b.lines.some((l) => !l.qty)) throw new KeystoneError('Enter a quantity above zero on every charge.');

  if (!b.lines.length || t.subtotal <= 0) throw new KeystoneError('Add at least one charge with an amount.');

  if (!recordOf(s, b.client)) throw new KeystoneError('Choose a client from the directory.');

  if (b.due < (b.invoiceDate ?? b.date)) throw new KeystoneError('The due date is before the invoice date.');

  const original = d.editing ? s.bs.find((x) => x.no === d.editing) : undefined;

  if (original && !asNew) {
    if (original.status !== 'Sent') {
      throw new KeystoneError(`${original.no} is ${original.status.toLowerCase()} and can no longer be changed. Save it as a new statement instead.`);
    }

    const updated = { ...b, no: original.no, status: original.status };

    return {
      state: logged({ ...s, bs: s.bs.map((x) => (x.no === original.no ? updated : x)) }, 'BS',
        `${updated.no} for ${nameOf(s, b.client)} edited (${peso(t.due)} due ${shortDate(b.due)}).`, ctx),
      record: updated, message: `${updated.no} updated.`,
    };
  }

  // A new statement keeps the number typed on it, unless that number is taken. A copy of a
  // saved one takes the next number.
  const no = original || !b.no ? nextStatementNo(s, ctx) : b.no;

  if (s.bs.some((x) => x.no === no)) throw new KeystoneError(`Invoice No. ${no} is already used. The next free one is ${nextStatementNo(s, ctx)}.`);
  const saved = { ...b, no };

  return {
    state: logged({ ...s, bs: [...s.bs, saved] }, 'BS', `${saved.no} sent to ${nameOf(s, b.client)} (${peso(t.due)} due ${shortDate(b.due)}).`, ctx),
    record: saved, message: `${saved.no} saved and marked as sent.`,
  };
}

export function setStatementStatus(s: TerminalState, no: string, status: StatementStatus, ctx: Ctx): Change<Statement> {
  const b = s.bs.find((x) => x.no === no);

  if (!b) throw new KeystoneError(`${no} is not in the register.`);

  if (b.status === status) return { state: s, record: b, message: `${no} is already ${status.toLowerCase()}.` };

  if (b.status === 'Void') throw new KeystoneError(`${no} is void and stays void.`);
  const updated = { ...b, status };

  const text = status === 'Paid' ? `${no} from ${nameOf(s, b.client)} marked paid (${peso(statementTotals(b).due)}).`
    : `${no} marked ${status.toLowerCase()}.`;

  return {
    state: logged({ ...s, bs: s.bs.map((x) => (x.no === no ? updated : x)) }, 'BS', text, ctx),
    record: updated, message: `${no} marked ${status.toLowerCase()}.`,
  };
}

/** Settles a statement with a reported payment. A payment short of the amount due is refused. */
export function recordPayment(s: TerminalState, no: string, p: Payment, ctx: Ctx): Change<Statement> {
  const b = s.bs.find((x) => x.no === no);

  if (!b) throw new KeystoneError(`${no} is not in the register.`);

  if (b.status === 'Paid' || b.status === 'Void') throw new KeystoneError(`${no} is already ${b.status.toLowerCase()}.`);
  const due = statementTotals(b).due;
  const paid = toCentavos(p.amount);

  if (paid < due) throw new KeystoneError(`${peso(paid)} is less than the ${peso(due)} due on ${no}. Record it when the balance is paid.`);
  const updated = { ...b, status: 'Paid' as const };
  const how = [p.method, p.reference && `ref ${p.reference}`].filter(Boolean).join(' ');

  return {
    state: logged({ ...s, bs: s.bs.map((x) => (x.no === no ? updated : x)) }, 'BS',
      `${no} from ${nameOf(s, b.client)} paid: ${peso(paid)}${how ? ` by ${how}` : ''}, reported on ${p.source}.`, ctx),
    record: updated, message: `${no} marked paid.`,
  };
}

/** Run on open: statements past their due date become Overdue. */
export function markOverdue(s: TerminalState, ctx: Ctx): TerminalState {
  const t = today(ctx);

  return s.bs.filter((b) => b.status === 'Sent' && b.due < t).reduce((acc, b) => setStatementStatus(acc, b.no, 'Overdue', ctx).state, s);
}

// ---------- what the billing domain tells Overview and Home ----------

export function billingFigure(s: TerminalState): Figure {
  const open = outstanding(s);

  return { label: 'Receivables outstanding', value: peso(outstandingTotal(s)), caption: `${count(open.length, 'statement')} open · ${overdue(s).length} overdue`, lead: true };
}

export function billingFinding(s: TerminalState): Finding | null {
  const late = overdue(s);

  if (!late.length) return null;
  const worst = late.reduce((a, b) => (statementTotals(b).due > statementTotals(a).due ? b : a));
  const more = late.length > 1 ? ` One of ${late.length} overdue statements.` : '';

  return { priority: 30, text: `${peso(statementTotals(worst).due)} from ${nameOf(s, worst.client)} has been overdue since ${shortDate(worst.due)}.${more}` };
}

export function billingWaiting(s: TerminalState): WaitingItem[] {
  return [...outstanding(s)].sort((a, b) => a.due.localeCompare(b.due)).map((b, i) => ({
    no: b.no, who: `${nameOf(s, b.client)} · due ${shortDate(b.due)}`, amount: statementTotals(b).due, status: b.status, tone: toneOf(b.status), rank: 10 + i,
  }));
}

// ---------- the service billing offers other parts ----------

/** Published as SERVICES.statementPayments; the website's payment matching uses it. */
export const statementPayments: StatementPayments = {
  open: (s) => [...outstanding(s)].sort((a, b) => a.due.localeCompare(b.due))
    .map((b) => ({ no: b.no, client: nameOf(s, b.client), due: b.due, amount: statementTotals(b).due })),
  record: recordPayment,
};
