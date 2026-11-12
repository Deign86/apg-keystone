import { describe, expect, it } from 'vitest';
import { withModuleData, type Ctx, type TerminalState } from '@keystone/core';
import {
  clock12, dataOf, daysOf, duration, employeeAttendance, missingTimeOuts, removeHoliday, saveDay, saveHoliday, tally, timeIn,
  timekeepingFigure, timekeepingFinding, timekeepingStat, timeOut, todayBoard, type TimeDay,
} from '../src/rules';
import { sampleState } from '@keystone/core/sample';

/** A moment in Manila (vitest pins TZ): month is 1-based here. */
const at = (y: number, m: number, d: number, h = 9, min = 0): Ctx => ({ now: () => new Date(y, m - 1, d, h, min) });
const state = () => sampleState();

/** The sample data with these days recorded. */
function withDays(days: Partial<TimeDay>[], s: TerminalState = state()) {
  return withModuleData(s, 'timekeeping', {
    days: days.map((d) => ({ emp: 'E-001', date: '', in: '', out: '', ot: 0, note: '', ...d })),
    holidays: [],
  });
}

describe('clocking in and out', () => {
  it('times an employee in and out at the current minute', () => {
    const r = timeIn(state(), 'E-002', at(2026, 11, 2, 7, 52));
    expect(r.message).toBe('Angelica S. Bautista timed in at 7:52 AM.');
    expect(r.state.log[0]).toEqual({ when: '2026-11-02 07:52', mod: 'DTR', text: 'Angelica S. Bautista timed in at 7:52 AM.' });

    const out = timeOut(r.state, 'E-002', at(2026, 11, 2, 17, 3));
    expect(out.message).toBe('Angelica S. Bautista timed out at 5:03 PM.');
    expect(dataOf(out.state).days).toEqual([{ emp: 'E-002', date: '2026-11-02', in: '07:52', out: '17:03', ot: 0, note: '' }]);
  });

  it('says when the weekly grace covers a late arrival, and when it does not', () => {
    const first = timeIn(state(), 'E-001', at(2026, 11, 2, 8, 12));
    expect(first.message).toBe('Juan Miguel P. Reyes timed in at 8:12 AM, within this week\'s grace.');
    const late = timeIn(first.state, 'E-001', at(2026, 11, 3, 8, 5));
    expect(late.message).toBe('Juan Miguel P. Reyes timed in at 8:05 AM, 5 min late.');
  });

  it('refuses a second time-in, a time-out before a time-in, and anyone not an employee', () => {
    const s = timeIn(state(), 'E-001', at(2026, 11, 2, 8)).state;
    expect(() => timeIn(s, 'E-001', at(2026, 11, 2, 8, 30))).toThrow('Juan Miguel P. Reyes already timed in at 8:00 AM.');
    expect(() => timeOut(state(), 'E-001', at(2026, 11, 2, 17))).toThrow('Juan Miguel P. Reyes has not timed in today.');
    expect(() => timeIn(state(), 'V-001', at(2026, 11, 2))).toThrow('Pick an employee from the directory.');
  });
});

describe('the weekly grace', () => {
  it('excuses the first arrival up to 15 minutes late each week, and counts the rest from 8:00', () => {
    const s = withDays([
      { date: '2026-11-02', in: '08:20', out: '17:00' }, // 20 minutes: more than the grace, so late, and the grace is kept
      { date: '2026-11-03', in: '08:15', out: '17:00' }, // the grace
      { date: '2026-11-04', in: '08:01', out: '17:00' }, // grace already used this week
      { date: '2026-11-05', in: '07:59', out: '17:00' },
      { date: '2026-11-09', in: '08:09', out: '17:00' }, // a new week, a new grace
    ]);

    const days = daysOf(s, 'E-001', '2026-11-02', '2026-11-09', at(2026, 11, 10));

    expect(days.map((d) => [d.date, d.status, d.late])).toEqual([
      ['2026-11-02', 'Late', 20], ['2026-11-03', 'Grace', 0], ['2026-11-04', 'Late', 1], ['2026-11-05', 'On time', 0],
      ['2026-11-06', 'Absent', 0], ['2026-11-07', 'Rest day', 0], ['2026-11-08', 'Rest day', 0], ['2026-11-09', 'Grace', 0],
    ]);
  });

  it('counts the week from Monday, so a grace used before a cut-off starts is spent', () => {
    const s = withDays([{ date: '2026-09-29', in: '08:10', out: '17:00' }, { date: '2026-10-01', in: '08:10', out: '17:00' }]);
    const [oct1] = daysOf(s, 'E-001', '2026-10-01', '2026-10-01', at(2026, 10, 2));
    expect([oct1.status, oct1.late]).toEqual(['Late', 10]);
  });
});

