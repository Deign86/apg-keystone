import { describe, expect, it } from 'vitest';
import { bundledSeed, peso, withModuleData, type AttendanceTally, type Ctx, type EmployeeAttendance } from '@keystone/core';
import { type PaySetup } from '../src/pay';
import {
  closeCutoff, cutoffOf, dataOf, payrollFigure, payrollFinding, payrollStat, removeSetup, reopenCutoff, saveSetup,
  setupDraftOf, totalOf, workedOut,
} from '../src/rules';

// The pay setup, the saved data, and assembling, closing and reopening a cut-off. The amounts themselves come from the
// engine (src/pay.ts), which test/pay.test.ts pins down; here they check that the right inputs reach it.

const at = (y: number, m: number, d: number, h = 10): Ctx => ({ seed: bundledSeed, now: () => new Date(y, m - 1, d, h) });
const state = () => structuredClone(bundledSeed.state);
const oct1 = { from: '2026-10-01', to: '2026-10-15' };

const setup = (x: Partial<PaySetup> = {}): PaySetup => ({
  emp: 'E-001', empNo: 'APGCO-0013', daily: 760, monthly: null, incentive: 1000, housing: 0, special: 150, sss: null,
  philhealth: null, pagibig: null, advance: 0, bank: 'Cash', account: '', ...x,
});

const days = (x: Partial<AttendanceTally> = {}): AttendanceTally => ({
  scheduled: 11, worked: 11, halfDays: 0, absent: 0, regularHolidaysOff: 0, specialHolidaysWorked: 0,
  regularHolidaysWorked: 0, shortMinutes: 0, overtimeHours: 0, dayMinutes: 480, ...x,
});

/** A stand-in for the timekeeping service: the same tally for everyone. */
const attendance = (t: AttendanceTally): EmployeeAttendance => ({ tally: () => t });

describe('assembling a cut-off', () => {
  it('pays every weekday in full when timekeeping is not installed', () => {
    const s = saveSetup(state(), { ...setupDraftOf(state(), 'E-001'), daily: '760' }, at(2026, 11, 2)).state;
    const c = cutoffOf(s, oct1, undefined, at(2026, 11, 2));

    expect(c.assumed).toBe(true);
    expect(peso(totalOf(c, 'gross'))).toBe('₱8,360.00');
  });

  it('asks the attendance service for each employee on the payroll, for exactly this cut-off', () => {
    const asked: string[] = [];

    const spy: EmployeeAttendance = {
      tally: (_s, emp, from, to) => {
        asked.push(`${emp} ${from} ${to}`);

        return days();
      },
    };

    let s = saveSetup(state(), { ...setupDraftOf(state(), 'E-002'), daily: '700' }, at(2026, 11, 2)).state;

    s = saveSetup(s, { ...setupDraftOf(s, 'E-001'), daily: '760' }, at(2026, 11, 2)).state;
    const c = cutoffOf(s, oct1, spy, at(2026, 11, 2));

    expect(asked.sort()).toEqual(['E-001 2026-10-01 2026-10-15', 'E-002 2026-10-01 2026-10-15']);
    // Listed by name, each priced by the engine with its own setup.
    expect(c.lines.map((l) => [l.name, peso(l.pay.basic)])).toEqual([['Angelica S. Bautista', '₱7,700.00'], ['Juan Miguel P. Reyes', '₱8,360.00']]);
  });
});

