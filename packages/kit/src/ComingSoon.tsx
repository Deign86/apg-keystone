import { Component, type ReactNode } from 'react';
import type { ModuleDef } from './registry';

// A screen not open to everyone yet (docs/adr/0017, 0019). It keeps its place in the rail, marked "Soon", its Home
// tile, marked too, and everything it does for other parts. Its screen shows as it will look, faded behind a notice
// that it is coming soon: nothing on it can be reached, typed into or read aloud, so nothing it holds changes. Only
// its finding is left out, so the sentence under Home and Overview speaks of a screen that opens.

/** A screen that fails behind the notice leaves the notice alone. */
class Preview extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function ComingSoonScreen({ module: m }: { module: ModuleDef }) {
  const { Screen } = m;

  return (
    <div className="relative min-h-[60dvh]">
      {/* inert takes the screen out of reach of the pointer, the keyboard and screen readers alike. */}
      <div ref={(el) => el?.setAttribute('inert', '')} aria-hidden="true" className="pointer-events-none opacity-30 blur-[2px] select-none">
        <Preview><Screen /></Preview>
      </div>
      <div className="absolute inset-0 flex justify-center px-4 pt-16">
        <section className="sticky top-16 h-fit w-full max-w-md rounded-card border border-line-bright bg-surface p-6 text-center">
          <h1 className="m-0 text-2xl font-bold text-ink">{m.title}</h1>
          <h2 className="mt-4 mb-0 font-display text-lg font-semibold text-gold-bright">Coming soon</h2>
          <p className="mt-1.5 mb-0 text-sm text-pretty text-ink-2">
            {m.title} is still being finished and opens in a later release of Keystone. This is how it will look; nothing on
            it can be changed yet.
          </p>
        </section>
      </div>
    </div>
  );
}

/** `m` as a screen that shows behind a notice that it is coming soon. */
export function comingSoon(m: ModuleDef): ModuleDef {
  function Screen() {
    return <ComingSoonScreen module={m} />;
  }

  return { ...m, finding: undefined, soon: true, Screen };
}
