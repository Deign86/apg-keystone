# Payroll

Employees' pay, cut-off by cut-off, kept in Keystone and reachable only from Keystone's own screens. Every employee
has their own pay setup, which the HR supervisor keeps. The cut-off is priced the way HR's payroll spreadsheet prices
it (the `PAYROLL` and `PAYSLIP` tabs), from the days Timekeeping counted.

## Owns
- `src/rules.ts`: the pay setup and its checks, pricing (`price`), the cut-off (`cutoffOf`), closing and reopening
  it, and what it contributes. Tested in `test/rules.test.ts`, including HR's Oct 1–15, 2026 row to the centavo.
- `src/index.tsx`: the screen. **Pay setup** lists every employee in the Directory; opening one sets their pay.
  **Cut-off** shows the pay for a semi-monthly cut-off and closes or reopens it. Under it, the **payroll sheet** and
  each employee's **payslip**, with Print and Export PDF.
- `src/PayrollPapers.tsx`: the payroll sheet (the spreadsheet's columns, totals, signatures) and the payslip
  (earnings, deductions, net pay).
- Its data: `state.ext.payroll` = `{ setups: [PaySetup], runs: [{ from, to, closed, rows }] }`.

### The pay setup (per employee)
| Field | How it is used |
|---|---|
| Employee no. | Printed on the sheet and the payslip ("APGCO-0013"); no two employees share one |
| Daily rate | Required. Cut-off rate = daily rate × standard working days; basic = daily rate × days paid |
| Incentives allowance, Housing allowance (HRA) | Added once each cut-off |
| Special allowance | Added for each day worked |
| SSS, PhilHealth and Pag-IBIG employee shares | Deducted once each cut-off |
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

**Closing** a cut-off (from the day after it ends) freezes each employee's setup and days as they were, so later
corrections and rate changes never reprice it. **Reopening** lets it follow them again. Both go to the Activity log.

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
