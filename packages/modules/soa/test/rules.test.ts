import { describe, expect, it } from 'vitest';
import { emptyState, moduleData, toCentavos, type Ctx } from '@keystone/core';
import {
  addMonths, depositLines, dueOnSigning, leaseSchedule, leaseTermsOf, monthlyRent, newSoa, pdcSchedule, pdcStart, removeSoa, saveSoa,
  soaDraftOf, soaLine, soaOf, statementsOf, type SoaDraft,
} from '../src/rules';

/** 24 Nov 2026, 09:05 in Manila. */
const ctx: Ctx = { now: () => new Date(2026, 10, 24, 9, 5) };

/** The company's form: 354.4 sqm at ₱600, two months' deposit and advance, the reservation paid in cash. */
const draft = (patch: Partial<SoaDraft> = {}): SoaDraft => ({
  ...newSoa(emptyState(), ctx), client: 'Northwind Retail Corp.', property: 'Unit 5, Ortigas Avenue, Pasig', payee: 'Juan Dela Cruz',
  sqm: '354.4', rate: '600', reservation: '212,640', reservationCoverage: '1 month deductible to advance rental', reservationCheck: 'CASH DEPOSIT',
  depositCoverage: 'Remaining 1 month', advanceCoverage: 'Jan – Feb 2027', commencement: '2027-01-01', termMonths: '24', escalation: '5',
  pdcFirst: '2027-02', pdcCount: '12', bank: 'BPI', firstCheck: '6000325749', ...patch,
});

describe('the monthly rent', () => {
  it('is the area times the rate, plus 12% VAT and less 5% EWT, both on the base rent', () => {
    expect(monthlyRent(soaOf(draft()))).toEqual({ base: 21264000, vat: 2551680, ewt: 1063200, net: 22752480 });
  });

  it('drops VAT or EWT when it is off', () => {
    expect(monthlyRent(soaOf(draft({ vat: false, ewt: false }))).net).toBe(21264000);
    expect(monthlyRent(soaOf(draft({ ewt: false }))).net).toBe(21264000 + 2551680);
  });
});

describe('the deposit and advance', () => {
  it('are months of base rent and of monthly rent, less the reservation: the form’s ₱455,049.60 advance', () => {
    const lines = depositLines(soaOf(draft()));

    expect(lines.map((l) => [l.desc, l.amount, l.qty, l.total, !!l.credit])).toEqual([
      ['Reservation', 21264000, 1, 21264000, true],
      ['Security deposit (2 months base rent)', 21264000, 2, 42528000, false],
      ['Advance rental (2 months)', 22752480, 2, toCentavos(455049.6), false],
    ]);
    expect(dueOnSigning(soaOf(draft()))).toBe(toCentavos(425280 + 455049.6 - 212640));
  });

  it('has no reservation line when none was paid', () => {
    expect(depositLines(soaOf(draft({ reservation: '' }))).map((l) => l.desc)).toEqual(['Security deposit (2 months base rent)', 'Advance rental (2 months)']);
  });
});

describe('the lease years', () => {
  it('escalate the base rent each year from the second, on the year before’s', () => {
    const years = leaseSchedule(soaOf(draft({ termMonths: '36' })));

    expect(years.map((y) => [y.year, y.from, y.to, y.base, y.net])).toEqual([
      [1, '2027-01-01', '2027-12-31', 21264000, 22752480],
      [2, '2028-01-01', '2028-12-31', 22327200, 23890104],
      [3, '2029-01-01', '2029-12-31', 23443560, 25084609],
    ]);
  });

  it('count a part year, which ends with the term', () => {
    expect(leaseSchedule(soaOf(draft({ termMonths: '18' }))).map((y) => [y.from, y.to])).toEqual([['2027-01-01', '2027-12-31'], ['2028-01-01', '2028-06-30']]);
  });

  it('read as the term and escalation when no lease terms are typed', () => {
    expect(leaseTermsOf(soaOf(draft()))).toBe('2 years, 5% escalation a year from the second year');
    expect(leaseTermsOf(soaOf(draft({ termMonths: '6' })))).toBe('6 months');
    expect(leaseTermsOf(soaOf(draft({ leaseTerms: ' Two years, renewable ' })))).toBe('Two years, renewable');
  });
});

