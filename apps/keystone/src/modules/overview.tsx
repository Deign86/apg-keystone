import { Button, FigureStrip, Panel, ScreenHeader, SectionLabel, StatusPill } from '@keystone/ui';
import {
  awaitingApproval, finding, outstanding, overviewFigures, peso, recordOf, shortDate, statementDraftOf, statementTotals, toneOf,
  voucherDraftOf, voucherTotal,
} from '@keystone/core';
import { useKeystone } from '../app/context';
import type { ModuleDef } from '../app/registry';
import { Feed } from './activity';

/** "What needs signing or collecting?" The finding leads; the open items carry the actions. */
function Overview() {
  const { state, ctx, go, store } = useKeystone();
  const pending = awaitingApproval(state);
  const open = [...outstanding(state)].sort((a, b) => a.due.localeCompare(b.due));
  const openVoucher = (no: string) => {
    const v = state.cv.find((x) => x.no === no);
    if (v) store.setDraft('cv', voucherDraftOf(v));
    go('vouchers');
  };
  const openStatement = (no: string) => {
    const b = state.bs.find((x) => x.no === no);
    if (b) store.setDraft('bs', statementDraftOf(b, ctx));
    go('billing');
  };
  return (
    <>
      <ScreenHeader
        eyebrow="Administrator access"
        title="Overview"
        line={finding(state)}
        actions={<>
          <Button kind="primary" onClick={() => go('vouchers')}>New check voucher</Button>
          <Button onClick={() => go('billing')}>New statement</Button>
          <Button onClick={() => go('id-maker')}>New ID</Button>
        </>}
      />
      <FigureStrip figures={overviewFigures(state, ctx)} lead={1} />
      <div className="mt-4 grid items-start gap-4 min-[1000px]:grid-cols-[minmax(0,1fr)_420px]">
        <Panel aria-labelledby="waiting">
          <SectionLabel id="waiting">Waiting on you</SectionLabel>
          {pending.length + open.length === 0 && <p className="mt-3 mb-0 text-[13px] text-ink-2">No voucher is waiting for a signature and every statement is paid.</p>}
          <ul className="m-0 mt-2 list-none p-0">
            {pending.map((v) => (
              <li key={v.no} className="border-t border-line">
                <button type="button" onClick={() => openVoucher(v.no)} className="grid min-h-[48px] w-full grid-cols-[minmax(0,1fr)_auto_112px] items-center gap-3 py-1.5 text-left hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block font-semibold text-gold-bright tabular-nums">{v.no}</span>
                    <span className="block truncate text-xs text-ink-2">{recordOf(state, v.payee)?.name ?? v.payee} · voucher</span>
                  </span>
                  <span className="font-semibold tabular-nums">{peso(voucherTotal(v))}</span>
                  <span className="text-right"><StatusPill status={v.status} tone={toneOf(v.status)} /></span>
                </button>
              </li>
            ))}
            {open.map((b) => (
              <li key={b.no} className="border-t border-line">
                <button type="button" onClick={() => openStatement(b.no)} className="grid min-h-[48px] w-full grid-cols-[minmax(0,1fr)_auto_112px] items-center gap-3 py-1.5 text-left hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block font-semibold text-gold-bright tabular-nums">{b.no}</span>
                    <span className="block truncate text-xs text-ink-2">{recordOf(state, b.client)?.name ?? b.client} · due {shortDate(b.due)}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{peso(statementTotals(b).due)}</span>
                  <span className="text-right"><StatusPill status={b.status} tone={toneOf(b.status)} /></span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel aria-labelledby="recent">
          <div className="flex items-center justify-between">
            <SectionLabel id="recent">Recent activity</SectionLabel>
            <Button size="sm" kind="quiet" onClick={() => go('activity')}>View all</Button>
          </div>
          <div className="mt-2"><Feed entries={state.log.slice(0, Math.max(3, pending.length + open.length))} compact /></div>
        </Panel>
      </div>
    </>
  );
}

export const overviewModule: ModuleDef = {
  id: 'overview',
  title: 'Overview',
  section: 'Administrator access',
  blurb: 'Summary figures for the CEO: pending approvals, receivables, and IDs issued this month.',
  order: 1,
  onHome: true,
  stat: (s) => ['Open items', String(awaitingApproval(s).length + outstanding(s).length)],
  Screen: Overview,
};
