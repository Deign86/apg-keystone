import { Button, EmptyState, FigureStrip, Panel, ScreenHeader, SectionLabel, StatusPill } from '@keystone/ui';
import { peso, topFinding, type Ctx, type TerminalState } from '@keystone/core';
import { useKeystone, useModuleApp, Feed, type ModuleDef } from '@keystone/kit';

/** Everything the installed modules say waits on someone, the most urgent first, each with the module that owns it. */
const waitingOf = (mods: readonly ModuleDef[], state: TerminalState, ctx: Ctx) => mods
  .flatMap((m) => (m.waiting ? m.waiting(state, ctx).map((w) => ({ ...w, owner: m })) : []))
  .sort((a, b) => a.rank - b.rank);

/**
 * "What needs signing or collecting?" Overview knows no other module: every figure,
 * every waiting item and the finding come from whatever modules are installed.
 */
function Overview() {
  const { state, ctx, registry } = useKeystone();
  const app = useModuleApp();
  const mods = registry.modules;
  const figures = mods.flatMap((m) => (m.figure ? [m.figure(state, ctx)] : []));
  const lead = figures.findIndex((f) => f.lead);
  const waiting = waitingOf(mods, state, ctx);

  const creators = mods.filter((m) => m.create);

  return (
    <>
      <ScreenHeader
        eyebrow="Administrator access"
        title="Overview"
        line={topFinding(mods.map((m) => m.finding?.(state, ctx)))}
        actions={creators.length ? creators.map((m, i) => (
          <Button key={m.id} kind={i === 0 ? 'primary' : 'secondary'} onClick={() => m.create!.run(app)}>{m.create!.label}</Button>
        )) : undefined}
      />
      {figures.length > 0 && <FigureStrip figures={figures} lead={lead >= 0 ? lead : undefined} />}
      <div className="mt-4 grid items-start gap-4 min-[1000px]:grid-cols-[minmax(0,1fr)_420px]">
        {/* Both cards head with a row as tall as Recent activity's View all, and say they're empty the same way, so
            side by side they end level. */}
        <Panel aria-labelledby="waiting">
          <div className="flex min-h-7 items-center"><SectionLabel id="waiting">Waiting on you</SectionLabel></div>
          {waiting.length === 0 ? <div className="mt-2"><EmptyState text="Nothing is waiting on you." /></div> : (
            <ul className="m-0 mt-2 list-none p-0">
              {waiting.map((w) => (
                <li key={`${w.owner.id}-${w.no}`} className="border-t border-line">
                  <button
                    type="button"
                    disabled={!w.owner.openWaiting}
                    onClick={() => w.owner.openWaiting?.(w.no, app)}
                    className="grid min-h-[48px] w-full grid-cols-[minmax(0,1fr)_auto_140px] items-center gap-3 py-1.5 text-left enabled:hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-gold-bright tabular-nums">{w.no}</span>
                      <span className="block truncate text-xs text-ink-2">{w.who}</span>
                    </span>
                    <span className="font-semibold tabular-nums">{w.amount === null ? '' : peso(w.amount)}</span>
                    <span className="text-right"><StatusPill status={w.status} tone={w.tone} /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel aria-labelledby="recent">
          <div className="flex min-h-7 items-center justify-between">
            <SectionLabel id="recent">Recent activity</SectionLabel>
            {app.has('activity') && <Button size="sm" kind="quiet" onClick={() => app.go('activity')}>View all</Button>}
          </div>
          <div className="mt-2"><Feed entries={state.log.slice(0, Math.max(3, waiting.length))} compact /></div>
        </Panel>
      </div>
    </>
  );
}

export const overviewModule: ModuleDef = {
  id: 'overview',
  title: 'Overview',
  blurb: 'Summary figures for the CEO: what waits for approval, what is owed, what is due.',
  order: 1,
  onHome: true,
  // Its tile counts what its own card lists: everything waiting on you, from whichever modules are installed.
  stat: (state, ctx, installed) => ['Waiting on you', String(waitingOf(installed, state, ctx).length)],
  Screen: Overview,
};