describe('the postdated checks', () => {
  it('are the form’s schedule: dated the 28th of the month before, numbered on, the next year’s at its escalated rent', () => {
    const checks = pdcSchedule(soaOf(draft()));

    expect(checks).toHaveLength(12);
    expect(checks[0]).toEqual({ no: 1, date: '2027-01-28', bank: 'BPI', check: '6000325749', amount: 22752480, month: '2027-02' });
    expect(checks[10]).toMatchObject({ date: '2027-11-28', check: '6000325759', amount: 22752480, month: '2027-12' });
    expect(checks[11]).toMatchObject({ date: '2027-12-28', check: '6000325760', amount: 23890104, month: '2028-01' });
  });

  it('start the month after the advance, one for each month it does not pay, unless set', () => {
    const a = soaOf(draft({ pdcFirst: '', pdcCount: '' }));

    expect(pdcStart(a)).toBe('2027-03');
    expect(pdcSchedule(a)).toHaveLength(22);
  });

  it('are dated no later than the month’s last day, and keep a check number’s leading zeros', () => {
    const checks = pdcSchedule(soaOf(draft({ pdcFirst: '2027-03', pdcDay: '31', firstCheck: '0099' })));

    expect(checks.slice(0, 2).map((c) => [c.date, c.check])).toEqual([['2027-02-28', '0099'], ['2027-03-31', '0100']]);
  });

  it('are none before the commencement date is set', () => {
    expect(pdcSchedule(soaOf(draft({ commencement: '' })))).toEqual([]);
  });

  it('count months across years', () => {
    expect(addMonths('2027-11', 3)).toBe('2028-02');
  });
});

describe('saving', () => {
  it('keeps the statement under state.ext.soa with the next number, and logs it', () => {
    const r = saveSoa(emptyState(), draft(), ctx);

    expect(r.message).toBe('SOA-2026-001 saved.');
    expect(statementsOf(r.state)).toEqual([r.record]);
    expect(moduleData(r.state, 'soa')).toEqual({ statements: [r.record] });
    expect(r.state.log[0]).toMatchObject({ mod: 'SOA', text: 'SOA-2026-001 for Northwind Retail Corp., Unit 5, Ortigas Avenue, Pasig (₱227,524.80 a month, ₱667,689.60 on signing) prepared as of November 24, 2026.' });
    expect(newSoa(r.state, ctx).no).toBe('SOA-2026-002');
    expect(soaLine(r.state)).toBe('1 statement of account saved, for 1 client.');
  });

  it('reads back what it saved through the form', () => {
    const { record } = saveSoa(emptyState(), draft(), ctx);

    expect(soaOf(soaDraftOf(record))).toEqual(record);
  });

  it('edits in place, saves a copy under the next number, and removes', () => {
    const first = saveSoa(emptyState(), draft(), ctx);
    const edited = saveSoa(first.state, { ...soaDraftOf(first.record), rate: '650' }, ctx);

    expect(statementsOf(edited.state).map((a) => [a.no, a.rate])).toEqual([['SOA-2026-001', 650]]);
    const copy = saveSoa(edited.state, soaDraftOf(edited.record), ctx, true);

    expect(statementsOf(copy.state).map((a) => a.no)).toEqual(['SOA-2026-001', 'SOA-2026-002']);
    expect(statementsOf(removeSoa(copy.state, 'SOA-2026-001', ctx).state).map((a) => a.no)).toEqual(['SOA-2026-002']);
  });

  it('refuses what cannot be worked out, with the sentence to show', () => {
    const s = emptyState();

    expect(() => saveSoa(s, draft({ client: ' ' }), ctx)).toThrow('Enter the client.');
    expect(() => saveSoa(s, draft({ sqm: '' }), ctx)).toThrow('Enter the floor area in square metres.');
    expect(() => saveSoa(s, draft({ rate: 'abc' }), ctx)).toThrow('Enter the rate per square metre.');
    expect(() => saveSoa(s, draft({ commencement: '' }), ctx)).toThrow('Enter the contract commencement date.');
    expect(() => saveSoa(s, draft({ termMonths: '12.5' }), ctx)).toThrow('Enter the lease term in whole months.');
    expect(() => saveSoa(s, draft({ pdcFirst: 'Feb 2027' }), ctx)).toThrow('Enter the first check month as YYYY-MM.');
    expect(() => saveSoa(s, draft({ pdcDay: '32' }), ctx)).toThrow('Date the checks on a day from 1 to 31.');
    const { state } = saveSoa(s, draft(), ctx);

    expect(() => saveSoa(state, draft(), ctx)).toThrow('SOA-2026-001 is already used. The next free one is SOA-2026-002.');
  });

  it('keeps nothing until something is saved', () => {
    expect(statementsOf(emptyState())).toEqual([]);
    expect(soaLine(emptyState())).toMatch(/^No statements of account yet\./);
  });
});
