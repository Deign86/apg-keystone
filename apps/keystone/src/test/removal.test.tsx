import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, buildRegistry, Connections, KeystoneStore, type ConnectorPlugin, type ModuleDef, type Platform } from '@keystone/kit';
import { plugins } from '../connectors';
import { builtInModules } from '../modules';
import { browserPlatform } from '../platform/browser';

// The modular-first promise, tested: take any one module or any one connected system
// out, or install any one of them alone, and every screen there is still renders, with
// no error and no broken link.

const platform: Platform = {
  ...browserPlatform,
  loadState: async () => null,
  saveState: async () => {},
  loadSettings: async () => ({}),
  saveSettings: async () => {},
};

const scenarios: [string, ModuleDef[], ConnectorPlugin[]][] = [
  ['everything installed', builtInModules, plugins],
  ...builtInModules.map((m): [string, ModuleDef[], ConnectorPlugin[]] => [`without the ${m.id} module`, builtInModules.filter((x) => x !== m), plugins]),
  ...plugins.map((p): [string, ModuleDef[], ConnectorPlugin[]] => [`without the ${p.connector.id} connector`, builtInModules, plugins.filter((x) => x !== p)]),
  ...builtInModules.map((m): [string, ModuleDef[], ConnectorPlugin[]] => [`the ${m.id} module on its own`, [m], []]),
  ...plugins.map((p): [string, ModuleDef[], ConnectorPlugin[]] => [`the ${p.connector.id} connector on its own`, [], [p]]),
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
    const connections = new Connections(platform, registry.connectors);

    for (const c of registry.connectors) await connections.refresh(c);

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const routes = registry.modules.length ? registry.modules : [null];

      for (const m of routes) {
        window.location.hash = m ? `#${m.id}` : '';
        const view = render(<App store={store} registry={registry} connections={connections} />);
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
  const r = buildRegistry(builtInModules, plugins);
  expect(r.refused).toEqual([]);
  expect(r.modules.map((m) => m.id)).toEqual([...new Set(r.modules.map((m) => m.id))]);
  expect(r.modules.map((m) => m.id)).toEqual(expect.arrayContaining(['home', 'vouchers', 'billing', 'id-maker', 'directory', 'activity', 'connections', 'website']));
  expect(r.connectors.map((c) => c.id)).toEqual(['attendance', 'branding-studio', 'website']);
});

it('a module that crashes shows its own error and leaves the rest working', async () => {
  const Broken = () => { throw new Error('Kaput'); };
  const registry = buildRegistry([...builtInModules, { id: 'broken', title: 'Broken', section: '', blurb: '', order: 50, Screen: Broken }], []);
  const store = await KeystoneStore.open(platform);
  const connections = new Connections(platform, []);
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  window.location.hash = '#broken';
  const view = render(<App store={store} registry={registry} connections={connections} />);
  await act(async () => {});
  expect(screen.getByRole('alert')).toHaveTextContent('Kaput');
  // The rail still works: open another module.
  await act(async () => { within(screen.getByRole('navigation', { name: 'Keystone' })).getByRole('button', { name: /Directory/ }).click(); });
  expect(screen.getByRole('heading', { level: 1, name: 'Directory' })).toBeInTheDocument();
  view.unmount();
  errors.mockRestore();
});