describe('the pay setup HR keeps', () => {
  const ctx = at(2026, 11, 2);

  it('saves each employee\'s own rates, allowances and deductions', () => {
    const d = { ...setupDraftOf(state(), 'E-002'), empNo: 'APGCO-0021', daily: '1,250.50', incentive: '2000', special: '150', sss: '675', bank: 'BPI', account: '1234-5678' };
    const r = saveSetup(state(), d, ctx);

    expect(r.message).toBe('Pay setup saved for Angelica S. Bautista.');
    expect(r.state.log[0]).toMatchObject({ mod: 'PAY', text: 'Pay set up for Angelica S. Bautista: ₱1,250.50 a day.' });
    expect(dataOf(r.state).setups).toEqual([{
      emp: 'E-002', empNo: 'APGCO-0021', daily: 1250.5, monthly: null, incentive: 2000, housing: 0, special: 150, sss: 675,
      philhealth: null, pagibig: null, advance: 0, bank: 'BPI', account: '1234-5678',
    }]);
    expect(setupDraftOf(r.state, 'E-002')).toMatchObject({ daily: '1250.5', sss: '675', philhealth: '' });

    const changed = saveSetup(r.state, { ...setupDraftOf(r.state, 'E-002'), daily: '1300' }, ctx);
    expect(changed.state.log[0].text).toBe('Pay setup for Angelica S. Bautista changed: ₱1,300.00 a day.');
    expect(dataOf(changed.state).setups).toHaveLength(1);
  });

  it('needs a daily rate, sensible amounts and a unique employee number', () => {
    const blank = setupDraftOf(state(), 'E-001');
    expect(() => saveSetup(state(), blank, ctx)).toThrow('Enter Juan Miguel P. Reyes\'s daily rate.');
    expect(() => saveSetup(state(), { ...blank, daily: '760', sss: 'some' }, ctx)).toThrow('Enter the SSS employee share as an amount in pesos.');
    expect(() => saveSetup(state(), { ...blank, daily: '760', advance: '-5' }, ctx)).toThrow('Enter the salary advance as an amount in pesos.');
    expect(() => saveSetup(state(), { ...blank, daily: '760', monthly: 'a lot' }, ctx)).toThrow('Enter the monthly pay basis as an amount in pesos.');
    expect(() => saveSetup(state(), { ...blank, emp: 'V-001', daily: '760' }, ctx)).toThrow('Pick an employee from the directory.');

    const s = saveSetup(state(), { ...blank, daily: '760', empNo: 'APGCO-0013' }, ctx).state;
    expect(() => saveSetup(s, { ...setupDraftOf(s, 'E-002'), daily: '700', empNo: 'apgco-0013' }, ctx)).toThrow('apgco-0013 is already the employee number of Juan Miguel P. Reyes.');
  });

  it('takes an employee off the payroll', () => {
    const s = saveSetup(state(), { ...setupDraftOf(state(), 'E-001'), daily: '760' }, ctx).state;
    expect(dataOf(removeSetup(s, 'E-001', ctx).state).setups).toEqual([]);
    expect(() => removeSetup(state(), 'E-001', ctx)).toThrow('Juan Miguel P. Reyes is not on the payroll.');
  });

  it('reads only what it can trust from the saved data', () => {
    const s = withModuleData(state(), 'payroll', { setups: [{ emp: 'E-001', daily: '760' }, 'junk'], runs: [{ from: 'soon' }] });
    expect(dataOf(s)).toEqual({ setups: [setup({ empNo: '', daily: 0, incentive: 0, special: 0, bank: '' })], runs: [] });
  });
});

describe('government shares and the monthly pay basis in the pay setup', () => {
  const ctx = at(2026, 11, 2);

  it('keep an empty field worked out and a typed one, 0 included, as the employee\'s own', () => {
    const s = saveSetup(state(), { ...setupDraftOf(state(), 'E-001'), daily: '760', monthly: '25,000', sss: '450', philhealth: '0' }, ctx).state;

    expect(dataOf(s).setups[0]).toMatchObject({ monthly: 25_000, sss: 450, philhealth: 0, pagibig: null });
    expect(setupDraftOf(s, 'E-001')).toMatchObject({ monthly: '25000', sss: '450', philhealth: '0', pagibig: '' });

    const cleared = saveSetup(s, { ...setupDraftOf(s, 'E-001'), monthly: '', sss: '' }, ctx).state;

    expect(dataOf(cleared).setups[0]).toMatchObject({ monthly: null, sss: null, philhealth: 0, pagibig: null });
  });

  it('price a cut-off with the shares the setup leads to', () => {
    const s = saveSetup(state(), { ...setupDraftOf(state(), 'E-001'), daily: '760', monthly: '25000', pagibig: '150' }, ctx).state;
    const [line] = cutoffOf(s, oct1, attendance(days()), ctx).lines;

    expect(line.shares).toEqual({ sss: 625, philhealth: 312.5, pagibig: 150 });
    expect(peso(line.pay.deductions)).toBe('₱1,087.50');
  });

  it('show in grey what an empty field will be, from what is typed so far, and never refuse while typing', () => {
    const d = { ...setupDraftOf(state(), 'E-001'), daily: '760' };

    expect(workedOut(d, oct1)).toEqual({ monthly: 16_530, shares: { sss: 412.5, philhealth: 206.63, pagibig: 100 } });
    expect(workedOut({ ...d, monthly: '25000' }, oct1)).toEqual({ monthly: 16_530, shares: { sss: 625, philhealth: 312.5, pagibig: 100 } });
    // A monthly basis that would be refused on saving is left out of the preview rather than shown.
    expect(workedOut({ ...d, monthly: '-3' }, oct1).shares).toEqual({ sss: 412.5, philhealth: 206.63, pagibig: 100 });
    // Nothing typed yet: the minimums, half a month each (SSS 250 and PhilHealth 250 a month), and no Pag-IBIG.
    expect(workedOut(setupDraftOf(state(), 'E-001'), oct1)).toEqual({ monthly: 0, shares: { sss: 125, philhealth: 125, pagibig: 0 } });
  });

  it('show in grey exactly what saving the form will deduct', () => {
    const drafts = [
      { daily: '760' }, { daily: '1,250.50' }, { daily: '610', monthly: '12000' }, { daily: '5000', monthly: '' },
      { daily: '760', monthly: '120000' }, { daily: '76o' },
    ];

    for (const typed of drafts) {
      const d = { ...setupDraftOf(state(), 'E-001'), ...typed };
      const saved = saveSetup(state(), d, ctx).state;
      const [line] = cutoffOf(saved, oct1, attendance(days()), ctx).lines;

      expect(line.shares).toEqual(workedOut(d, oct1).shares);
    }
  });
});

