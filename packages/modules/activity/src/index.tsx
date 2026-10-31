import { Button, EmptyState, Field, Panel, ScreenHeader, TextInput, cn } from '@keystone/ui';
import { useState } from 'react';
import { count, lastEntryDate } from '@keystone/core';
import { useKeystone, Feed, type ModuleDef } from '@keystone/kit';

function Activity() {
  const { state, registry } = useKeystone();
  // Filters come from the installed modules' log tags, plus "Other" for entries written
  // by modules this build does not have.
  const known = Object.assign({}, ...registry.modules.map((m) => m.logTags ?? {})) as Record<string, string>;
  const hasOther = state.log.some((e) => !(e.mod in known));
  const filters = [{ id: 'all', label: 'All' }, ...Object.entries(known).map(([id, label]) => ({ id, label })), ...(hasOther ? [{ id: 'other', label: 'Other' }] : [])];
  const [mod, setMod] = useState<string>('all');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = state.log.filter((e) => (mod === 'all' || e.mod === mod || (mod === 'other' && !(e.mod in known))) && (!q || e.text.toLowerCase().includes(q)));
  return (
    <>
      <ScreenHeader
        eyebrow="Audit trail"
        title="Activity Log"
        line={state.log.length ? `${count(state.log.length, 'entry', 'entries')}. The last was on ${lastEntryDate(state)}.` : 'Every save, approval and issuance will be listed here.'}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Module" className="flex flex-wrap gap-2">
          {filters.map((f) => (
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
