import { Button, EmptyState, Panel, Register, ScreenHeader, SectionLabel, Sheet, StatusPill, type Column } from '@keystone/ui';
import { useCallback, useEffect, useState } from 'react';
import {
  count, newDirectoryDraft, peso, saveDirectoryRecord, SERVICES, shortDate, toCentavos, type OpenStatement,
} from '@keystone/core';
import { useConnectorStatus, useKeystone, useModuleApp } from '@keystone/kit';
import { paymentAmount, websiteApi, type Inquiry } from './api';

type Load = { state: 'loading' } | { state: 'ready'; payments: Inquiry[]; inquiries: Inquiry[] } | { state: 'failed'; reason: string };

const when = (s: string) => shortDate(s.slice(0, 10));

/** Statements this payment could settle, best match first: same amount, then a name match. */
export function candidates(open: OpenStatement[], p: Inquiry) {
  const amount = paymentAmount(p);
  const payer = `${p.name} ${p.meta?.company ?? ''}`.toLowerCase();

  const score = (b: OpenStatement) => (amount !== null && toCentavos(amount) === b.amount ? 2 : 0)
    + (b.client.toLowerCase().split(/[\s,.]+/).some((w) => w.length > 3 && payer.includes(w)) ? 1 : 0);

  return [...open].sort((a, b) => score(b) - score(a));
}

