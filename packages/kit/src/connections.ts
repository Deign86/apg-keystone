import { withDeadline, type Connector, type ConnectorEnv, type Figure, type Health } from '@keystone/core';
import type { Platform } from './platform';

export interface ConnectorStatus {
  health: Health | null;
  figures: Figure[] | null;
  checkedAt: number;
}

const CHECK_MS = 8000;
const NOT_CHECKED: ConnectorStatus = { health: null, figures: null, checkedAt: 0 };

/**
 * Runs the connected systems. Every call goes through `safely`, which adds a deadline
 * and turns any failure into an `error` or `offline` health, so a system that is down,
 * slow or not installed shows as such on its own card and nowhere else.
 */
export class Connections {
  private settings: Record<string, Record<string, string>> = {};
  private status = new Map<string, ConnectorStatus>();
  private listeners = new Set<() => void>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(private platform: Platform, readonly connectors: Connector[]) {}

  async load() {
    this.settings = await this.platform.loadSettings().catch(() => ({}));
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private all: { id: string; status: ConnectorStatus }[] = [];

  private emit() {
    this.all = this.connectors.map((c) => ({ id: c.id, status: this.statusOf(c.id) }));
    this.listeners.forEach((fn) => fn());
  }

  /** Every connector's status, stable until the next refresh. */
  allStatuses = () => this.all;

  get(id: string) {
    return this.connectors.find((c) => c.id === id);
  }

  /** Stable until the next refresh, as useSyncExternalStore requires. */
  statusOf(id: string): ConnectorStatus {
    return this.status.get(id) ?? NOT_CHECKED;
  }

  settingsOf(c: Connector): Record<string, string> {
    const saved = this.settings[c.id] ?? {};
    return Object.fromEntries(c.settings.filter((f) => f.kind !== 'secret').map((f) => [f.key, saved[f.key] ?? f.default ?? '']));
  }

  env(c: Connector): ConnectorEnv {
    return {
      settings: this.settingsOf(c),
      secret: (key) => this.platform.secret(`${c.id}.${key}`),
      http: this.platform.http,
      system: this.platform,
      now: () => new Date(),
    };
  }

  /** Saves settings and secrets (secrets go to the keychain, never to the settings file). */
  async configure(c: Connector, values: Record<string, string>, secrets: Record<string, string | null>) {
    this.settings = { ...this.settings, [c.id]: values };
    await this.platform.saveSettings(this.settings);
    for (const [key, value] of Object.entries(secrets)) {
      await this.platform.setSecret(`${c.id}.${key}`, value);
    }
    await this.refresh(c);
  }

  async safely<T>(c: Connector, what: string, work: (env: ConnectorEnv) => Promise<T>, ms = CHECK_MS): Promise<T> {
    try {
      return await withDeadline(work(this.env(c)), ms, c.name);
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : `${c.name}: ${what} failed.`);
    }
  }

  async refresh(c: Connector) {
    let health: Health;
    try {
      health = await this.safely(c, 'health check', (env) => c.health(env));
    } catch (e) {
      health = { state: 'offline', detail: e instanceof Error ? e.message : String(e) };
    }
    let figures: Figure[] | null = null;
    if (health.state === 'ready' && c.figures) {
      figures = await this.safely(c, 'figures', (env) => c.figures!(env)).catch(() => null);
    }
    this.status.set(c.id, { health, figures, checkedAt: Date.now() });
    this.emit();
  }

  /** Checks every system now, then on each one's own schedule. */
  start() {
    for (const c of this.connectors) {
      void this.refresh(c);
      clearInterval(this.timers.get(c.id));
      this.timers.set(c.id, setInterval(() => void this.refresh(c), (c.refreshSeconds ?? 60) * 1000));
    }
  }

  stop() {
    this.timers.forEach((t) => clearInterval(t));
    this.timers.clear();
  }
}
