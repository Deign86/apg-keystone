import type { ComponentType } from 'react';
import { validateConnector, type Connector, type Ctx, type TerminalState } from '@keystone/core';

/**
 * A screen in Keystone. Built-in modules (vouchers, billing…) and modules contributed by
 * connectors (the website inbox) are the same shape and register the same way.
 */
export interface ModuleDef {
  /** Stable id, also the route and the log tag namespace. */
  id: string;
  title: string;
  /** Eyebrow over the screen title. */
  section: string;
  /** The line on its home-screen tile. */
  blurb: string;
  /** Rail position; the rail numbers modules 0, 1, 2… in this order for ⌘/Ctrl+number. */
  order: number;
  /** The live figure on its home tile: [label, value]. */
  stat?: (state: TerminalState, ctx: Ctx) => [string, string];
  /** Show as a tile on the home screen. */
  onHome?: boolean;
  Screen: ComponentType;
}

/** A connected system plus any screens it brings with it. */
export interface ConnectorPlugin {
  connector: Connector;
  modules?: ModuleDef[];
}

export interface Registry {
  modules: ModuleDef[];
  connectors: Connector[];
  /** Definitions that were refused, with the reason, shown in Settings › Connections. */
  refused: { id: string; reason: string }[];
}

/**
 * Builds the registry once at start. A broken definition (duplicate id, missing health
 * check) is refused with its reason instead of taking the app down.
 */
export function buildRegistry(builtIn: ModuleDef[], plugins: ConnectorPlugin[]): Registry {
  const refused: Registry['refused'] = [];
  const connectors: Connector[] = [];
  const modules: ModuleDef[] = [];

  for (const p of plugins) {
    const problem = validateConnector(p.connector, connectors.map((c) => c.id));
    if (problem) {
      refused.push({ id: p.connector.id, reason: problem });
      continue;
    }
    connectors.push(p.connector);
    modules.push(...(p.modules ?? []));
  }

  const ids = new Set<string>();
  const all = [...builtIn, ...modules].sort((a, b) => a.order - b.order);
  const accepted = all.filter((m) => {
    if (!/^[a-z][a-z0-9-]*$/.test(m.id)) { refused.push({ id: m.id, reason: `Module id "${m.id}" must be lowercase letters, digits and dashes.` }); return false; }
    if (ids.has(m.id)) { refused.push({ id: m.id, reason: `Two modules use the id "${m.id}".` }); return false; }
    ids.add(m.id);
    return true;
  });
  return { modules: accepted, connectors, refused };
}
