import { describe, expect, it } from 'vitest';
import { bundledSeed, lineDraft, SERVICES, toCentavos, type Ctx } from '@keystone/core';
import {
  billingFigure, billingFinding, billingWaiting, markOverdue, newStatement, nextStatementNo, recordPayment, saveStatement,
  statementPayments, statementTotals, withClient,
} from '../src/rules';
import { billingModule } from '../src';

/** 30 Oct 2026, 09:05 in Manila. */
const ctx: Ctx = { seed: bundledSeed, now: () => new Date(2026, 9, 30, 9, 5) };
const state = () => structuredClone(bundledSeed.state);

describe('billing statements', () => {
  it('totals match the prototype (VAT added, EWT withheld)', () => {
    const due = Object.fromEntries(bundledSeed.state.bs.map((b) => [b.no, statementTotals(b).due]));
    expect(due['BS-2026-0086']).toBe(toCentavos(426930));
    expect(due['BS-2026-0087']).toBe(toCentavos(91000));
    expect(due['BS-2026-0088']).toBe(toCentavos(586627.5));
    expect(nextStatementNo(state(), ctx)).toBe('BS-2026-0089');
  });

  it('takes defaults from the client', () => {
    const s = state();
    const d = newStatement(s, ctx);
    expect(d.due).toBe('2026-11-14');
    expect(withClient(s, d, 'C-002')).toMatchObject({ vat: false, ewt: false });
    expect(withClient(s, d, 'C-003')).toMatchObject({ vat: true, ewt: true });
  });

  it('refuses a statement due before it is dated', () => {
    const s = state();
    const d = { ...newStatement(s, ctx), due: '2026-10-01', lines: [lineDraft({ desc: 'Rent', amount: '100' })] };
    expect(() => saveStatement(s, d, ctx)).toThrow('The due date is before the statement date.');
  });

  it('settles a statement with a reported payment, never a partial one', () => {
    const p = { amount: 91000, method: 'GCash', reference: '7731925', source: 'the website (ticket APG-1A2B3C4D)' };
    const r = recordPayment(state(), 'BS-2026-0087', p, ctx);
    expect(r.record.status).toBe('Paid');
    expect(r.state.log[0].text).toBe('BS-2026-0087 from Dela Cruz, Maria Teresa paid: ₱91,000.00 by GCash ref 7731925, reported on the website (ticket APG-1A2B3C4D).');
    expect(() => recordPayment(state(), 'BS-2026-0087', { ...p, amount: 50000 }, ctx)).toThrow(/less than the ₱91,000.00 due/);
    expect(() => recordPayment(r.state, 'BS-2026-0087', p, ctx)).toThrow(/already paid/);
  });

  it('marks statements overdue on open', () => {
    expect(markOverdue(state(), ctx).bs.find((b) => b.no === 'BS-2026-0088')?.status).toBe('Sent'); // due Nov 5
    const late = markOverdue(state(), { ...ctx, now: () => new Date(2026, 10, 10) });
    expect(late.bs.find((b) => b.no === 'BS-2026-0088')?.status).toBe('Overdue');
    expect(late.log[0].text).toBe('BS-2026-0088 marked overdue.');
  });

  it('contributes its figure, finding and waiting items', () => {
    const s = state();
    expect(billingFigure(s)).toMatchObject({ value: '₱677,627.50', caption: '2 statements open · 1 overdue', lead: true });
    expect(billingFinding(s)).toEqual({ priority: 30, text: '₱91,000.00 from Dela Cruz, Maria Teresa has been overdue since Oct 10, 2026.' });
    expect(billingWaiting(s).map((w) => w.no)).toEqual(['BS-2026-0087', 'BS-2026-0088']);
  });

  it('offers the statement-payments service under its published name', () => {
    expect(billingModule.provides?.[SERVICES.statementPayments]).toBe(statementPayments);
    expect(statementPayments.open(state())).toEqual([
      { no: 'BS-2026-0087', client: 'Dela Cruz, Maria Teresa', due: '2026-10-10', amount: toCentavos(91000) },
      { no: 'BS-2026-0088', client: 'Harbor Point Logistics Corp.', due: '2026-11-05', amount: toCentavos(586627.5) },
    ]);
  });
});
