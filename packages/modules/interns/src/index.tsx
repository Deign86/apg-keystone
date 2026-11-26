import {
  Button, Checkbox, cn, EmptyState, Field, FieldMarks, FieldRow, PAGE_SIZE, Panel, Register, ScreenHeader, SectionLabel, SelectInput, Sheet, StatusPill, Tabs, TextArea,
  TextInput, useConfirm, type Column, type Refusal, type RowAction,
} from '@keystone/ui';
import { useId, useMemo, useState } from 'react';
import { count, DASH, isISODate, sentenceOf } from '@keystone/core';
import { useDraft, useKeystone, type ModuleDef } from '@keystone/kit';
import {
  addToRoster, batchesOf, batchLabel, dateText, datesToCheck, hoursText, ID, internDraftOf, internsFigure, internsFinding, internsLine, internsOf, isActive, NOT_NEEDED,
  newIntern, owed, owing, receiveRequirement, removeFromRoster, removeIntern, REQUIREMENTS, requirementText, rosterOf, rosterSuggestions, saveIntern, STATUS_TONE,
  STATUSES, TAG, unreadDate, type Intern, type InternDraft, type RequirementKey, type Weekday,
} from './rules';
import { importInterns, importPlan, importSummary } from './import';
import { readWorkbook } from './xlsx';

const DRAFT = `${ID}.draft`;

const VIEW = `${ID}.view`;

type View = 'register' | 'papers' | 'cleaning';

type Show = 'All' | (typeof STATUSES)[number] | 'Dates to check';

/** "Jun 3, 2025 – Jul 17, 2025", "From Oct 26, 2026" while the end is not known, or a dash. */
function datesOf(i: Intern): string {
  if (i.start && i.end) return `${dateText(i.start)} – ${dateText(i.end)}`;

  if (i.start) return `From ${dateText(i.start)}`;

  return i.end ? `Until ${dateText(i.end)}` : DASH;
}

/** How many of the four requirements are in: "4 of 4", or a dash for the first batches, whose sheets never asked. */
const papersOf = (i: Intern) => {
  const inn = REQUIREMENTS.length - owed(i).length;

  return inn === 0 && !isActive(i) && !owing(i) ? DASH : `${inn} of ${REQUIREMENTS.length}`;
};

