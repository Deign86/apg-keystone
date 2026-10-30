import { Button, Checkbox, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SelectInput, Sheet, Tag, TextInput, cn, useConfirm, type Column } from '@keystone/ui';
import { useState } from 'react';
import {
  count, directoryDraftOf, newDirectoryDraft, nextCode, recordsOf, removeDirectoryRecord, RECORD_TYPES, saveDirectoryRecord, usedBy,
  type DirectoryDraft, type DirectoryRecord, type RecordType,
} from '@keystone/core';
import { useKeystone } from '../app/context';
import type { ModuleDef } from '../app/registry';

function RecordForm({ draft, onDone }: { draft: DirectoryDraft; onDone: () => void }) {
  const { state, run } = useKeystone();
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const r = run((s, c) => saveDirectoryRecord(s, d, c));
    if (r.ok) onDone(); else setError(r.error);
  };
  return (
    <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <FieldRow>
        <Field label="Type">
          <SelectInput value={d.type} onChange={(t) => setD({ ...d, type: t as RecordType, vat: t === 'Client' })} options={RECORD_TYPES.map((t) => ({ value: t, label: t }))} />
        </Field>
        <Field label="TIN"><TextInput figures placeholder="000-000-000-000" value={d.tin} onChange={(tin) => setD({ ...d, tin })} /></Field>
      </FieldRow>
      <Field label="Name" error={error ?? undefined}><TextInput autoFocus value={d.name} onChange={(name) => setD({ ...d, name })} /></Field>
      <FieldRow>
        <Field label={d.type === 'Employee' ? 'Position' : 'Address'}><TextInput value={d.detail} onChange={(detail) => setD({ ...d, detail })} /></Field>
        {d.type === 'Employee' && <Field label="Department"><TextInput value={d.dept} onChange={(dept) => setD({ ...d, dept })} /></Field>}
      </FieldRow>
      <FieldRow>
        <Field label="Email"><TextInput type="email" value={d.email} onChange={(email) => setD({ ...d, email })} /></Field>
        <Field label="Phone"><TextInput type="tel" value={d.phone} onChange={(phone) => setD({ ...d, phone })} /></Field>
      </FieldRow>
      {d.type === 'Client' && (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Checkbox checked={d.vat} onChange={(vat) => setD({ ...d, vat })}>VAT-registered (statements add 12% VAT)</Checkbox>
          <Checkbox checked={d.ewt} onChange={(ewt) => setD({ ...d, ewt })}>Withholds 5% EWT</Checkbox>
        </div>
      )}
      <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
        <span className="mr-auto text-xs text-ink-2">{d.editing ? `Keeps code ${d.editing}.` : `Gets code ${nextCode(state, d.type)}.`}</span>
        <Button onClick={onDone}>Cancel</Button>
        <Button kind="primary" type="submit">{d.editing ? 'Save changes' : 'Add record'}</Button>
      </div>
    </form>
  );
}

