import { describe, expect, it } from 'vitest';
import {
  halfOf, monthlyPay, pagibigMonthly, philhealthMonthly, sssCredit, sssMonthly, tableShares,
} from '../src/contributions';

// Amounts in centavos unless the name says pesos. 2026 tables: SSS 5% of the salary credit (₱5,000 to ₱35,000 in ₱500
// steps), PhilHealth 2.5% of pay between ₱10,000 and ₱100,000, Pag-IBIG 2% (1% at ₱1,500 or less) of up to ₱10,000.
const pesos = (n: number) => Math.round(n * 100);

describe('the contribution tables', () => {
  it('turns a daily rate into monthly pay for a Monday-to-Friday employee', () => {
    expect(monthlyPay(pesos(760))).toBe(pesos(16_530));
  });

  it('puts monthly pay in its SSS salary credit bracket', () => {
    expect(sssCredit(pesos(1_000))).toBe(pesos(5_000));
    expect(sssCredit(pesos(5_249.99))).toBe(pesos(5_000));
    expect(sssCredit(pesos(5_250))).toBe(pesos(5_500));
    expect(sssCredit(pesos(16_530))).toBe(pesos(16_500));
    expect(sssCredit(pesos(27_300))).toBe(pesos(27_500));
    expect(sssCredit(pesos(34_749.99))).toBe(pesos(34_500));
    expect(sssCredit(pesos(34_750))).toBe(pesos(35_000));
    expect(sssCredit(pesos(80_000))).toBe(pesos(35_000));
  });

  it('takes the employee\'s share of each', () => {
    expect([sssMonthly(pesos(4_000)), sssMonthly(pesos(16_530)), sssMonthly(pesos(80_000))]).toEqual([pesos(250), pesos(825), pesos(1_750)]);
    expect([philhealthMonthly(pesos(8_000)), philhealthMonthly(pesos(16_530)), philhealthMonthly(pesos(150_000))]).toEqual([pesos(250), pesos(413.25), pesos(2_500)]);
    expect([pagibigMonthly(pesos(1_500)), pagibigMonthly(pesos(1_500.01)), pagibigMonthly(pesos(16_530))]).toEqual([pesos(15), pesos(30), pesos(200)]);
  });

  it('splits a month between its two cut-offs so the month adds up', () => {
    const first = { from: '2026-11-01', to: '2026-11-15' };
    const second = { from: '2026-11-16', to: '2026-11-30' };

    expect([halfOf(41_325, first), halfOf(41_325, second)]).toEqual([20_663, 20_662]);
    expect(tableShares(760, first)).toEqual({ sss: 412.5, philhealth: 206.63, pagibig: 100 });
    expect(tableShares(760, second)).toEqual({ sss: 412.5, philhealth: 206.62, pagibig: 100 });
  });
});
