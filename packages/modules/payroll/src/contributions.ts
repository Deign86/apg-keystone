import { toCentavos, toPesos, type Centavos, type Period } from '@keystone/core';

// The employee's share of the government contributions, from the 2026 tables. These are the defaults; HR can type an
// employee's own amount over any of them in the pay setup. If a table changes, change it here: closed cut-offs keep
// the shares they were closed with.
//
// - SSS (RA 11199, schedule from Jan 2025, still in force in 2026): 15% of the monthly salary credit, 5% from the
//   employee. The credit is the monthly pay rounded to the nearest ₱500 (₱x,250 rounds up), from ₱5,000 to ₱35,000.
// - PhilHealth (UHC Act, from 2024): 5% of monthly basic pay, half from the employee, on pay floored at ₱10,000 and
//   capped at ₱100,000.
// - Pag-IBIG (HDMF Circular 460, from Feb 2024): 2% from the employee (1% at ₱1,500 a month or less), on at most
//   ₱10,000 a month.

/** Working days in a year for a Monday-to-Friday employee: the DOLE factor that turns a daily rate into a monthly one. */
export const WORKING_DAYS_A_YEAR = 261;

export const SSS = { minCredit: toCentavos(5_000), maxCredit: toCentavos(35_000), step: toCentavos(500), employeePerMille: 50 };
export const PHILHEALTH = { floor: toCentavos(10_000), ceiling: toCentavos(100_000), employeePerMille: 25 };
export const PAGIBIG = { cap: toCentavos(10_000), lowPay: toCentavos(1_500), lowPerMille: 10, employeePerMille: 20 };

const perMille = (c: Centavos, rate: number) => Math.round((c * rate) / 1000);

/** A daily rate as monthly pay, the basis of every contribution: daily × 261 ÷ 12. */
export const monthlyPay = (daily: Centavos): Centavos => Math.round((daily * WORKING_DAYS_A_YEAR) / 12);

/** The SSS monthly salary credit for this monthly pay. */
export function sssCredit(monthly: Centavos): Centavos {
  const bracket = Math.floor((monthly + SSS.step / 2) / SSS.step) * SSS.step;

  return Math.min(SSS.maxCredit, Math.max(SSS.minCredit, bracket));
}

/** Each share for a month, in centavos. */
export const sssMonthly = (monthly: Centavos) => perMille(sssCredit(monthly), SSS.employeePerMille);
export const philhealthMonthly = (monthly: Centavos) => perMille(Math.min(PHILHEALTH.ceiling, Math.max(PHILHEALTH.floor, monthly)), PHILHEALTH.employeePerMille);
export const pagibigMonthly = (monthly: Centavos) => perMille(Math.min(PAGIBIG.cap, monthly), monthly <= PAGIBIG.lowPay ? PAGIBIG.lowPerMille : PAGIBIG.employeePerMille);

/** Half a month's share for this cut-off: the 1st–15th takes the rounded half, the 16th–end the rest, so a month adds up. */
export function halfOf(monthly: Centavos, p: Period): Centavos {
  const first = Math.round(monthly / 2);

  return Number(p.from.slice(8, 10)) <= 15 ? first : monthly - first;
}

/** The employee's shares for one cut-off, in pesos, as the payroll keeps them. */
export type Shares = { sss: number; philhealth: number; pagibig: number };

/** What the tables say an employee on this daily rate pays in this cut-off. */
export function tableShares(daily: number, p: Period): Shares {
  const monthly = monthlyPay(toCentavos(daily));

  return {
    sss: toPesos(halfOf(sssMonthly(monthly), p)),
    philhealth: toPesos(halfOf(philhealthMonthly(monthly), p)),
    pagibig: toPesos(halfOf(pagibigMonthly(monthly), p)),
  };
}
