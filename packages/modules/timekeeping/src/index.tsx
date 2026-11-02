import {
  Button, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SectionLabel, SelectInput, Sheet, StatusPill,
  TextInput, useConfirm, type Column, type Tone,
} from '@keystone/ui';
import { useState } from 'react';
import {
  count, halfMonthOf, halfMonthsTo, periodLabel, recordsOf, SERVICES, shortDate, today, weekdayLong, weekdayOf,
} from '@keystone/core';
import { useKeystone, useModuleApp, type ModuleDef } from '@keystone/kit';
import {
  clock12, dataOf, dayDraftOf, daysOf, duration, employeeAttendance, HOLIDAY_KINDS, inToday, missingTimeOuts, newHoliday,
  removeHoliday, saveDay, saveHoliday, TAG, tally, timeIn, timekeepingFigure, timekeepingFinding, timekeepingStat,
  timeOut, todayBoard, type DayDraft, type DayResult, type DayStatus, type Holiday, type HolidayDraft, type TodayRow,
} from './rules';

const TONE: Record<DayStatus, Tone> = {
  'On time': 'good', Grace: 'good', Late: 'warn', 'Half day': 'warn', Absent: 'bad',
  Holiday: 'neutral', 'Rest day': 'neutral', 'Not in yet': 'neutral', Upcoming: 'neutral',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Status({ day }: { day: DayResult }) {
  const label = day.status === 'Late' ? `Late ${duration(day.late)}` : day.status === 'Grace' ? 'On time (grace)' : day.status;

  return <StatusPill status={label} tone={TONE[day.status]} />;
}

/** What else is worth knowing about a day: its holiday, undertime, a missing time-out, the note. */
function remarks(d: DayResult): string {
  return [
    d.holiday ? `${d.holiday.name} (${d.holiday.kind.toLowerCase()} holiday)` : '',
    d.undertime ? `${duration(d.undertime)} undertime` : '',
    d.open ? 'No time-out' : '',
    d.record?.note ?? '',
  ].filter(Boolean).join(' · ');
}

function DayForm({ draft, name, onDone }: { draft: DayDraft; name: string; onDone: () => void }) {
  const { run } = useKeystone();
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const r = run((s, c) => saveDay(s, d, c));

    if (r.ok) onDone(); else setError(r.error);
  };

  return (
    <form aria-label={`Correct ${shortDate(d.date)}`} className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <p className="m-0 text-[13px] text-ink-2">{name} · {shortDate(d.date)}</p>
      <FieldRow min={120}>
        <Field label="Time in" hint="24-hour, like 08:00"><TextInput autoFocus figures placeholder="08:00" value={d.in} onChange={(v) => setD({ ...d, in: v })} /></Field>
        <Field label="Time out" hint="24-hour, like 17:00"><TextInput figures placeholder="17:00" value={d.out} onChange={(v) => setD({ ...d, out: v })} /></Field>
      </FieldRow>
      <Field label="Approved overtime (hours)" hint="Only what was approved; staying late alone is not overtime.">
        <TextInput figures placeholder="0" value={d.ot} onChange={(v) => setD({ ...d, ot: v })} />
      </Field>
      <Field label="Note"><TextInput placeholder="Why it was corrected" value={d.note} onChange={(v) => setD({ ...d, note: v })} /></Field>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        {error && <p role="alert" className="m-0 mr-auto max-w-[36ch] text-xs text-bad">{error}</p>}
        <Button onClick={onDone}>Cancel</Button>
        <Button kind="primary" type="submit">Save day</Button>
      </div>
    </form>
  );
}

function HolidayForm() {
  const { ctx, run } = useKeystone();
  const [h, setH] = useState<HolidayDraft>(() => newHoliday(ctx));
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const r = run((s, c) => saveHoliday(s, h, c));
    setError(r.ok ? null : r.error);

    if (r.ok) setH(newHoliday(ctx));
  };

  return (
    <form aria-label="Add a holiday" className="mt-3 flex flex-col gap-2.5 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <FieldRow min={140}>
        <Field label="Date"><TextInput type="date" value={h.date} onChange={(date) => setH({ ...h, date })} /></Field>
        <Field label="Holiday"><TextInput placeholder="Bonifacio Day" value={h.name} onChange={(name) => setH({ ...h, name })} /></Field>
        <Field label="Kind">
          <SelectInput value={h.kind} onChange={(k) => setH({ ...h, kind: k === 'Special' ? 'Special' : 'Regular' })} options={HOLIDAY_KINDS.map((k) => ({ value: k, label: k === 'Regular' ? 'Regular holiday' : 'Special non-working day' }))} />
        </Field>
      </FieldRow>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {error && <p role="alert" className="m-0 mr-auto text-xs text-bad">{error}</p>}
        <span className="mr-auto text-xs text-ink-2">{error ? '' : 'A regular holiday is paid when not worked; working a special day adds 30%, a regular one 100%.'}</span>
        <Button kind="primary" type="submit">Add holiday</Button>
      </div>
    </form>
  );
}