describe('what a day counts as', () => {
  const day = (d: Partial<TimeDay>) => daysOf(withDays([{ date: '2026-11-02', ...d }]), 'E-001', '2026-11-02', '2026-11-02', at(2026, 11, 3))[0];

  it('a morning or an afternoon only is a half day, never late', () => {
    expect(day({ in: '12:30', out: '17:00' })).toMatchObject({ status: 'Half day', late: 0, undertime: 0 });
    expect(day({ in: '08:40', out: '12:05' })).toMatchObject({ status: 'Half day', late: 0, undertime: 0 });
  });

  it('leaving before 5:00 PM is undertime; a day with no time-out is flagged', () => {
    expect(day({ in: '07:55', out: '16:30' })).toMatchObject({ status: 'On time', undertime: 30 });
    expect(day({ in: '07:55' })).toMatchObject({ open: true, undertime: 0 });
    expect(missingTimeOuts(withDays([{ date: '2026-11-02', in: '07:55' }]), at(2026, 11, 3)).map((d) => d.date)).toEqual(['2026-11-02']);
  });
});

describe('the tally payroll prices', () => {
  it('counts the HR sheet\'s Oct 1–15, 2026 cut-off: 11 standard days, 9 worked, one of them a special holiday', () => {
    const worked = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12', '2026-10-13'];
    let s = withDays(worked.map((date) => ({ date, in: '07:58', out: '17:02' })));
    s = saveHoliday(s, { date: '2026-10-09', name: 'Company foundation day', kind: 'Special' }, at(2026, 10, 1)).state;

    expect(tally(s, 'E-001', '2026-10-01', '2026-10-15', at(2026, 10, 16))).toEqual({
      scheduled: 11, worked: 9, halfDays: 0, absent: 2, regularHolidaysOff: 0, specialHolidaysWorked: 1,
      regularHolidaysWorked: 0, shortMinutes: 0, overtimeHours: 0, dayMinutes: 480,
    });
  });

  it('pays a regular holiday not worked instead of marking it absent, and adds up late, undertime and overtime', () => {
    let s = withDays([
      { date: '2026-11-02', in: '08:30', out: '16:45', ot: 0 },
      { date: '2026-11-03', in: '08:00', out: '20:00', ot: 2 },
      { date: '2026-11-07', in: '09:00', out: '13:00', ot: 4 }, // a Saturday: overtime only
    ]);

    s = saveHoliday(s, { date: '2026-11-04', name: 'Example holiday', kind: 'Regular' }, at(2026, 11, 1)).state;
    const t = tally(s, 'E-001', '2026-11-02', '2026-11-08', at(2026, 11, 9));

    expect(t).toMatchObject({ scheduled: 5, worked: 2, absent: 2, regularHolidaysOff: 1, shortMinutes: 30 + 15, overtimeHours: 6 });
  });

  it('does not count days that have not come yet as absences', () => {
    expect(tally(state(), 'E-001', '2026-11-01', '2026-11-15', at(2026, 11, 3, 9))).toMatchObject({ scheduled: 10, worked: 0, absent: 1 });
  });
});

