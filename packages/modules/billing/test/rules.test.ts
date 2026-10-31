import { describe, expect, it } from 'vitest';
import { bundledSeed, lineDraft, SERVICES, toCentavos, type Ctx } from '@keystone/core';
import {
  billingFigure, billingFinding, billingWaiting, lineWithTax, markOverdue, newStatement, nextStatementNo, recordPayment,
  saveStatement, statementDraftOf, statementPayments, statementTotals, withClient,
} from '../src/rules';
import { billingModule } from '../src';

/** 30 Oct 2026, 09:05 in Manila. */
const ctx: Ctx = { seed: bundledSeed, now: () => new Date(2026, 9, 30, 9, 5) };
const state = () => structuredClone(bundledSeed.state);

describe('billing statements', () => {
  it('totals match the prototype (VAT added, EWT withheld)', () => {
    const due = Object.fromEntries(bundledSeed.state.bs.map((b) => [b.no, statementTotals(b).due]));
    expect(due['010097-2026']).toBe(toCentavos(426930));
    expect(due['010098-2026']).toBe(toCentavos(91000));
    expect(due['010099-2026']).toBe(toCentavos(586627.5));
  });

  it('numbers invoices with a six-digit running number and the year', () => {
    expect(nextStatementNo(state(), ctx)).toBe('010100-2026');
    const older = { ...state(), bs: [...state().bs, { ...state().bs[0], no: 'BS-2026-0123' }] };
    expect(nextStatementNo(older, ctx)).toBe('010100-2026'); // older numbers don't count
    expect(nextStatementNo({ ...state(), bs: [] }, ctx)).toBe('000001-2026');
  });

  it('keeps the invoice number typed on a new statement, and refuses one in use', () => {
    const s = state();
    const d = { ...newStatement(s, ctx), lines: [lineDraft({ desc: 'Virtual Office Service (October 2026)', amount: '2,299' })] };
    expect(saveStatement(s, d, ctx).record.no).toBe('010100-2026');
    expect(saveStatement(s, { ...d, no: '010150-2026' }, ctx).record.no).toBe('010150-2026');
    expect(() => saveStatement(s, { ...d, no: '010099-2026' }, ctx)).toThrow('Invoice No. 010099-2026 is already used. The next free one is 010100-2026.');
    expect(saveStatement(s, statementDraftOf(s.bs[2], ctx), ctx, true).record.no).toBe('010100-2026'); // a copy takes the next
  });

  it('prices each charge by quantity and shows it with tax, as the company statement does', () => {
    const s = state();
    const d = { ...withClient(s, newStatement(s, ctx), 'C-001'), ewt: false, lines: [lineDraft({ desc: 'Virtual Office Service (October 2026)', qty: '1', amount: '2,299' })] };
    const b = saveStatement(s, d, ctx).record;
    expect(b.lines).toEqual([{ desc: 'Virtual Office Service (October 2026)', qty: 1, price: 2299, amt: 2299 }]);
    expect(statementTotals(b)).toEqual({ subtotal: toCentavos(2299), vat: toCentavos(275.88), ewt: 0, due: toCentavos(2574.88) });
    expect(lineWithTax(b, b.lines[0])).toBe(toCentavos(2574.88));
    expect(lineWithTax({ vat: false }, b.lines[0])).toBe(toCentavos(2299));
    const two = saveStatement(s, { ...d, lines: [lineDraft({ desc: 'Desk', qty: '2', amount: '1,500' })] }, ctx).record;
    expect(statementTotals(two).subtotal).toBe(toCentavos(3000));
    expect(() => saveStatement(s, { ...d, lines: [lineDraft({ desc: 'Desk', qty: '0', amount: '1,500' })] }, ctx)).toThrow('Enter a quantity above zero on every charge.');
  });

  it('takes defaults from the client', () => {
    const s = state();
    const d = newStatement(s, ctx);
    expect(d.due).toBe('2026-11-14');
    expect(d.invoiceDate).toBe('2026-10-30');
    expect(d.notes).toContain('Account Number: 4011 0258 68');
    expect(withClient(s, d, 'C-002')).toMatchObject({ vat: false, ewt: false, attention: '' });
    expect(withClient(s, d, 'C-003')).toMatchObject({ vat: true, ewt: true, attention: 'Liza Tan' });
  });

  it('refuses a statement due before its invoice date', () => {
    const s = state();
    const d = { ...newStatement(s, ctx), due: '2026-10-01', lines: [lineDraft({ desc: 'Rent', amount: '100' })] };
    expect(() => saveStatement(s, d, ctx)).toThrow('The due date is before the invoice date.');
  });

  it('settles a statement with a reported payment, never a partial one', () => {
    const p = { amount: 91000, method: 'GCash', reference: '7731925', source: 'the website (ticket APG-1A2B3C4D)' };
    const r = recordPayment(state(), '010098-2026', p, ctx);
    expect(r.record.status).toBe('Paid');
    expect(r.state.log[0].text).toBe('010098-2026 from Dela Cruz, Maria Teresa paid: ₱91,000.00 by GCash ref 7731925, reported on the website (ticket APG-1A2B3C4D).');
    expect(() => recordPayment(state(), '010098-2026', { ...p, amount: 50000 }, ctx)).toThrow(/less than the ₱91,000.00 due/);
    expect(() => recordPayment(r.state, '010098-2026', p, ctx)).toThrow(/already paid/);
  });

  it('marks statements overdue on open', () => {
    expect(markOverdue(state(), ctx).bs.find((b) => b.no === '010099-2026')?.status).toBe('Sent'); // due Nov 5
    const late = markOverdue(state(), { ...ctx, now: () => new Date(2026, 10, 10) });
    expect(late.bs.find((b) => b.no === '010099-2026')?.status).toBe('Overdue');
    expect(late.log[0].text).toBe('010099-2026 marked overdue.');
  });

  it('contributes its figure, finding and waiting items', () => {
    const s = state();
    expect(billingFigure(s)).toMatchObject({ value: '₱677,627.50', caption: '2 statements open · 1 overdue', lead: true });
    expect(billingFinding(s)).toEqual({ priority: 30, text: '₱91,000.00 from Dela Cruz, Maria Teresa has been overdue since Oct 10, 2026.' });
    expect(billingWaiting(s).map((w) => w.no)).toEqual(['010098-2026', '010099-2026']);
  });

  it('offers the statement-payments service under its published name', () => {
    expect(billingModule.provides?.[SERVICES.statementPayments]).toBe(statementPayments);
    expect(statementPayments.open(state())).toEqual([
      { no: '010098-2026', client: 'Dela Cruz, Maria Teresa', due: '2026-10-10', amount: toCentavos(91000) },
      { no: '010099-2026', client: 'Harbor Point Logistics Corp.', due: '2026-11-05', amount: toCentavos(586627.5) },
    ]);
  });
});
