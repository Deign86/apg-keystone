import {
  addDays, count, datesBetween, halfMonthOf, isISODate, isJsonObject, isWeekday, jsonNumber, jsonObjects, jsonText,
  KeystoneError, logged, moduleData, parseAmount, percent, periodLabel, peso, recordOf, shortDate, stamp, sumCentavos,
  toCentavos, today, withModuleData, type AttendanceTally, type Centavos, type Change, type Ctx, type EmployeeAttendance,
  type Figure, type Finding, type JsonObject, type JsonValue, type Period, type TerminalState,
} from '@keystone/core';
import { tableShares, type Shares } from './contributions';

// Employee payroll: each employee's own pay setup, which the HR supervisor keeps, and the semi-monthly cut-off priced
// the way the HR payroll sheet prices it. Attendance comes from the timekeeping service when it is installed. Kept
// under state.ext.payroll; nothing leaves Keystone.

export const MODULE = 'payroll';
export const TAG = 'PAY';

/** Overtime is paid at 125% of the hourly rate (Labor Code, Art. 87). */
export const OVERTIME_PERCENT = 125;

/** Working a special non-working day adds 30% of the daily rate; a regular holiday adds 100%. */
export const SPECIAL_HOLIDAY_PERCENT = 30;
export const REGULAR_HOLIDAY_PERCENT = 100;

/**
 * One employee's pay, as the HR supervisor sets it. Pesos, as everywhere in the saved state. Allowances and
 * deductions are per cut-off, except the special allowance, which is per day worked. A government share left null
 * comes from the contribution tables; an amount (0 included) is that employee's own.
 */
export type PaySetup = {
  /** Directory code of the employee. */
  emp: string;
  /** The payroll's own employee number, "APGCO-0013". */
  empNo: string;
  daily: number;
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

/** A closed cut-off keeps who was paid and on what, as it was, so later corrections never reprice it. */
export type PayRunRow = { setup: PaySetup; tally: AttendanceTally; shares: Shares; name: string; position: string; dept: string; tin: string };

export type PayRun = { from: string; to: string; closed: string; rows: PayRunRow[] };

export type PayrollData = { setups: PaySetup[]; runs: PayRun[] };

// ---------- reading and writing the saved data ----------

/** An employee's own share, or null for the tables. */
const ownShare = (v: JsonValue | undefined) => (Number.isFinite(v) ? jsonNumber(v) : null);

function setupOf(o: JsonObject): PaySetup {
  return {
    emp: jsonText(o.emp), empNo: jsonText(o.empNo), daily: jsonNumber(o.daily), incentive: jsonNumber(o.incentive), housing: jsonNumber(o.housing),
    special: jsonNumber(o.special), sss: ownShare(o.sss), philhealth: ownShare(o.philhealth), pagibig: ownShare(o.pagibig),
    advance: jsonNumber(o.advance), bank: jsonText(o.bank), account: jsonText(o.account),
  };
}

function sharesOf(o: JsonValue | undefined, setup: PaySetup, p: Period): Shares {
  if (!isJsonObject(o)) return sharesFor(setup, p);

  return { sss: jsonNumber(o.sss), philhealth: jsonNumber(o.philhealth), pagibig: jsonNumber(o.pagibig) };
}

function tallyOf(o: JsonValue | undefined): AttendanceTally {
  const t = isJsonObject(o) ? o : {};

  return {
    scheduled: jsonNumber(t.scheduled), worked: jsonNumber(t.worked), halfDays: jsonNumber(t.halfDays), absent: jsonNumber(t.absent),
    regularHolidaysOff: jsonNumber(t.regularHolidaysOff), specialHolidaysWorked: jsonNumber(t.specialHolidaysWorked),
    regularHolidaysWorked: jsonNumber(t.regularHolidaysWorked), shortMinutes: jsonNumber(t.shortMinutes),
    overtimeHours: jsonNumber(t.overtimeHours), dayMinutes: jsonNumber(t.dayMinutes) || 480,
  };
}

/** What payroll has saved, checked field by field; anything unreadable is left out. */
export function dataOf(s: TerminalState): PayrollData {
  const raw = moduleData(s, MODULE);

  if (!isJsonObject(raw)) return { setups: [], runs: [] };

  return {
    setups: jsonObjects(raw.setups).map(setupOf).filter((x) => x.emp),
    runs: jsonObjects(raw.runs)
      .map((r): PayRun => ({
        from: jsonText(r.from), to: jsonText(r.to), closed: jsonText(r.closed),
        rows: jsonObjects(r.rows).flatMap((x) => {
          if (!isJsonObject(x.setup)) return [];
          const setup = setupOf(x.setup);

          return [{
            setup, tally: tallyOf(x.tally), shares: sharesOf(x.shares, setup, { from: jsonText(r.from), to: jsonText(r.to) }),
            name: jsonText(x.name), position: jsonText(x.position), dept: jsonText(x.dept), tin: jsonText(x.tin),
          }];
        }),
      }))
      .filter((r) => isISODate(r.from) && isISODate(r.to)),
  };
}

const saved = (s: TerminalState, data: PayrollData) => withModuleData(s, MODULE, data);

export const setupFor = (s: TerminalState, emp: string) => dataOf(s).setups.find((x) => x.emp === emp);

/** The shares this employee pays in this cut-off: their own amount where HR typed one, the tables' otherwise. */
export function sharesFor(setup: PaySetup, p: Period): Shares {
  const table = tableShares(setup.daily, p);

  return { sss: setup.sss ?? table.sss, philhealth: setup.philhealth ?? table.philhealth, pagibig: setup.pagibig ?? table.pagibig };
}

// ---------- pricing ----------

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
  /** What the absences cost, for the record; basic already leaves them out. */
  absentAmount: Centavos;
  overtime: Centavos;
  gross: Centavos;
  sss: Centavos;
  philhealth: Centavos;
  pagibig: Centavos;
  advance: Centavos;
  deductions: Centavos;
  net: Centavos;
}