describe('corrections and holidays', () => {
  const ctx = at(2026, 11, 2, 10);

  it('saves a forgotten time-out with approved overtime, and clears a day', () => {
    const s = withDays([{ date: '2026-10-30', in: '08:00' }]);
    const r = saveDay(s, { emp: 'E-001', date: '2026-10-30', in: '08:00', out: '19:00', ot: '2', note: 'Month-end close' }, ctx);
    expect(r.message).toBe('Oct 30, 2026 saved for Juan Miguel P. Reyes.');
    expect(r.state.log[0].text).toBe('Oct 30, 2026 for Juan Miguel P. Reyes corrected: in 8:00 AM, out 7:00 PM, 2 hr overtime.');
    expect(missingTimeOuts(r.state, ctx)).toEqual([]);

    const cleared = saveDay(r.state, { emp: 'E-001', date: '2026-10-30', in: '', out: '', ot: '', note: '' }, ctx);
    expect(dataOf(cleared.state).days).toEqual([]);
  });

  it('refuses times that cannot be right', () => {
    const d = { emp: 'E-001', date: '2026-10-30', in: '08:00', out: '', ot: '', note: '' };
    expect(() => saveDay(state(), { ...d, date: '2026-11-03' }, ctx)).toThrow('Nov 3, 2026 has not come yet.');
    expect(() => saveDay(state(), { ...d, in: '8am' }, ctx)).toThrow('Enter the time in as hours and minutes, like 08:00.');
    expect(() => saveDay(state(), { ...d, out: '07:00' }, ctx)).toThrow('The time out must be after the time in.');
    expect(() => saveDay(state(), { ...d, in: '', out: '17:00' }, ctx)).toThrow('Enter the time in as well as the time out.');
    expect(() => saveDay(state(), { ...d, ot: '-1' }, ctx)).toThrow('Enter overtime as hours, from 0 to 16.');
  });

  it('adds and removes holidays', () => {
    const r = saveHoliday(state(), { date: '2026-11-30', name: 'Bonifacio Day', kind: 'Regular' }, ctx);
    expect(r.message).toBe('Nov 30, 2026 set as a regular holiday: Bonifacio Day.');
    expect(dataOf(removeHoliday(r.state, '2026-11-30', ctx).state).holidays).toEqual([]);
    expect(() => saveHoliday(state(), { date: '2026-11-30', name: ' ', kind: 'Regular' }, ctx)).toThrow('Enter the holiday\'s name.');
  });

  it('reads only what it can trust from the saved data', () => {
    const s = withModuleData(state(), 'timekeeping', { days: [{ emp: 'E-001', date: 'yesterday' }, 'junk', { emp: 'E-002', date: '2026-11-02', in: '08:00', ot: -3 }], holidays: 'none' });
    expect(dataOf(s)).toEqual({ days: [{ emp: 'E-002', date: '2026-11-02', in: '08:00', out: '', ot: 0, note: '' }], holidays: [] });
  });
});

describe('what timekeeping contributes', () => {
  it('says who is in today and flags a missing time-out', () => {
    const ctx = at(2026, 11, 2, 10);
    let s = timeIn(state(), 'E-001', at(2026, 11, 2, 8, 40)).state;
    s = timeIn(s, 'E-002', at(2026, 11, 2, 7, 55)).state;

    expect(todayBoard(s, ctx).map((r) => r.day.status)).toEqual(['Late', 'On time', 'Not in yet', 'Not in yet']);
    expect(timekeepingStat(s, ctx)).toEqual(['In today', '2 of 4']);
    expect(timekeepingFigure(s, ctx)).toEqual({ label: 'Employees in today', value: '2 of 4', caption: '1 late' });
    expect(timekeepingFinding(s, ctx)).toBeNull();
    expect(timekeepingFinding(s, at(2026, 11, 3))).toEqual({ priority: 8, text: 'Juan Miguel P. Reyes did not time out on Nov 2, 2026. 1 other day also has no time-out.' });
  });

  it('writes times the way people read them', () => {
    expect([clock12('00:05'), clock12('12:00'), clock12('17:30'), clock12('')]).toEqual(['12:05 AM', '12:00 PM', '5:30 PM', '—']);
    expect([duration(5), duration(60), duration(75), duration(0)]).toEqual(['5 min', '1 hr', '1 hr 15 min', '0 min']);
  });
});

