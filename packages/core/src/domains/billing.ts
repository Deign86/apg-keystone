import { addDays } from '../kernel/dates';
import { count, shortDate } from '../kernel/format';
import type { Figure, Finding, WaitingItem } from '../kernel/insight';
import { lineDraft, lineDraftOf, lineItemsOf, type LineDraft } from '../kernel/lines';
import { peso, percent, sumCentavos, toCentavos, type Centavos } from '../kernel/money';
import { toneOf, type Statement, type StatementStatus, type TerminalState } from '../kernel/schema';
import { KeystoneError, logged, newestFirst, nextNumber, thisYear, today, type Change, type Ctx, type Editing } from '../kernel/state';
import { nameOf, recordOf, recordsOf } from './directory';

// Billing statements: receivables from clients, with VAT and expanded withholding.
// Reads the directory for clients and their tax setup.

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

export const statementsNewestFirst = (s: TerminalState) => newestFirst(s.bs);
export const nextStatementNo = (s: TerminalState, ctx: Ctx) => nextNumber(s.bs.map((b) => b.no), `BS-${thisYear(ctx)}-`);
export const outstanding = (s: TerminalState) => s.bs.filter((b) => b.status === 'Sent' || b.status === 'Overdue');
export const overdue = (s: TerminalState) => s.bs.filter((b) => b.status === 'Overdue');
export const outstandingTotal = (s: TerminalState) => sumCentavos(outstanding(s), (b) => statementTotals(b).due);

export interface StatementDraft extends Editing {
  no: string; date: string; due: string; client: string; period: string; ref: string;
  lines: LineDraft[]; vat: boolean; ewt: boolean; notes: string;
}

export function newStatement(s: TerminalState, ctx: Ctx): StatementDraft {
  const d = ctx.seed.reference.defaults;
  const client = recordsOf(s, 'Client')[0];
  const t = today(ctx);
  return {
    no: nextStatementNo(s, ctx), date: t, due: addDays(t, d.dueInDays), client: client?.code ?? '',
    period: d.billingPeriod, ref: '', lines: [lineDraft({ desc: 'Monthly rent' }), lineDraft({ desc: 'Association dues' })],
    vat: client?.vat ?? false, ewt: client?.ewt ?? false, notes: d.paymentInstructions,
  };
}

export const statementDraftOf = (b: Statement, ctx: Ctx): StatementDraft => ({
  editing: b.no, no: b.no, date: b.date, due: b.due, client: b.client, period: b.period, ref: b.ref,
  lines: b.lines.map(lineDraftOf), vat: b.vat, ewt: b.ewt, notes: b.notes ?? ctx.seed.reference.defaults.paymentInstructions,
});

export const statementOf = (d: StatementDraft, status: StatementStatus = 'Sent'): Statement => ({
  no: d.no, date: d.date, due: d.due, client: d.client, period: d.period, ref: d.ref, lines: lineItemsOf(d.lines, 'ref'),
  vat: d.vat, ewt: d.ewt, notes: d.notes, status,
});

/** Picking a client sets VAT and EWT from its directory record. */
export function withClient(s: TerminalState, d: StatementDraft, client: string): StatementDraft {
  const c = recordOf(s, client);
  return { ...d, client, vat: c?.vat ?? false, ewt: c?.ewt ?? false };
}

export function saveStatement(s: TerminalState, d: StatementDraft, ctx: Ctx, asNew = false): Change<Statement> {
  const b = statementOf(d);
  const t = statementTotals(b);
  if (!b.lines.length || t.subtotal <= 0) throw new KeystoneError('Add at least one charge with an amount.');
  if (!recordOf(s, b.client)) throw new KeystoneError('Choose a client from the directory.');
  if (b.due < b.date) throw new KeystoneError('The due date is before the statement date.');

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
  const saved = { ...b, no: nextStatementNo(s, ctx) };
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

export interface Payment {
  /** Pesos received. */
  amount: number;
  method?: string;
  reference?: string;
  /** Where the payment was reported: "the website (ticket APG-1A2B3C4D)". */
  source: string;
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
