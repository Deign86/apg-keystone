import {
  datesBetween, isWeekday, percent, toCentavos, toPesos, type AttendanceTally, type Centavos, type Period,
} from '@keystone/core';

// THE PAYROLL ENGINE. Every peso of an employee's pay is computed here and nowhere else: screens, the payroll sheet,
// the payslip and Overview only show the fields of a `Pay`. Days and minutes come counted from timekeeping (its
// `AttendanceTally`); this file turns them into pesos with the employee's own setup. Everything is in whole centavos so
// totals never drift, and every function is pure, so test/pay.test.ts can pin it down exhaustively.
//
// Rates, from HR's payroll sheet and the law:
// - Overtime: 125% of the hourly rate (Labor Code, Art. 87). The hourly rate is the daily rate over the working day.
// - Working a special non-working day adds 30% of the daily rate; working a regular holiday adds 100%.
//
// Government shares, 2026 tables. HR can type an employee's own amount over any of them, and over the monthly pay
// they are worked out on. Closed cut-offs keep the shares they were closed with, so changing a table here never
// reprices one.
// - SSS (RA 11199, schedule from Jan 2025, in force in 2026): 5% of the monthly salary credit, which is the monthly pay
//   to the nearest ₱500 (₱x,250 rounds up), from ₱5,000 to ₱35,000.
// - PhilHealth (UHC Act, from 2024): 2.5% of monthly pay, floored at ₱10,000 and capped at ₱100,000.
// - Pag-IBIG (HDMF Circular 460, from Feb 2024): 2% of monthly pay up to ₱10,000 (1% at ₱1,500 a month or less).

export const OVERTIME_PERCENT = 125;
export const SPECIAL_HOLIDAY_PERCENT = 30;
export const REGULAR_HOLIDAY_PERCENT = 100;

/** Working days in a year for a Monday-to-Friday employee: the DOLE factor that turns a daily rate into a monthly one. */
export const WORKING_DAYS_A_YEAR = 261;

export const SSS = { minCredit: toCentavos(5_000), maxCredit: toCentavos(35_000), step: toCentavos(500), employeePerMille: 50 };
export const PHILHEALTH = { floor: toCentavos(10_000), ceiling: toCentavos(100_000), employeePerMille: 25 };
export const PAGIBIG = { cap: toCentavos(10_000), lowPay: toCentavos(1_500), lowPerMille: 10, employeePerMille: 20 };

/**
 * One employee's pay, as the HR supervisor sets it. Pesos, as everywhere in the saved state. Allowances and
 * deductions are per cut-off, except the special allowance, which is per day worked. The monthly pay basis and each
 * government share, left null, are worked out (daily × 261 ÷ 12, then the tables); an amount, 0 included, is that
 * employee's own.
 */
export type PaySetup = {
  /** Directory code of the employee. */
  emp: string;
  /** The payroll's own employee number, "APGCO-0013". */
  empNo: string;
  daily: number;
  /** The monthly pay the government shares are worked out on; null for daily × 261 ÷ 12. */
  monthly: number | null;
  incentive: number;
  housing: number;
  special: number;
  sss: number | null;
  philhealth: number | null;
  pagibig: number | null;
  /** A salary advance repaid each cut-off until it is set back to zero. */
  advance: number;
  /** "Cash", or the bank paid into. */
  bank: string;
  account: string;
};

/** The employee's government shares for one cut-off, in pesos, as a closed cut-off keeps them. */
export type Shares = { sss: number; philhealth: number; pagibig: number };

// ---------- government shares ----------

const perMille = (c: Centavos, rate: number) => Math.round((c * rate) / 1000);

/** A daily rate as monthly pay: daily × 261 ÷ 12. */
export const monthlyPay = (daily: Centavos): Centavos => Math.round((daily * WORKING_DAYS_A_YEAR) / 12);

/** The SSS monthly salary credit for this monthly pay. */
export function sssCredit(monthly: Centavos): Centavos {
  const bracket = Math.floor((monthly + SSS.step / 2) / SSS.step) * SSS.step;

  return Math.min(SSS.maxCredit, Math.max(SSS.minCredit, bracket));
}

/** Each employee share for a month, in centavos. */
export const sssMonthly = (monthly: Centavos) => perMille(sssCredit(monthly), SSS.employeePerMille);
export const philhealthMonthly = (monthly: Centavos) => perMille(Math.min(PHILHEALTH.ceiling, Math.max(PHILHEALTH.floor, monthly)), PHILHEALTH.employeePerMille);
export const pagibigMonthly = (monthly: Centavos) => perMille(Math.min(PAGIBIG.cap, monthly), monthly <= PAGIBIG.lowPay ? PAGIBIG.lowPerMille : PAGIBIG.employeePerMille);

/** Half a month's share for this cut-off: the 1st–15th takes the rounded half, the 16th–end the rest, so a month adds up. */
export function halfOf(monthly: Centavos, p: Period): Centavos {
  const first = Math.round(monthly / 2);

  return Number(p.from.slice(8, 10)) <= 15 ? first : monthly - first;
}

/** What the tables say an employee on this monthly pay (pesos) pays in this cut-off. */
export function tableShares(monthlyPesos: number, p: Period): Shares {
  const monthly = toCentavos(monthlyPesos);

  return {
    sss: toPesos(halfOf(sssMonthly(monthly), p)),
    philhealth: toPesos(halfOf(philhealthMonthly(monthly), p)),
    pagibig: toPesos(halfOf(pagibigMonthly(monthly), p)),
  };
}

