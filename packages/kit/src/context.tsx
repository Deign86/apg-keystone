import { useNotify } from '@keystone/ui';
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode,
} from 'react';
import { DEADLINES, type Change, type Connector, type ConnectorEnv, type ConnectorUpdate, type Ctx, type ServiceName, type SystemBridge, type TerminalState } from '@keystone/core';
import type { AppAccounts, Platform } from './platform';
import { findService, type ModuleApp, type Registry } from './registry';
import type { KeystoneStore, Outcome } from './store';

/** Asking the person where to save a file, or for one to open. */
export interface Files {
  /** Asks where to save, then writes. Returns the file's name, or null if cancelled. */
  save: Platform['saveFile'];
  /** Asks for one file and reads it. Null if cancelled. */
  open: Platform['openFile'];
}

/** The card photos kept beside the records. Read one with `usePhoto`. */
export interface Photos {
  put: Platform['putPhoto'];
}

/** Everything Keystone holds, replaced at once from a backup. Half-filled forms are dropped with it. */
export interface Backup {
  restore(next: TerminalState): void;
}

/** What a screen may do to the machine: each capability by name, never the store or the platform themselves. */
interface Capabilities {
  files: Files;
  photos: Photos;
  backup: Backup;
  /** Where the records are kept when nobody signs in: this computer's data folder, or this browser. */
  kind: Platform['kind'];
  /** Who may open the records in the cloud. Absent with no sign-in. */
  accounts?: AppAccounts;
}

interface KeystoneContextValue {
  store: KeystoneStore;
  registry: Registry;
  platform: Platform;
  capabilities: Capabilities;
  route: string;
  go: (id: string) => void;
}

function capabilitiesOf(store: KeystoneStore): Capabilities {
  const p = store.platform;
  const accounts = p.accounts;

  return {
    files: { save: (name, bytes, filters) => p.saveFile(name, bytes, filters), open: (filters) => p.openFile(filters) },
    photos: { put: (name, bytes) => p.putPhoto(name, bytes) },
    backup: { restore: (next) => store.replaceAll(next) },
    kind: p.kind,
    ...(accounts && {
      accounts: {
        ...accounts,
        // The rail and the rules see the new name from the next change on (docs/adr/0020): the caller's log line.
        rename: async (name) => {
          await accounts.rename(name);

          if (store.ctx.who) store.ctx = { ...store.ctx, who: { ...store.ctx.who, name } };
        },
      },
    }),
  };
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
  const capabilities = useMemo(() => capabilitiesOf(store), [store]);
  const value = useMemo(() => ({ store, registry, platform: store.platform, capabilities, route, go }), [store, registry, capabilities, route, go]);

  return <KeystoneContext.Provider value={value}>{children}</KeystoneContext.Provider>;
}

function useCtx() {
  const v = useContext(KeystoneContext);

  if (!v) throw new Error('useKeystone outside KeystoneProvider');

  return v;
}

/** The store and the platform themselves, for the kit's own shell (saving, signing out, updating). Never for a screen. */
export function useRuntime() {
  const { store, platform } = useCtx();

  return { store, platform };
}

/**
 * The state, the rules' context, `run`, which applies a rule, shows its result and returns the state after it, and the
 * capabilities a screen may use: files, photos, the backup.
 */
export function useKeystone() {
  const { store, registry, capabilities, route, go } = useCtx();
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const notify = useNotify();

  const run = useCallback(<T,>(rule: (s: TerminalState, ctx: Ctx) => Change<T>): Outcome<T> => {
    const r = store.run(rule);

    if (r.ok) notify(r.message);
    else notify(r.error, 'error');

    return r;
  }, [store, notify]);

  return { state, ctx: store.ctx, run, registry, route, go, notify, ...capabilities };
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

/** What a connector is handed: the operating system and nothing else of the platform (no records, accounts or session). */
function systemOf(p: Platform): SystemBridge {
  return {
    platform: p.platform,
    // Read when asked: the desktop learns its processor a moment after it starts.
    get arch() { return p.arch; },
    latestRelease: p.latestRelease?.bind(p),
    installFrom: p.installFrom?.bind(p),
    locateApp: (locator) => p.locateApp(locator),
    launchApp: (app) => p.launchApp(app),
    openUrl: (url) => p.openUrl(url),
  };
}

/**
 * Runs one connector call. It has a few seconds (`DEADLINES.answerMs`), unless it says it is doing something slow
 * (`env.slow`): then it has the time a download needs (`DEADLINES.installMs`), and `doing` hears what to show meanwhile.
 * Work that answers after its deadline is ignored; the native download has given up by then (core's `DEADLINES`).
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

    within(DEADLINES.answerMs);

    try {
      return await Promise.race([work({ system: systemOf(platform), slow: (what) => { within(DEADLINES.installMs); doing?.(what); } }), deadline]);
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

    if (c.update) {
      void call(c.name, undefined, (env) => c.update?.(env) ?? Promise.resolve(null)).then(
        (u) => { if (alive) setUpdate(u); },
        // Never a reason the shortcut fails, but never dropped without a word either.
        (cause: unknown) => console.warn(`Keystone could not check ${c.name} for an update; it tries again when Home next opens.`, cause),
      );
    }

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