function Timekeeping() {
  const { state, ctx, run } = useKeystone();
  const app = useModuleApp();
  const confirm = useConfirm();
  const employees = recordsOf(state, 'Employee');
  const t = today(ctx);
  const periods = halfMonthsTo(t, 6);
  const [emp, setEmp] = useState(() => employees[0]?.code ?? '');
  const [periodFrom, setPeriodFrom] = useState(() => halfMonthOf(t).from);
  const [correcting, setCorrecting] = useState<DayDraft | null>(null);

  const board = todayBoard(state, ctx);
  const inNow = inToday(board);
  const notIn = board.filter((r) => r.day.status === 'Not in yet');
  const open = missingTimeOuts(state, ctx);
  const period = periods.find((p) => p.from === periodFrom) ?? periods[0];
  const shown = employees.find((e) => e.code === emp) ?? employees[0];
  const days = shown ? daysOf(state, shown.code, period.from, period.to, ctx) : [];
  const counted = shown ? tally(state, shown.code, period.from, period.to, ctx) : null;
  const holidays = dataOf(state).holidays;

  const toDirectory = app.has('directory') ? <Button size="sm" kind="primary" onClick={() => app.go('directory')}>Open the Directory</Button> : undefined;

  const line = !employees.length
    ? 'No employees in the Directory yet, so there is no time to keep.'
    : open.length
      ? timekeepingFinding(state, ctx)?.text
      : `${inNow.length} of ${count(board.length, 'employee')} timed in today.${notIn.length ? ` Not in yet: ${notIn.map((r) => r.name).join(', ')}.` : ''}`;

  const boardColumns: Column<TodayRow>[] = [
    { key: 'name', header: 'Employee', cell: (r) => <span title={r.position}>{r.name} <span className="text-ink-3">· {r.position}</span></span> },
    { key: 'in', header: 'Time in', width: 96, cell: (r) => <span className="tabular-nums">{clock12(r.day.record?.in ?? '')}</span> },
    { key: 'out', header: 'Time out', width: 96, cell: (r) => <span className="tabular-nums">{clock12(r.day.record?.out ?? '')}</span> },
    { key: 'status', header: 'Status', width: 180, cell: (r) => <Status day={r.day} /> },
    {
      key: 'clock', header: 'Clock', width: 116, align: 'right', cell: (r) => {
        const rec = r.day.record;

        if (!rec?.in) return <Button size="sm" kind="secondary" aria-label={`Time in ${r.name}`} onClick={() => run((s, c) => timeIn(s, r.emp, c))}>Time in</Button>;

        if (!rec.out) return <Button size="sm" kind="quiet" aria-label={`Time out ${r.name}`} onClick={() => run((s, c) => timeOut(s, r.emp, c))}>Time out</Button>;

        return <span className="text-xs text-ink-3">Done</span>;
      },
    },
  ];

  const dayColumns: Column<DayResult>[] = [
    { key: 'date', header: 'Date', width: 132, cell: (d) => <span className="tabular-nums">{WEEKDAYS[weekdayOf(d.date)]} · {shortDate(d.date).replace(/, \d{4}$/, '')}</span> },
    { key: 'in', header: 'In', width: 84, cell: (d) => <span className="tabular-nums">{clock12(d.record?.in ?? '')}</span> },
    { key: 'out', header: 'Out', width: 84, cell: (d) => <span className="tabular-nums">{clock12(d.record?.out ?? '')}</span> },
    { key: 'status', header: 'Status', width: 172, cell: (d) => <Status day={d} /> },
    { key: 'ot', header: 'OT', width: 56, align: 'right', cell: (d) => (d.record?.ot ? `${d.record.ot} hr` : '—') },
    { key: 'remarks', header: 'Remarks', cell: (d) => <span className="text-ink-2" title={remarks(d)}>{remarks(d) || '—'}</span> },
  ];

  const holidayColumns: Column<Holiday>[] = [
    { key: 'date', header: 'Date', width: 120, cell: (h) => <span className="tabular-nums">{shortDate(h.date)}</span> },
    { key: 'name', header: 'Holiday', cell: (h) => h.name },
    { key: 'kind', header: 'Kind', width: 180, cell: (h) => <span className="text-ink-2">{h.kind === 'Regular' ? 'Regular holiday' : 'Special non-working day'}</span> },
  ];

  return (
    <>
      <ScreenHeader eyebrow="People" title="Timekeeping" line={line} />

      <Panel className="mb-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <SectionLabel>Today</SectionLabel>
          <span className="text-xs text-ink-2">{weekdayLong(ctx.now())} · 8:00 AM to 5:00 PM · one 15-minute grace a week</span>
        </div>
        <Register
          label="Today"
          columns={boardColumns}
          rows={board}
          rowKey={(r) => r.emp}
          empty={<EmptyState text="No employees in the Directory yet." action={toDirectory} />}
        />
      </Panel>

      <Panel className="mb-4">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <SectionLabel>Daily time record</SectionLabel>
          <div className="flex flex-wrap gap-2.5">
            <div className="w-64"><SelectInput label="Employee" value={shown?.code ?? ''} onChange={setEmp} options={employees.map((e) => ({ value: e.code, label: e.name }))} /></div>
            <div className="w-48"><SelectInput label="Cut-off" value={period.from} onChange={setPeriodFrom} options={periods.map((p) => ({ value: p.from, label: periodLabel(p) }))} /></div>
          </div>
        </div>
        {shown && counted ? (
          <>
            <Register
              label="Daily time record"
              caption={`${shown.name}, ${periodLabel(period)}`}
              columns={dayColumns}
              rows={days}
              rowKey={(d) => d.date}
              onOpen={(d) => d.date <= t && setCorrecting(dayDraftOf(state, shown.code, d.date))}
              empty={<EmptyState text="No days in this cut-off." />}
            />
            <p className="m-0 mt-3 border-t border-line pt-3 text-xs text-ink-2">
              {`${counted.worked} of ${count(counted.scheduled, 'working day')} worked so far · ${count(counted.absent, 'absence')} · ${count(counted.halfDays, 'half day')} · ${duration(counted.shortMinutes)} late or undertime · ${counted.overtimeHours} hr approved overtime. Open a past day to correct it.`}
            </p>
          </>
        ) : <EmptyState text="No employees in the Directory yet." action={toDirectory} />}
      </Panel>

      <Panel>
        <SectionLabel className="mb-2">Holidays</SectionLabel>
        <Register
          label="Holidays"
          columns={holidayColumns}
          rows={holidays}
          rowKey={(h) => h.date}
          actions={(h) => [{
            label: 'Remove…', danger: true,
            onSelect: () => confirm({ title: `Remove ${h.name}?`, body: `${shortDate(h.date)} becomes an ordinary day for timekeeping and payroll.`, confirm: 'Remove holiday', danger: true, onConfirm: () => run((s, c) => removeHoliday(s, h.date, c)) }),
          }]}
          empty={<EmptyState text="No holidays set. Add the ones the office observes." />}
        />
        <HolidayForm />
      </Panel>

      <Sheet open={correcting !== null} onOpenChange={(o) => !o && setCorrecting(null)} title="Correct a day" description="A forgotten time-in or time-out, approved overtime, or a note. Clear every field to remove the day.">
        {correcting && <DayForm key={`${correcting.emp}-${correcting.date}`} draft={correcting} name={employees.find((e) => e.code === correcting.emp)?.name ?? correcting.emp} onDone={() => setCorrecting(null)} />}
      </Sheet>
    </>
  );
}

export const timekeepingModule: ModuleDef = {
  id: 'timekeeping',
  title: 'Timekeeping',
  section: 'People',
  blurb: 'Employees time in and out here; late, half days, holidays and the weekly grace are counted for payroll.',
  order: 7,
  onHome: true,
  stat: timekeepingStat,
  figure: timekeepingFigure,
  finding: timekeepingFinding,
  logTags: { [TAG]: 'Timekeeping' },
  provides: { [SERVICES.employeeAttendance]: employeeAttendance },
  Screen: Timekeeping,
};
