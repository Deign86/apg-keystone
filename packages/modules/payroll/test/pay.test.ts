import { describe, expect, it } from 'vitest';
import { toCentavos, type AttendanceTally, type Period } from '@keystone/core';
import {
  basisOf, deductionsOf, fullAttendance, halfOf, monthlyPay, pagibigMonthly, philhealthMonthly, price, setupSummary,
  sharesFor, sssCredit, sssMonthly, tableShares, type Pay, type PaySetup, type Shares,
} from '../src/pay';

// The payroll engine (src/pay.ts) is the only place pay is computed, so it is pinned down here three ways: golden
// cases worked out by hand (HR's own sheet among them), identities that must hold for any input, and the government
// tables at every bracket edge. Expected amounts are written in pesos and compared in centavos.

const first: Period = { from: '2026-10-01', to: '2026-10-15' };
const second: Period = { from: '2026-10-16', to: '2026-10-31' };

const setup = (x: Partial<PaySetup> = {}): PaySetup => ({
  emp: 'E-001', empNo: 'APGCO-0013', daily: 760, monthly: null, incentive: 0, housing: 0, special: 0, sss: null,
  philhealth: null, pagibig: null, advance: 0, bank: '', account: '', ...x,
});

const tally = (x: Partial<AttendanceTally> = {}): AttendanceTally => ({
  scheduled: 11, worked: 11, halfDays: 0, absent: 0, regularHolidaysOff: 0, specialHolidaysWorked: 0,
  regularHolidaysWorked: 0, shortMinutes: 0, overtimeHours: 0, dayMinutes: 480, ...x,
});

const none: Shares = { sss: 0, philhealth: 0, pagibig: 0 };

/** The money fields of a Pay, in pesos, to compare against amounts worked out by hand. */
function inPesos(p: Pay, keys: (keyof Pay)[]) {
  return Object.fromEntries(keys.map((k) => [k, ['scheduled', 'worked', 'paidDays', 'absent', 'halfDays'].includes(k) ? p[k] : p[k] / 100]));
}

// ---------- golden cases ----------

interface Golden { name: string; setup: Partial<PaySetup>; tally: Partial<AttendanceTally>; shares: Shares; expect: Partial<Record<keyof Pay, number>> }

const GOLDEN: Golden[] = [
  {
    name: 'HR\'s PAYROLL sheet, Chico, Jean Ashley, Oct 1–15, 2026',
    setup: { daily: 760, incentive: 1000, special: 150 },
    tally: { scheduled: 11, worked: 9, absent: 2, specialHolidaysWorked: 1 },
    shares: none,
    expect: {
      cutoffRate: 8360, basic: 6840, specialHoliday: 228, regularHoliday: 0, compensation: 7068, allowances: 2350,
      late: 0, halfDay: 0, absentAmount: 1520, overtime: 0, gross: 9418, net: 9418,
    },
  },
  {
    name: 'the regression cut-off: Juan, Oct 16–31, 2026, with every kind of day',
    setup: { daily: 760, incentive: 1000, special: 150 },
    tally: {
      scheduled: 11, worked: 9, halfDays: 1, absent: 1, regularHolidaysOff: 1, specialHolidaysWorked: 1, shortMinutes: 55,
      overtimeHours: 2,
    },
    shares: { sss: 412.5, philhealth: 206.62, pagibig: 100 },
    expect: {
      paidDays: 10, basic: 7600, specialHoliday: 228, compensation: 7828, allowances: 2350, late: 87.08, halfDay: 380,
      shortfall: 467.08, overtime: 237.5, earnings: 10415.5, gross: 9948.42, deductions: 719.12, totalDeductions: 1186.2,
      net: 9229.3,
    },
  },
  {
    name: 'a full cut-off with nothing taken off',
    setup: { daily: 760 },
    tally: {},
    shares: none,
    expect: { paidDays: 11, basic: 8360, gross: 8360, net: 8360 },
  },
  {
    name: 'nothing worked: only the allowances paid once a cut-off, less the deductions',
    setup: { daily: 760, incentive: 1000, housing: 500, special: 150, advance: 300 },
    tally: { worked: 0, absent: 11 },
    shares: { sss: 412.5, philhealth: 206.63, pagibig: 100 },
    expect: { basic: 0, specialAllowance: 0, allowances: 1500, absentAmount: 8360, gross: 1500, deductions: 1019.13, net: 480.87 },
  },
  {
    name: 'a regular holiday worked pays 100% more; one not worked is still paid',
    setup: { daily: 800 },
    tally: { worked: 9, regularHolidaysOff: 1, regularHolidaysWorked: 1, absent: 1 },
    shares: none,
    expect: { paidDays: 10, basic: 8000, regularHoliday: 800, compensation: 8800, gross: 8800 },
  },
  {
    name: 'late and undertime by the minute, half days at half the rate, approved overtime at 125%',
    setup: { daily: 800 },
    tally: { worked: 11, halfDays: 2, shortMinutes: 45, overtimeHours: 3 },
    shares: none,
    expect: { late: 75, halfDay: 800, shortfall: 875, overtime: 375, gross: 8800 - 875 + 375 },
  },
  {
    name: 'an odd daily rate rounds each amount to the centavo once',
    setup: { daily: 733.33, special: 33.33 },
    tally: { worked: 1, halfDays: 1, shortMinutes: 7, overtimeHours: 1, specialHolidaysWorked: 1, scheduled: 1 },
    shares: none,
    // 733.33 × 7 ÷ 480 = 10.694…; half of 733.33 = 366.665; 733.33 ÷ 8 × 1.25 = 114.583…; 30% = 219.999.
    expect: { late: 10.69, halfDay: 366.67, overtime: 114.58, specialHoliday: 220, specialAllowance: 33.33 },
  },
  {
    name: 'without counted minutes (timekeeping not installed) nothing is priced by the minute',
    setup: { daily: 760 },
    tally: { shortMinutes: 30, overtimeHours: 2, dayMinutes: 0 },
    shares: none,
    expect: { late: 0, overtime: 0, gross: 8360 },
  },
];

