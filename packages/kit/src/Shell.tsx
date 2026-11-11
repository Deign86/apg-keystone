import { Button, KeyBadge, Sheet, cn } from '@keystone/ui';
import { Menu } from 'lucide-react';
import keystoneMark from '@keystone/ui/keystone-mark.png';
import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { useKeystone } from './context';
import type { ModuleDef } from './registry';
import { IdleSignOut, SignOutButton } from './Session';
import { UpdateNotice } from './UpdateNotice';

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

const shortcutKey = () => (navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+');

/** The mark and the company's name, which go to the first screen. */
function Brand({ onGo }: { onGo?: () => void }) {
  const { registry, go, store } = useKeystone();

  return (
    <button type="button" onClick={() => { if (registry.modules[0]) go(registry.modules[0].id); onGo?.(); }} className="flex min-w-0 items-center gap-2.5 rounded-control text-left">
      <img src={keystoneMark} alt="" className="size-[38px] shrink-0 object-contain" />
      <span className="min-w-0">
        <span className="block font-display text-[11px] leading-tight font-bold text-ink">
          ALPHA PREMIER <span className="text-gold-bright">KEYSTONE</span>
        </span>
        <span className="mt-0.5 block truncate text-[11px] leading-snug text-ink-2">{store.ctx.seed.company.shortAddress}</span>
      </span>
    </button>
  );
}

/** Who is using Keystone and where the records are kept, signing out, the save error if any, and the keys. */
function RailFoot() {
  const { registry, store, platform } = useKeystone();
  const mod = shortcutKey();
  const who = platform.who;

  return (
    <div className="mt-auto text-[11.5px] leading-relaxed text-ink-2">
      <UpdateNotice />
      <p className="m-0 flex items-center gap-1.5 font-semibold text-ink">
        <span aria-hidden="true" className="size-[7px] rounded-full bg-good" />
        {who ? `${who.name} · ${who.role === 'owner' ? 'Owner' : 'Staff'}` : 'Administrator access'}
      </p>
      <p className="m-0">{who ? 'Saved in APG\'s records in the cloud' : platform.kind === 'desktop' ? 'Saved on this computer' : 'Browser preview · saved in this browser'}</p>
      <SignOutButton />
      {store.saveError && <p role="alert" className="m-0 text-bad">{store.saveError}</p>}
      {/* A phone has no keyboard to press them on. */}
      <p className="m-0 hidden text-[11px] text-ink-3 md:block">{mod}0 home · {mod}1–{mod}{Math.min(9, registry.modules.length - 1)} screens</p>
    </div>
  );
}

/** The screens in rail order, with their shortcut badges. `onGo` runs after one is picked: the phone's menu closes. */
function Screens({ onGo }: { onGo?: () => void }) {
  const { registry, route, go } = useKeystone();
  const mod = shortcutKey();

  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
      {registry.modules.map((m, i) => {
        const active = route === m.id;

        return (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => { go(m.id); onGo?.(); }}
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
  );
}

/** The rail, from 768px wide: the brand, the screens and the foot. */
function Rail() {
  return (
    <nav aria-label="Keystone" className="hidden h-dvh w-[var(--size-rail)] shrink-0 flex-col gap-6 border-r border-line bg-bg py-5 pr-3.5 pl-4 md:flex">
      <Brand />
      <Screens />
      <RailFoot />
    </nav>
  );
}

/** Narrower than 768px (a phone): a bar with the brand, and the rail behind a menu button. */
function TopBar() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-bg px-4 py-2.5 md:hidden">
      <Brand />
      <Button size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Menu size={14} aria-hidden="true" />
        Menu
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Keystone">
        <nav aria-label="Keystone" className="flex flex-col gap-5">
          <Screens onGo={close} />
          <RailFoot />
        </nav>
      </Sheet>
    </header>
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
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      <TopBar />
      <Rail />
      <main id="main" className="min-w-0 flex-1 overflow-y-auto">
        {active ? (
          <div key={active.id} className="mx-auto max-w-[var(--size-content)] px-4 pt-5 pb-14 md:px-8 md:pt-7 motion-safe:animate-[fade-in_180ms_ease-out]">
            <ModuleBoundary module={active}>
              <active.Screen />
            </ModuleBoundary>
          </div>
        ) : (
          <p className="m-8 text-ink-2">No screens are installed. Add a module to apps/keystone/src/modules.ts.</p>
        )}
      </main>
      <IdleSignOut />
    </div>
  );
}
