import { describe, expect, it } from 'vitest';
import { refusalOf } from '@keystone/kit/testing';
import { emptyState, moduleData, percent, toCentavos, withModuleData, type Ctx } from '@keystone/core';
import {
  addMonths, baseRentInYear, depositLines, dueOnSigning, leaseSchedule, leaseTermsOf, leaseYearOf, monthlyRent, monthName, newSoa,
  pdcSchedule, pdcStart, pdcTotal, removeSoa, rentOn, saveSoa, soaDraftFrom, soaDraftOf, soaDraftTitle, soaLine, soaOf, statementsNewestFirst, statementsOf,
  topDetails, withCheckNumber, type SoaDraft, earlierSoaEntries, withSoaClient,
} from '../src/rules';
import { soaModule } from '../src';

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
  it('are the form’s schedule: each dated in the month it pays, numbered on, the next year’s at its escalated rent', () => {
    const checks = pdcSchedule(soaOf(draft()));

    expect(checks).toHaveLength(12);
    expect(checks[0]).toEqual({ no: 1, date: '2027-02-28', bank: 'BPI', check: '6000325749', amount: 22752480, month: '2027-02' });
    expect(checks[10]).toMatchObject({ date: '2027-12-28', check: '6000325759', amount: 22752480, month: '2027-12' });
    expect(checks[11]).toMatchObject({ date: '2028-01-28', check: '6000325760', amount: 23890104, month: '2028-01' });
    // Its date and "Payment for" always name the same month.
    expect(checks.every((c) => c.date.slice(0, 7) === c.month)).toBe(true);
  });

  it('start the month after the advance, one for each month it does not pay, unless set', () => {
    const a = soaOf(draft({ pdcFirst: '', pdcCount: '' }));

    expect(pdcStart(a)).toBe('2027-03');
    expect(pdcSchedule(a)).toHaveLength(22);
  });

  it('are dated no later than the month’s last day, and keep a check number’s leading zeros', () => {
    const checks = pdcSchedule(soaOf(draft({ pdcFirst: '2027-03', pdcDay: '31', firstCheck: '0099' })));

    expect(checks.slice(0, 2).map((c) => [c.date, c.check])).toEqual([['2027-03-31', '0099'], ['2027-04-30', '0100']]);
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

    expect(refusalOf(() => saveSoa(s, draft({ client: ' ' }), ctx))).toEqual({ error: 'Enter the client.', fields: ['client'] });
    expect(refusalOf(() => saveSoa(s, draft({ sqm: '' }), ctx))).toEqual({ error: 'Enter the floor area in square metres.', fields: ['sqm'] });
    expect(refusalOf(() => saveSoa(s, draft({ rate: 'abc' }), ctx))).toEqual({ error: 'Enter the rate per square metre.', fields: ['rate'] });
    expect(refusalOf(() => saveSoa(s, draft({ commencement: '' }), ctx))).toEqual({ error: 'Enter the contract commencement date.', fields: ['commencement'] });
    expect(refusalOf(() => saveSoa(s, draft({ termMonths: '12.5' }), ctx))).toEqual({ error: 'Enter the lease term in whole months.', fields: ['termMonths'] });
    expect(refusalOf(() => saveSoa(s, draft({ pdcFirst: 'Feb 2027' }), ctx))).toEqual({ error: 'Enter the first check month as YYYY-MM.', fields: ['pdcFirst'] });
    expect(refusalOf(() => saveSoa(s, draft({ pdcDay: '32' }), ctx))).toEqual({ error: 'Date the checks on a day from 1 to 31.', fields: ['pdcDay'] });
    const { state } = saveSoa(s, draft(), ctx);

    expect(refusalOf(() => saveSoa(state, draft(), ctx))).toEqual({ error: 'SOA-2026-001 is already used. The next free one is SOA-2026-002.', fields: [] });
  });

  it('keeps nothing until something is saved', () => {
    expect(statementsOf(emptyState())).toEqual([]);
    expect(soaLine(emptyState())).toMatch(/^No statements of account yet\./);
  });
});

