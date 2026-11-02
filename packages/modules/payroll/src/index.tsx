import {
  Button, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SectionLabel, SelectInput, Sheet, StatusPill,
  TextInput, cn, useConfirm, type Column,
} from '@keystone/ui';
import { useRef, useState, type ReactNode } from 'react';
import {
  count, halfMonthsTo, peso, periodLabel, recordOf, recordsOf, SERVICES, toCentavos, today,
  type DirectoryRecord, type Period,
} from '@keystone/core';
import { printElement, savePdf, useKeystone, useModuleApp, type ModuleDef } from '@keystone/kit';
import { setupSummary } from './pay';
import { Payslip, PayrollSheet } from './PayrollPapers';
import {
  AMOUNT_LABEL, closeCutoff, cutoffOf, lastCutoff, payrollFigure, payrollFinding, payrollStat, removeSetup,
  reopenCutoff, saveSetup, setupDraftOf, setupFor, SHARES, TAG, totalOf, workedOut, type AmountField, type PayLine,
  type SetupDraft,
} from './rules';

function Amount({ field, d, set, placeholder = '0.00' }: { field: AmountField; d: SetupDraft; set: (d: SetupDraft) => void; placeholder?: string }) {
  return (
    <Field label={AMOUNT_LABEL[field]}>
      <TextInput figures align="right" placeholder={placeholder} value={d[field]} onChange={(v) => set({ ...d, [field]: v })} />
    </Field>
  );
}

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 border-0 border-t border-line p-0 pt-3">
      <legend className="float-left mb-0.5 w-full text-[12.5px] font-semibold text-ink-2">{legend}</legend>
      {children}
    </fieldset>
  );
}

function SetupForm({ draft, period, onDone }: { draft: SetupDraft; period: Period; onDone: () => void }) {
  const { state, run } = useKeystone();
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const name = recordOf(state, d.emp)?.name ?? d.emp;
  const grey = workedOut(d, period);

  const save = () => {
    const r = run((s, c) => saveSetup(s, d, c));

    if (r.ok) onDone(); else setError(r.error);
  };

  return (
    <form aria-label={`Pay setup for ${name}`} className="flex flex-col gap-3.5" onSubmit={(ev) => { ev.preventDefault(); save(); }}>
      <FieldRow>
        <Field label="Employee no."><TextInput autoFocus placeholder="APGCO-0013" value={d.empNo} onChange={(empNo) => setD({ ...d, empNo })} /></Field>
        <Amount field="daily" d={d} set={setD} />
        <Amount field="monthly" d={d} set={setD} placeholder={grey.monthly.toFixed(2)} />
      </FieldRow>
      <Group legend="Allowances (special allowance is per day worked)">
        <FieldRow min={130}>
          <Amount field="incentive" d={d} set={setD} />
          <Amount field="housing" d={d} set={setD} />
          <Amount field="special" d={d} set={setD} />
        </FieldRow>
      </Group>
      <Group legend="Deductions, each cut-off">
        <FieldRow min={100}>
          {SHARES.map((f) => <Amount key={f} field={f} d={d} set={setD} placeholder={grey.shares[f].toFixed(2)} />)}
          <Amount field="advance" d={d} set={setD} />
        </FieldRow>
        <p className="m-0 text-xs text-ink-2">Empty fields are worked out (shown in grey): monthly pay as the daily rate × 261 ÷ 12, shares from the 2026 tables on it. Type an amount, 0 included, to use this employee's own.</p>
      </Group>
      <Group legend="Paid by">
        <FieldRow>
          <Field label="Bank"><TextInput placeholder="Cash" value={d.bank} onChange={(bank) => setD({ ...d, bank })} /></Field>
          <Field label="Account no."><TextInput figures value={d.account} onChange={(account) => setD({ ...d, account })} /></Field>
        </FieldRow>
      </Group>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        {error && <p role="alert" className="m-0 mr-auto max-w-[36ch] text-xs text-bad">{error}</p>}
        <Button onClick={onDone}>Cancel</Button>
        <Button kind="primary" type="submit">Save pay setup</Button>
      </div>
    </form>
  );
}

