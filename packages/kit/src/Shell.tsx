import { KeyBadge, cn } from '@keystone/ui';
import logo from '@keystone/ui/logo.png';
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { useKeystone } from './context';
import type { ModuleDef } from './registry';

/** One module failing to render shows its own error; the rail and every other module keep working. */
interface BoundaryState { error: Error | null }

class ModuleBoundary extends Component<{ module: ModuleDef; children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Module ${this.props.module.id} failed`, error, info.componentStack);
  }
  componentDidUpdate(prev: { module: ModuleDef }) {
    if (prev.module.id !== this.props.module.id && this.state.error) this.setState({ error: null });
  }
  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div role="alert" className="rounded-card border border-bad/50 bg-surface p-6">
        <p className="eyebrow m-0 text-bad">{this.props.module.title}</p>
        <h1 className="mt-2 mb-0 text-xl font-bold">This screen hit a problem</h1>
        <p className="mt-2 mb-4 text-sm text-ink-2">{this.state.error.message}. The rest of Keystone is unaffected and your data is safe.</p>
        <button type="button" className="h-9 rounded-control border border-line-bright px-3.5 text-[13px] font-semibold text-gold-bright hover:border-gold" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}

function Rail() {
  const { registry, route, go, store, platform } = useKeystone();
  const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+';

  return (
    <nav aria-label="Keystone" className="flex h-dvh w-[var(--size-rail)] shrink-0 flex-col gap-6 border-r border-line bg-bg py-5 pr-3.5 pl-4">
      <button type="button" onClick={() => registry.modules[0] && go(registry.modules[0].id)} className="flex items-center gap-2.5 rounded-control text-left">
        <img src={logo} alt="" className="size-[38px] shrink-0 object-contain" />
        <span className="min-w-0">
          <span className="block font-display text-[11px] leading-tight font-bold text-ink">
            ALPHA PREMIER <span className="text-gold-bright">KEYSTONE</span>
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-ink-2">{store.ctx.seed.company.shortAddress}</span>
        </span>
      </button>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {registry.modules.map((m, i) => {
          const active = route === m.id;

          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => go(m.id)}
                aria-current={active ? 'page' : undefined}
                title={i < 10 ? `${m.title} (${mod}${i})` : m.title}
                className={cn(
                  'relative flex h-[38px] w-full items-center gap-2.5 rounded-control px-2.5 text-left text-[13px] font-semibold',
                  active ? 'text-gold-bright' : 'text-ink-2 hover:bg-surface hover:text-ink',
                )}
              >
                <KeyBadge n={i} active={active} />
                <span className="truncate">{m.title}</span>
                {/* The one selection mark: a 1px gold line on the rail's edge. */}
                <span aria-hidden="true" className={cn('absolute top-1.5 -right-3.5 bottom-1.5 w-px bg-gold transition-opacity duration-150', active ? 'opacity-100' : 'opacity-0')} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto text-[11.5px] leading-relaxed text-ink-2">
        <p className="m-0 flex items-center gap-1.5 font-semibold text-ink">
          <span aria-hidden="true" className="size-[7px] rounded-full bg-good" />
          Administrator access
        </p>
        <p className="m-0">{platform.kind === 'desktop' ? 'Saved on this computer' : 'Browser preview · saved in this browser'}</p>
        {store.saveError && <p role="alert" className="m-0 text-bad">{store.saveError}</p>}
        <p className="m-0 text-[11px] text-ink-3">{mod}0 home · {mod}1–{mod}{Math.min(9, registry.modules.length - 1)} screens</p>
      </div>
    </nav>
  );
}

export function Shell() {
  const { registry, route, go } = useKeystone();
  const active = registry.modules.find((m) => m.id === route) ?? registry.modules[0];

  // ⌘/Ctrl + number opens the module at that rail position.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const n = Number(e.key);

      if (!Number.isInteger(n) || !registry.modules[n]) return;
      e.preventDefault();
      go(registry.modules[n].id);
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [registry, go]);

  // Each screen starts at the top.
  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 });
  }, [route]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Rail />
      <main id="main" className="min-w-0 flex-1 overflow-y-auto">
        {active ? (
          <div key={active.id} className="mx-auto max-w-[var(--size-content)] px-8 pt-7 pb-14 motion-safe:animate-[fade-in_180ms_ease-out]">
            <ModuleBoundary module={active}>
              <active.Screen />
            </ModuleBoundary>
          </div>
        ) : (
          <p className="m-8 text-ink-2">No screens are installed. Add a module to apps/keystone/src/modules.ts.</p>
        )}
      </main>
    </div>
  );
}