describe('the arithmetic, for any lease', () => {
  // A small, seeded generator, so a failure names the same lease every run.
  let seed = 86;
  const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

  it('is always base + VAT − EWT, each rounded to the centavo on the base rent', () => {
    for (let i = 0; i < 500; i += 1) {
      const sqm = Math.round(next() * 200000) / 100;
      const rate = Math.round(next() * 300000) / 100;
      const a = soaOf(draft({ sqm: String(sqm), rate: String(rate), vat: next() < 0.5, ewt: next() < 0.5 }));
      const r = monthlyRent(a);

      expect(r.base).toBe(toCentavos(sqm * rate));
      expect(r.vat).toBe(a.vat ? percent(r.base, 12) : 0);
      expect(r.ewt).toBe(a.ewt ? percent(r.base, 5) : 0);
      expect(r.net).toBe(r.base + r.vat - r.ewt);
      expect(Number.isInteger(r.net)).toBe(true);
    }
  });

  it('never lowers the rent from one lease year to the next, and keeps it flat with no escalation', () => {
    for (let i = 0; i < 100; i += 1) {
      const escalation = Math.round(next() * 15);
      const sqm = Math.round(next() * 50000) / 100 + 1;
      const a = soaOf(draft({ sqm: String(sqm), rate: String(Math.round(next() * 2000) + 1), escalation: String(escalation), termMonths: '60' }));
      const bases = leaseSchedule(a).map((y) => y.base);

      expect(bases).toHaveLength(5);
      bases.slice(1).forEach((b, y) => expect(escalation ? b > bases[y] : b === bases[y]).toBe(true));
      bases.forEach((b, y) => expect(baseRentInYear(a, y + 1)).toBe(b));
    }
  });

  it('pays each check the rent of the lease year its month falls in', () => {
    const a = soaOf(draft({ commencement: '2027-03-15', pdcFirst: '2027-04', pdcCount: '30', termMonths: '36' }));

    for (const c of pdcSchedule(a)) expect(c.amount).toBe(rentOn(a, baseRentInYear(a, leaseYearOf(a, c.month))).net);
    expect([leaseYearOf(a, '2028-02'), leaseYearOf(a, '2028-03'), leaseYearOf(a, '2029-03')]).toEqual([1, 2, 3]);
  });
});

describe('the edges of a lease', () => {
  it('asks for nothing on signing when there is no deposit, advance or reservation', () => {
    const a = soaOf(draft({ reservation: '', depositMonths: '0', advanceMonths: '0' }));

    expect(depositLines(a)).toEqual([]);
    expect(dueOnSigning(a)).toBe(0);
    // No advance: the checks start in the commencement month, one for every month of the term.
    expect(pdcStart({ ...a, pdcFirst: '' })).toBe('2027-01');
    expect(pdcTotal({ ...a, pdcCount: 0 })).toBe(24);
  });

  it('writes no more than 120 checks, and none when the advance pays the whole term', () => {
    expect(pdcSchedule(soaOf(draft({ pdcCount: '', termMonths: '600' })))).toHaveLength(120);
    expect(pdcSchedule(soaOf(draft({ pdcCount: '', termMonths: '2' })))).toEqual([]);
  });

  it('numbers a check that is not all digits only on the first, and leaves the rest to be written in', () => {
    expect(pdcSchedule(soaOf(draft({ firstCheck: 'A-100', pdcCount: '3' }))).map((c) => c.check)).toEqual(['A-100', '', '']);
    expect(pdcSchedule(soaOf(draft({ firstCheck: '', pdcCount: '2' }))).map((c) => c.check)).toEqual(['', '']);
  });

  it('counts months back across a year, and names them', () => {
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(addMonths('2027-12', 1)).toBe('2028-01');
    expect(monthName('2027-02')).toBe('February 2027');
  });

  it('reads the lease terms from the term alone when there is one year or no escalation', () => {
    expect(leaseTermsOf(soaOf(draft({ termMonths: '12' })))).toBe('1 year');
    expect(leaseTermsOf(soaOf(draft({ termMonths: '18' })))).toBe('18 months, 5% escalation a year from the second year');
    expect(leaseTermsOf(soaOf(draft({ termMonths: '36', escalation: '0' })))).toBe('3 years');
    expect(leaseTermsOf(soaOf(draft({ termMonths: '' })))).toBe('');
  });

  it('reads amounts as typed, with commas, a peso sign or spaces, and anything else as nothing', () => {
    expect(soaOf(draft({ rate: '₱ 1,250.50', reservation: 'none', sqm: ' 42 ' }))).toMatchObject({ rate: 1250.5, reservation: 0, sqm: 42 });
  });
});