// ---------- edges and regressions: where day-counting rules break ----------

/** One employee's days, keyed by date, with the given holidays. */
function scenario(days: Record<string, [string, string, number?]>, holidays: { date: string; name: string; kind: 'Regular' | 'Special' }[] = []) {
  return withModuleData(state(), 'timekeeping', {
    days: Object.entries(days).map(([date, [tin, tout, ot]]) => ({ emp: 'E-001', date, in: tin, out: tout, ot: ot ?? 0, note: '' })),
    holidays,
  });
}

const statusOf = (s: TerminalState, date: string, now = at(2027, 2, 1)) => {
  const [d] = daysOf(s, 'E-001', date, date, now);

  return [d.status, d.late, d.undertime];
};

describe('the weekly grace, at its edges', () => {
  it('covers 15 minutes late but not 16', () => {
    expect(statusOf(scenario({ '2026-11-02': ['08:15', '17:00'] }), '2026-11-02')).toEqual(['Grace', 0, 0]);
    expect(statusOf(scenario({ '2026-11-02': ['08:16', '17:00'] }), '2026-11-02')).toEqual(['Late', 16, 0]);
    expect(statusOf(scenario({ '2026-11-02': ['08:00', '17:00'] }), '2026-11-02')).toEqual(['On time', 0, 0]);
  });

  it('is not spent by an arrival too late for it, by a half day, or by a rest day', () => {
    const s = scenario({
      '2026-11-02': ['09:30', '17:00'], // 90 minutes: late, grace kept
      '2026-11-03': ['12:10', '17:00'], // a half day: never late, grace kept
      '2026-11-07': ['08:10', '12:00'], // Saturday: not a working day, grace kept
      '2026-11-04': ['08:07', '17:00'], // the grace
      '2026-11-05': ['08:07', '17:00'], // late
    });

    expect(daysOf(s, 'E-001', '2026-11-02', '2026-11-07', at(2026, 11, 9)).map((d) => [d.date, d.status, d.late])).toEqual([
      ['2026-11-02', 'Late', 90], ['2026-11-03', 'Half day', 0], ['2026-11-04', 'Grace', 0], ['2026-11-05', 'Late', 7],
      ['2026-11-06', 'Absent', 0], ['2026-11-07', 'Rest day', 0],
    ]);
  });

  it('applies on a holiday worked like any other day', () => {
    const s = scenario({ '2026-11-30': ['08:05', '17:00'], '2026-12-01': ['08:05', '17:00'] }, [{ date: '2026-11-30', name: 'Bonifacio Day', kind: 'Regular' }]);

    expect(daysOf(s, 'E-001', '2026-11-30', '2026-12-01', at(2026, 12, 2)).map((d) => d.status)).toEqual(['Grace', 'Late']);
  });

  it('runs Monday to Sunday across a month end and a year end', () => {
    // Mon Dec 28, 2026 to Sun Jan 3, 2027 is one week; Mon Jan 4 starts the next.
    const s = scenario({ '2026-12-29': ['08:05', '17:00'], '2027-01-01': ['08:05', '17:00'], '2027-01-04': ['08:05', '17:00'] });

    expect(daysOf(s, 'E-001', '2026-12-28', '2027-01-04', at(2027, 1, 5)).filter((d) => d.record).map((d) => [d.date, d.status]))
      .toEqual([['2026-12-29', 'Grace'], ['2027-01-01', 'Late'], ['2027-01-04', 'Grace']]);
  });

  it('gives the same answer for a day whether its week is read from Monday or from the cut-off', () => {
    const s = scenario({ '2026-10-13': ['08:05', '17:00'], '2026-10-16': ['08:05', '17:00'] });

    expect(statusOf(s, '2026-10-16')).toEqual(['Late', 5, 0]);
    expect(daysOf(s, 'E-001', '2026-10-12', '2026-10-31', at(2026, 11, 2)).find((d) => d.date === '2026-10-16')?.status).toBe('Late');
  });
});