describe('regressions: saved pay never changes behind HR\'s back', () => {
  it('keeps a setup saved before the tables deducting exactly what it did (0, not the tables)', () => {
    // The first release saved an empty share as 0, and had no monthly basis.
    const v1 = { emp: 'E-001', empNo: '', daily: 760, incentive: 0, housing: 0, special: 0, sss: 0, philhealth: 0, pagibig: 0, advance: 0, bank: '', account: '' };
    const s = withModuleData(state(), 'payroll', { setups: [v1], runs: [] });
    const [line] = cutoffOf(s, oct1, attendance(days()), at(2026, 11, 2)).lines;

    expect(dataOf(s).setups[0]).toMatchObject({ monthly: null, sss: 0, philhealth: 0, pagibig: 0 });
    expect(line.pay.deductions).toBe(0);
  });

  it('keeps a cut-off closed by the first release at the pay it was closed with', () => {
    const row = {
      setup: { emp: 'E-001', empNo: '', daily: 760, incentive: 1000, housing: 0, special: 150, sss: 450, philhealth: 0, pagibig: 0, advance: 0, bank: '', account: '' },
      tally: days({ worked: 9, absent: 2, specialHolidaysWorked: 1 }), name: 'Juan Miguel P. Reyes', position: '', dept: '', tin: '',
    };

    const s = withModuleData(state(), 'payroll', { setups: [], runs: [{ from: '2026-10-01', to: '2026-10-15', closed: '2026-10-16 10:00', rows: [row] }] });
    const c = cutoffOf(s, oct1, attendance(days()), at(2026, 11, 2));

    expect(c.closed).toBe('2026-10-16 10:00');
    expect(c.lines[0].shares).toEqual({ sss: 450, philhealth: 0, pagibig: 0 });
    expect(peso(totalOf(c, 'net'))).toBe('₱8,968.00');
  });

  it('keeps a closed cut-off\'s shares when the employee\'s own amounts or monthly pay change later', () => {
    const after = at(2026, 10, 16);
    let s = saveSetup(state(), { ...setupDraftOf(state(), 'E-001'), daily: '760' }, after).state;

    s = closeCutoff(s, oct1, attendance(days()), after).state;
    s = saveSetup(s, { ...setupDraftOf(s, 'E-001'), monthly: '30000', sss: '1000' }, after).state;

    expect(cutoffOf(s, oct1, attendance(days()), after).lines[0].shares).toEqual({ sss: 412.5, philhealth: 206.63, pagibig: 100 });
  });
});

describe('closing a cut-off', () => {
  const after = at(2026, 10, 16);
  const withPay = () => saveSetup(state(), { ...setupDraftOf(state(), 'E-001'), daily: '760', incentive: '1000', special: '150' }, after).state;

  it('freezes the pay so later corrections and rate changes do not reprice it', () => {
    const r = closeCutoff(withPay(), oct1, attendance(days({ worked: 9, absent: 2, specialHolidaysWorked: 1 })), after);
    // Gross 9,418.00 less the table shares for 760 a day: SSS 412.50, PhilHealth 206.63, Pag-IBIG 100.00.
    expect(r.message).toBe('Payroll for Oct 1–15, 2026 closed: 1 employee, ₱8,698.87 net.');

    const raised = saveSetup(r.state, { ...setupDraftOf(r.state, 'E-001'), daily: '900', sss: '500' }, after).state;
    const c = cutoffOf(raised, oct1, attendance(days()), after);
    expect(c.closed).toBe('2026-10-16 10:00');
    expect(peso(totalOf(c, 'gross'))).toBe('₱9,418.00');
    expect(peso(totalOf(c, 'sss'))).toBe('₱412.50');
    expect(payrollFigure(raised)).toEqual({ label: 'Last payroll', value: '₱8,698.87', caption: 'Oct 1–15, 2026 · 1 employee' });

    const reopened = reopenCutoff(raised, oct1, after).state;
    expect(peso(totalOf(cutoffOf(reopened, oct1, attendance(days()), after), 'basic'))).toBe('₱9,900.00');
  });

  it('refuses to close before the cut-off ends, twice, or with nobody on it', () => {
    expect(() => closeCutoff(withPay(), oct1, undefined, at(2026, 10, 15, 18))).toThrow('The Oct 1–15, 2026 cut-off ends Oct 15, 2026; close it from Oct 16, 2026.');
    expect(() => closeCutoff(state(), oct1, undefined, after)).toThrow('Set up pay for at least one employee first.');
    const closed = closeCutoff(withPay(), oct1, undefined, after).state;
    expect(() => closeCutoff(closed, oct1, undefined, after)).toThrow('The Oct 1–15, 2026 payroll was closed on Oct 16, 2026.');
  });

  it('asks for the last cut-off to be closed, and contributes its figures', () => {
    expect(payrollFinding(state(), at(2026, 11, 2))).toBeNull();
    expect(payrollFinding(withPay(), at(2026, 11, 2))).toEqual({ priority: 7, text: 'The Oct 16–31, 2026 payroll is ready to close.' });
    expect(payrollStat(withPay())).toEqual(['On payroll', '1']);
    expect(payrollFigure(state())).toEqual({ label: 'Last payroll', value: '—', caption: 'No cut-off closed yet' });
  });
});
