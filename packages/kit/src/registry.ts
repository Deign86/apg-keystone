import type { ComponentType } from 'react';
import {
  validateConnector, type Connector, type Ctx, type Figure, type Finding, type TerminalState, type WaitingItem,
} from '@keystone/core';

/**
 * What a module may ask of the app. Modules never import each other; when one needs
 * another (Overview opening a voucher), it goes through this, and `has` tells it
 * whether that module is installed at all.
 */
export interface ModuleApp {
  go(moduleId: string): void;
  has(moduleId: string): boolean;
  /** Puts a draft where a module's form will pick it up next time it opens. */
  setDraft<T>(key: string, draft: T): void;
  /** A service another module provides (see SERVICES in @keystone/core), or undefined if none is installed. */
  service<T>(name: string): T | undefined;
  state: TerminalState;
  ctx: Ctx;
}

/**
 * A screen in Keystone, and everything it contributes to the rest of the app.
 * Overview, Home, Activity and Settings are built from these contributions, so taking a
 * module out removes its contributions with it and nothing else changes.
 */
export interface ModuleDef {
  /** Stable id: the route (#vouchers), the key in `requires`. Lowercase letters, digits, dashes. */
  id: string;
  title: string;
  /** Eyebrow over the screen title. */
  section: string;
  /** The line on its home-screen tile. */
  blurb: string;
  /** Rail position; the rail numbers modules 0, 1, 2… in this order for ⌘/Ctrl+number. */
  order: number;
  Screen: ComponentType;

  /** Ids of modules this one cannot work without. If one is missing, this module is left out, with the reason shown in Connections. */
  requires?: string[];
  /** Show as a tile on Home. */
  onHome?: boolean;
  /** The live figure on its Home tile: [label, value]. */
  stat?: (state: TerminalState, ctx: Ctx) => [string, string];
  /** Its cell in the Overview figure strip. */
  figure?: (state: TerminalState, ctx: Ctx) => Figure;
  /** Its candidate for the one sentence under Home and Overview. */
  finding?: (state: TerminalState, ctx: Ctx) => Finding | null;
  /** Records waiting on someone, listed on Overview. */
  waiting?: (state: TerminalState, ctx: Ctx) => WaitingItem[];
  /** Opens one of its waiting items (load it into the form, then go there). */
  openWaiting?: (no: string, app: ModuleApp) => void;
  /** A "New …" action shown on Overview. */
  create?: { label: string; run: (app: ModuleApp) => void };
  /** The activity-log tags this module writes, with their filter label: { CV: 'Vouchers' }. */
  logTags?: Record<string, string>;
  /** Housekeeping when Keystone opens (statements past due become Overdue). */
  onOpen?: (state: TerminalState, ctx: Ctx) => TerminalState;
  /** Services this module offers other parts, by published name: { [SERVICES.statementPayments]: impl }. */
  provides?: Record<string, unknown>;
}

/** A connected system plus any screens it brings with it. */
export interface ConnectorPlugin {
  connector: Connector;
  modules?: ModuleDef[];
}

export interface Registry {
  modules: ModuleDef[];
  connectors: Connector[];
  /** Definitions that were left out, with the reason, shown in Connections. */
  refused: { id: string; reason: string }[];
}

const ID = /^[a-z][a-z0-9-]*$/;

/**
 * Builds the registry once at start. A broken or incomplete part (duplicate id, a
 * missing requirement, no health check) is left out with its reason instead of taking
 * the app down.
 */
export function buildRegistry(builtIn: ModuleDef[], plugins: ConnectorPlugin[]): Registry {
  const refused: Registry['refused'] = [];
  const connectors: Connector[] = [];
  const contributed: ModuleDef[] = [];

  for (const p of plugins) {
    const problem = validateConnector(p.connector, connectors.map((c) => c.id));

    if (problem) {
      refused.push({ id: p.connector.id, reason: problem });
      continue;
    }

    connectors.push(p.connector);
    contributed.push(...(p.modules ?? []));
  }

  const seen = new Set<string>();

  let modules = [...builtIn, ...contributed].sort((a, b) => a.order - b.order).filter((m) => {
    if (!ID.test(m.id)) {
      refused.push({ id: m.id, reason: `Module id "${m.id}" must be lowercase letters, digits and dashes.` });

      return false;
    }

    if (seen.has(m.id)) {
      refused.push({ id: m.id, reason: `Two modules use the id "${m.id}".` });

      return false;
    }

    seen.add(m.id);

    return true;
  });

  // Leave out modules whose requirements are missing, repeating until nothing changes
  // (a module that needed one just left out goes too).
  for (let changed = true; changed;) {
    changed = false;
    const present = new Set(modules.map((m) => m.id));
    modules = modules.filter((m) => {
      const missing = (m.requires ?? []).filter((r) => !present.has(r));

      if (!missing.length) return true;
      refused.push({ id: m.id, reason: `${m.title} needs ${missing.join(', ')}, which ${missing.length === 1 ? 'is' : 'are'} not installed.` });
      changed = true;

      return false;
    });
  }

  // One provider per service: a second module offering the same one is left out, so a
  // consumer never gets whichever happened to load first.
  const offered = new Map<string, string>();
  modules = modules.filter((m) => {
    const taken = Object.keys(m.provides ?? {}).filter((s) => offered.has(s));

    if (taken.length) {
      refused.push({ id: m.id, reason: `${m.title} offers ${taken.join(', ')}, which ${offered.get(taken[0])} already provides.` });

      return false;
    }

    for (const s of Object.keys(m.provides ?? {})) offered.set(s, m.title);

    return true;
  });

  return { modules, connectors, refused };
}

/** The provider of a named service among the installed modules, if any. */
export function findService<T>(modules: ModuleDef[], name: string): T | undefined {
  for (const m of modules) {
    if (m.provides && name in m.provides) return m.provides[name] as T;
  }

  return undefined;
}