describe('half days and undertime, at their edges', () => {
  it('counts an arrival from 12:00 as a half day, and 11:59 as very late', () => {
    expect(statusOf(scenario({ '2026-11-02': ['11:59', '17:00'] }), '2026-11-02')).toEqual(['Late', 239, 0]);
    expect(statusOf(scenario({ '2026-11-02': ['12:00', '17:00'] }), '2026-11-02')).toEqual(['Half day', 0, 0]);
  });

  it('counts leaving by 1:00 PM as a half day, and 1:01 PM as undertime', () => {
    expect(statusOf(scenario({ '2026-11-02': ['08:00', '13:00'] }), '2026-11-02')).toEqual(['Half day', 0, 0]);
    expect(statusOf(scenario({ '2026-11-02': ['08:00', '13:01'] }), '2026-11-02')).toEqual(['On time', 0, 239]);
    expect(statusOf(scenario({ '2026-11-02': ['08:00', '16:59'] }), '2026-11-02')).toEqual(['On time', 0, 1]);
    expect(statusOf(scenario({ '2026-11-02': ['08:00', '23:00'] }), '2026-11-02')).toEqual(['On time', 0, 0]);
  });

  it('adds late and undertime on the same day', () => {
    expect(statusOf(scenario({ '2026-11-02': ['08:40', '16:00'] }), '2026-11-02')).toEqual(['Late', 40, 60]);
  });
});

describe('the regression cut-off', () => {
  // Juan, Oct 16–31, 2026: every kind of day once. Payroll's engine prices exactly this tally in test/pay.test.ts
  // (packages/modules/payroll), and the app and end-to-end suites walk the same days.
  const s = scenario({
    '2026-10-16': ['07:58', '17:00'], // on time
    '2026-10-19': ['08:12', '17:00'], // the week's grace
    '2026-10-20': ['08:05', '17:00'], // late 5
    '2026-10-21': ['08:00', '19:00', 2], // two hours approved overtime
    '2026-10-22': ['12:30', '17:00'], // half day
    // Oct 23: absent
    '2026-10-26': ['07:50', '16:30'], // undertime 30
    '2026-10-27': ['08:20', '17:00'], // late 20, too late for the grace
    '2026-10-28': ['08:10', '17:00'], // the week's grace
    '2026-10-29': ['08:00', '17:00'], // a special holiday, worked
    // Oct 30: a regular holiday, not worked
  }, [{ date: '2026-10-29', name: 'Special day', kind: 'Special' }, { date: '2026-10-30', name: 'Regular day', kind: 'Regular' }]);

  it('counts every kind of day', () => {
    expect(tally(s, 'E-001', '2026-10-16', '2026-10-31', at(2026, 11, 2))).toEqual({
      scheduled: 11, worked: 9, halfDays: 1, absent: 1, regularHolidaysOff: 1, specialHolidaysWorked: 1,
      regularHolidaysWorked: 0, shortMinutes: 55, overtimeHours: 2, dayMinutes: 480,
    });
  });

  it('gives the same tally through the service it publishes', () => {
    expect(employeeAttendance.tally(s, 'E-001', '2026-10-16', '2026-10-31', at(2026, 11, 2))).toEqual(tally(s, 'E-001', '2026-10-16', '2026-10-31', at(2026, 11, 2)));
  });

  it('counts only the days asked for, and nobody else\'s', () => {
    expect(tally(s, 'E-002', '2026-10-16', '2026-10-31', at(2026, 11, 2))).toMatchObject({ worked: 0, absent: 9, regularHolidaysOff: 1 }); // neither holiday is an absence
    expect(tally(s, 'E-001', '2026-10-16', '2026-10-16', at(2026, 11, 2))).toMatchObject({ scheduled: 1, worked: 1, shortMinutes: 0 });
  });
});