/** Prices a tally with an employee's pay setup and the government shares for the cut-off. */
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
  const late = Math.round((daily * t.shortMinutes) / t.dayMinutes);
  const halfDay = Math.round((daily * t.halfDays) / 2);
  const overtime = Math.round((daily * t.overtimeHours * 60 * OVERTIME_PERCENT) / (t.dayMinutes * 100));
  const gross = compensation + allowances - late - halfDay + overtime;
  const sss = toCentavos(shares.sss);
  const philhealth = toCentavos(shares.philhealth);
  const pagibig = toCentavos(shares.pagibig);
  const advance = toCentavos(setup.advance);
  const deductions = sss + philhealth + pagibig + advance;

  return {
    daily, cutoffRate: daily * t.scheduled, scheduled: t.scheduled, worked: t.worked, paidDays, absent: t.absent,
    halfDays: t.halfDays, basic, specialHoliday, regularHoliday, compensation, incentive, housing, specialAllowance,
    allowances, late, halfDay, absentAmount: daily * t.absent, overtime, gross, sss, philhealth, pagibig, advance,
    deductions, net: gross - deductions,
  };
}

/** Without timekeeping: every weekday of the cut-off paid in full, nothing late, no overtime. */
export function fullAttendance(p: Period): AttendanceTally {
  const scheduled = datesBetween(p.from, p.to).filter(isWeekday).length;

  return {
    scheduled, worked: scheduled, halfDays: 0, absent: 0, regularHolidaysOff: 0, specialHolidaysWorked: 0,
    regularHolidaysWorked: 0, shortMinutes: 0, overtimeHours: 0, dayMinutes: 480,
  };
}

// ---------- a cut-off ----------

export interface PayLine extends PayRunRow { pay: Pay }

export interface Cutoff {
  period: Period;
  lines: PayLine[];
  /** When it was closed ("2026-11-16 10:02"); undefined while it is open. */
  closed?: string;
  /** Open and without timekeeping: days are assumed, not counted. */
  assumed: boolean;
}

export const runFor = (s: TerminalState, p: Period) => dataOf(s).runs.find((r) => r.from === p.from && r.to === p.to);