describe('golden cut-offs, worked out by hand', () => {
  it.each(GOLDEN.map((g) => [g.name, g] as const))('%s', (_name, g) => {
    const p = price(setup(g.setup), tally(g.tally), g.shares);
    // SAFETY: g.expect is typed Partial<Record<keyof Pay, number>>, so every key it has is a key of Pay.
    const keys = Object.keys(g.expect) as (keyof Pay)[];

    expect(inPesos(p, keys)).toEqual(g.expect);
  });
});

// ---------- identities that hold for any input ----------

const DAILIES = [0.01, 500, 610, 733.33, 760, 1250.5, 4999.99];

const TALLIES: Partial<AttendanceTally>[] = [
  {}, { worked: 0, absent: 11 }, { worked: 9, halfDays: 3, shortMinutes: 121 }, { overtimeHours: 7.5 },
  { worked: 10, regularHolidaysOff: 1, regularHolidaysWorked: 1, specialHolidaysWorked: 2 }, { dayMinutes: 0, shortMinutes: 9 },
];

const SHARES: Shares[] = [none, { sss: 412.5, philhealth: 206.63, pagibig: 100 }, { sss: 1750, philhealth: 2500, pagibig: 200 }];

const CASES = DAILIES.flatMap((daily) => TALLIES.flatMap((t) => SHARES.map((sh) => ({ s: setup({ daily, incentive: 1000, housing: 250.25, special: 150, advance: 99.99 }), t: tally(t), sh }))));

describe('identities, over every combination of rate, days and shares', () => {
  it('ties every total to its parts, so the sheet, the payslip and the register can never disagree', () => {
    for (const { s, t, sh } of CASES) {
      const p = price(s, t, sh);

      expect(p.compensation).toBe(p.basic + p.specialHoliday + p.regularHoliday);
      expect(p.allowances).toBe(p.incentive + p.housing + p.specialAllowance);
      expect(p.shortfall).toBe(p.late + p.halfDay);
      expect(p.earnings).toBe(p.compensation + p.allowances + p.overtime);
      expect(p.gross).toBe(p.compensation + p.allowances - p.late - p.halfDay + p.overtime);
      expect(p.deductions).toBe(p.sss + p.philhealth + p.pagibig + p.advance);
      expect(p.totalDeductions).toBe(p.deductions + p.shortfall);
      expect(p.net).toBe(p.gross - p.deductions);
      expect(p.net).toBe(p.earnings - p.totalDeductions);
      expect(p.basic).toBe(p.daily * p.paidDays);
      expect(p.cutoffRate).toBe(p.daily * p.scheduled);
    }
  });

  it('only ever holds whole centavos', () => {
    for (const { s, t, sh } of CASES) {
      for (const [k, v] of Object.entries(price(s, t, sh))) expect(Number.isInteger(v), `${k} = ${v}`).toBe(true);
    }
  });

  it('never pays less for working more, or more for being late', () => {
    for (const daily of DAILIES) {
      const s = setup({ daily, special: 150 });
      const base = price(s, tally({ worked: 8, absent: 3, shortMinutes: 10 }), none);

      expect(price(s, tally({ worked: 9, absent: 2, shortMinutes: 10 }), none).gross).toBeGreaterThanOrEqual(base.gross);
      expect(price(s, tally({ worked: 8, absent: 3, shortMinutes: 11 }), none).net).toBeLessThanOrEqual(base.net);
      expect(price(s, tally({ worked: 8, absent: 3, shortMinutes: 10, overtimeHours: 1 }), none).net).toBeGreaterThanOrEqual(base.net);
      expect(price(s, tally({ worked: 8, absent: 3, shortMinutes: 10, halfDays: 1 }), none).net).toBeLessThanOrEqual(base.net);
    }
  });

  it('shows the same deductions in the pay setup list as on the payslip', () => {
    for (const daily of DAILIES) {
      for (const own of [{}, { sss: 450, philhealth: 0 }, { monthly: 25_000 }]) {
        const s = setup({ daily, advance: 99.99, ...own });

        expect(setupSummary(s, second).deductions).toBe(price(s, tally(), sharesFor(s, second)).deductions);
      }
    }
  });
});

