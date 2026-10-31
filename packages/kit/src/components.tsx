import { Button, CellInput, EmptyState, FigureStrip, Panel, SectionLabel, SelectInput, StatusPill, Tag, cn } from '@keystone/ui';
import { X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { lineDraft, shortDate, type Connector, type HealthState, type LineDraft, type LogEntry } from '@keystone/core';
import { useConnectorStatus, useImportPeople, useKeystone, useModuleApp } from './context';

// The module kit: building blocks any module may use. Everything here belongs to the
// kernel, so a module that uses it can be removed without touching another module.

/** Description · account or reference · amount · remove. */
export function LineEditor({ title, lines, onChange, accounts }: { title: string; lines: LineDraft[]; onChange: (l: LineDraft[]) => void; accounts?: string[] }) {
  const set = (id: string, patch: Partial<LineDraft>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <div className="flex items-center justify-between">
        <legend className="text-[12.5px] font-medium">{title}</legend>
        <Button size="sm" onClick={() => onChange([...lines, lineDraft({ acct: accounts?.[0] ?? '' })])}>Add line</Button>
      </div>
      {lines.map((l, i) => (
        <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_112px_32px] items-center gap-1.5">
          <CellInput label={`Line ${i + 1} description`} placeholder="Description" value={l.desc} onChange={(v) => set(l.id, { desc: v })} />
          {accounts ? (
            <SelectInput label={`Line ${i + 1} account`} value={l.acct} onChange={(v) => set(l.id, { acct: v })} options={accounts.map((a) => ({ value: a, label: a }))} />
          ) : (
            <CellInput label={`Line ${i + 1} reference`} placeholder="Reference" value={l.ref} onChange={(v) => set(l.id, { ref: v })} />
          )}
          <CellInput label={`Line ${i + 1} amount`} placeholder="0.00" align="right" value={l.amount} onChange={(v) => set(l.id, { amount: v })} />
          <button
            type="button"
            aria-label={`Remove line ${i + 1}`}
            disabled={lines.length === 1}
            onClick={() => onChange(lines.filter((x) => x.id !== l.id))}
            className="grid size-8 place-items-center rounded-control text-ink-3 hover:text-bad disabled:opacity-30"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
    </fieldset>
  );
}

/** The form on the left, the document it produces on the right; stacked under 1100px. */
export function Workspace({ form, preview, previewTitle, previewNote = 'Updates as you type' }: { form: ReactNode; preview: ReactNode; previewTitle: string; previewNote?: string }) {
  return (
    <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {form}
      <section aria-label={previewTitle} className="min-[1100px]:sticky min-[1100px]:top-4">
        <div className="mb-2 flex items-center justify-between">
          <SectionLabel>{previewTitle}</SectionLabel>
          <span className="text-xs text-ink-2">{previewNote}</span>
        </div>
        {preview}
      </section>
    </div>
  );
}

/**
 * A form card: its heading, the fields, and the save row. ⌘/Ctrl+S saves. The refusal,
 * when there is one, is written next to the save button as well as in a toast.
 */
export function FormCard({
  id, eyebrow, title, children, actions, onSubmit, error,
}: { id?: string; eyebrow: string; title: string; children: ReactNode; actions: ReactNode; onSubmit: () => void; error?: string | null }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); onSubmit(); }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [onSubmit]);

  return (
    <Panel as="form" id={id} aria-label={title} className="flex flex-col gap-3.5" onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }}>
      <div>
        <p className="eyebrow m-0">{eyebrow}</p>
        <h2 className="mt-1 mb-0 font-display text-[15px] font-semibold">{title}</h2>
      </div>
      {children}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
        {error && <p role="alert" className="m-0 mr-auto max-w-[44ch] text-xs text-bad">{error}</p>}
        {actions}
      </div>
    </Panel>
  );
}

const HEALTH: Record<HealthState, { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  ready: { label: 'Connected', tone: 'good' },
  setup: { label: 'Set up', tone: 'warn' },
  offline: { label: 'Offline', tone: 'bad' },
  error: { label: 'Problem', tone: 'bad' },
  unsupported: { label: 'Desktop only', tone: 'neutral' },
};

/** A connected system's card: health, live figures, and its actions. Works for any connector. */
export function ConnectorCard({ connector, compact = false }: { connector: Connector; compact?: boolean }) {
  const { connections, notify } = useKeystone();
  const app = useModuleApp();
  const status = useConnectorStatus(connector.id);
  const importPeople = useImportPeople();
  const [busy, setBusy] = useState<string | null>(null);
  const h = status.health;
  const tone = h ? HEALTH[h.state] : { label: 'Checking', tone: 'neutral' as const };

  const act = async (id: string, work: () => Promise<string | void>) => {
    setBusy(id);

    try {
      const r = await work();

      if (r) notify(r);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel className="flex flex-col gap-3" aria-label={connector.name} aria-busy={!h}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 font-display text-sm font-semibold">{connector.name}</h3>
          {!compact && <p className="mt-1 mb-0 text-[13px] text-ink-2">{connector.about}</p>}
        </div>
        <StatusPill status={tone.label} tone={tone.tone} />
      </div>
      <p className="m-0 rounded-control bg-gold-tint px-3 py-2.5 text-[12.5px] text-ink" aria-live="polite">
        {h ? h.detail : 'Checking…'}
      </p>
      {status.figures && status.figures.length > 0 && <FigureStrip figures={status.figures} />}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {h?.update && (
          <Button size="sm" kind="secondary" onClick={() => act('update', async () => {
            await connections.env(connector).system.openUrl(h.update!.url);

            return `Downloading ${connector.name} ${h.update!.version}.`;
          })}>
            Get {h.update.version}
          </Button>
        )}
        {h?.state !== 'unsupported' && connector.actions?.map((a) => (
          <Button
            key={a.id}
            size="sm"
            kind={a.primary && h?.state === 'ready' ? 'primary' : 'secondary'}
            disabled={busy !== null}
            onClick={() => act(a.id, () => connections.safely(connector, a.label, (env) => a.run(env), 300000))}
          >
            {busy === a.id ? 'Working…' : a.label}
          </Button>
        ))}
        {connector.people && (
          <Button size="sm" disabled={busy !== null || h?.state === 'unsupported'} onClick={() => act('people', async () => { await importPeople(connector); })}>
            {busy === 'people' ? 'Importing…' : connector.people.label}
          </Button>
        )}
        {app.has('connections') && (h?.state === 'setup' || h?.state === 'error' || connector.settings.length > 0) && (
          <Button size="sm" kind="quiet" className={cn('ml-auto')} onClick={() => app.go('connections')}>
            Settings
          </Button>
        )}
      </div>
    </Panel>
  );
}

/** Time, tag and what happened, one entry per line. */
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