function Directory() {
  const { state, run, connections } = useKeystone();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<RecordType | 'All'>('All');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<DirectoryDraft | null>(null);

  const q = query.trim().toLowerCase();
  const rows = state.dir.filter((d) => (filter === 'All' || d.type === filter)
    && (!q || [d.code, d.name, d.tin, d.detail, d.dept, d.email].some((x) => x?.toLowerCase().includes(q))));
  const sourceName = (id: string) => connections.get(id)?.name ?? id;

  const columns: Column<DirectoryRecord>[] = [
    { key: 'code', header: 'Code', width: 68, cell: (d) => <span className="font-semibold text-gold-bright tabular-nums">{d.code}</span> },
    { key: 'type', header: 'Type', width: 88, cell: (d) => <span className="text-ink-2">{d.type}</span> },
    { key: 'name', header: 'Name', cell: (d) => <span title={d.name}>{d.name}</span> },
    { key: 'tin', header: 'TIN', width: 138, cell: (d) => <span className="text-ink-2 tabular-nums">{d.tin || '—'}</span> },
    {
      key: 'detail', header: 'Details', cell: (d) => (
        <span className="text-ink-2">
          {[d.detail, d.dept, d.type === 'Client' ? `${d.vat ? 'VAT' : 'non-VAT'}${d.ewt ? ', EWT' : ''}` : null].filter(Boolean).join(' · ') || '—'}
        </span>
      ),
    },
    {
      key: 'used', header: 'Used by', width: 100, cell: (d) => {
        const used = usedBy(state, d.code);
        const linked = Object.keys(d.links ?? {});
        return used.length || linked.length ? (
          <span className="flex flex-wrap gap-1" title={linked.length ? `Linked to ${linked.map(sourceName).join(', ')}` : undefined}>
            {used.map((u) => <Tag key={u}>{u}</Tag>)}
            {linked.map((l) => <Tag key={l}>{l === 'attendance' ? 'RFID' : l === 'website' ? 'WEB' : l.slice(0, 3).toUpperCase()}</Tag>)}
          </span>
        ) : <span className="text-ink-3">—</span>;
      },
    },
  ];

  return (
    <>
      <ScreenHeader
        eyebrow="Master data"
        title="Directory"
        line={`${count(recordsOf(state, 'Vendor').length, 'vendor')}, ${count(recordsOf(state, 'Client').length, 'client')} and ${count(recordsOf(state, 'Employee').length, 'employee')}. A vendor added here can be paid by voucher, a client billed, an employee given an ID.`}
        actions={<Button kind="primary" onClick={() => setEditing(newDirectoryDraft(filter === 'All' ? 'Vendor' : filter))}>Add record</Button>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {(['All', ...RECORD_TYPES] as const).map((t) => {
            const n = t === 'All' ? state.dir.length : recordsOf(state, t).length;
            const on = filter === t;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(t)}
                className={cn('flex h-[30px] items-center gap-2 rounded-full border px-3 text-[12.5px] font-semibold', on ? 'border-gold text-gold-bright' : 'border-line text-ink-2 hover:border-line-bright hover:text-ink')}
              >
                {t === 'All' ? 'All' : `${t}s`}
                <span className={cn('rounded-full px-1.5 text-[11px] font-bold tabular-nums', on ? 'bg-gold text-gold-ink' : 'bg-surface-2 text-ink')}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto w-72">
          <Field label="Search" className="sr-only-label">
            <TextInput placeholder="Name, code, TIN or address" value={query} onChange={setQuery} />
          </Field>
        </div>
      </div>
      <Panel>
        <Register
          label="Directory"
          columns={columns}
          rows={rows}
          rowKey={(d) => d.code}
          onOpen={(d) => setEditing(directoryDraftOf(d))}
          actions={(d) => [
            { label: 'Edit…', onSelect: () => setEditing(directoryDraftOf(d)) },
            { label: 'Copy code', onSelect: () => void navigator.clipboard?.writeText(d.code) },
            {
              label: 'Remove…', danger: true, disabled: usedBy(state, d.code).length > 0,
              onSelect: () => confirm({ title: `Remove ${d.code}?`, body: `${d.name} is removed from the directory. Nothing refers to it yet, so no document changes.`, confirm: 'Remove record', danger: true, onConfirm: () => run((s, c) => removeDirectoryRecord(s, d.code, c)) }),
            },
          ]}
          empty={<EmptyState text={q ? `Nothing matches “${query}”.` : 'No records of this type yet.'} action={q ? <Button size="sm" onClick={() => setQuery('')}>Clear search</Button> : <Button size="sm" kind="primary" onClick={() => setEditing(newDirectoryDraft(filter === 'All' ? 'Vendor' : filter))}>Add one</Button>} />}
        />
      </Panel>
      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing?.editing ? `Edit ${editing.editing}` : 'Add record'} description="Vendors can be paid by voucher, clients billed, employees given an ID.">
        {editing && <RecordForm key={editing.editing ?? 'new'} draft={editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

export const directoryModule: ModuleDef = {
  id: 'directory',
  title: 'Directory',
  section: 'Master data',
  blurb: 'One master list of vendors, clients, and employees shared by every system.',
  order: 5,
  onHome: true,
  stat: (s) => ['Records', String(s.dir.length)],
  Screen: Directory,
};
