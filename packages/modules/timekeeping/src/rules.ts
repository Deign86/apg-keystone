import {
  count, datesBetween, isISODate, isJsonObject, isWeekday, jsonNumber, jsonObjects, jsonText, KeystoneError, logged,
  mondayOf, moduleData, nameOf, recordOf, recordsOf, shortDate, today, withModuleData, type AttendanceTally, type Change,
  type Ctx, type EmployeeAttendance, type Figure, type Finding, type ISODate, type TerminalState,
} from '@keystone/core';

// Employee timekeeping: who came in when, and what that means for the day. Employees only (directory records of type
// Employee); there are no interns, cards, readers or key logs here. Everything is kept in Keystone, under
// state.ext.timekeeping, and only Keystone's screens reach it.

export const MODULE = 'timekeeping';
export const TAG = 'DTR';

/** The office day: 8:00 AM to 5:00 PM, Monday to Friday, with 12:00 to 1:00 PM unpaid for lunch. In minutes. */
export const SHIFT = { start: 8 * 60, end: 17 * 60, lunchStart: 12 * 60, lunchEnd: 13 * 60 } as const;
export const DAY_MINUTES = SHIFT.end - SHIFT.start - (SHIFT.lunchEnd - SHIFT.lunchStart);

/** Each employee may arrive up to 15 minutes late once a week (Monday to Sunday) and still be on time. */
export const WEEKLY_GRACE = 15;

export const HOLIDAY_KINDS = ['Regular', 'Special'] as const;

export type HolidayKind = (typeof HOLIDAY_KINDS)[number];

export type Holiday = { date: ISODate; name: string; kind: HolidayKind };

/** One employee's day. Times are 24-hour "HH:mm"; "" when not recorded. `ot` is approved overtime in hours. */
export type TimeDay = { emp: string; date: ISODate; in: string; out: string; ot: number; note: string };

export type TimekeepingData = { days: TimeDay[]; holidays: Holiday[] };

// ---------- reading and writing the saved data ----------

/** What timekeeping has saved, checked field by field; anything unreadable is left out. */
export function dataOf(s: TerminalState): TimekeepingData {
  const raw = moduleData(s, MODULE);

  if (!isJsonObject(raw)) return { days: [], holidays: [] };

  return {
    days: jsonObjects(raw.days)
      .map((d) => ({ emp: jsonText(d.emp), date: jsonText(d.date), in: jsonText(d.in), out: jsonText(d.out), ot: Math.max(0, jsonNumber(d.ot)), note: jsonText(d.note) }))
      .filter((d) => d.emp && isISODate(d.date)),
    holidays: jsonObjects(raw.holidays)
      .map((h): Holiday => ({ date: jsonText(h.date), name: jsonText(h.name), kind: h.kind === 'Regular' ? 'Regular' : 'Special' }))
      .filter((h) => isISODate(h.date)),
  };
}

const saved = (s: TerminalState, data: TimekeepingData) => withModuleData(s, MODULE, data);

// ---------- clock times ----------

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const isTime = (t: string) => TIME.test(t);

