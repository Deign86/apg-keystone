import { useNotify } from '@keystone/ui';
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode,
} from 'react';
import { importEmployees, type Change, type Connector, type Ctx, type ServiceName, type TerminalState } from '@keystone/core';
import type { Platform } from './platform';
import type { Connections } from './connections';
import { findService, type ModuleApp, type Registry } from './registry';
import type { KeystoneStore, Outcome } from './store';

interface KeystoneContextValue {
  store: KeystoneStore;
  registry: Registry;
  connections: Connections;
  platform: Platform;
  route: string;
  go: (id: string) => void;
}

const KeystoneContext = createContext<KeystoneContextValue | null>(null);

export function KeystoneProvider({ store, registry, connections, children }: { store: KeystoneStore; registry: Registry; connections: Connections; children: ReactNode }) {
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
  const value = useMemo(() => ({ store, registry, connections, platform: store.platform, route, go }), [store, registry, connections, route, go]);

  return <KeystoneContext.Provider value={value}>{children}</KeystoneContext.Provider>;
}

function useCtx() {
  const v = useContext(KeystoneContext);

  if (!v) throw new Error('useKeystone outside KeystoneProvider');

  return v;
}

/** The state, the rules' context, and `run`, which applies a rule and shows its result. */
export function useKeystone() {
  const { store, registry, connections, platform, route, go } = useCtx();
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const notify = useNotify();

  const run = useCallback(<T,>(rule: (s: TerminalState, ctx: Ctx) => Change<T>, quiet = false): Outcome<T> => {
    const r = store.run(rule);

    if (r.ok && !quiet) notify(r.message);

    if (!r.ok) notify(r.error, 'error');

    return r;
  }, [store, notify]);

  return { state, ctx: store.ctx, run, store, registry, connections, platform, route, go, notify };
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

/** A connector's live health and figures, refreshed on its own schedule. */
export function useConnectorStatus(id: string) {
  const { connections } = useCtx();

  return useSyncExternalStore(connections.subscribe, () => connections.statusOf(id));
}

/** Every connector's status at once. */
export function useAllConnectorStatuses() {
  const { connections } = useCtx();

  return useSyncExternalStore(connections.subscribe, connections.allStatuses);
}

/** Imports a connector's people (and their photos) into the directory. */
export function useImportPeople() {
  const { store, connections, platform } = useCtx();
  const notify = useNotify();

  return useCallback(async (c: Connector): Promise<boolean> => {
    if (!c.people) return false;

    try {
      const got = await connections.safely(c, 'import', (env) => c.people!.fetch(env), 120000);
      const files = new Map<string, string>();

      for (const p of got.photos) {
        const ext = p.type === 'image/webp' ? 'webp' : p.type === 'image/png' ? 'png' : 'jpg';
        const name = `${c.id}-${p.externalId.replace(/[^A-Za-z0-9._-]/g, '_')}.${ext}`;
        await platform.putPhoto(name, p.bytes);
        files.set(p.externalId, name);
      }

      const people = got.people.map((p) => (files.has(p.externalId) ? { ...p, photo: files.get(p.externalId) } : p));
      const r = store.run((s, ctx) => importEmployees(s, { id: c.id, name: c.name }, people, ctx));
      notify(r.ok ? `${r.message} Source: ${got.source}.` : r.error, r.ok ? 'success' : 'error');

      return r.ok;
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');

      return false;
    }
  }, [store, connections, platform, notify]);
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
