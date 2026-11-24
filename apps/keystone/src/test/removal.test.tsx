import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Connector } from '@keystone/core';
import { App, buildRegistry, KeystoneStore, type ModuleDef, type Platform } from '@keystone/kit';
import { connectors } from '../connectors';
import { builtInModules } from '../modules';
import { browserPlatform } from '../platform/browser';

// The modular-first promise, tested: take any one module or any one connected system
// out, or install any one of them alone, and every screen there is still renders, with
// no error and no broken link.

const platform: Platform = {
  ...browserPlatform,
  loadState: async () => null,
  saveState: async () => {},
};

const scenarios: [string, ModuleDef[], Connector[]][] = [
  ['everything installed', builtInModules, connectors],
  ...builtInModules.map((m): [string, ModuleDef[], Connector[]] => [`without the ${m.id} module`, builtInModules.filter((x) => x !== m), connectors]),
  ...connectors.map((p): [string, ModuleDef[], Connector[]] => [`without the ${p.id} connector`, builtInModules, connectors.filter((x) => x !== p)]),
  ...builtInModules.map((m): [string, ModuleDef[], Connector[]] => [`the ${m.id} module on its own`, [m], []]),
  ...connectors.map((p): [string, ModuleDef[], Connector[]] => [`the ${p.id} connector on its own`, [], [p]]),
  ['nothing but the kernel', [], []],
];

afterEach(() => {
  window.location.hash = '';
});

describe.each(scenarios)('%s', (_name, modules, connectorPlugins) => {
  it('renders every remaining screen without errors', async () => {
    const registry = buildRegistry(modules, connectorPlugins);
    // Nothing that ships is refused, whatever else is taken out.
    expect(registry.refused).toEqual([]);

    const store = await KeystoneStore.open(platform, registry.modules.flatMap((m) => (m.onOpen ? [m.onOpen] : [])));

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const routes = registry.modules.length ? registry.modules : [null];

      for (const m of routes) {
        window.location.hash = m ? `#${m.id}` : '';
        const view = render(<App store={store} registry={registry} />);
        await act(async () => {});
        expect(screen.queryByText('This screen hit a problem')).toBeNull();

        if (m) {
          const current = within(screen.getByRole('navigation', { name: 'Keystone' })).getByRole('button', { current: 'page' });
          expect(current).toHaveTextContent(m.title);
          expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0);
        } else {
          expect(screen.getByText(/No screens are installed/)).toBeInTheDocument();
        }

        view.unmount();
      }

      expect(errors).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  }, 30000);
});

it('every shipped part has a distinct id and loads without refusal', () => {
  const r = buildRegistry(builtInModules, connectors);
  expect(r.refused).toEqual([]);
  expect(r.modules.map((m) => m.id)).toEqual([...new Set(r.modules.map((m) => m.id))]);
  expect(r.modules.map((m) => m.id)).toEqual(expect.arrayContaining(['home', 'vouchers', 'billing', 'directory', 'activity', 'data']));
  expect(r.connectors.map((c) => c.id)).toEqual(['attendance', 'id-maker-app', 'branding-studio', 'website']);
});

it('a module that crashes shows its own error and leaves the rest working', async () => {
  const Broken = () => { throw new Error('Kaput'); };
  const registry = buildRegistry([...builtInModules, { id: 'broken', title: 'Broken', blurb: '', order: 50, Screen: Broken }], []);
  const store = await KeystoneStore.open(platform);
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  window.location.hash = '#broken';
  const view = render(<App store={store} registry={registry} />);
  await act(async () => {});
  expect(screen.getByRole('alert')).toHaveTextContent('Kaput');
  // The rail still works: open another module.
  await act(async () => { within(screen.getByRole('navigation', { name: 'Keystone' })).getByRole('button', { name: /Directory/ }).click(); });
  expect(screen.getByRole('heading', { level: 1, name: 'Directory' })).toBeInTheDocument();
  view.unmount();
  errors.mockRestore();
});
