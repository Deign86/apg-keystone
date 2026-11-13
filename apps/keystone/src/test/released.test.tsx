import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SERVICES } from '@keystone/core';
import { App, buildRegistry, documentLayout, findService, KeystoneStore, type Platform } from '@keystone/kit';
import { plugins } from '../connectors';
import { builtInModules, RELEASED, shippedModules } from '../modules';
import { browserPlatform } from '../platform/browser';
import { isBeta } from '../platform/config';

// Outside a beta build only the released screens open, and the others say "Coming soon" (docs/adr/0017). A screen
// coming soon must still keep its records where they are, in the cloud too, and keep what it does for the screens that
// are open.

const platform: Platform = { ...browserPlatform, loadState: async () => null, saveState: async () => {} };

afterEach(() => {
  window.location.hash = '';
});

describe('which build is a beta', () => {
  it('follows VITE_KEYSTONE_CHANNEL, as CI sets it', () => {
    expect(isBeta({ VITE_KEYSTONE_CHANNEL: 'beta', DEV: false })).toBe(true);
    expect(isBeta({ VITE_KEYSTONE_CHANNEL: 'stable', DEV: true })).toBe(false);
  });

  it('without it, is the dev server and never a built app', () => {
    expect(isBeta({ DEV: true })).toBe(true);
    expect(isBeta({ DEV: false })).toBe(false);
    expect(isBeta({ VITE_KEYSTONE_CHANNEL: ' ', DEV: false })).toBe(false);
  });
});

describe('a build that is not a beta', () => {
  const stable = buildRegistry(shippedModules(false), plugins);

  it('opens Home, with the connected systems, Check Vouchers, User Accounts, Bank Accounts and Company Details, and nothing else', () => {
    expect(stable.refused).toEqual([]);
    expect(stable.modules.filter((m) => !m.soon).map((m) => m.id)).toEqual(['home', 'vouchers', 'accounts', 'banks', 'company']);
    expect(stable.modules.map((m) => m.id)).toEqual(buildRegistry(builtInModules, plugins).modules.map((m) => m.id));
    expect(stable.connectors.length).toBe(plugins.length);
    expect(RELEASED.every((id) => builtInModules.some((m) => m.id === id))).toBe(true);
  });

  it('keeps every record where it is kept, and the services the open screens use', () => {
    const everything = buildRegistry(builtInModules, plugins);

    expect(documentLayout(stable.modules)).toEqual(documentLayout(everything.modules));

    for (const name of Object.values(SERVICES)) {
      expect(findService(stable.modules, name)).toBe(findService(everything.modules, name));
    }
  });

  it('marks each screen not released in the rail, and opens it behind "Coming soon"', async () => {
    const store = await KeystoneStore.open(platform, stable.modules.flatMap((m) => (m.onOpen ? [m.onOpen] : [])));

    for (const m of stable.modules.filter((x) => x.soon)) {
      window.location.hash = `#${m.id}`;
      const view = render(<App store={store} registry={stable} />);
      await act(async () => {});

      const rail = within(screen.getByRole('navigation', { name: 'Keystone' }));
      expect(rail.getByRole('button', { current: 'page' })).toHaveAccessibleName(`${m.title}, coming soon`);
      expect(screen.getByRole('heading', { name: m.title, level: 1 })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Coming soon', level: 2 })).toBeInTheDocument();
      // Its screen, out of reach behind the notice, never fails in its place.
      expect(screen.queryByText('This screen hit a problem')).toBeNull();

      view.unmount();
    }
  });

  it('shows Home with every tile, those coming soon marked, and every connected system', async () => {
    const store = await KeystoneStore.open(platform);
    window.location.hash = '#home';
    render(<App store={store} registry={stable} />);
    await act(async () => {});

    const main = within(screen.getByRole('main'));
    expect(main.getByRole('button', { name: /^Check Vouchers/ })).not.toHaveTextContent('Coming soon');
    expect(main.getByRole('button', { name: /^Billing Statements Coming soon/ })).toBeInTheDocument();
    expect(main.getAllByRole('listitem').length).toBeGreaterThan(stable.connectors.length + 1);
    expect(main.getByText('Connected systems')).toBeInTheDocument();
  });
});
