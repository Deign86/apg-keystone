import { Panel, ScreenHeader } from '@keystone/ui';
import type { ModuleDef } from './registry';

// A screen not open to everyone yet (docs/adr/0017). It keeps its place in the rail, marked "Soon", and what it does
// for other parts: the services it provides, its housekeeping on opening, what it needs and where its records are
// kept, so nothing it holds changes. It shows nothing else: no Home tile, Overview figure, finding, waiting item,
// "New …" action or Activity filter.

function ComingSoonScreen({ module: m }: { module: ModuleDef }) {
  return (
    <>
      <ScreenHeader eyebrow={m.section} title={m.title} line={m.blurb} />
      <Panel>
        <h2 className="m-0 text-lg font-bold">Coming soon</h2>
        <p className="mt-1.5 mb-0 max-w-[68ch] text-sm text-pretty text-ink-2">
          {m.title} is still being finished and opens in a later release of Keystone. Nothing it holds is changed meanwhile.
        </p>
      </Panel>
    </>
  );
}

/** `m` as a screen that says it is coming soon. */
export function comingSoon(m: ModuleDef): ModuleDef {
  const { id, title, section, blurb, order, requires, onOpen, provides, documents } = m;

  function Screen() {
    return <ComingSoonScreen module={m} />;
  }

  return { id, title, section, blurb, order, requires, onOpen, provides, documents, soon: true, Screen };
}
