import { useNotify } from '@keystone/ui';
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode,
} from 'react';
import { type Change, type Connector, type ConnectorEnv, type ConnectorUpdate, type Ctx, type ServiceName, type TerminalState } from '@keystone/core';
import type { Platform } from './platform';
import { findService, type ModuleApp, type Registry } from './registry';
import type { KeystoneStore, Outcome } from './store';

interface KeystoneContextValue {
  store: KeystoneStore;
  registry: Registry;
  platform: Platform;
  route: string;
  go: (id: string) => void;
}

const KeystoneContext = createContext<KeystoneContextValue | null>(null);

export function KeystoneProvider({ store, registry, children }: { store: KeystoneStore; registry: Registry; children: ReactNode }) {
  // The route lives in the address (#vouchers), so screens can be linked to and reloads keep their place.
  const known = useCallback((id: string) => registry.modules.some((m) => m.id === id), [registry]);
  const start = registry.modules.some((m) => m.id === 'home') ? 'home' : registry.modules[0]?.id ?? '';

  const [route, setRoute] = useState(() => {
    const fromHash = location.hash.slice(1);

    return known(fromHash) ? fromHash : start;
  });

  const go = useCallback((id: string) => {
    if (!known(id)) return;
    setRoute(id);
    history.replaceState(null, '', `#${id}`);
  }, [known]);

  useEffect(() => {
    const onHash = () => {
      const id = location.hash.slice(1);

      if (known(id)) setRoute(id);
    };

    window.addEventListener('hashchange', onHash);

    return () => window.removeEventListener('hashchange', onHash);
  }, [known]);
  const value = useMemo(() => ({ store, registry, platform: store.platform, route, go }), [store, registry, route, go]);

  return <KeystoneContext.Provider value={value}>{children}</KeystoneContext.Provider>;
}

function useCtx() {
  const v = useContext(KeystoneContext);

  if (!v) throw new Error('useKeystone outside KeystoneProvider');

  return v;
}

/** The state, the rules' context, and `run`, which applies a rule and shows its result. */
export function useKeystone() {
  const { store, registry, platform, route, go } = useCtx();
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const notify = useNotify();

  const run = useCallback(<T,>(rule: (s: TerminalState, ctx: Ctx) => Change<T>, quiet = false): Outcome<T> => {
    const r = store.run(rule);

    if (r.ok && !quiet) notify(r.message);

    if (!r.ok) notify(r.error, 'error');

    return r;
  }, [store, notify]);

  return { state, ctx: store.ctx, run, store, registry, platform, route, go, notify };
}

/** The app as a module sees it: navigation, drafts, and whether another module is installed. */
export function useModuleApp(): ModuleApp {
  const { store, registry, go } = useCtx();
  const state = useSyncExternalStore(store.subscribe, store.getState);

  return useMemo(() => ({
    go,
    has: (id: string) => registry.modules.some((m) => m.id === id),
    setDraft: <T,>(key: string, draft: T) => store.setDraft(key, draft),
    service: <N extends ServiceName>(name: N) => findService(registry.modules, name),
    state,
    ctx: store.ctx,
  }), [go, registry, store, state]);
}

/** A form draft that survives switching screens. */
export function useDraft<T>(key: string, make: () => T): [T, (next: T) => void] {
  const { store } = useCtx();
  const [value, setValue] = useState<T>(() => store.draft(key, make));

  const set = useCallback((next: T) => {
    store.setDraft(key, next);
    setValue(next);
  }, [store, key]);

  return [value, set];
}

/** How long opening another app may take (finding it on macOS can take a few seconds) before Keystone says so. */
const OPEN_MS = 15_000;

/** How long fetching an installer may take: they run to 150 MB, on an office line. */
const INSTALL_MS = 20 * 60_000;

/**
 * Runs one connector call. It has a few seconds, unless it says it is doing something slow (`env.slow`): then it has
 * the time a download needs, and `doing` hears what to show meanwhile.
 */
function useConnectorCall() {
  const { platform } = useCtx();

  return useCallback(async <T,>(name: string, doing: ((what: string) => void) | undefined, work: (env: ConnectorEnv) => Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let late: (e: Error) => void = () => {};
    const deadline = new Promise<never>((_, reject) => { late = reject; });

    const within = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => late(new Error(`${name} did not answer within ${ms >= 60_000 ? `${Math.round(ms / 60_000)} minutes` : `${Math.round(ms / 1000)} seconds`}.`)), ms);
    };

    within(OPEN_MS);

    try {
      return await Promise.race([work({ system: platform, slow: (what) => { within(INSTALL_MS); doing?.(what); } }), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }, [platform]);
}

/** Opens a connected system's app, and says what happened when it did something else or could not. */
export function useOpenConnector() {
  const call = useConnectorCall();
  const notify = useNotify();

  return useCallback(async (c: Connector, doing?: (what: string) => void) => {
    try {
      const said = await call(c.name, doing, (env) => c.open(env));

      if (said) notify(said);
    } catch (e) {
      notify(e instanceof Error ? e.message : `${c.name} did not open.`, 'error');
    }
  }, [call, notify]);
}

/**
 * The newer version of a connected app that Keystone can install, for an app with no updater of its own; null when
 * there is none, the app updates itself, or Keystone cannot tell. `install` fetches and opens its installer.
 */
export function useConnectorUpdate(c: Connector) {
  const call = useConnectorCall();
  const notify = useNotify();
  const [update, setUpdate] = useState<ConnectorUpdate | null>(null);

  useEffect(() => {
    let alive = true;

    if (c.update) void call(c.name, undefined, (env) => c.update?.(env) ?? Promise.resolve(null)).then((u) => { if (alive) setUpdate(u); }, () => {});

    return () => { alive = false; };
  }, [c, call]);

  const install = useCallback(async (doing?: (what: string) => void) => {
    if (!update) return;

    try {
      const said = await call(c.name, doing, (env) => update.install(env));

      if (said) notify(said);
      setUpdate(null);
    } catch (e) {
      notify(e instanceof Error ? e.message : `${c.name} could not be updated.`, 'error');
    }
  }, [c, call, notify, update]);

  return update ? { version: update.version, install } : null;
}

/** A photo from the photo folder as an object URL, or null. */
export function usePhoto(name: string | undefined) {
  const { platform } = useCtx();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;

    if (!name) {
      setUrl(null);

      return;
    }

    platform.photoUrl(name).then((u) => {
      made = u;

      if (alive) setUrl(u);
    });

    return () => {
      alive = false;

      if (made) URL.revokeObjectURL(made);
    };
  }, [platform, name]);

  return url;
}
