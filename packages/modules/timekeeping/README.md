# Timekeeping

Employee time-ins and time-outs, kept in Keystone and reachable only from Keystone's own screens. It reworks what the
attendance tracker (`Deign86/alpha-premier-attendance`) does at the front desk for **employees only**, and leaves out
everything that app is built around:

| | Attendance tracker (separate app) | Timekeeping (this module) |
|---|---|---|
| Who | Interns | Employees in the Directory |
| How time is taken | RFID card at a kiosk, photo and spoken greeting | Time in / Time out in Keystone, at the minute Keystone reads |
| Late | Every started hour from 8:00, no grace | By the minute, after one 15-minute grace a week |
| Pay | A fixed intern rate in its engine | Each employee's own pay setup, in the Payroll module |
| Bathroom key log | Yes | No |
| Office-network viewer, Google Sheets export | Yes | No: the data never leaves Keystone's `state.json` |

## Owns
- `src/rules.ts`: the office day (8:00 AM to 5:00 PM, Monday to Friday, 12:00 to 1:00 PM unpaid), the weekly grace,
  time in and out, corrections, holidays, the tally payroll prices, and what it contributes. Tested in
  `test/rules.test.ts`.
- `src/index.tsx`: the screen. **Today** lists every employee with a Time in or Time out button. **Daily time
  record** shows one employee's cut-off day by day; opening a past day corrects it (a forgotten time-in or
  time-out, approved overtime, a note). **Holidays** lists the days the office observes, regular or special.
- Its data: `state.ext.timekeeping` = `{ days: [{ emp, date, in, out, ot, note }], holidays: [{ date, name, kind }] }`.

### How a day counts
- **On time:** in by 8:00 AM.
- **Weekly grace:** the first arrival of the week (Monday to Sunday) that is 1 to 15 minutes late counts as on time.
  It is used once; a later one that week is late. An arrival more than 15 minutes late does not use it.
- **Late:** minutes after 8:00 AM, counted from 8:00 (8:20 is 20 minutes late).
- **Undertime:** minutes left before 5:00 PM.
- **Half day:** in at or after 12:00 PM, or out at or before 1:00 PM. Never also late.
- **Absent:** a past weekday with no time-in that is not a holiday. Today is "Not in yet" until it is over.
- **Overtime:** only the approved hours entered on a correction, never worked out from a late time-out.
- **Holidays:** a regular holiday not worked is paid; working a special day adds 30% of the daily rate, a regular one
  100% (priced in Payroll).

## Contributes
- **Home:** a tile with "In today, N of M".
- **Overview:** the "Employees in today" figure.
- **Finding:** a past day with no time-out (priority 8), so it is corrected before payroll.
- **Activity:** log tag `DTR`.

## Provides
`timekeeping.employee-attendance` (`SERVICES.employeeAttendance`, typed `EmployeeAttendance` in core): an employee's
`AttendanceTally` for a period (scheduled days, days worked, half days, absences, holidays, late and undertime
minutes, overtime hours). Payroll prices it.

## Needs
Employees in the directory (data).

## Removing it
The above disappear, and so does the attendance service: Payroll then pays every weekday of a cut-off in full and
says so. Saved days and holidays stay in `state.json`.
