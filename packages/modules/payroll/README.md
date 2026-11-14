# Payroll

Employees' pay, cut-off by cut-off, kept in Keystone and reachable only from Keystone's own screens. Every employee
has their own pay setup, which the HR supervisor keeps. The cut-off is priced the way HR's payroll spreadsheet prices
it (the `PAYROLL` and `PAYSLIP` tabs), from the days Timekeeping counted.

## Owns
- `src/pay.ts`: **the payroll engine, the only place pay is computed.** Pricing (`price`), the 2026 SSS, PhilHealth
  and Pag-IBIG tables, the monthly pay basis, each employee's shares, and the payslip's totals. Pure functions over
  whole centavos. The screen, the payroll sheet, the payslip and Overview only show fields of the `Pay` it returns;
  none of them adds anything up. Tested in `test/pay.test.ts`.
- `src/rules.ts`: the pay setup and its checks, the saved data, assembling a cut-off (`cutoffOf`), closing and
  reopening it, and what it contributes. It calls the engine for every amount. Tested in `test/rules.test.ts`.
- `src/index.tsx`: the screen. **Pay setup** lists every employee in the Directory; opening one sets their pay.
  **Cut-off** shows the pay for a semi-monthly cut-off and closes or reopens it; in a narrow window it keeps gross,
  deductions and net pay and leaves what adds up to gross to the payroll sheet. Under it, the **payroll sheet** and
  each employee's **payslip**, with Print and Export PDF.
- `src/PayrollPapers.tsx`: the payroll sheet (the spreadsheet's columns, totals, signatures) and the payslip
  (earnings, deductions, net pay). The sheet's 22 columns are wider than the paper even on its side, so it is a
  landscape A4 and its table shrinks to fit across it, one line per employee, on screen as in print and the PDF.
- Its data: `state.ext.payroll` = `{ setups: [PaySetup], runs: [{ from, to, closed, rows }] }`.

### The pay setup (per employee)
| Field | How it is used |
|---|---|
| Employee no. | Printed on the sheet and the payslip ("APGCO-0013"); no two employees share one |
| Daily rate | Required. Cut-off rate = daily rate × standard working days; basic = daily rate × days paid |
| Monthly pay basis | What the government shares are worked out on. Empty: daily rate × 261 ÷ 12. An amount: that employee's own |
| Incentives allowance, Housing allowance (HRA) | Added once each cut-off |
| Special allowance | Added for each day worked |
| SSS, PhilHealth and Pag-IBIG employee shares | Deducted each cut-off. Empty: from the contribution tables (below). An amount, 0 included: that employee's own, used instead |
| Salary advance | Deducted each cut-off until it is set back to zero |
| Bank, Account no. | Printed on the payslip; an empty bank prints "Cash" |

Name, designation, department and TIN come from the employee's Directory record.

### Pricing a cut-off (1st to 15th, 16th to the month's end)
- **Standard working days:** weekdays in the cut-off, holidays included.
- **Days paid:** days worked plus regular holidays not worked. **Basic** = daily rate × days paid.
- **Special holiday worked:** + 30% of the daily rate. **Regular holiday worked:** + 100%.
- **Total compensation** = basic + holiday pay. **Total allowance** = incentives + HRA + special allowance × days worked.
- **Late / undertime:** the daily rate ÷ 480 for each minute. **Half day:** half the daily rate.
- **Overtime:** approved hours at the hourly rate (daily ÷ 8) × 125%.
- **Gross compensation** = total compensation + total allowance − late − half day + overtime.
- **Net pay** = gross − SSS − PhilHealth − Pag-IBIG − salary advance.
- **Absent** is shown for the record; basic already leaves the day out.

### Government shares, from the 2026 tables
Each is worked out on the employee's monthly pay basis (their own, or daily × 261 ÷ 12 for a Monday-to-Friday
employee), and half of the month's share is deducted each cut-off (the 16th–end takes what rounding leaves, so a month
adds up).
- **SSS:** 5% of the monthly salary credit: monthly pay to the nearest ₱500 (₱x,250 rounds up), from ₱5,000 to ₱35,000.
- **PhilHealth:** 2.5% of monthly pay, floored at ₱10,000 and capped at ₱100,000.
- **Pag-IBIG:** 2% of monthly pay up to ₱10,000 (1% at ₱1,500 or less).

The form shows the table's amount in each empty field. A closed cut-off keeps the shares it was closed with, so a
later change to a table or to an employee's own amount never reprices it.

**Closing** a cut-off (from the day after it ends) freezes each employee's setup and days as they were, so later
corrections and rate changes never reprice it. **Reopening** lets it follow them again. Both go to the Activity log.

### Tests
Pay proved fragile in the intern attendance app, so it is tested from four sides:
- **The engine** (`test/pay.test.ts`):
  - golden cut-offs worked out by hand, HR's own sheet row and the regression cut-off among them;
  - identities checked over every combination of rate, days and shares: gross, net, payslip totals, and the register
    matching the payslip;
  - every SSS bracket edge, the PhilHealth floor and ceiling, Pag-IBIG's 1% band and cap;
  - a month adding up to the centavo across its two cut-offs.
- **The rules** (`test/rules.test.ts`): what reaches the engine, the grey preview equal to what saving deducts,
  refusals, and regressions (data saved by earlier releases keeps its pay; a closed cut-off never reprices).
- **Across the parts** (`apps/keystone/src/test/payroll.test.tsx`): the regression cut-off's saved days rendered
  through Timekeeping, the attendance service and this screen, with and without Timekeeping.
- **End to end** (`e2e/modules/payroll.e2e.ts`): the regression cut-off entered in Timekeeping and paid here, the
  shares and monthly pay basis, and a closed cut-off ignoring a later correction until it is reopened.

## Contributes
- **Home:** a tile with "On payroll, N".
- **Overview:** the "Last payroll" figure (net of the latest closed cut-off).
- **Finding:** the last cut-off is ready to close (priority 7).
- **Activity:** log tag `PAY`.

## Needs
Employees in the directory (data). Uses `timekeeping.employee-attendance` (`SERVICES.employeeAttendance`) when it is
installed; without it, every weekday of a cut-off is paid in full and the screen says so.

## Removing it
The above disappear. Pay setups and closed cut-offs stay in `state.json`.