describe('the saved statements', () => {
  it('read back field by field, a damaged one with its gaps empty, zero or off, and anything else left out', () => {
    const s = withModuleData(emptyState(), 'soa', { statements: [{ no: 'SOA-2026-009', client: 'Harbor Point Logistics Corp.', sqm: 'lots', vat: 'yes', ewt: true }, 'junk', { client: 'No number' }] });
    const [a, ...rest] = statementsOf(s);

    expect(rest).toEqual([]);
    expect(a).toMatchObject({ no: 'SOA-2026-009', client: 'Harbor Point Logistics Corp.', sqm: 0, rate: 0, vat: false, ewt: true, property: '', commencement: '', pdcCount: 0 });
    expect(statementsOf(withModuleData(emptyState(), 'soa', 'not a list'))).toEqual([]);
  });

  it('number on within the year, and start again at 001 in a new one', () => {
    const { state } = saveSoa(emptyState(), draft(), ctx);
    const january: Ctx = { now: () => new Date(2027, 0, 4, 9, 0) };

    expect(newSoa(state, ctx).no).toBe('SOA-2026-002');
    expect(newSoa(state, january).no).toBe('SOA-2027-001');
  });

  it('list the newest first, and say how many clients they are for', () => {
    const one = saveSoa(emptyState(), draft(), ctx).state;
    const two = saveSoa(one, draft({ no: 'SOA-2026-002' }), ctx).state;
    const three = saveSoa(two, draft({ no: 'SOA-2026-003', client: 'Harbor Point Logistics Corp.' }), ctx).state;

    expect(statementsNewestFirst(three).map((a) => a.no)).toEqual(['SOA-2026-003', 'SOA-2026-002', 'SOA-2026-001']);
    expect(soaLine(three)).toBe('3 statements of account saved, for 2 clients.');
  });

  it('refuse to edit or remove one that is gone', () => {
    const saved = saveSoa(emptyState(), draft(), ctx);
    const gone = removeSoa(saved.state, 'SOA-2026-001', ctx).state;

    expect(refusalOf(() => saveSoa(gone, soaDraftOf(saved.record), ctx))).toEqual({ error: 'SOA-2026-001 is no longer saved.', fields: [] });
    expect(() => removeSoa(gone, 'SOA-2026-001', ctx)).toThrow('SOA-2026-001 is not saved.');
    expect(moduleData(gone, 'soa')).toEqual({ statements: [] });
  });

  it('refuse an escalation below zero, part months of deposit, more than 120 checks, and no property', () => {
    expect(refusalOf(() => saveSoa(emptyState(), draft({ escalation: '-1' }), ctx))).toEqual({ error: 'The escalation cannot be below zero.', fields: ['escalation'] });
    expect(refusalOf(() => saveSoa(emptyState(), draft({ depositMonths: '1.5' }), ctx))).toEqual({ error: 'Enter the deposit and advance in whole months.', fields: ['depositMonths'] });
    expect(refusalOf(() => saveSoa(emptyState(), draft({ depositMonths: '-1', advanceMonths: '0.5' }), ctx))).toEqual({ error: 'Enter the deposit and advance in whole months.', fields: ['depositMonths', 'advanceMonths'] });
    expect(refusalOf(() => saveSoa(emptyState(), draft({ pdcCount: '121' }), ctx))).toEqual({ error: 'Enter up to 120 checks.', fields: ['pdcCount'] });
    expect(refusalOf(() => saveSoa(emptyState(), draft({ property: '' }), ctx))).toEqual({ error: 'Enter the property address.', fields: ['property'] });
  });
});

