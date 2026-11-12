import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withModuleData, type Member, type TerminalState } from '@keystone/core';
import { App, buildRegistry, KeystoneStore, type ModuleDef, type Platform } from '@keystone/kit';
import { plugins } from '../connectors';
import { builtInModules } from '../modules';
import { browserPlatform } from '../platform/browser';
import { sampleState } from '@keystone/core/sample';

// A request for funds across the parts as shipped (docs/adr/0011): the owner, signed in, approves it on the Requests
// for Funds screen, and Check Vouchers drafts the voucher through its vouchers.drafts service; without Check Vouchers
// the approval still stands. Staff and a computer with nobody signed in are never offered the decision.

const owner: Member = { uid: 'owner-1', name: 'Mark Reyes', role: 'owner' };
const hr: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };

/** HR's request, exactly as the funds module saves it. */
function savedState(): TerminalState {
  return withModuleData(sampleState(), 'funds', {
    requests: [{
      no: 'RF-2026-0001', date: '2026-11-02', purpose: 'Christmas party: venue deposit', amount: 48000, payee: 'V-002', settle: 'ASAP',
      requester: 'Ana Cruz', uid: 'hr-1', status: 'For Approval',
    }],
    last: 'RF-2026-0001',
  });
}

async function openFunds(modules: ModuleDef[], who?: Member) {
  const platform: Platform = { ...browserPlatform, loadState: async () => JSON.stringify(savedState()), saveState: async () => {}, ...(who && { who }) };
  const store = await KeystoneStore.open(platform);

  window.location.hash = '#funds';
  render(<App store={store} registry={buildRegistry(modules, plugins)} />);
  await act(async () => {});

  return store;
}

async function approve() {
  fireEvent.click(within(screen.getByRole('article', { name: 'RF-2026-0001' })).getByRole('button', { name: 'Approve' }));
  fireEvent.click(within(await screen.findByRole('alertdialog', { name: 'Approve RF-2026-0001?' })).getByRole('button', { name: 'Approve' }));
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 10));
});

afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

describe('a request for funds, as shipped', () => {
  it('the owner approves it, and Check Vouchers drafts the voucher for the amount', async () => {
    const store = await openFunds(builtInModules, owner);

    await approve();
    const voucher = store.state.cv.at(-1);
    expect(voucher).toMatchObject({ no: '888-001', payee: 'V-002', status: 'For Approval', lines: [{ desc: 'Christmas party: venue deposit (RF-2026-0001)', amt: 48000 }] });
    expect(store.state.ext?.funds).toMatchObject({ requests: [{ no: 'RF-2026-0001', status: 'Approved', voucher: '888-001', decision: { by: 'Mark Reyes', uid: 'owner-1' } }] });
    expect(screen.getByRole('table', { name: 'Requests for funds' })).toHaveTextContent('Approved');
  });

  it('without Check Vouchers, the approval stands and no voucher is drafted', async () => {
    const store = await openFunds(builtInModules.filter((m) => m.id !== 'vouchers'), owner);
    const vouchers = store.state.cv.length;

    await approve();
    expect(store.state.cv).toHaveLength(vouchers);
    expect(store.state.ext?.funds).toMatchObject({ requests: [{ status: 'Approved' }] });
    expect(await screen.findByText('RF-2026-0001 approved. Check Vouchers is not installed, so no voucher was drafted.')).toBeInTheDocument();
  });

  it('is never offered to staff', async () => {
    await openFunds(builtInModules, hr);
    expect(screen.queryByRole('article', { name: 'RF-2026-0001' })).toBeNull();
    expect(screen.getByText('Only the owner approves or declines requests. The answer shows here once it is given.')).toBeInTheDocument();
  });

  it('is never offered on a computer where nobody signs in', async () => {
    await openFunds(builtInModules);
    expect(screen.queryByRole('article', { name: 'RF-2026-0001' })).toBeNull();
    expect(screen.getByText(/^Only the owner approves or declines requests, signed in to APG's records in the cloud\./)).toBeInTheDocument();
  });
});