function Payroll() {
  const { state, ctx, run, platform, notify } = useKeystone();
  const app = useModuleApp();
  const attendance = app.service(SERVICES.employeeAttendance);
  const confirm = useConfirm();
  const periods = halfMonthsTo(today(ctx), 6);
  const [from, setFrom] = useState(() => lastCutoff(ctx).from);
  const [editing, setEditing] = useState<SetupDraft | null>(null);
  const [slipFor, setSlipFor] = useState<string | null>(null);
  const paper = useRef<HTMLDivElement>(null);

  const period = periods.find((p) => p.from === from) ?? periods[0];
  const cut = cutoffOf(state, period, attendance, ctx);
  const label = periodLabel(period);
  const employees = recordsOf(state, 'Employee');
  const slip = cut.lines.find((l) => l.setup.emp === slipFor);

  const line = !cut.lines.length && !cut.closed
    ? 'No employee has a pay setup yet, so there is no payroll to run.'
    : `${label}: ${count(cut.lines.length, 'employee')}, ${peso(totalOf(cut, 'net'))} net${cut.closed ? ', closed' : ' so far'}.`;

  const setupColumns: Column<DirectoryRecord>[] = [
    { key: 'no', header: 'Employee no.', width: 124, cell: (e) => <span className="font-semibold text-gold-bright tabular-nums">{setupFor(state, e.code)?.empNo || '—'}</span> },
    { key: 'name', header: 'Employee', cell: (e) => <span title={e.detail}>{e.name} <span className="text-ink-3">· {e.detail}</span></span> },
    {
      key: 'daily', header: 'Daily rate', width: 116, align: 'right', cell: (e) => {
        const x = setupFor(state, e.code);

        return x ? peso(toCentavos(x.daily)) : <span className="text-ink-3">Not set up</span>;
      },
    },
    {
      key: 'allow', header: 'Allowances', width: 212, cell: (e) => {
        const x = setupFor(state, e.code);

        if (!x) return '—';
        const sum = setupSummary(x, period);

        return <span className="text-ink-2 tabular-nums">{peso(sum.fixedAllowances)} + {peso(sum.perDayAllowance)} a day</span>;
      },
    },
    {
      key: 'ded', header: 'Deductions', width: 116, align: 'right', cell: (e) => {
        const x = setupFor(state, e.code);

        if (!x) return '—';

        return <span title="SSS, PhilHealth, Pag-IBIG and salary advance, this cut-off">{peso(setupSummary(x, period).deductions)}</span>;
      },
    },
    { key: 'bank', header: 'Paid by', width: 96, cell: (e) => <span className="text-ink-2">{setupFor(state, e.code) ? setupFor(state, e.code)?.bank || 'Cash' : '—'}</span> },
  ];

  const money = (key: string, header: string, value: (l: PayLine) => number, strong = false): Column<PayLine> => ({
    key, header, width: 116, align: 'right', cell: (l) => <span className={cn(strong && 'font-semibold')}>{peso(value(l))}</span>,
  });

  const cutColumns: Column<PayLine>[] = [
    { key: 'name', header: 'Employee', cell: (l) => <span title={l.name}>{l.name}</span> },
    { key: 'days', header: 'Days', width: 64, align: 'right', cell: (l) => `${l.pay.paidDays}/${l.pay.scheduled}` },
    money('comp', 'Compensation', (l) => l.pay.compensation),
    money('allow', 'Allowances', (l) => l.pay.allowances),
    money('short', 'Late, half day', (l) => -l.pay.shortfall),
    money('ot', 'Overtime', (l) => l.pay.overtime),
    money('gross', 'Gross', (l) => l.pay.gross),
    money('ded', 'Deductions', (l) => -l.pay.deductions),
    money('net', 'Net pay', (l) => l.pay.net, true),
  ];

  const file = slip ? `Payslip ${slip.name} ${label}.pdf` : `Payroll ${label}.pdf`;

  return (
    <>
      <ScreenHeader eyebrow="People" title="Payroll" line={line} />

      <Panel className="mb-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <SectionLabel>Pay setup</SectionLabel>
          <span className="text-xs text-ink-2">Set by HR for each employee. Open one to change it.</span>
        </div>
        <Register
          label="Pay setup"
          columns={setupColumns}
          rows={employees}
          rowKey={(e) => e.code}
          onOpen={(e) => setEditing(setupDraftOf(state, e.code))}
          actions={(e) => [
            { label: 'Edit pay…', onSelect: () => setEditing(setupDraftOf(state, e.code)) },
            {
              label: 'Take off payroll…', danger: true, disabled: !setupFor(state, e.code),
              onSelect: () => confirm({ title: `Take ${e.name} off the payroll?`, body: 'Their pay setup is removed. Closed cut-offs keep what they were paid.', confirm: 'Take off payroll', danger: true, onConfirm: () => run((s, c) => removeSetup(s, e.code, c)) }),
            },
          ]}
          empty={<EmptyState text="No employees in the Directory yet." action={app.has('directory') ? <Button size="sm" kind="primary" onClick={() => app.go('directory')}>Open the Directory</Button> : undefined} />}
        />
      </Panel>

      <Panel className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SectionLabel>Cut-off</SectionLabel>
            <StatusPill status={cut.closed ? 'Closed' : 'Open'} tone={cut.closed ? 'good' : 'warn'} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-48"><SelectInput label="Cut-off" value={period.from} onChange={(f) => { setFrom(f); setSlipFor(null); }} options={periods.map((p) => ({ value: p.from, label: periodLabel(p) }))} /></div>
            {cut.closed
              ? <Button onClick={() => confirm({ title: `Reopen ${label}?`, body: 'Its pay follows Timekeeping and the pay setups again until it is closed.', confirm: 'Reopen cut-off', onConfirm: () => run((s, c) => reopenCutoff(s, period, c)) })}>Reopen cut-off</Button>
              : <Button kind="primary" onClick={() => run((s, c) => closeCutoff(s, period, attendance, c))}>Close cut-off</Button>}
          </div>
        </div>
        <p className="m-0 mb-2 text-xs text-ink-2">
          {cut.closed
            ? `Closed ${cut.closed}. Its figures are frozen: later corrections and rate changes do not reprice it.`
            : cut.assumed
              ? 'Timekeeping is not installed, so every weekday of the cut-off is paid in full.'
              : 'Open: days come from Timekeeping and follow its corrections until the cut-off is closed.'}
        </p>
        <Register
          label="Cut-off"
          caption={label}
          columns={cutColumns}
          rows={cut.lines}
          rowKey={(l) => l.setup.emp}
          onOpen={(l) => setSlipFor(l.setup.emp)}
          empty={<EmptyState text={cut.closed ? 'No one was paid in this cut-off.' : 'No one has a pay setup yet.'} action={!cut.closed && employees[0] ? <Button size="sm" onClick={() => setEditing(setupDraftOf(state, employees[0].code))}>Set up pay</Button> : undefined} />}
        />
        {cut.lines.length > 0 && (
          <p className="m-0 mt-3 border-t border-line pt-3 text-xs text-ink-2 tabular-nums">
            {`Gross ${peso(totalOf(cut, 'gross'))} · deductions ${peso(totalOf(cut, 'deductions'))} · net ${peso(totalOf(cut, 'net'))}. Open an employee for their payslip.`}
          </p>
        )}
      </Panel>

      <section aria-label="Payroll documents">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
            {[{ id: null, name: 'Payroll sheet' }, ...cut.lines.map((l) => ({ id: l.setup.emp, name: `Payslip: ${l.name}` }))].map((o) => (
              <button
                key={o.id ?? 'sheet'}
                type="button"
                aria-pressed={(slip?.setup.emp ?? null) === o.id}
                onClick={() => setSlipFor(o.id)}
                className={cn('flex h-[30px] items-center rounded-full border px-3 text-[12.5px] font-semibold', (slip?.setup.emp ?? null) === o.id ? 'border-gold text-gold-bright' : 'border-line text-ink-2 hover:border-line-bright hover:text-ink')}
              >
                {o.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => paper.current && printElement(paper.current)}>Print</Button>
            <Button onClick={() => paper.current && savePdf(paper.current, file, platform).then((n) => n && notify(`Saved ${n}.`), (e) => notify(String(e), 'error'))}>Export PDF</Button>
          </div>
        </div>
        <div className="overflow-hidden rounded-card border border-line">
          {slip
            ? <Payslip ref={paper} line={slip} cutoff={cut} company={ctx.seed.company} />
            : <PayrollSheet ref={paper} cutoff={cut} company={ctx.seed.company} />}
        </div>
      </section>

      <Sheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing ? `Pay setup: ${recordOf(state, editing.emp)?.name ?? editing.emp}` : 'Pay setup'}
        description={`${editing ? [recordOf(state, editing.emp)?.detail, recordOf(state, editing.emp)?.dept].filter(Boolean).join(' · ') + '. ' : ''}Each change is written to the Activity log.`}
      >
        {editing && <SetupForm key={editing.emp} draft={editing} period={period} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

export const payrollModule: ModuleDef = {
  id: 'payroll',
  title: 'Payroll',
  section: 'People',
  blurb: 'Each employee\'s own pay, the cut-off sheet and payslips, priced from Timekeeping.',
  order: 8,
  onHome: true,
  stat: payrollStat,
  figure: payrollFigure,
  finding: payrollFinding,
  logTags: { [TAG]: 'Payroll' },
  Screen: Payroll,
};