describe('what the module contributes', () => {
  it('is Statements of Account at #soa, on Home with how many are saved, logged as SOA, with a New button', () => {
    const saved = saveSoa(emptyState(), draft(), ctx).state;

    expect(soaModule).toMatchObject({ id: 'soa', title: 'Statements of Account', onHome: true, logTags: { SOA: 'Statements of Account' } });
    expect(soaModule.stat?.(emptyState(), ctx, [soaModule])).toEqual(['Saved', '0']);
    expect(soaModule.stat?.(saved, ctx, [soaModule])).toEqual(['Saved', '1']);
    expect(soaModule.create?.label).toBe('New statement of account');
  });
});

describe('check numbers typed on the paper', () => {
  const lease = (patch: Partial<SoaDraft> = {}) => draft({ firstCheck: '029458', pdcCount: '6', ...patch });
  const numbers = (d: SoaDraft) => pdcSchedule(soaOf(d)).map((c) => c.check);

  it('count on from the first check number until one is typed', () => {
    expect(numbers(lease())).toEqual(['029458', '029459', '029460', '029461', '029462', '029463']);
  });

  it('carry the checks after a typed one with it, as a new checkbook would', () => {
    const d = withCheckNumber(lease(), 4, '030001');

    expect(d.checkNos).toEqual({ 4: '030001' });
    expect(numbers(d)).toEqual(['029458', '029459', '029460', '030001', '030002', '030003']);
  });

  it('keep each typed check, and count on from the latest before each', () => {
    const d = withCheckNumber(withCheckNumber(lease(), 2, '029470'), 5, '000100');

    expect(numbers(d)).toEqual(['029458', '029470', '029471', '029472', '000100', '000101']);
  });

  it('go back to counting when a typed number is cleared or typed as it would be anyway', () => {
    const typed = withCheckNumber(lease(), 4, '030001');

    expect(withCheckNumber(typed, 4, '  ').checkNos).toEqual({});
    expect(withCheckNumber(lease(), 3, '029460').checkNos).toEqual({});
    expect(numbers(withCheckNumber(typed, 4, ''))).toEqual(numbers(lease()));
  });

  it('are kept when the statement is saved and read back, and anything damaged is left out', () => {
    const { record, state } = saveSoa(emptyState(), withCheckNumber(lease(), 4, '030001'), ctx);

    expect(statementsOf(state)[0].checkNos).toEqual({ 4: '030001' });
    expect(soaOf(soaDraftOf(record))).toEqual(record);
    const damaged = withModuleData(emptyState(), 'soa', { statements: [{ no: 'SOA-2026-001', checkNos: { 2: '029470', x: '1', 3: '', 4: 7 } }] });

    expect(statementsOf(damaged)[0].checkNos).toEqual({ 2: '029470' });
  });
});