/** A date field in the form: a date, with what the spreadsheet wrote under it when that was not a date. */
function DateField({ name, label, value, onChange, hint }: { name: string; label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const written = unreadDate(value) ? `The spreadsheet says “${value}”; enter the date to replace it.` : undefined;

  return (
    <Field name={name} label={label} hint={written ?? hint}>
      <TextInput type="date" value={isISODate(value) ? value : ''} onChange={onChange} />
    </Field>
  );
}

/** One requirement in the form: the date it was handed in, or not needed. */
function RequirementField({ k, label, value, onChange }: { k: RequirementKey; label: string; value: string; onChange: (v: string) => void }) {
  const na = value === NOT_NEEDED;

  return (
    <div className="flex flex-col gap-1.5">
      {na ? <Field name={k} label={label} hint="Not needed for this intern."><TextInput readOnly value={NOT_NEEDED} onChange={() => undefined} /></Field> : (
        <DateField name={k} label={label} value={value} onChange={onChange} hint="The date it was handed in; blank while it is not." />
      )}
      <Checkbox checked={na} onChange={(v) => onChange(v ? NOT_NEEDED : '')}>{`${label} not needed`}</Checkbox>
    </div>
  );
}

/** Where an imported intern came from, and every cell of its row as the spreadsheet had it. */
function SourceRows({ intern }: { intern: Intern }) {
  const src = intern.source;

  if (!src) return null;

  return (
    <section aria-labelledby="intern-source" className="flex flex-col gap-2 border-t border-line pt-3">
      <SectionLabel id="intern-source">From the spreadsheet</SectionLabel>
      <p className="m-0 text-[13px] text-ink-2">
        {src.file}, tab “{src.sheet}”, row {src.row}
        {src.fill && src.fill !== 'FFFFFFFF' && <>, marked <span aria-hidden="true" className="inline-block size-3 rounded-[2px] border border-line-bright align-[-1px]" style={{ background: `#${src.fill.slice(2)}` }} /> #{src.fill.slice(2)}</>}.
        {' '}Each cell as it was written:
      </p>
      <dl className="m-0 grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
        {src.cells.map((c) => (
          <div key={c.column} className="contents">
            <dt className="text-ink-2">{c.column}</dt>
            <dd className="m-0 text-ink [overflow-wrap:anywhere]">{c.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function InternForm({ draft, onDone }: { draft: InternDraft; onDone: () => void }) {
  const { state, run } = useKeystone();
  const [d, setD] = useState(draft);
  const [error, setError] = useState<Refusal | null>(null);
  const said = useId();
  const set = (patch: Partial<InternDraft>) => setD({ ...d, ...patch });
  const original = d.editing ? internsOf(state).find((i) => i.no === d.editing) : undefined;
  const schools = useMemo(() => [...new Set(internsOf(state).map((i) => i.school).filter(Boolean))], [state]);
  const schedules = useMemo(() => [...new Set(internsOf(state).map((i) => i.schedule).filter(Boolean))], [state]);

  const save = () => {
    const r = run((s, c) => saveIntern(s, d, c));

    if (r.ok) onDone(); else setError(r);
  };

  return (
    <form aria-label={d.editing ? `Edit ${draft.name}` : 'New intern'} className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <FieldMarks refusal={error} describedBy={said}>
        <Field name="name" label="Name"><TextInput capitalize autoFocus value={d.name} onChange={(name) => set({ name })} /></Field>
        <Field label="School"><TextInput suggestions={schools} value={d.school} onChange={(school) => set({ school })} /></Field>
        <FieldRow>
          <Field name="batch" label="Batch"><TextInput figures value={d.batch} onChange={(batch) => set({ batch })} /></Field>
          <Field name="idNo" label="ID number" hint={d.editing ? undefined : 'The next number; change it if you need to.'}><TextInput figures value={d.idNo} onChange={(idNo) => set({ idNo })} /></Field>
        </FieldRow>
        <FieldRow>
          <DateField name="start" label="Start date" value={d.start} onChange={(start) => set({ start })} />
          <DateField name="end" label="End date" value={d.end} onChange={(end) => set({ end })} hint="Blank until it is known." />
        </FieldRow>
        <FieldRow>
          <Field label="Schedule" hint="Their days, like Mon-Fri."><TextInput suggestions={schedules} value={d.schedule} onChange={(schedule) => set({ schedule })} /></Field>
          <Field name="hours" label="OJT hours" hint="What their school requires."><TextInput figures value={d.hours} onChange={(hours) => set({ hours })} /></Field>
        </FieldRow>

        <SectionLabel>Requirements</SectionLabel>
        <FieldRow min={200}>
          {REQUIREMENTS.map((r) => <RequirementField key={r.key} k={r.key} label={r.label} value={d[r.key]} onChange={(v) => set({ [r.key]: v })} />)}
        </FieldRow>

        <SectionLabel>Completion</SectionLabel>
        <FieldRow>
          <Field label="Status">
            <SelectInput value={d.status} onChange={(v) => set({ status: STATUSES.find((x) => x === v) ?? 'Ongoing' })} options={STATUSES.map((x) => ({ value: x, label: x }))} />
          </Field>
          <Field label="Proof of completion issued" hint="Like Certificate; blank while none is."><TextInput suggestions={['Certificate']} value={d.proof} onChange={(proof) => set({ proof })} /></Field>
        </FieldRow>
        <Checkbox checked={d.volunteer} onChange={(volunteer) => set({ volunteer })}>Served as a volunteer</Checkbox>
        <Field label="Notes / remarks"><TextArea value={d.remarks} onChange={(remarks) => set({ remarks })} /></Field>
      </FieldMarks>
      {original && <SourceRows intern={original} />}
      <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
        {error
          ? <p id={said} role="alert" className="m-0 mr-auto max-w-[36ch] text-xs text-pretty text-bad">{error.error}</p>
          : <span className="mr-auto text-xs text-ink-2">{original ? `Kept as ${original.no}.` : 'Added to the register.'}</span>}
        <Button onClick={onDone}>Cancel</Button>
        <Button kind="primary" type="submit">{d.editing ? 'Save changes' : 'Add intern'}</Button>
      </div>
    </form>
  );
}

/** The interns, filtered by status, batch and a search, a page at a time. */
function InternRegister({ onOpen }: { onOpen: (i: Intern) => void }) {
  const { state, ctx, run } = useKeystone();
  const confirm = useConfirm();
  const [picked, setShow] = useState<Show>('All');
  const [batch, setBatch] = useState('All');
  const [query, setQuery] = useState('');
  const all = internsOf(state);
  const toCheck = all.filter((i) => datesToCheck(i, ctx).length);

  const shows: { value: Show; n: number }[] = [
    { value: 'All', n: all.length },
    ...STATUSES.map((s) => ({ value: s, n: all.filter((i) => i.status === s).length })),
    ...(toCheck.length ? [{ value: 'Dates to check' as const, n: toCheck.length }] : []),
  ];

  // A filter whose chip has gone (the last date to check fixed) shows everyone again.
  const show = shows.some((x) => x.value === picked) ? picked : 'All';
  const q = query.trim().toLowerCase();

  const rows = all
    .filter((i) => (show === 'All' || (show === 'Dates to check' ? toCheck.includes(i) : i.status === show))
      && (batch === 'All' || String(i.batch) === batch)
      && (!q || [i.name, i.school, i.idNo, i.schedule, i.remarks].some((x) => x.toLowerCase().includes(q))))
    .sort((a, b) => b.batch - a.batch);

  const columns: Column<Intern>[] = [
    { key: 'idNo', header: 'ID No.', width: 124, cell: (i) => <span className="font-semibold text-gold-bright tabular-nums">{i.idNo || DASH}</span> },
    { key: 'name', header: 'Name', cell: (i) => <>{i.name}{i.school && <span className="block text-xs text-ink-2">{i.school}</span>}</> },
    { key: 'batch', header: 'Batch', width: 64, cell: (i) => <span className="tabular-nums">{i.batch || DASH}</span> },
    { key: 'dates', header: 'Dates', width: 208, cell: (i) => <span className="text-ink-2 tabular-nums">{datesOf(i)}</span> },
    { key: 'hours', header: 'Hours', width: 92, align: 'right', detail: true, cell: (i) => <span className="tabular-nums">{hoursText(i)}</span> },
    { key: 'papers', header: 'Papers', width: 72, cell: (i) => <span className={cn('tabular-nums', owing(i) ? 'text-warn' : 'text-ink-2')}>{papersOf(i)}</span> },
    {
      key: 'status', header: 'Status', width: 160, cell: (i) => (
        <span className="flex flex-wrap items-center gap-1">
          <StatusPill status={i.status === 'Incomplete requirements' ? 'Incomplete' : i.status} tone={STATUS_TONE[i.status]} />
          {i.volunteer && <span className="text-xs text-ink-2">Volunteer</span>}
          {datesToCheck(i, ctx).length > 0 && <span className="text-xs text-warn">Check dates</span>}
        </span>
      ),
    },
  ];

  const actions = (i: Intern): RowAction[] => [
    { label: 'Edit…', onSelect: () => onOpen(i) },
    ...(isActive(i) || owing(i) ? owed(i).map((r) => ({ label: `${r.label} handed in today`, onSelect: () => void run((s, c) => receiveRequirement(s, i.no, r.key, c)) })) : []),
    {
      label: 'Remove…', danger: true,
      onSelect: () => confirm({
        title: `Remove ${i.name}?`, body: `${i.name} of ${batchLabel(i.batch)} is taken off the register, with everything kept about their OJT.`,
        confirm: 'Remove intern', danger: true, onConfirm: () => run((s, c) => removeIntern(s, i.no, c)),
      }),
    },
  ];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {shows.map(({ value, n }) => (
            <button
              key={value}
              type="button"
              aria-pressed={show === value}
              onClick={() => setShow(value)}
              className={cn('flex h-[30px] items-center gap-2 rounded-full border px-3 text-[12.5px] font-semibold', show === value ? 'border-gold text-gold-bright' : 'border-line text-ink-2 hover:border-line-bright hover:text-ink')}
            >
              {value}
              <span className={cn('rounded-full px-1.5 text-[11px] font-bold tabular-nums', show === value ? 'bg-gold text-gold-ink' : 'bg-surface-2 text-ink')}>{n}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex w-full flex-wrap gap-2 min-[700px]:w-auto">
          <div className="w-full min-[700px]:w-40">
            <SelectInput label="Batch" value={batch} onChange={setBatch} options={[{ value: 'All', label: 'All batches' }, ...batchesOf(state).map((b) => ({ value: String(b), label: batchLabel(b) }))]} />
          </div>
          <div className="w-full min-[700px]:w-64">
            <Field label="Search" className="sr-only-label"><TextInput placeholder="Name, school or ID number" value={query} onChange={setQuery} /></Field>
          </div>
        </div>
      </div>
      <Panel>
        <Register
          // A change of filter starts again from the first page.
          key={`${show}|${batch}|${q}`}
          label="Interns"
          columns={columns}
          rows={rows}
          rowKey={(i) => i.no}
          rowLabel={(i) => `${i.name}, ${batchLabel(i.batch)}`}
          onOpen={onOpen}
          actions={actions}
          pageSize={PAGE_SIZE}
          empty={<EmptyState text={all.length ? 'No intern matches.' : 'No interns yet. Import HR’s spreadsheet to bring every batch in.'} action={q || show !== 'All' || batch !== 'All' ? <Button size="sm" onClick={() => { setQuery(''); setShow('All'); setBatch('All'); }}>Show all</Button> : undefined} />}
        />
      </Panel>
    </>
  );
}

/** Who still owes requirements, with each requirement's date, and the button to mark one handed in today. */
function Requirements({ onOpen }: { onOpen: (i: Intern) => void }) {
  const { state, run } = useKeystone();
  const rows = internsOf(state).filter(owing).sort((a, b) => b.batch - a.batch);

  const columns: Column<Intern>[] = [
    { key: 'name', header: 'Name', cell: (i) => <>{i.name}<span className="block text-xs text-ink-2">{batchLabel(i.batch)}{i.status === 'Incomplete requirements' ? ' · done, requirements incomplete' : ''}</span></> },
    ...REQUIREMENTS.map((r): Column<Intern> => ({
      key: r.key, header: r.label, width: 132,
      cell: (i) => <span className={cn('tabular-nums', i[r.key].trim() ? 'text-ink-2' : 'font-semibold text-warn')}>{requirementText(i[r.key], i.status)}</span>,
    })),
  ];

  return (
    <Panel>
      <Register
        label="Requirements owed"
        columns={columns}
        rows={rows}
        rowKey={(i) => i.no}
        rowLabel={(i) => i.name}
        onOpen={onOpen}
        actions={(i) => [
          ...owed(i).map((r) => ({ label: `${r.label} handed in today`, onSelect: () => void run((s, c) => receiveRequirement(s, i.no, r.key, c)) })),
          { label: 'Edit…', onSelect: () => onOpen(i) },
        ]}
        pageSize={PAGE_SIZE}
        empty={<EmptyState text="Every intern on OJT has handed in their requirements." />}
      />
    </Panel>
  );
}

/** One day of the cleaning schedule: who cleans, and a field to add someone. */
function RosterDayCard({ day, names, offered }: { day: Weekday; names: string[]; offered: string[] }) {
  const { run } = useKeystone();
  const [who, setWho] = useState('');
  const [error, setError] = useState<Refusal | null>(null);
  const said = useId();

  const add = () => {
    const r = run((s, c) => addToRoster(s, day, who, c));
    setError(r.ok ? null : r);

    if (r.ok) setWho('');
  };

  return (
    <Panel aria-labelledby={`roster-${day}`} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <SectionLabel id={`roster-${day}`}>{day}</SectionLabel>
        <span className="text-xs text-ink-2">{names.length ? count(names.length, 'person', 'people') : 'Nobody'}</span>
      </div>
      <ul aria-label={`Cleaning on ${day}`} className="m-0 flex list-none flex-col p-0">
        {names.map((n) => (
          <li key={n} className="flex items-center justify-between gap-2 border-t border-line py-1 text-[13px]">
            <span>{n}</span>
            <Button size="sm" kind="quiet" aria-label={`Take ${n} off ${day}`} onClick={() => run((s, c) => removeFromRoster(s, day, n, c))}>Remove</Button>
          </li>
        ))}
      </ul>
      <form className="flex items-end gap-2" aria-label={`Add to ${day}`} onSubmit={(e) => { e.preventDefault(); add(); }}>
        <FieldMarks refusal={error} describedBy={said}>
          <div className="min-w-0 flex-1">
            <Field name={`roster.${day}`} label={`Who cleans on ${day}`} className="sr-only-label"><TextInput capitalize suggestions={offered} placeholder="Name" value={who} onChange={setWho} /></Field>
          </div>
        </FieldMarks>
        <Button type="submit">Add</Button>
      </form>
      {error && <p id={said} role="alert" className="m-0 text-xs text-bad">{error.error}</p>}
    </Panel>
  );
}

function Cleaning() {
  const { state } = useKeystone();
  const offered = rosterSuggestions(state);

  return (
    <div className="grid items-start gap-3 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-4">
      {rosterOf(state).map((d) => <RosterDayCard key={d.day} day={d.day} names={d.names} offered={offered} />)}
    </div>
  );
}

function Interns() {
  const { state, ctx, run, files, notify } = useKeystone();
  const confirm = useConfirm();
  const [editing, setEditing] = useDraft<InternDraft | null>(DRAFT, () => null);
  const [view, setView] = useDraft<View>(VIEW, () => 'register');
  const all = internsOf(state);
  const open = (i: Intern) => setEditing(internDraftOf(i));

  // HR's spreadsheet, read here and brought in once it is confirmed (docs/adr/0056). It is read again against the
  // records as they are when confirmed, so nothing saved meanwhile is counted twice.
  const importSheet = async () => {
    const file = await files.open([{ name: 'Excel workbook', extensions: ['xlsx'] }]);

    if (!file) return;

    try {
      const book = readWorkbook(file.bytes);
      const plan = importPlan(state, book, file.name);

      if (!plan.added.length && !plan.rosterTaken) {
        notify(`Everything in ${file.name} is already in Keystone.`);

        return;
      }

      confirm({ title: `Import ${file.name}?`, body: importSummary(plan), confirm: 'Import', onConfirm: () => run((s, c) => importInterns(s, importPlan(s, book, file.name), c)) });
    } catch (e) {
      notify(sentenceOf(e), 'error');
    }
  };

  return (
    <>
      <ScreenHeader
        eyebrow="People"
        title="Interns"
        line={internsLine(state)}
        actions={<>
          <Button onClick={() => void importSheet()}>Import from spreadsheet…</Button>
          <Button kind="primary" onClick={() => setEditing(newIntern(state, ctx))}>Add intern</Button>
        </>}
      />
      <Tabs<View>
        label="Interns"
        value={view}
        onChange={setView}
        tabs={[
          { value: 'register', label: 'Register', note: String(all.length), panel: <InternRegister onOpen={open} /> },
          { value: 'papers', label: 'Requirements', note: String(all.filter(owing).length), panel: <Requirements onOpen={open} /> },
          { value: 'cleaning', label: 'Cleaning schedule', panel: <Cleaning /> },
        ]}
      />
      <Sheet
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.editing ? editing.name : 'Add intern'}
        description={editing?.editing ? `${batchLabel(Number(editing.batch))}${editing.idNo ? ` · ${editing.idNo}` : ''}` : 'Their school, dates, requirements and ID number.'}
      >
        {editing && <InternForm key={editing.editing ?? 'new'} draft={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

export const internsModule: ModuleDef = {
  id: ID,
  title: 'Interns',
  blurb: 'Each batch of OJT interns: their requirements, ID numbers, certificates, and the cleaning schedule.',
  // After Payroll, with the other people screens.
  order: 8.5,
  onHome: true,
  stat: (s) => ['On OJT', String(internsOf(s).filter(isActive).length)],
  figure: internsFigure,
  finding: internsFinding,
  create: { label: 'Add an intern', run: (app) => { app.setDraft(DRAFT, newIntern(app.state, app.ctx)); app.go(ID); } },
  logTags: { [TAG]: 'Interns' },
  Screen: Interns,
};