/** "08:15" → 495 minutes after midnight. */
export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** The local clock time of an instant, "08:15". */
export const timeOf = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** "08:15" → "8:15 AM"; "" → "—". */
export function clock12(t: string): string {
  if (!isTime(t)) return '—';
  const h = Number(t.slice(0, 2));

  return `${h % 12 === 0 ? 12 : h % 12}:${t.slice(3, 5)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "75" → "1 hr 15 min". */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  return [h ? `${h} hr` : '', m || !h ? `${m} min` : ''].filter(Boolean).join(' ');
}

// ---------- what a day means ----------

export type DayStatus = 'On time' | 'Grace' | 'Late' | 'Half day' | 'Absent' | 'Holiday' | 'Rest day' | 'Not in yet' | 'Upcoming';

export interface DayResult {
  date: ISODate;
  record?: TimeDay;
  holiday?: Holiday;
  /** A working day on the schedule (Monday to Friday), holiday or not. */
  scheduled: boolean;
  status: DayStatus;
  /** Minutes late, after the weekly grace. */
  late: number;
  /** Minutes left before 5:00 PM. */
  undertime: number;
  /** A past day timed in but never timed out. */
  open: boolean;
}

const worked = (r?: TimeDay) => !!r && isTime(r.in);

/**
 * One employee's days from one date to another, in order. The weekly grace is counted from the Monday of the first
 * week, so a grace used on a Tuesday is spent for the Thursday a cut-off starts on.
 */
export function daysOf(s: TerminalState, emp: string, from: ISODate, to: ISODate, ctx: Ctx): DayResult[] {
  const data = dataOf(s);
  const t = today(ctx);
  const records = new Map(data.days.filter((d) => d.emp === emp).map((d) => [d.date, d]));
  const holidays = new Map(data.holidays.map((h) => [h.date, h]));
  const graceUsed = new Set<ISODate>();
  const out: DayResult[] = [];

  for (const date of datesBetween(mondayOf(from), to)) {
    const record = records.get(date);
    const holiday = holidays.get(date);
    const scheduled = isWeekday(date);
    const day: DayResult = { date, record, holiday, scheduled, status: 'On time', late: 0, undertime: 0, open: false };

    if (!worked(record)) {
      day.status = !scheduled ? 'Rest day' : holiday ? 'Holiday' : date > t ? 'Upcoming' : date === t ? 'Not in yet' : 'Absent';
    } else if (record) {
      const inAt = minutesOf(record.in);
      const outAt = isTime(record.out) ? minutesOf(record.out) : null;

      day.open = outAt === null && date < t;

      if (!scheduled) {
        day.status = 'Rest day';
      } else if (inAt >= SHIFT.lunchStart || (outAt !== null && outAt <= SHIFT.lunchEnd)) {
        // Only the morning or only the afternoon: half a day, never late.
        day.status = 'Half day';
      } else {
        const late = Math.max(0, inAt - SHIFT.start);
        const week = mondayOf(date);

        if (late > 0 && late <= WEEKLY_GRACE && !graceUsed.has(week)) {
          graceUsed.add(week);
          day.status = 'Grace';
        } else {
          day.late = late;
          day.status = late > 0 ? 'Late' : 'On time';
        }

        day.undertime = outAt !== null ? Math.max(0, SHIFT.end - outAt) : 0;
      }
    }

    if (date >= from) out.push(day);
  }

  return out;
}

/** The days counted for payroll, not yet priced: what timekeeping offers other parts as a service. */
export function tally(s: TerminalState, emp: string, from: ISODate, to: ISODate, ctx: Ctx): AttendanceTally {
  const days = daysOf(s, emp, from, to, ctx).filter((d) => d.scheduled);
  const on = (d: DayResult) => worked(d.record);

  return {
    scheduled: days.length,
    worked: days.filter(on).length,
    halfDays: days.filter((d) => d.status === 'Half day').length,
    absent: days.filter((d) => d.status === 'Absent').length,
    regularHolidaysOff: days.filter((d) => !on(d) && d.holiday?.kind === 'Regular' && d.date <= today(ctx)).length,
    specialHolidaysWorked: days.filter((d) => on(d) && d.holiday?.kind === 'Special').length,
    regularHolidaysWorked: days.filter((d) => on(d) && d.holiday?.kind === 'Regular').length,
    shortMinutes: days.reduce((m, d) => m + d.late + d.undertime, 0),
    // Approved overtime counts on any day, rest days included.
    overtimeHours: daysOf(s, emp, from, to, ctx).reduce((h, d) => h + (d.record?.ot ?? 0), 0),
    dayMinutes: DAY_MINUTES,
  };
}

export const employeeAttendance: EmployeeAttendance = { tally };

// ---------- clocking in and out ----------

function employee(s: TerminalState, emp: string) {
  const e = recordOf(s, emp);

  if (!e || e.type !== 'Employee') throw new KeystoneError('Pick an employee from the directory.');

  return e;
}

const upsert = (days: TimeDay[], day: TimeDay) => [...days.filter((d) => !(d.emp === day.emp && d.date === day.date)), day];

const note = (r: DayResult) => (r.status === 'Grace' ? ', within this week\'s grace' : r.status === 'Late' ? `, ${duration(r.late)} late` : '');

export function timeIn(s: TerminalState, emp: string, ctx: Ctx): Change<TimeDay> {
  const e = employee(s, emp);
  const date = today(ctx);
  const data = dataOf(s);
  const existing = data.days.find((d) => d.emp === emp && d.date === date);

  if (existing && isTime(existing.in)) throw new KeystoneError(`${e.name} already timed in at ${clock12(existing.in)}.`);
  const day: TimeDay = { emp, date, in: timeOf(ctx.now()), out: '', ot: existing?.ot ?? 0, note: existing?.note ?? '' };
  const next = saved(s, { ...data, days: upsert(data.days, day) });
  const [result] = daysOf(next, emp, date, date, ctx);
  const line = `${e.name} timed in at ${clock12(day.in)}${note(result)}.`;

  return { state: logged(next, TAG, line, ctx), record: day, message: line };
}

export function timeOut(s: TerminalState, emp: string, ctx: Ctx): Change<TimeDay> {
  const e = employee(s, emp);
  const date = today(ctx);
  const data = dataOf(s);
  const existing = data.days.find((d) => d.emp === emp && d.date === date);

  if (!existing || !isTime(existing.in)) throw new KeystoneError(`${e.name} has not timed in today.`);

  if (isTime(existing.out)) throw new KeystoneError(`${e.name} already timed out at ${clock12(existing.out)}.`);
  const out = timeOf(ctx.now());

  if (minutesOf(out) <= minutesOf(existing.in)) throw new KeystoneError(`${e.name} timed in at ${clock12(existing.in)}; time out after that.`);
  const day = { ...existing, out };
  const line = `${e.name} timed out at ${clock12(out)}.`;

  return { state: logged(saved(s, { ...data, days: upsert(data.days, day) }), TAG, line, ctx), record: day, message: line };
}

// ---------- correcting a day ----------

export interface DayDraft { emp: string; date: ISODate; in: string; out: string; ot: string; note: string }

export function dayDraftOf(s: TerminalState, emp: string, date: ISODate): DayDraft {
  const d = dataOf(s).days.find((x) => x.emp === emp && x.date === date);

  return { emp, date, in: d?.in ?? '', out: d?.out ?? '', ot: d?.ot ? String(d.ot) : '', note: d?.note ?? '' };
}

/** Saves a day as HR corrects it: a forgotten time-in or time-out, approved overtime, a note. Empty clears the day. */
export function saveDay(s: TerminalState, d: DayDraft, ctx: Ctx): Change<TimeDay> {
  const e = employee(s, d.emp);

  if (!isISODate(d.date)) throw new KeystoneError('Enter the date to correct.');

  if (d.date > today(ctx)) throw new KeystoneError(`${shortDate(d.date)} has not come yet.`);
  const tin = d.in.trim();
  const tout = d.out.trim();
  const ot = d.ot.trim() === '' ? 0 : Number(d.ot);
  const remark = d.note.trim();

  if (tin && !isTime(tin)) throw new KeystoneError('Enter the time in as hours and minutes, like 08:00.');

  if (tout && !isTime(tout)) throw new KeystoneError('Enter the time out as hours and minutes, like 17:00.');

  if (tout && !tin) throw new KeystoneError('Enter the time in as well as the time out.');

  if (tin && tout && minutesOf(tout) <= minutesOf(tin)) throw new KeystoneError('The time out must be after the time in.');

  if (!Number.isFinite(ot) || ot < 0 || ot > 16) throw new KeystoneError('Enter overtime as hours, from 0 to 16.');

  const data = dataOf(s);
  const day: TimeDay = { emp: d.emp, date: d.date, in: tin, out: tout, ot, note: remark };
  const when = shortDate(d.date);

  if (!tin && !ot && !remark) {
    const days = data.days.filter((x) => !(x.emp === d.emp && x.date === d.date));

    if (days.length === data.days.length) throw new KeystoneError(`${e.name} has nothing recorded on ${when}.`);

    return { state: logged(saved(s, { ...data, days }), TAG, `${when} cleared for ${e.name}.`, ctx), record: day, message: `${when} cleared for ${e.name}.` };
  }

  const times = tin ? `in ${clock12(tin)}${tout ? `, out ${clock12(tout)}` : ''}` : 'no time in';
  const extra = ot ? `, ${ot} hr overtime` : '';

  return {
    state: logged(saved(s, { ...data, days: upsert(data.days, day) }), TAG, `${when} for ${e.name} corrected: ${times}${extra}.`, ctx),
    record: day, message: `${when} saved for ${e.name}.`,
  };
}

// ---------- holidays ----------

export interface HolidayDraft { date: ISODate; name: string; kind: HolidayKind }

export const newHoliday = (ctx: Ctx): HolidayDraft => ({ date: today(ctx), name: '', kind: 'Regular' });

export function saveHoliday(s: TerminalState, h: HolidayDraft, ctx: Ctx): Change<Holiday> {
  const name = h.name.trim();

  if (!isISODate(h.date)) throw new KeystoneError('Enter the holiday\'s date.');

  if (!name) throw new KeystoneError('Enter the holiday\'s name.');
  const data = dataOf(s);
  const holiday: Holiday = { date: h.date, name, kind: h.kind };
  const holidays = [...data.holidays.filter((x) => x.date !== h.date), holiday].sort((a, b) => a.date.localeCompare(b.date));
  const line = `${shortDate(h.date)} set as a ${h.kind.toLowerCase()} holiday: ${name}.`;

  return { state: logged(saved(s, { ...data, holidays }), TAG, line, ctx), record: holiday, message: line };
}

export function removeHoliday(s: TerminalState, date: ISODate, ctx: Ctx): Change<Holiday> {
  const data = dataOf(s);
  const h = data.holidays.find((x) => x.date === date);

  if (!h) throw new KeystoneError(`${shortDate(date)} is not a holiday.`);
  const line = `${shortDate(date)} is no longer a holiday.`;

  return { state: logged(saved(s, { ...data, holidays: data.holidays.filter((x) => x.date !== date) }), TAG, line, ctx), record: h, message: line };
}

// ---------- today, and what timekeeping tells Overview and Home ----------

export interface TodayRow { emp: string; name: string; position: string; day: DayResult }

/** Every employee in the directory with today's day. */
export function todayBoard(s: TerminalState, ctx: Ctx): TodayRow[] {
  const t = today(ctx);

  return recordsOf(s, 'Employee').map((e) => ({ emp: e.code, name: e.name, position: e.detail, day: daysOf(s, e.code, t, t, ctx)[0] }));
}

export const inToday = (rows: TodayRow[]) => rows.filter((r) => worked(r.day.record));

/** Past days timed in but never timed out, newest first: each needs a correction before payroll. */
export function missingTimeOuts(s: TerminalState, ctx: Ctx) {
  const t = today(ctx);

  return dataOf(s).days
    .filter((d) => isTime(d.in) && !isTime(d.out) && d.date < t)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function timekeepingStat(s: TerminalState, ctx: Ctx): [string, string] {
  const rows = todayBoard(s, ctx);

  return ['In today', `${inToday(rows).length} of ${rows.length}`];
}

export function timekeepingFigure(s: TerminalState, ctx: Ctx): Figure {
  const rows = todayBoard(s, ctx);
  const late = rows.filter((r) => r.day.status === 'Late').length;

  return { label: 'Employees in today', value: `${inToday(rows).length} of ${rows.length}`, caption: `${late} late` };
}

export function timekeepingFinding(s: TerminalState, ctx: Ctx): Finding | null {
  const open = missingTimeOuts(s, ctx);

  if (!open.length) return null;
  const first = open[0];
  const more = open.length > 1 ? ` ${count(open.length - 1, 'other day')} also ${open.length === 2 ? 'has' : 'have'} no time-out.` : '';

  return { priority: 8, text: `${nameOf(s, first.emp)} did not time out on ${shortDate(first.date)}.${more}` };
}