// ---------- government shares ----------

const pesos = (n: number) => toCentavos(n);

describe('the 2026 contribution tables', () => {
  it('turns a daily rate into monthly pay for a Monday-to-Friday employee', () => {
    expect(monthlyPay(pesos(760))).toBe(pesos(16_530));
    expect(basisOf({ daily: 760, monthly: null })).toBe(16_530);
    expect(basisOf({ daily: 760, monthly: 25_000 })).toBe(25_000);
  });

  it('puts monthly pay in its SSS salary credit, at every bracket edge', () => {
    expect(sssCredit(pesos(0))).toBe(pesos(5_000));
    expect(sssCredit(pesos(5_249.99))).toBe(pesos(5_000));

    for (let credit = 5_500; credit < 35_000; credit += 500) {
      expect(sssCredit(pesos(credit - 250))).toBe(pesos(credit));
      expect(sssCredit(pesos(credit + 249.99))).toBe(pesos(credit));
    }

    expect(sssCredit(pesos(34_750))).toBe(pesos(35_000));
    expect(sssCredit(pesos(1_000_000))).toBe(pesos(35_000));
  });

  it('takes the employee\'s share of each, inside its floor and ceiling', () => {
    expect([sssMonthly(pesos(4_000)), sssMonthly(pesos(16_530)), sssMonthly(pesos(80_000))]).toEqual([pesos(250), pesos(825), pesos(1_750)]);
    expect([philhealthMonthly(pesos(8_000)), philhealthMonthly(pesos(10_000)), philhealthMonthly(pesos(16_530)), philhealthMonthly(pesos(100_000)), philhealthMonthly(pesos(150_000))])
      .toEqual([pesos(250), pesos(250), pesos(413.25), pesos(2_500), pesos(2_500)]);
    expect([pagibigMonthly(pesos(1_000)), pagibigMonthly(pesos(1_500)), pagibigMonthly(pesos(1_500.01)), pagibigMonthly(pesos(10_000)), pagibigMonthly(pesos(16_530))])
      .toEqual([pesos(10), pesos(15), pesos(30), pesos(200), pesos(200)]);
  });

  it('splits every month between its two cut-offs so the month adds up to the centavo', () => {
    for (let monthly = pesos(1_000); monthly <= pesos(120_000); monthly += 7_777) {
      for (const share of [sssMonthly, philhealthMonthly, pagibigMonthly]) {
        const m = share(monthly);

        expect(halfOf(m, first) + halfOf(m, second)).toBe(m);
        expect(Math.abs(halfOf(m, first) - halfOf(m, second))).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives the shares for a cut-off from the tables, the employee\'s own amounts, or their own monthly pay', () => {
    expect(tableShares(16_530, first)).toEqual({ sss: 412.5, philhealth: 206.63, pagibig: 100 });
    expect(tableShares(16_530, second)).toEqual({ sss: 412.5, philhealth: 206.62, pagibig: 100 });
    expect(sharesFor(setup(), first)).toEqual({ sss: 412.5, philhealth: 206.63, pagibig: 100 });
    // Their own amount wins, 0 included; the rest stay on the tables.
    expect(sharesFor(setup({ sss: 450, philhealth: 0 }), first)).toEqual({ sss: 450, philhealth: 0, pagibig: 100 });
    // Their own monthly pay moves every table share: SSS credit 25,000, PhilHealth 2.5%, Pag-IBIG at its cap.
    expect(sharesFor(setup({ monthly: 25_000 }), first)).toEqual({ sss: 625, philhealth: 312.5, pagibig: 100 });
    expect(sharesFor(setup({ monthly: 25_000, pagibig: 150 }), first)).toEqual({ sss: 625, philhealth: 312.5, pagibig: 150 });
    expect(deductionsOf({ sss: 412.5, philhealth: 206.63, pagibig: 100 }, 99.99)).toBe(81_912);
  });

  it('keeps what a cut-off without timekeeping counts: every weekday, no minutes', () => {
    expect(fullAttendance(first)).toMatchObject({ scheduled: 11, worked: 11, absent: 0, dayMinutes: 0 });
    expect(fullAttendance({ from: '2026-11-16', to: '2026-11-30' })).toMatchObject({ scheduled: 11, worked: 11 });
    expect(fullAttendance({ from: '2028-02-16', to: '2028-02-29' })).toMatchObject({ scheduled: 10 });
  });
});
