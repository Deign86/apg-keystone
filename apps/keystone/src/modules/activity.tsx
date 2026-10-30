import { Button, EmptyState, Field, Panel, ScreenHeader, Tag, TextInput, cn } from '@keystone/ui';
import { useState } from 'react';
import { count, lastEntryDate, shortDate, type LogEntry } from '@keystone/core';
import { useKeystone } from '../app/context';
import type { ModuleDef } from '../app/registry';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'CV', label: 'Vouchers' },
  { id: 'BS', label: 'Billing' },
  { id: 'ID', label: 'IDs' },
  { id: 'DIR', label: 'Directory' },
] as const;

export function Feed({ entries, compact = false }: { entries: LogEntry[]; compact?: boolean }) {
  if (!entries.length) return <EmptyState text="No activity yet." />;
  return (
    <ol className="m-0 list-none p-0">
      {entries.map((e, i) => (
        <li key={`${e.when}-${i}`} className={cn('grid items-baseline gap-x-3 border-t border-line py-2.5 text-[13px]', compact ? 'grid-cols-[46px_1fr]' : 'grid-cols-[140px_46px_1fr]', i === 0 && !compact && 'border-t-0')}>
          {!compact && <time className="text-xs text-ink-3 tabular-nums">{e.when}</time>}
          <Tag>{e.mod}</Tag>
          <span className="text-pretty">
            {e.text}
            {compact && <time className="ml-2 text-xs text-ink-3 tabular-nums">{shortDate(e.when.slice(0, 10))}</time>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Activity() {
  const { state } = useKeystone();
  const [mod, setMod] = useState<string>('all');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = state.log.filter((e) => (mod === 'all' || e.mod === mod) && (!q || e.text.toLowerCase().includes(q)));
  return (
    <>
      <ScreenHeader
        eyebrow="Audit trail"
        title="Activity Log"
        line={state.log.length ? `${count(state.log.length, 'entry', 'entries')}. The last was on ${lastEntryDate(state)}.` : 'Every save, approval and issuance will be listed here.'}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Module" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={mod === f.id}
              onClick={() => setMod(f.id)}
              className={cn('h-[30px] rounded-full border px-3 text-[12.5px] font-semibold', mod === f.id ? 'border-gold text-gold-bright' : 'border-line text-ink-2 hover:border-line-bright hover:text-ink')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto w-72">
          <Field label="Search the log" className="sr-only-label">
            <TextInput placeholder="A number, a name, a word" value={query} onChange={setQuery} />
          </Field>
        </div>
      </div>
      <Panel aria-label="Entries">
        {shown.length || !q ? <Feed entries={shown} /> : <EmptyState text={`Nothing matches “${query}”.`} action={<Button size="sm" onClick={() => setQuery('')}>Clear search</Button>} />}
      </Panel>
    </>
  );
}

export const activityModule: ModuleDef = {
  id: 'activity',
  title: 'Activity Log',
  section: 'Audit trail',
  blurb: 'Every save, approval, and issuance across the terminal, kept as the audit trail.',
  order: 6,
  onHome: true,
  stat: (s) => ['Last entry', lastEntryDate(s)],
  Screen: Activity,
};
