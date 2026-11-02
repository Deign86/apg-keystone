# 0008. Employee timekeeping and payroll live in Keystone

Status: Accepted · Date: 2026-11-02

## Context

- **The attendance tracker** (`Deign86/alpha-premier-attendance`) is an RFID kiosk for **interns**. It has a fixed
  intern rate, late charged by the started hour with no grace, a bathroom key log, a LAN viewer and a Sheets export.
  Keystone only opens it (0007).
- **Employees** need their own time records and payroll, kept away from the kiosk and the office network. They are
  paid differently from interns and from each other. The HR supervisor keeps each employee's pay in a spreadsheet
  (`PAYROLL` and `PAYSLIP` tabs): a daily rate, incentives and special allowances, holiday pay, late, half days,
  overtime, SSS, PhilHealth and Pag-IBIG shares, salary advances, and the bank paid into.
- **The office rule for employees** is one 15-minute grace on time-ins each week.

## Decision

- **Two new modules**, one business function each:
  - `timekeeping`: time in and out, corrections, holidays, and the office day with its weekly grace.
  - `payroll`: each employee's pay setup, the semi-monthly cut-off priced as HR's sheet prices it, closing a
    cut-off, and the payroll sheet and payslips.
- **One new service,** `timekeeping.employee-attendance`, so payroll prices days without importing timekeeping. Its
  contract, `AttendanceTally`, counts days and minutes and holds no pesos.
  - Payroll works without it: every weekday is paid in full, and the screen says so.
  - Timekeeping works without payroll.
- **Saved data:** each module keeps its data in `state.ext.<id>`, the first parts to do so (rule 9). Core gains
  `moduleData` and `withModuleData`, plus decoders (`isJsonObject`, `jsonText`, `jsonNumber`, `jsonObjects`) that read
  a field back safely.
- **Calendar helpers in core,** because both modules need them: the semi-monthly cut-off (`halfMonthOf`,
  `halfMonthsTo`, `periodLabel`) and weekdays (`isWeekday`, `mondayOf`, `datesBetween`).
- **Nothing is shared with the attendance tracker.** It is neither read from nor written to, and it is unchanged.
  Bathroom keys, RFID cards, photos, spoken greetings, the LAN viewer and the Sheets export are left out on purpose.
- **Dialogs scroll** (`Sheet` in `@keystone/ui` has a max height): the pay setup is the first form tall enough to need
  it.

## Consequences

- **Good:**
  - HR keeps every employee's pay where the payroll is run.
  - The weekly grace, half days and overtime are applied the same way every time.
  - A closed cut-off never reprices.
  - Each module can be removed alone (the removal suite covers both).
- **Cost:**
  - Keystone has no sign-in, so anyone who can open Keystone can change a pay setup. Every change is written to the
    Activity log with the time.
  - Days are entered in Keystone, by an employee at the computer or by HR. There is no card reader.
  - Government contributions are entered as amounts per cut-off. Keystone does not compute them from contribution
    tables.
