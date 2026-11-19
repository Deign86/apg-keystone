import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withModuleData, type Member, type TerminalState } from '@keystone/core';
import { App, buildRegistry, KeystoneStore, type ModuleDef, type Platform } from '@keystone/kit';
import { connectors } from '../connectors';
import { builtInModules } from '../modules';
import { browserPlatform } from '../platform/browser';
import { sampleState } from '@keystone/core/sample';

// A request for funds across the parts as shipped (docs/adr/0011, 0021): the CEO, signed in, approves it on the
// Requests for Funds screen. A check: Check Vouchers drafts the voucher through its vouchers.drafts service, and without
// Check Vouchers the approval still stands. A transfer: the fund transfer request opens, ready to print or save, and no
// voucher is drafted. Staff and a computer with nobody signed in are never offered the decision.

const owner: Member = { uid: 'owner-1', name: 'Mark Reyes', role: 'owner' };
const hr: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };

/** HR's request, as a build before 0021 saved it: a check, with no expenses listed. */
function savedState(): TerminalState {
  return withModuleData(sampleState(), 'funds', {
    requests: [{
      no: 'RF-2026-0001', date: '2026-11-02', purpose: 'Christmas party: venue deposit', amount: 48000, payee: 'V-002', settle: 'ASAP',
      requester: 'Ana Cruz', uid: 'hr-1', status: 'For Approval',
    }],
    last: 'RF-2026-0001',
  });
}

/** HR's expenses for the fortnight, to be paid back by a transfer into the fund's account, exactly as the funds module saves it. */
function transferState(): TerminalState {
  return withModuleData(sampleState(), 'funds', {
    requests: [{
      no: 'RF-2026-0001', date: '2026-11-02', purpose: 'Revolving fund, Nov 1 to 15',
      lines: [{ desc: 'Pantry groceries', amt: 3250.75 }, { desc: 'Courier for payroll documents', amt: 480 }], amount: 3730.75, pay: 'transfer',
      account: { bank: 'BDO', branch: 'Makati Ayala', name: 'Liza Ramos', number: '0012 3456 7890' }, payee: '', settle: 'ASAP',
      requester: 'Ana Cruz', uid: 'hr-1', status: 'For Approval',
    }],
    last: 'RF-2026-0001',
  });
}

async function openFunds(modules: ModuleDef[], who?: Member, saved = savedState()) {
  const platform: Platform = { ...browserPlatform, loadState: async () => JSON.stringify(saved), saveState: async () => {}, ...(who && { who }) };
  const store = await KeystoneStore.open(platform);

  window.location.hash = '#funds';
  render(<App store={store} registry={buildRegistry(modules, connectors)} />);
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
  it('the CEO approves it, and Check Vouchers drafts the voucher for the amount', async () => {
    const store = await openFunds(builtInModules, owner);

    await approve();
    const voucher = store.state.cv.at(-1);
    expect(voucher).toMatchObject({ no: '888-001', payee: 'MANILA WATER COMPANY', address: 'MWSS Compound, Quezon City', status: 'For Approval', lines: [{ desc: 'Christmas party: venue deposit (RF-2026-0001)', amt: 48000 }] });
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

  it('the CEO approves a transfer, and its fund transfer request opens to print or save, with no voucher drafted', async () => {
    const store = await openFunds(builtInModules, owner, transferState());
    const vouchers = store.state.cv.length;
    const card = screen.getByRole('article', { name: 'RF-2026-0001' });

    // The CEO sees each expense, and the account the money goes to, before deciding.
    expect(within(card).getByRole('list', { name: 'Expenses on RF-2026-0001' })).toHaveTextContent('Pantry groceries₱3,250.75Courier for payroll documents₱480.00');
    expect(card).toHaveTextContent('Transfer toBDO · Liza Ramos · 0012 3456 7890');

    await approve();
    expect(store.state.cv).toHaveLength(vouchers);
    expect(store.state.ext?.funds).toMatchObject({ requests: [{ status: 'Approved', decision: { by: 'Mark Reyes' } }] });
    expect(store.state.ext?.funds).not.toMatchObject({ requests: [{ voucher: expect.anything() }] });

    const form = screen.getByRole('form', { name: 'Viewing RF-2026-0001' });
    expect(within(form).getByRole('button', { name: 'Export PDF' })).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: 'Print' })).toBeInTheDocument();
    const paper = screen.getByRole('article', { name: 'Fund transfer request RF-2026-0001' });
    expect(paper).toHaveTextContent('Account no.0012 3456 7890');
    expect(paper).toHaveTextContent('₱3,730.75');
    expect(paper).toHaveTextContent('Approved in Keystone by Mark Reyes on November 2, 2026 at 10:00.');
  });

  it('is never offered to staff', async () => {
    await openFunds(builtInModules, hr);
    expect(screen.queryByRole('article', { name: 'RF-2026-0001' })).toBeNull();
    expect(screen.getByText('Only the CEO approves or declines requests. The answer shows here once it is given.')).toBeInTheDocument();
  });

  it('is never offered on a computer where nobody signs in', async () => {
    await openFunds(builtInModules);
    expect(screen.queryByRole('article', { name: 'RF-2026-0001' })).toBeNull();
    expect(screen.getByText(/^Only the CEO approves or declines requests, signed in to APG's records in the cloud\./)).toBeInTheDocument();
  });
});
