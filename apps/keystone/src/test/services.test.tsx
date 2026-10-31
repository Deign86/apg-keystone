import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SERVICES, type HttpResponse, type StatementPayments } from '@keystone/core';
import { App, buildRegistry, Connections, findService, KeystoneStore, type Platform } from '@keystone/kit';
import { plugins } from '../connectors';
import { builtInModules } from '../modules';
import { browserPlatform } from '../platform/browser';

// The one place two parts cooperate: the website screen (connector package) settles
// statements that belong to the billing module (module package) through the
// statement-payments service. Tested end to end, with and without billing installed.

function response(status: number, body: unknown): HttpResponse {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body), json: async <T,>() => body as T, bytes: async () => new Uint8Array() };
}

/** A desktop platform whose website is signed in and has one payment reported for `amount` pesos. */
function withWebsite(amount: number) {
  const archived: number[] = [];

  const payment = {
    id: 41, kind: 'payment', enterprise_slug: 'apg', name: 'Lopez Realty', email: 'accounts@lopezrealty.ph', phone: '', subject: 'Payment', excerpt: '',
    meta: { ticket: 'APG-1A2B3C4D', amount: amount.toFixed(2), payment_method: 'GCash', reference_no: '7788' }, status: 'new', created_at: '2026-10-30 09:00:00',
  };

  const platform: Platform = {
    ...browserPlatform,
    loadState: async () => null,
    saveState: async () => {},
    loadSettings: async () => ({ website: { email: 'keystone@alphapremiergroup.com' } }),
    saveSettings: async () => {},
    secret: async () => 'secret',
    http: {
      native: true,
      async request(url, init = {}) {
        if (url.includes('auth.php?action=check')) return response(200, { authenticated: true, user: { name: 'Keystone', role: 'admin' } });

        if (url.includes('kind=payment')) return response(200, { data: [payment] });

        if (url.includes('exclude=newsletter')) return response(200, { data: [] });

        if (url.includes('action=summary')) return response(200, { summary: { unread: 0, by_kind: {}, total: 0, new: 0, interviewing: 0, hired: 0 } });

        if (init.method === 'PUT') {
          archived.push(JSON.parse(String(init.body)).id);

          return response(200, { ok: true });
        }

        return response(404, {});
      },
    },
  };

  return { platform, archived };
}

async function openWebsite(platform: Platform, modules = builtInModules) {
  const registry = buildRegistry(modules, plugins);
  const store = await KeystoneStore.open(platform);
  const connections = new Connections(platform, registry.connectors);
  await connections.load();

  for (const c of registry.connectors) await connections.refresh(c);
  window.location.hash = '#website';
  const view = render(<App store={store} registry={registry} connections={connections} />);
  await act(async () => {});
  await screen.findByRole('cell', { name: /Lopez Realty/ });

  return { registry, store, view };
}

afterEach(() => {
  window.location.hash = '';
  vi.restoreAllMocks();
});

describe('website and billing, through the statement-payments service', () => {
  it('billing provides the service the website asks for', () => {
    const r = buildRegistry(builtInModules, plugins);
    const desk = findService<StatementPayments>(r.modules, SERVICES.statementPayments);
    expect(desk).toBeDefined();
    expect(typeof desk!.open).toBe('function');
  });

  it('matches a payment reported online to its statement and marks it paid', async () => {
    const desk = findService<StatementPayments>(buildRegistry(builtInModules, plugins).modules, SERVICES.statementPayments)!;
    const store0 = await KeystoneStore.open({ ...browserPlatform, loadState: async () => null });
    const target = desk.open(store0.state)[0];
    const { platform, archived } = withWebsite(target.amount / 100);
    const { store, view } = await openWebsite(platform);

    fireEvent.click(screen.getByRole('cell', { name: /Lopez Realty/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Match payment to a statement' });
    const row = within(sheet).getByText(target.no).closest('li')!;
    await act(async () => { fireEvent.click(within(row).getByRole('button', { name: 'Mark paid' })); });

    await waitFor(() => expect(store.state.bs.find((b) => b.no === target.no)?.status).toBe('Paid'));
    const entry = store.state.log.find((e) => e.text.startsWith(`${target.no} from`));
    expect(entry?.text).toMatch(/paid: .* by GCash ref 7788, reported on the website \(ticket APG-1A2B3C4D\)\.$/);
    expect(archived).toEqual([41]);
    view.unmount();
  });

  it('without billing, the website screen still lists payments and says matching needs it', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { platform } = withWebsite(4999);
    const { registry, view } = await openWebsite(platform, builtInModules.filter((m) => m.id !== 'billing'));
    expect(registry.refused).toEqual([]);
    expect(screen.getByText(/needs the Billing module, which is not installed/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('cell', { name: /Lopez Realty/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    view.unmount();
  });
});
