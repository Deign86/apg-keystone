import { describe, expect, it } from 'vitest';
import { refusalOf } from '@keystone/kit/testing';
import { companyOf, lineDraft, SERVICES, toCentavos, type BankAccount, type Ctx } from '@keystone/core';
import {
  billingFigure, billingFinding, billingWaiting, EWT_RATE, EWT_RATES, ewtRateOf, markOverdue, newStatement, nextStatementNo, paidInto, withStatementDate, payInto,
  recordPayment, saveStatement, STATEMENT_STATUSES, statementDraftFrom, statementDraftOf, statementDraftTitle, statementPayments, statementTone, statementTotals, withClient,
} from '../src/rules';
import { billingModule } from '../src';
import { sampleState } from '@keystone/core/sample';

/** 30 Oct 2026, 09:05 in Manila. */
const ctx: Ctx = { now: () => new Date(2026, 9, 30, 9, 5) };
const state = () => sampleState();

/** A new statement billed to Novatek (C-001), typed as its directory name: a VAT client that withholds EWT. */
const billed = (s: ReturnType<typeof state>) => withClient(s, newStatement(s, ctx), 'Novatek BPO Solutions Inc.');

describe('billing statements', () => {
  it('keeps the statuses and tones a statement has always had, and reads one it does not know as neutral', () => {
    expect(STATEMENT_STATUSES.map((s) => [s, statementTone(s)])).toEqual([['Sent', 'neutral'], ['Paid', 'good'], ['Overdue', 'bad'], ['Void', 'neutral']]);
    expect(statementTone('Disputed')).toBe('neutral');
  });

  it('totals match the prototype (VAT added, EWT withheld)', () => {
    const due = Object.fromEntries(sampleState().bs.map((b) => [b.no, statementTotals(b).due]));
    expect(due['010097-2026']).toBe(toCentavos(426930));
    expect(due['010098-2026']).toBe(toCentavos(91000));
    expect(due['010099-2026']).toBe(toCentavos(586627.5));
  });

  it('numbers invoices 888- and the date as month, day and year, then -2, -3 on the same day', () => {
    const s = state();
    expect(nextStatementNo(s, '2026-10-30')).toBe('888103026');
    expect(nextStatementNo(s, '2027-01-05')).toBe('888010527');
    const one = { ...s, bs: [...s.bs, { ...s.bs[0], no: '888103026' }] };
    expect(nextStatementNo(one, '2026-10-30')).toBe('888103026-2');
    expect(nextStatementNo({ ...one, bs: [...one.bs, { ...s.bs[0], no: '888103026-2' }] }, '2026-10-30')).toBe('888103026-3');
    // A new statement takes its date's number as its date changes; a number typed by hand stays.
    const d = newStatement(s, ctx);
    expect(withStatementDate(s, d, '2026-11-02').no).toBe('888110226');
    expect(withStatementDate(s, { ...d, no: 'SPECIAL-1' }, '2026-11-02').no).toBe('SPECIAL-1');
  });

  it('keeps the invoice number typed on a new statement, and refuses one in use', () => {
    const s = state();
    const d = { ...billed(s), lines: [lineDraft({ desc: 'Virtual Office Service (October 2026)', amount: '2,299' })] };
    expect(saveStatement(s, d, ctx).record.no).toBe('888103026');
    expect(saveStatement(s, { ...d, no: '010150-2026' }, ctx).record.no).toBe('010150-2026');
    expect(refusalOf(() => saveStatement(s, { ...d, no: '010099-2026' }, ctx))).toEqual({ error: 'Invoice No. 010099-2026 is already used. The next free one is 888103026.', fields: [] });
    expect(saveStatement(s, statementDraftOf(s.bs[2], s), ctx, true).record.no).toBe('888102526'); // a copy takes the next number for its date
  });

  it('prices each charge by quantity, and adds VAT on the subtotal', () => {
    const s = state();
    const d = { ...billed(s), ewt: false, lines: [lineDraft({ desc: 'Virtual Office Service (October 2026)', qty: '1', amount: '2,299' })] };
    const b = saveStatement(s, d, ctx).record;
    expect(b.lines).toEqual([{ desc: 'Virtual Office Service (October 2026)', qty: 1, price: 2299, amt: 2299 }]);
    expect(statementTotals(b)).toEqual({ subtotal: toCentavos(2299), vat: toCentavos(275.88), ewt: 0, due: toCentavos(2574.88) });
    const two = saveStatement(s, { ...d, lines: [lineDraft({ desc: 'Desk', qty: '2', amount: '1,500' })] }, ctx).record;
    expect(statementTotals(two).subtotal).toBe(toCentavos(3000));
    expect(refusalOf(() => saveStatement(s, { ...d, lines: [lineDraft({ desc: 'Desk', qty: '0', amount: '1,500' })] }, ctx))).toEqual({ error: 'Enter a quantity above zero on every charge.', fields: ['lines.0.qty'] });
    // Each charge without a quantity is named by its line on the form, a blank line before it counted.
    const blank = [lineDraft(), lineDraft({ desc: 'Desk', qty: '0', amount: '1,500' }), lineDraft({ desc: 'Chair', amount: '500' }), lineDraft({ desc: 'Lamp', qty: 'x', amount: '200' })];
    expect(refusalOf(() => saveStatement(s, { ...d, lines: blank }, ctx))).toEqual({ error: 'Enter a quantity above zero on every charge.', fields: ['lines.1.qty', 'lines.3.qty'] });
    expect(refusalOf(() => saveStatement(s, { ...d, lines: [lineDraft()] }, ctx))).toEqual({ error: 'Add at least one charge with an amount.', fields: ['lines.0.amount'] });
  });

  it('withholds 2% EWT on a new statement, and keeps the 5% an older one withheld', () => {
    const s = state();
    const d = { ...billed(s), lines: [lineDraft({ desc: 'Virtual office', amount: '10,000' })] };
    expect(EWT_RATE).toBe(2);
    expect(d.ewtRate).toBe(2);
    const b = saveStatement(s, d, ctx).record;
    expect(b.ewtRate).toBe(2);
    expect(statementTotals(b)).toEqual({ subtotal: toCentavos(10000), vat: toCentavos(1200), ewt: toCentavos(200), due: toCentavos(11000) });

    // The sample's statements were saved before statements kept their rate: they withheld 5%, and still do once edited.
    const older = s.bs.find((x) => x.no === '010099-2026')!;
    expect(older.ewtRate).toBeUndefined();
    expect(ewtRateOf(older)).toBe(5);
    expect(saveStatement(s, statementDraftOf(older, s), ctx).record.ewtRate).toBe(5);
  });

  it('withholds 5% EWT when that rate is picked, and no rate but 2% or 5%', () => {
    const s = state();
    const d = { ...billed(s), ewtRate: 5, lines: [lineDraft({ desc: 'Unit rental', amount: '10,000' })] };
    expect(EWT_RATES).toEqual([2, 5]);
    const b = saveStatement(s, d, ctx).record;
    expect(b.ewtRate).toBe(5);
    expect(statementTotals(b)).toEqual({ subtotal: toCentavos(10000), vat: toCentavos(1200), ewt: toCentavos(500), due: toCentavos(10700) });

    expect(refusalOf(() => saveStatement(s, { ...d, ewtRate: 10 }, ctx))).toEqual({ error: 'Withhold 2% or 5% EWT.', fields: ['ewtRate'] });
    // With nothing withheld, the rate is not asked about.
    expect(saveStatement(s, { ...d, ewt: false, ewtRate: 10 }, ctx).record.ewt).toBe(false);
  });

  it('is prepared by whoever is signed in, and checked and approved as the last statement was', () => {
    const s = state();
    const d = billed(s);
    // No statement names its signatories yet, so they start as Company Details'.
    expect(d).toMatchObject({ prepared: 'D. Lazaro', checked: 'Accounting', approved: 'CEO' });
    expect(newStatement(s, { ...ctx, who: { uid: 'staff-1', name: 'Jean Ashley Chico', role: 'staff' } }).prepared).toBe('Jean Ashley Chico');

    const saved = saveStatement(s, { ...d, checked: ' Mark Anthony Santos ', approved: 'Brian Sy', lines: [lineDraft({ desc: 'Rent', amount: '100' })] }, ctx);
    expect(saved.record).toMatchObject({ checked: 'Mark Anthony Santos', approved: 'Brian Sy' });
    expect(newStatement(saved.state, ctx)).toMatchObject({ checked: 'Mark Anthony Santos', approved: 'Brian Sy' });
  });

  it('keeps each signatory\'s position as typed, only when there is one, and starts the next statement with them', () => {
    const s = state();
    const d = billed(s);
    // No statement names a position yet.
    expect(d).toMatchObject({ preparedPos: '', checkedPos: '', approvedPos: '' });

    const saved = saveStatement(s, { ...d, checkedPos: ' Finance Manager ', approvedPos: 'Chief Executive Officer', lines: [lineDraft({ desc: 'Rent', amount: '100' })] }, ctx);
    expect(saved.record).toMatchObject({ checkedPos: 'Finance Manager', approvedPos: 'Chief Executive Officer' });
    // A position left blank is not kept at all, as on a statement saved before positions.
    expect(saved.record).not.toHaveProperty('preparedPos');
    expect(newStatement(saved.state, ctx)).toMatchObject({ preparedPos: '', checkedPos: 'Finance Manager', approvedPos: 'Chief Executive Officer' });
    expect(statementDraftOf(saved.record, saved.state)).toMatchObject({ checkedPos: 'Finance Manager', approvedPos: 'Chief Executive Officer' });
  });

  it('is billed to whoever is typed, and a directory client typed by name brings its setup', () => {
    const s = state();
    const d = newStatement(s, ctx);
    expect(d).toMatchObject({ client: '', attention: '', vat: false, ewt: false });
    expect(d.due).toBe('2026-11-14');
    expect(d.invoiceDate).toBe('2026-10-30');
    expect(d.notes).toContain('Account Number: 4011 0258 68');
    expect(withClient(s, d, '  harbor point logistics corp. ')).toMatchObject({ vat: true, ewt: true, attention: 'Liza Tan' });
    expect(withClient(s, { ...d, vat: true, ewt: true, attention: 'Liza Tan' }, 'Dela Cruz, Maria Teresa')).toMatchObject({ vat: false, ewt: false, attention: '' });
    // A name not in the directory leaves the setup as it was.
    const racil = withClient(s, { ...d, vat: true }, 'RACIL REALTY INC');
    expect(racil).toMatchObject({ client: 'RACIL REALTY INC', vat: true, ewt: false });

    const saved = saveStatement(s, { ...racil, lines: [lineDraft({ desc: 'Commission', amount: '210,000' })] }, ctx);
    expect(saved.record.client).toBe('RACIL REALTY INC');
    expect(saved.state.log[0].text).toBe('888103026 sent to RACIL REALTY INC (₱235,200.00 due Nov 14, 2026).');
    expect(refusalOf(() => saveStatement(s, { ...racil, client: '  ', lines: [lineDraft({ desc: 'Commission', amount: '1' })] }, ctx))).toEqual({ error: 'Enter who the statement is billed to.', fields: ['client'] });
    // A statement saved before Bill to was typed names its client by code, and comes back with the name.
    expect(statementDraftOf(s.bs[2], s).client).toBe('Harbor Point Logistics Corp.');
  });

  it('keeps Bill to\'s address as typed, only when there is one, and a client typed by name leaves it as it is', () => {
    const s = state();
    const d = { ...billed(s), address: '  Ortigas Ave., Pasig City ' };

    expect(newStatement(s, ctx).address).toBe('');
    expect(withClient(s, d, 'Dela Cruz, Maria Teresa').address).toBe('  Ortigas Ave., Pasig City ');
    const saved = saveStatement(s, { ...d, lines: [lineDraft({ desc: 'Rent', amount: '1000' })] }, ctx);

    expect(saved.record.address).toBe('Ortigas Ave., Pasig City');
    expect(statementDraftOf(saved.record, saved.state).address).toBe('Ortigas Ave., Pasig City');
    // None typed: none kept, as on a statement saved before Bill to had an address.
    const bare = saveStatement(s, { ...billed(s), lines: [lineDraft({ desc: 'Rent', amount: '1000' })] }, ctx);

    expect(bare.record).not.toHaveProperty('address');
    expect(statementDraftOf(bare.record, bare.state).address).toBe('');
  });

  it('keeps Bill to\'s TIN as typed, brings a directory client\'s, and keeps none when there is none', () => {
    const s = state();

    expect(newStatement(s, ctx).tin).toBe('');
    // A directory client with a TIN brings it; one without, or a name not in the directory, leaves what was typed.
    expect(billed(s).tin).toBe('008-771-402-000');
    expect(withClient(s, { ...newStatement(s, ctx), tin: '123-456-789-000' }, 'Dela Cruz, Maria Teresa').tin).toBe('123-456-789-000');
    expect(withClient(s, { ...newStatement(s, ctx), tin: '123-456-789-000' }, 'RACIL REALTY INC').tin).toBe('123-456-789-000');
    const saved = saveStatement(s, { ...billed(s), tin: ' 008-771-402-000 ', lines: [lineDraft({ desc: 'Rent', amount: '1000' })] }, ctx);

    expect(saved.record.tin).toBe('008-771-402-000');
    expect(statementDraftOf(saved.record, saved.state).tin).toBe('008-771-402-000');
    // None typed: none kept, as on a statement saved before Bill to had a TIN.
    const bare = saveStatement(s, { ...billed(s), tin: '  ', lines: [lineDraft({ desc: 'Rent', amount: '1000' })] }, ctx);

    expect(bare.record).not.toHaveProperty('tin');
    expect(statementDraftOf(bare.record, bare.state).tin).toBe('');
  });

  it('refuses a statement due before its invoice date', () => {
    const s = state();
    const d = { ...billed(s), due: '2026-10-01', lines: [lineDraft({ desc: 'Rent', amount: '100' })] };
    expect(refusalOf(() => saveStatement(s, d, ctx))).toEqual({ error: 'The due date is before the invoice date.', fields: ['due'] });
    expect(refusalOf(() => saveStatement(s, { ...d, due: '' }, ctx))).toEqual({ error: 'Enter the due date.', fields: ['due'] });
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

// "Pay into" is shown only when Bank Accounts provides SERVICES.bankAccounts; these are the rules it calls.
describe('the account a client pays into', () => {
  const bpi: BankAccount = { id: 'B-001', bank: 'BPI', branch: '', name: 'Alpha Premier Group of Companies OPC', number: '4011 0258 68' };
  const bdo: BankAccount = { id: 'B-002', bank: 'BDO', branch: 'Ortigas Center', name: 'APG Holdings OPC', number: '0012 3456 7890' };
  const instructions = companyOf(sampleState()).paymentInstructions;

  it('rewrites the Bank, Account Name and Account Number lines and keeps the rest of the text', () => {
    expect(payInto(instructions, bdo)).toBe([
      'Please make payment to:',
      'Bank: BDO, Ortigas Center',
      'Account Name: APG Holdings OPC',
      'Account Number: 0012 3456 7890',
      '',
      'Kindly send proof of payment to accounting@alphapremiergroup.com',
    ].join('\n'));
    // The account Company Details names writes its own payment instructions back exactly.
    expect(payInto(payInto(instructions, bdo), bpi)).toBe(instructions);
  });

  it('puts the account lines where the first of them was, and at the top of text that has none', () => {
    const lines = (...xs: string[]) => xs.join('\n');
    const block = ['Bank: BPI', 'Account Name: Alpha Premier Group of Companies OPC', 'Account Number: 4011 0258 68'];

    expect(payInto(lines('Pay to:', 'account number: 1', 'Thank you.'), bpi)).toBe(lines('Pay to:', ...block, 'Thank you.'));
    expect(payInto('Send proof to billing.', bpi)).toBe(lines(...block, '', 'Send proof to billing.'));
    expect(payInto('', bpi)).toBe(lines(...block));
  });

  it('knows which account the instructions name, by its number however it is spaced', () => {
    expect(paidInto(instructions, [bdo, bpi])).toBe(bpi);
    expect(paidInto('Account Number: 0012-3456-7890', [bpi, bdo])).toBe(bdo);
    expect(paidInto(instructions, [bdo])).toBeUndefined();
    expect(paidInto('Account Number:', [{ ...bdo, number: '' }])).toBeUndefined();
    expect(paidInto('Pay in cash.', [bpi])).toBeUndefined();
  });

  it('pays a new statement into the account the last one named, or the one Company Details names, or the first kept', () => {
    const s = state();
    const save = (st: typeof s, notes: string) => saveStatement(st, { ...billed(st), notes, lines: [lineDraft({ desc: 'Rent', amount: '100' })] }, ctx).state;

    // No statement names an account yet: Company Details' instructions name BPI.
    expect(paidInto(newStatement(s, ctx, [bdo, bpi]).notes, [bdo, bpi])).toBe(bpi);
    // The last statement paid into BDO, so the next one does too, as a voucher is drawn on the last voucher's bank.
    expect(paidInto(newStatement(save(s, payInto(instructions, bdo)), ctx, [bpi, bdo]).notes, [bpi, bdo])).toBe(bdo);
    // Neither names a kept account: the first kept, written into Company Details' text.
    expect(newStatement(s, ctx, [bdo]).notes).toBe(payInto(instructions, bdo));
    // Without Bank Accounts the instructions are Company Details' as typed.
    expect(newStatement(s, ctx).notes).toBe(instructions);
  });

  it('saves the account picked with the statement, as its payment instructions', () => {
    const s = state();
    const d = { ...billed(s), lines: [lineDraft({ desc: 'Rent', amount: '100' })] };
    const b = saveStatement(s, { ...d, notes: payInto(d.notes, bdo) }, ctx).record;
    expect(b.notes).toContain('Account Number: 0012 3456 7890');
    expect(paidInto(statementDraftOf(b, s).notes, [bpi, bdo])).toBe(bdo);
  });
});

describe('a saved draft of a statement (docs/adr/0041)', () => {
  it('is called by whom it bills and what it comes to so far', () => {
    const s = state();

    expect(statementDraftTitle({ ...billed(s), lines: [lineDraft({ desc: 'Rent', amount: '1000' })] })).toBe('Novatek BPO Solutions Inc. · ₱1,100.00');
    expect(statementDraftTitle(newStatement(s, ctx))).toBe('No client yet · ₱0.00');
  });

  it('goes back in the form over a new statement, with the next invoice number unless it edits a saved one', () => {
    const s = state();
    const back = statementDraftFrom(s, ctx, [], { client: 'Springfield Properties Inc.', no: '010150-2026', lines: [{ id: 'line-1', desc: 'Rent', qty: '2', amount: '500' }] });

    expect(back).toMatchObject({ client: 'Springfield Properties Inc.', no: '888103026', ewtRate: EWT_RATE, notes: companyOf(s).paymentInstructions });
    expect(back.lines.map((l) => [l.desc, l.qty, l.amount])).toEqual([['Rent', '2', '500']]);
    expect(statementDraftFrom(s, ctx, [], { ...statementDraftOf(s.bs[2], s) }).no).toBe(s.bs[2].no);
  });
});