/** The cut-off as it stands: frozen once closed, otherwise priced from the pay setups and attendance now. */
export function cutoffOf(s: TerminalState, p: Period, attendance: EmployeeAttendance | undefined, ctx: Ctx): Cutoff {
  const run = runFor(s, p);

  if (run) return { period: p, closed: run.closed, assumed: false, lines: run.rows.map((r) => ({ ...r, pay: price(r.setup, r.tally, r.shares) })) };

  const lines = dataOf(s).setups.map((setup): PayLine => {
    const e = recordOf(s, setup.emp);
    const tally = attendance ? attendance.tally(s, setup.emp, p.from, p.to, ctx) : fullAttendance(p);
    const shares = sharesFor(setup, p);

    return { setup, tally, shares, name: e?.name ?? setup.emp, position: e?.detail ?? '', dept: e?.dept ?? '', tin: e?.tin ?? '', pay: price(setup, tally, shares) };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return { period: p, lines, assumed: !attendance };
}

export type PayKey = { [K in keyof Pay]: Pay[K] extends Centavos ? K : never }[keyof Pay];

export const totalOf = (c: Cutoff, key: PayKey) => sumCentavos(c.lines, (l) => l.pay[key]);

export function closeCutoff(s: TerminalState, p: Period, attendance: EmployeeAttendance | undefined, ctx: Ctx): Change<PayRun> {
  const label = periodLabel(p);
  const existing = runFor(s, p);

  if (existing) throw new KeystoneError(`The ${label} payroll was closed on ${shortDate(existing.closed.slice(0, 10))}.`);

  if (today(ctx) <= p.to) throw new KeystoneError(`The ${label} cut-off ends ${shortDate(p.to)}; close it from ${shortDate(addDays(p.to, 1))}.`);
  const c = cutoffOf(s, p, attendance, ctx);

  if (!c.lines.length) throw new KeystoneError('Set up pay for at least one employee first.');
  const data = dataOf(s);
  const run: PayRun = { from: p.from, to: p.to, closed: stamp(ctx.now()), rows: c.lines.map((l) => ({ setup: l.setup, tally: l.tally, shares: l.shares, name: l.name, position: l.position, dept: l.dept, tin: l.tin })) };
  const line = `Payroll for ${label} closed: ${count(run.rows.length, 'employee')}, ${peso(totalOf(c, 'net'))} net.`;

  return { state: logged(saved(s, { ...data, runs: [...data.runs, run] }), TAG, line, ctx), record: run, message: line };
}

export function reopenCutoff(s: TerminalState, p: Period, ctx: Ctx): Change<PayRun> {
  const run = runFor(s, p);
  const label = periodLabel(p);

  if (!run) throw new KeystoneError(`The ${label} payroll is not closed.`);
  const data = dataOf(s);
  const line = `Payroll for ${label} reopened; it follows timekeeping and the pay setups again.`;

  return { state: logged(saved(s, { ...data, runs: data.runs.filter((r) => !(r.from === p.from && r.to === p.to)) }), TAG, line, ctx), record: run, message: line };
}

// ---------- the pay setup HR keeps ----------

export const AMOUNTS = ['daily', 'incentive', 'housing', 'special', 'sss', 'philhealth', 'pagibig', 'advance'] as const;

/** The government shares: from the tables unless HR types the employee's own amount. */
export const SHARES = ['sss', 'philhealth', 'pagibig'] as const;

type ShareField = (typeof SHARES)[number];

export type AmountField = (typeof AMOUNTS)[number];

export const AMOUNT_LABEL: Record<AmountField, string> = {
  daily: 'Daily rate', incentive: 'Incentives allowance', housing: 'HRA', special: 'Special allowance',
  sss: 'SSS', philhealth: 'PhilHealth', pagibig: 'Pag-IBIG', advance: 'Salary advance',
};

/** The same, inside a sentence. */
const AMOUNT_WORDS: Record<AmountField, string> = {
  daily: 'daily rate', incentive: 'incentives allowance', housing: 'housing allowance', special: 'special allowance',
  sss: 'SSS employee share', philhealth: 'PhilHealth employee share', pagibig: 'Pag-IBIG employee share', advance: 'salary advance',
};

export type SetupDraft = { emp: string; empNo: string; bank: string; account: string } & Record<AmountField, string>;

const amountText = (pesos: number) => (pesos ? String(pesos) : '');
const shareText = (pesos: number | null | undefined) => (pesos === null || pesos === undefined ? '' : String(pesos));

export function setupDraftOf(s: TerminalState, emp: string): SetupDraft {
  const x = setupFor(s, emp);

  return {
    emp, empNo: x?.empNo ?? '', bank: x?.bank ?? '', account: x?.account ?? '',
    daily: amountText(x?.daily ?? 0), incentive: amountText(x?.incentive ?? 0), housing: amountText(x?.housing ?? 0),
    special: amountText(x?.special ?? 0), sss: shareText(x?.sss), philhealth: shareText(x?.philhealth),
    pagibig: shareText(x?.pagibig), advance: amountText(x?.advance ?? 0),
  };
}

function pesosIn(d: SetupDraft, field: AmountField): number {
  const typed = d[field].trim();

  if (!typed) return 0;
  const c = parseAmount(typed);

  if (c === null || c < 0) throw new KeystoneError(`Enter the ${AMOUNT_WORDS[field]} as an amount in pesos.`);

  return c / 100;
}

/** A government share as typed: empty means the tables, so it is null; anything else is the employee's own amount. */
const shareIn = (d: SetupDraft, field: ShareField) => (d[field].trim() ? pesosIn(d, field) : null);

export function saveSetup(s: TerminalState, d: SetupDraft, ctx: Ctx): Change<PaySetup> {
  const e = recordOf(s, d.emp);

  if (!e || e.type !== 'Employee') throw new KeystoneError('Pick an employee from the directory.');
  const daily = pesosIn(d, 'daily');

  if (!daily) throw new KeystoneError(`Enter ${e.name}'s daily rate.`);
  const data = dataOf(s);
  const empNo = d.empNo.trim();
  const clash = empNo && data.setups.find((x) => x.emp !== d.emp && x.empNo.toLowerCase() === empNo.toLowerCase());

  if (clash) throw new KeystoneError(`${empNo} is already the employee number of ${recordOf(s, clash.emp)?.name ?? clash.emp}.`);

  const setup: PaySetup = {
    emp: d.emp, empNo, daily, incentive: pesosIn(d, 'incentive'), housing: pesosIn(d, 'housing'), special: pesosIn(d, 'special'),
    sss: shareIn(d, 'sss'), philhealth: shareIn(d, 'philhealth'), pagibig: shareIn(d, 'pagibig'), advance: pesosIn(d, 'advance'),
    bank: d.bank.trim(), account: d.account.trim(),
  };

  const before = data.setups.some((x) => x.emp === d.emp);
  const setups = before ? data.setups.map((x) => (x.emp === d.emp ? setup : x)) : [...data.setups, setup];

  const line = before
    ? `Pay setup for ${e.name} changed: ${peso(toCentavos(daily))} a day.`
    : `Pay set up for ${e.name}: ${peso(toCentavos(daily))} a day.`;

  return { state: logged(saved(s, { ...data, setups }), TAG, line, ctx), record: setup, message: `Pay setup saved for ${e.name}.` };
}

export function removeSetup(s: TerminalState, emp: string, ctx: Ctx): Change<PaySetup> {
  const data = dataOf(s);
  const x = data.setups.find((y) => y.emp === emp);
  const name = recordOf(s, emp)?.name ?? emp;

  if (!x) throw new KeystoneError(`${name} is not on the payroll.`);
  const line = `${name} taken off the payroll. Closed cut-offs keep their pay.`;

  return { state: logged(saved(s, { ...data, setups: data.setups.filter((y) => y.emp !== emp) }), TAG, line, ctx), record: x, message: line };
}

// ---------- what payroll tells Overview and Home ----------

/** The cut-off before the one today falls in: the one to close now. */
export const lastCutoff = (ctx: Ctx): Period => halfMonthOf(addDays(halfMonthOf(today(ctx)).from, -1));

export function payrollStat(s: TerminalState): [string, string] {
  return ['On payroll', String(dataOf(s).setups.length)];
}

export function payrollFigure(s: TerminalState): Figure {
  const runs = dataOf(s).runs;
  const latest = [...runs].sort((a, b) => b.to.localeCompare(a.to))[0];

  if (!latest) return { label: 'Last payroll', value: '—', caption: 'No cut-off closed yet' };
  const net = sumCentavos(latest.rows, (r) => price(r.setup, r.tally, r.shares).net);

  return { label: 'Last payroll', value: peso(net), caption: `${periodLabel(latest)} · ${count(latest.rows.length, 'employee')}` };
}

export function payrollFinding(s: TerminalState, ctx: Ctx): Finding | null {
  const p = lastCutoff(ctx);

  if (!dataOf(s).setups.length || runFor(s, p)) return null;

  return { priority: 7, text: `The ${periodLabel(p)} payroll is ready to close.` };
}