export function WebsiteInbox() {
  const { state, connections, run } = useKeystone();
  const app = useModuleApp();
  // Statements belong to the billing module; this screen only reaches them through its service.
  const desk = app.service(SERVICES.statementPayments);
  const connector = connections.get('website')!;
  const health = useConnectorStatus('website').health;
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [matching, setMatching] = useState<Inquiry | null>(null);

  const refresh = useCallback(async () => {
    setLoad({ state: 'loading' });

    try {
      const [payments, inquiries] = await connections.safely(connector, 'inbox', (env) => {
        const api = websiteApi(env);

        return Promise.all([api.payments(), api.inquiries(30)]);
      }, 20000);

      setLoad({ state: 'ready', payments, inquiries });
    } catch (e) {
      setLoad({ state: 'failed', reason: e instanceof Error ? e.message : String(e) });
    }
  }, [connections, connector]);

  const ready = health?.state === 'ready';
  useEffect(() => { if (ready) void refresh(); }, [ready, refresh]);

  const markOnSite = (id: number, status: Inquiry['status']) =>
    connections.safely(connector, 'update', (env) => websiteApi(env).setStatus(id, status)).catch(() => undefined);

  const settle = async (p: Inquiry, b: OpenStatement) => {
    if (!desk) return;
    const amount = paymentAmount(p) ?? 0;

    const r = run((s, c) => desk.record(s, b.no, {
      amount, method: p.meta?.payment_method, reference: p.meta?.reference_no,
      source: `the website${p.meta?.ticket ? ` (ticket ${p.meta.ticket})` : ''}`,
    }, c));

    if (r.ok) {
      setMatching(null);
      await markOnSite(p.id, 'archived');
      void refresh();
    }
  };

  const addClient = (i: Inquiry) => {
    const r = run((s, c) => saveDirectoryRecord(s, { ...newDirectoryDraft('Client'), name: i.meta?.company || i.name, email: i.email, phone: i.phone, detail: i.meta?.property ?? '' }, c));

    if (r.ok) void markOnSite(i.id, 'read');
  };


  const payColumns: Column<Inquiry>[] = [
    { key: 'when', header: 'Reported', width: 104, cell: (p) => <span className="text-ink-2 tabular-nums">{when(p.created_at)}</span> },
    { key: 'who', header: 'From', cell: (p) => <span>{p.name}{p.meta?.service ? <span className="text-ink-2"> · {p.meta.service}</span> : null}</span> },
    { key: 'ref', header: 'Method / reference', width: 200, cell: (p) => <span className="text-ink-2 tabular-nums">{[p.meta?.payment_method, p.meta?.reference_no].filter(Boolean).join(' · ') || '—'}</span> },
    { key: 'amount', header: 'Amount', width: 128, align: 'right', cell: (p) => <span className="font-semibold">{paymentAmount(p) !== null ? peso(toCentavos(paymentAmount(p)!)) : '—'}</span> },
    { key: 'status', header: 'Status', width: 100, align: 'right', cell: (p) => <StatusPill status={p.status} tone={p.status === 'new' ? 'warn' : 'neutral'} /> },
  ];

  const inqColumns: Column<Inquiry>[] = [
    { key: 'when', header: 'Received', width: 104, cell: (i) => <span className="text-ink-2 tabular-nums">{when(i.created_at)}</span> },
    { key: 'who', header: 'From', width: 220, cell: (i) => i.name },
    { key: 'about', header: 'About', cell: (i) => <span className="text-ink-2">{i.meta?.listing_title || i.meta?.property || i.subject || i.excerpt}</span> },
    { key: 'kind', header: 'Kind', width: 110, cell: (i) => <span className="text-ink-2">{i.kind.replace('_', ' ')}</span> },
    { key: 'status', header: 'Status', width: 100, align: 'right', cell: (i) => <StatusPill status={i.status} tone={i.status === 'new' ? 'warn' : 'neutral'} /> },
  ];

  const open = desk ? desk.open(state) : [];

  const header = (
    <ScreenHeader
      eyebrow="Connected · alphapremiergroup.com"
      title="Website"
      line={load.state === 'ready'
        ? `${count(load.payments.filter((p) => p.status === 'new').length, 'new payment')} reported online and ${count(load.inquiries.filter((i) => i.status === 'new').length, 'unread inquiry', 'unread inquiries')}.`
        : 'Payments clients report on the website’s Pay page, matched to statements here, and the latest inquiries.'}
      actions={<Button onClick={() => void refresh()} disabled={!ready}>Refresh</Button>}
    />
  );

  if (!ready) {
    return (
      <>
        {header}
        <Panel><EmptyState text={health?.detail ?? 'Connecting to the website…'} action={app.has('connections') ? <Button size="sm" kind="primary" onClick={() => app.go('connections')}>Set up the website</Button> : undefined} /></Panel>
      </>
    );
  }

  return (
    <>
      {header}
      {load.state === 'failed' && <Panel className="mb-4"><EmptyState text={load.reason} action={<Button size="sm" onClick={() => void refresh()}>Try again</Button>} /></Panel>}
      <Panel className="mb-4" aria-busy={load.state === 'loading'}>
        <SectionLabel>Payments reported online</SectionLabel>
        {!desk && <p className="mt-2 mb-0 text-sm text-ink-2">Matching these to statements needs the Billing module, which is not installed.</p>}
        {load.state === 'loading' ? <div className="mt-3 h-24 rounded-control bg-surface-2/60" aria-label="Loading payments" /> : load.state === 'ready' && (
          <Register
            label="Payments reported online"
            columns={payColumns}
            rows={load.payments}
            rowKey={(p) => String(p.id)}
            onOpen={desk ? (p) => setMatching(p) : undefined}
            actions={(p) => [
              { label: 'Match to a statement…', onSelect: () => setMatching(p), disabled: !desk || open.length === 0 },
              { label: 'Mark read on the website', onSelect: () => void markOnSite(p.id, 'read').then(refresh), disabled: p.status !== 'new' },
            ]}
            empty={<EmptyState text="No payments reported on the website." />}
          />
        )}
      </Panel>
      <Panel aria-busy={load.state === 'loading'}>
        <SectionLabel>Latest inquiries</SectionLabel>
        {load.state === 'ready' && (
          <Register
            label="Latest inquiries"
            columns={inqColumns}
            rows={load.inquiries}
            rowKey={(i) => String(i.id)}
            actions={(i) => [
              { label: 'Add to directory as client', onSelect: () => addClient(i) },
              { label: 'Mark read on the website', onSelect: () => void markOnSite(i.id, 'read').then(refresh), disabled: i.status !== 'new' },
            ]}
            empty={<EmptyState text="No inquiries waiting." />}
          />
        )}
      </Panel>

      <Sheet open={matching !== null} onOpenChange={(o) => !o && setMatching(null)} title="Match payment to a statement" description={matching ? `${matching.name} reported ${paymentAmount(matching) !== null ? peso(toCentavos(paymentAmount(matching)!)) : 'a payment'}${matching.meta?.reference_no ? `, reference ${matching.meta.reference_no}` : ''}.` : undefined}>
        {matching && (open.length === 0 ? <EmptyState text="No statement is open." /> : (
          <ul className="m-0 flex max-h-[50dvh] list-none flex-col overflow-y-auto p-0">
            {candidates(open, matching).map((b) => (
              <li key={b.no} className="flex items-center justify-between gap-3 border-t border-line py-2.5">
                <span className="min-w-0">
                  <span className="block font-semibold text-gold-bright tabular-nums">{b.no}</span>
                  <span className="block truncate text-xs text-ink-2">{b.client} · due {shortDate(b.due)}</span>
                </span>
                <span className="font-semibold tabular-nums">{peso(b.amount)}</span>
                <Button size="sm" kind="primary" onClick={() => void settle(matching, b)}>Mark paid</Button>
              </li>
            ))}
          </ul>
        ))}
        {matching && <p className="mt-3 mb-0 text-xs text-ink-2">Marking paid also archives the report on the website. A payment short of the amount due is refused.</p>}
      </Sheet>
    </>
  );
}