describe('the details at the top', () => {
  it('are the lease’s own, the payee under "Payee" unless retitled', () => {
    expect(topDetails(soaOf(draft())).map((d) => [d.label, d.value])).toEqual([
      ['Client', 'Northwind Retail Corp.'], ['Property address', 'Unit 5, Ortigas Avenue, Pasig'],
      ['Lease terms', '2 years, 5% escalation a year from the second year'], ['Payee', 'Juan Dela Cruz'], ['Contract commencement', 'January 1, 2027'],
    ]);
    expect(topDetails(soaOf(draft({ payeeLabel: ' Lessor ' })))[3]).toEqual({ label: 'Lessor', value: 'Juan Dela Cruz', part: 'payee' });
  });

  it('show the floor area when chosen, and the details added after the lease’s own, leaving out an empty one', () => {
    const a = soaOf(draft({ showSqm: true, details: [{ label: ' Floor ', value: ' 3rd floor, Room 7 ' }, { label: ' ', value: '' }] }));

    expect(topDetails(a).map((d) => d.label)).toEqual(['Client', 'Property address', 'Floor area', 'Lease terms', 'Payee', 'Contract commencement', 'Floor']);
    expect(topDetails(a)[2]).toEqual({ label: 'Floor area', value: '354.4 sqm', part: 'breakdown', figure: true });
    expect(a.details).toEqual([{ label: 'Floor', value: '3rd floor, Room 7' }]);
  });

  it('are kept when saved and read back; one saved before has none', () => {
    const { record, state } = saveSoa(emptyState(), draft({ payeeLabel: 'Lessor', showSqm: true, details: [{ label: 'Floor', value: '3rd' }] }), ctx);

    expect(statementsOf(state)[0]).toMatchObject({ payeeLabel: 'Lessor', showSqm: true, details: [{ label: 'Floor', value: '3rd' }] });
    expect(soaOf(soaDraftOf(record))).toEqual(record);
    expect(statementsOf(withModuleData(emptyState(), 'soa', { statements: [{ no: 'SOA-2026-001' }] }))[0]).toMatchObject({ payeeLabel: '', showSqm: false, details: [], checkNos: {} });
  });
});

describe('a saved draft of a statement of account (docs/adr/0041)', () => {
  it('is called by its client and property', () => {
    expect(soaDraftTitle(draft())).toBe('Northwind Retail Corp. · Unit 5, Ortigas Avenue, Pasig');
    expect(soaDraftTitle(newSoa(emptyState(), ctx))).toBe('No client yet');
  });

  it('goes back in the form over a new statement, with the next number unless it edits a saved one', () => {
    const { state } = saveSoa(emptyState(), draft(), ctx);
    const back = soaDraftFrom(state, ctx, { client: 'Northwind Retail Corp.', no: 'SOA-2026-009', sqm: '20' });

    expect(back).toMatchObject({ client: 'Northwind Retail Corp.', sqm: '20', no: 'SOA-2026-002', depositMonths: '2' });
    expect(soaDraftFrom(state, ctx, { ...soaDraftOf(statementsOf(state)[0]) }).no).toBe('SOA-2026-001');
  });

  it('never carries which saved draft it came from into the statement saved', () => {
    expect(soaOf({ ...draft(), savedDraft: 'ana-1-soa-1' })).not.toHaveProperty('savedDraft');
    expect(saveSoa(emptyState(), { ...draft(), savedDraft: 'ana-1-soa-1' }, ctx).record).not.toHaveProperty('savedDraft');
  });
});

describe('repeated details on a statement of account (docs/adr/0053)', () => {
  it('brings a client\'s last statement into what is still blank, and offers what was typed before', () => {
    const s = saveSoa(emptyState(), draft({ bank: 'BPI', payeeLabel: 'Lessor', notes: 'Checks payable to Juan Dela Cruz.' }), ctx).state;
    const next = withSoaClient(s, newSoa(s, ctx), 'northwind  retail corp.');
    expect(next).toMatchObject({ client: 'northwind  retail corp.', property: 'Unit 5, Ortigas Avenue, Pasig', payee: 'Juan Dela Cruz', payeeLabel: 'Lessor', bank: 'BPI' });
    expect(next.sqm).toBe(draft().sqm);
    expect(withSoaClient(s, { ...newSoa(s, ctx), property: 'Typed' }, 'Northwind Retail Corp.').property).toBe('Typed');
    expect(withSoaClient(s, newSoa(s, ctx), 'Someone New')).toMatchObject({ property: '', payee: '', bank: '' });
    expect(earlierSoaEntries(s)).toMatchObject({ clients: ['Northwind Retail Corp.'], banks: ['BPI'], notes: ['Checks payable to Juan Dela Cruz.'] });
  });
});
