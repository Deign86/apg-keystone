import { KeyBadge, SectionLabel } from '@keystone/ui';
import logo from '@keystone/ui/logo.png';
import { useEffect, useState } from 'react';
import { clockTime, greeting, topFinding, weekdayLong } from '@keystone/core';
import { ConnectorShortcut, useKeystone, type ModuleDef } from '@keystone/kit';

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);

    return () => clearInterval(t);
  }, []);

  return now;
}

/** The kiosk-style front door shared with the attendance tracker. */
function Home() {
  const { state, ctx, registry, go } = useKeystone();
  const now = useNow();
  const tiles = registry.modules.filter((m) => m.onHome);
  const index = (id: string) => registry.modules.findIndex((m) => m.id === id);

  return (
    <div className="mx-auto max-w-[1120px]">
      <div className="flex justify-end border-b border-line pb-4">
        <div className="text-right">
          <p className="m-0 text-xs text-ink-2">{weekdayLong(now)}</p>
          <p className="m-0 font-display text-xl font-semibold text-gold-bright tabular-nums" aria-live="off">{clockTime(now)}</p>
        </div>
      </div>

      <div className="py-9 text-center">
        <div className="mx-auto mb-[18px] grid size-[92px] place-items-center rounded-full border border-gold-soft bg-surface-2">
          <img src={logo} alt="Alpha Premier phoenix" className="size-16 object-contain" />
        </div>
        <h1 className="m-0 font-display text-[clamp(34px,5vw,58px)] leading-tight font-semibold">{greeting(now)}</h1>
        <p className="mx-auto mt-3 mb-0 max-w-[60ch] font-semibold text-gold">{topFinding(registry.modules.map((m) => m.finding?.(state, ctx)))}</p>
      </div>

      <h2 className="sr-only">Systems</h2>
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 min-[700px]:grid-cols-2 min-[1000px]:grid-cols-3">
        {tiles.map((m) => {
          const [label, value] = m.stat?.(state, ctx) ?? ['', ''];

          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => go(m.id)}
                className="group flex h-full w-full flex-col gap-3 rounded-tile border border-line bg-surface p-[22px] text-left transition-[border-color,background-color,transform] duration-200 ease-out hover:border-gold hover:bg-surface-2 motion-safe:hover:-translate-y-0.5"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="font-display text-sm font-semibold text-ink">{m.title}</span>
                  <KeyBadge n={index(m.id)} />
                </span>
                <span className="flex-1 text-[13px] text-ink-2">{m.blurb}</span>
                {label && (
                  <span className="flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-ink-2">
                    {label}
                    <b className="font-display text-[12.5px] font-semibold text-gold-bright tabular-nums">{value}</b>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {registry.connectors.length > 0 && <>
      <div className="mt-8 mb-3 flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-5">
        <SectionLabel>Connected systems</SectionLabel>
        <p className="m-0 text-[12.5px] text-ink-2">Shortcuts to the other APG apps.</p>
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 min-[700px]:grid-cols-2 min-[1000px]:grid-cols-3">
        {registry.connectors.map((c) => <li key={c.id}><ConnectorShortcut connector={c} /></li>)}
      </ul>
      </>}
    </div>
  );
}

export const homeModule: ModuleDef = {
  id: 'home',
  title: 'Home',
  section: 'Administrator access',
  blurb: '',
  order: 0,
  Screen: Home,
};
