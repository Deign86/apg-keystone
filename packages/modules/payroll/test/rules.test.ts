import { describe, expect, it } from 'vitest';
import { bundledSeed, peso, withModuleData, type AttendanceTally, type Ctx, type EmployeeAttendance } from '@keystone/core';
import type { Shares } from '../src/contributions';
import {
  closeCutoff, cutoffOf, dataOf, fullAttendance, payrollFigure, payrollFinding, payrollStat, price, removeSetup,
  reopenCutoff, saveSetup, setupDraftOf, sharesFor, totalOf, type PaySetup,
} from '../src/rules';

const at = (y: number, m: number, d: number, h = 10): Ctx => ({ seed: bundledSeed, now: () => new Date(y, m - 1, d, h) });
const state = () => structuredClone(bundledSeed.state);
const oct1 = { from: '2026-10-01', to: '2026-10-15' };

const setup = (x: Partial<PaySetup> = {}): PaySetup => ({
  emp: 'E-001', empNo: 'APGCO-0013', daily: 760, incentive: 1000, housing: 0, special: 150, sss: null, philhealth: null,
  pagibig: null, advance: 0, bank: 'Cash', account: '', ...x,
});

/** No government shares, as on the HR sheet's PAYROLL tab, which stops at gross. */
const none: Shares = { sss: 0, philhealth: 0, pagibig: 0 };

const days = (x: Partial<AttendanceTally> = {}): AttendanceTally => ({
  scheduled: 11, worked: 11, halfDays: 0, absent: 0, regularHolidaysOff: 0, specialHolidaysWorked: 0,
  regularHolidaysWorked: 0, shortMinutes: 0, overtimeHours: 0, dayMinutes: 480, ...x,
});

/** A stand-in for the timekeeping service: the same tally for everyone. */
const attendance = (t: AttendanceTally): EmployeeAttendance => ({ tally: () => t });

describe('pricing a cut-off', () => {
  it('reproduces the HR payroll sheet for Oct 1–15, 2026', () => {
    // 760 a day, 11 standard days, 9 worked, one of them a special holiday; 1,000 incentives, 150 a day special allowance.
    const p = price(setup(), days({ worked: 9, absent: 2, specialHolidaysWorked: 1 }), none);

    expect(p.cutoffRate).toBe(836000);
    expect(p.basic).toBe(684000);
    expect(p.specialHoliday).toBe(22800);
    expect(p.compensation).toBe(706800);
    expect(p.allowances).toBe(235000);
    expect(p.absentAmount).toBe(152000);
    expect(p.gross).toBe(941800);
    expect(p.net).toBe(941800);
  });

  it('takes off late minutes, half days and the payslip deductions, and adds holidays and overtime', () => {
    const p = price(
      setup({ daily: 800, housing: 500, advance: 1000 }),
      days({ worked: 10, regularHolidaysOff: 1, halfDays: 1, regularHolidaysWorked: 0, shortMinutes: 45, overtimeHours: 2 }),
      { sss: 450, philhealth: 200, pagibig: 100 },
    );

    expect(p.paidDays).toBe(11);
    expect(p.basic).toBe(880000); // 11 paid days, the regular holiday off included
    expect(p.late).toBe(7500); // 45 minutes at 800 / 480 a minute
    expect(p.halfDay).toBe(40000);
    expect(p.overtime).toBe(25000); // 2 hours at 100 an hour, at 125%
    expect(p.allowances).toBe(100000 + 50000 + 15000 * 10);
    expect(p.gross).toBe(880000 + 300000 - 7500 - 40000 + 25000);
    expect(p.deductions).toBe(175000);
    expect(p.net).toBe(p.gross - 175000);
  });

  it('pays every weekday in full when timekeeping is not installed', () => {
    expect(fullAttendance(oct1)).toMatchObject({ scheduled: 11, worked: 11, absent: 0 });
    const s = saveSetup(state(), { ...setupDraftOf(state(), 'E-001'), daily: '760' }, at(2026, 11, 2)).state;
    const c = cutoffOf(s, oct1, undefined, at(2026, 11, 2));

    expect(c.assumed).toBe(true);
    expect(peso(totalOf(c, 'gross'))).toBe('₱8,360.00');
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
      emp: 'E-002', empNo: 'APGCO-0021', daily: 1250.5, incentive: 2000, housing: 0, special: 150, sss: 675, philhealth: null,
      pagibig: null, advance: 0, bank: 'BPI', account: '1234-5678',
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

describe('government shares', () => {
  it('come from the tables unless HR types the employee\'s own amount, 0 included', () => {
    expect(sharesFor(setup(), oct1)).toEqual({ sss: 412.5, philhealth: 206.63, pagibig: 100 });
    expect(sharesFor(setup(), { from: '2026-10-16', to: '2026-10-31' })).toEqual({ sss: 412.5, philhealth: 206.62, pagibig: 100 });
    expect(sharesFor(setup({ sss: 450, philhealth: 0 }), oct1)).toEqual({ sss: 450, philhealth: 0, pagibig: 100 });
  });

  it('keep an empty field on the tables and a typed one as the employee\'s own', () => {
    const ctx = at(2026, 11, 2);
    const s = saveSetup(state(), { ...setupDraftOf(state(), 'E-001'), daily: '760', sss: '450', philhealth: '0' }, ctx).state;

    expect(dataOf(s).setups[0]).toMatchObject({ sss: 450, philhealth: 0, pagibig: null });
    expect(setupDraftOf(s, 'E-001')).toMatchObject({ sss: '450', philhealth: '0', pagibig: '' });
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
