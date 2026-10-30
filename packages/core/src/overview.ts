import { count, shortDate } from './format';
import { peso, sumCentavos } from './money';
import type { TerminalState } from './models';
import { localDate } from './dates';
import { nameOf, recordsOf, statementTotals, voucherTotal, type Ctx } from './terminal';

/** One figure in a strip: label, value, and what the value counts. */
export interface Figure {
  label: string;
  value: string;
  caption: string;
}

export const awaitingApproval = (s: TerminalState) => s.cv.filter((v) => v.status === 'For Approval');
export const outstanding = (s: TerminalState) => s.bs.filter((b) => b.status === 'Sent' || b.status === 'Overdue');
export const overdue = (s: TerminalState) => s.bs.filter((b) => b.status === 'Overdue');
export const queuedForPrinting = (s: TerminalState) => s.ids.filter((i) => i.status === 'For printing');
export const issuedThisMonth = (s: TerminalState, ctx: Ctx) => {
  const month = localDate(ctx.now()).slice(0, 7);
  return s.ids.filter((i) => i.issued.startsWith(month));
};

export const outstandingTotal = (s: TerminalState) => sumCentavos(outstanding(s), (b) => statementTotals(b).due);

export function overviewFigures(s: TerminalState, ctx: Ctx): Figure[] {
  const pending = awaitingApproval(s);
  const open = outstanding(s);
  return [
    { label: 'Vouchers awaiting approval', value: String(pending.length), caption: `${peso(sumCentavos(pending, voucherTotal))} pending signature` },
    { label: 'Receivables outstanding', value: peso(outstandingTotal(s)), caption: `${count(open.length, 'statement')} open · ${overdue(s).length} overdue` },
    { label: 'IDs issued this month', value: String(issuedThisMonth(s, ctx).length), caption: `${queuedForPrinting(s).length} queued for printing` },
    {
      label: 'Directory records', value: String(s.dir.length),
      caption: `${count(recordsOf(s, 'Vendor').length, 'vendor')} · ${count(recordsOf(s, 'Client').length, 'client')} · ${count(recordsOf(s, 'Employee').length, 'employee')}`,
    },
  ];
}

/** The one thing on the books that most needs attention, in a sentence. */
export function finding(s: TerminalState): string {
  const late = overdue(s);
  if (late.length) {
    const worst = late.reduce((a, b) => (statementTotals(b).due > statementTotals(a).due ? b : a));
    const more = late.length > 1 ? ` One of ${late.length} overdue statements.` : '';
    return `${peso(statementTotals(worst).due)} from ${nameOf(s, worst.client)} has been overdue since ${shortDate(worst.due)}.${more}`;
  }
  const pending = awaitingApproval(s);
  if (pending.length) {
    return `${count(pending.length, 'voucher')} worth ${peso(sumCentavos(pending, voucherTotal))} ${pending.length === 1 ? 'waits' : 'wait'} for approval.`;
  }
  const queued = queuedForPrinting(s);
  if (queued.length) return `${count(queued.length, 'ID')} ${queued.length === 1 ? 'is' : 'are'} waiting to be printed.`;
  return 'Nothing is waiting on you. Every voucher is signed and every statement is settled.';
}

export function lastEntryDate(s: TerminalState): string {
  return s.log.length ? shortDate(s.log[0].when.slice(0, 10)) : '—';
}