/** The monthly pay an employee's shares are worked out on, in pesos: their own, or daily × 261 ÷ 12. */
export const basisOf = (setup: Pick<PaySetup, 'daily' | 'monthly'>) => setup.monthly ?? toPesos(monthlyPay(toCentavos(setup.daily)));

/** The shares this employee pays in this cut-off: their own amount where HR typed one, the tables' otherwise. */
export function sharesFor(setup: PaySetup, p: Period): Shares {
  const table = tableShares(basisOf(setup), p);

  return { sss: setup.sss ?? table.sss, philhealth: setup.philhealth ?? table.philhealth, pagibig: setup.pagibig ?? table.pagibig };
}

/** Everything taken off a cut-off's gross: the three shares and the salary advance. */
export const deductionsOf = (shares: Shares, advance: number): Centavos =>
  toCentavos(shares.sss) + toCentavos(shares.philhealth) + toCentavos(shares.pagibig) + toCentavos(advance);

/** What the pay setup list shows for an employee in a cut-off, before any day is counted. */
export function setupSummary(setup: PaySetup, p: Period) {
  return {
    /** Paid once each cut-off. */
    fixedAllowances: toCentavos(setup.incentive) + toCentavos(setup.housing),
    /** Paid for each day worked. */
    perDayAllowance: toCentavos(setup.special),
    deductions: deductionsOf(sharesFor(setup, p), setup.advance),
  };
}

// ---------- pricing a cut-off ----------

/** One employee's pay for a cut-off, in centavos, column for column with the HR payroll sheet and the payslip. */
export interface Pay {
  daily: Centavos;
  /** The daily rate times the standard working days. */
  cutoffRate: Centavos;
  scheduled: number;
  worked: number;
  /** Days worked plus regular holidays not worked. */
  paidDays: number;
  /** Leave without pay: absences. */
  absent: number;
  halfDays: number;
  basic: Centavos;
  specialHoliday: Centavos;
  regularHoliday: Centavos;
  /** Basic plus holiday pay: the sheet's "Total compensation". */
  compensation: Centavos;
  incentive: Centavos;
  housing: Centavos;
  specialAllowance: Centavos;
  allowances: Centavos;
  /** Late and undertime, by the minute. */
  late: Centavos;
  halfDay: Centavos;
  /** Late, undertime and half days together. */
  shortfall: Centavos;
  /** What the absences cost, for the record; basic already leaves them out. */
  absentAmount: Centavos;
  overtime: Centavos;
  /** The payslip's "Total earnings": compensation, allowances and overtime, before anything is taken off. */
  earnings: Centavos;
  /** The sheet's "Gross compensation": earnings less the shortfall. */
  gross: Centavos;
  sss: Centavos;
  philhealth: Centavos;
  pagibig: Centavos;
  advance: Centavos;
  /** The shares and the salary advance. */
  deductions: Centavos;
  /** The payslip's "Total deductions": the deductions and the shortfall. */
  totalDeductions: Centavos;
  /** Gross less deductions; the same as earnings less total deductions. */
  net: Centavos;
}

/**
 * Prices a tally with an employee's pay setup and the government shares for the cut-off. A tally whose working day
 * has no length (no minutes were counted) prices no late minutes or overtime.
 */
export function price(setup: PaySetup, t: AttendanceTally, shares: Shares): Pay {
  const daily = toCentavos(setup.daily);
  const paidDays = t.worked + t.regularHolidaysOff;
  const basic = daily * paidDays;
  const specialHoliday = percent(daily, SPECIAL_HOLIDAY_PERCENT) * t.specialHolidaysWorked;
  const regularHoliday = percent(daily, REGULAR_HOLIDAY_PERCENT) * t.regularHolidaysWorked;
  const compensation = basic + specialHoliday + regularHoliday;
  const incentive = toCentavos(setup.incentive);
  const housing = toCentavos(setup.housing);
  const specialAllowance = toCentavos(setup.special) * t.worked;
  const allowances = incentive + housing + specialAllowance;
  const day = t.dayMinutes > 0 ? t.dayMinutes : 0;
  const late = day ? Math.round((daily * t.shortMinutes) / day) : 0;
  const halfDay = Math.round((daily * t.halfDays) / 2);
  const shortfall = late + halfDay;
  const overtime = day ? Math.round((daily * t.overtimeHours * 60 * OVERTIME_PERCENT) / (day * 100)) : 0;
  const earnings = compensation + allowances + overtime;
  const gross = earnings - shortfall;
  const sss = toCentavos(shares.sss);
  const philhealth = toCentavos(shares.philhealth);
  const pagibig = toCentavos(shares.pagibig);
  const advance = toCentavos(setup.advance);
  const deductions = deductionsOf(shares, setup.advance);

  return {
    daily, cutoffRate: daily * t.scheduled, scheduled: t.scheduled, worked: t.worked, paidDays, absent: t.absent,
    halfDays: t.halfDays, basic, specialHoliday, regularHoliday, compensation, incentive, housing, specialAllowance,
    allowances, late, halfDay, shortfall, absentAmount: daily * t.absent, overtime, earnings, gross, sss, philhealth,
    pagibig, advance, deductions, totalDeductions: deductions + shortfall, net: gross - deductions,
  };
}

/** Without timekeeping: every weekday of the cut-off paid in full. No minutes are counted, so the day has no length. */
export function fullAttendance(p: Period): AttendanceTally {
  const scheduled = datesBetween(p.from, p.to).filter(isWeekday).length;

  return {
    scheduled, worked: scheduled, halfDays: 0, absent: 0, regularHolidaysOff: 0, specialHolidaysWorked: 0,
    regularHolidaysWorked: 0, shortMinutes: 0, overtimeHours: 0, dayMinutes: 0,
  };
}
