import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SERVICES, type BankAccount, type BankAccounts } from '@keystone/core';
import { App, buildRegistry, KeystoneStore, type ModuleDef } from '@keystone/kit';
import { memoryPlatform } from '@keystone/kit/testing';
import { billingModule } from '../src';
import { sampleText } from '@keystone/core/sample';

// The statement form with and without the bank-accounts service (SERVICES.bankAccounts). Billing never imports Bank
// Accounts: a stand-in module provides the service here, as the real one does in the app.

const { platform } = memoryPlatform(sampleText);

const bpi: BankAccount = { id: 'B-001', bank: 'BPI', branch: '', name: 'Alpha Premier Group of Companies OPC', number: '4011 0258 68' };
const bdo: BankAccount = { id: 'B-002', bank: 'BDO', branch: 'Ortigas Center', name: 'APG Holdings OPC', number: '0012 3456 7890' };

function banks(accounts: BankAccount[]): ModuleDef {
  const service: BankAccounts = {
    accounts: () => accounts, label: (a) => `${a.bank} · ${a.number}`,
    // Keeps the account in the list given, as Bank Accounts keeps it in the state.
    add: (state, a) => {
      const record = { ...a, id: `B-00${accounts.length + 1}` };
      accounts.push(record);

      return { state, record, message: `${record.id} added.` };
    },
    remove: () => { throw new Error('Not in these tests.'); },
  };

  return { id: 'banks', title: 'Bank Accounts', blurb: '', order: 91, Screen: () => <h1>Bank Accounts</h1>, provides: { [SERVICES.bankAccounts]: service } };
}

async function openBilling(modules: ModuleDef[]) {
  const store = await KeystoneStore.open(platform);

  window.location.hash = '#billing';
  render(<App store={store} registry={buildRegistry(modules, [])} />);
  await act(async () => {});

  return {
    form: screen.getByRole('form', { name: 'New statement' }),
    paper: screen.getByRole('article', { name: 'Billing statement 010100-2026' }),
  };
}

afterEach(() => {
  window.location.hash = '';
});

describe('Pay into on a statement', () => {
  it('is not there without Bank Accounts, and the payment instructions are the default text', async () => {
    const { form, paper } = await openBilling([billingModule]);

    expect(within(form).queryByRole('combobox', { name: 'Pay into' })).toBeNull();
    expect(within(form).getByRole('textbox', { name: 'Payment instructions' })).toHaveDisplayValue(/Account Number: 4011 0258 68/);
    expect(paper).toHaveTextContent('Account Number: 4011 0258 68');
  });

  it('lists the accounts with Bank Accounts installed, naming the one the instructions already name', async () => {
    const { form } = await openBilling([billingModule, banks([bpi, bdo])]);

    expect(within(form).getByRole('combobox', { name: 'Pay into' })).toHaveTextContent('BPI · 4011 0258 68');
  });

  it('writes the account picked into the payment instructions and onto the printed statement', async () => {
    const { form, paper } = await openBilling([billingModule, banks([bpi, bdo])]);

    fireEvent.click(within(form).getByRole('combobox', { name: 'Pay into' }));
    await act(async () => {});
    // A mouse click on an item starts with the pointer going down on it.
    const option = await screen.findByRole('option', { name: 'BDO · 0012 3456 7890' });
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    await act(async () => {});

    expect(within(form).getByRole('combobox', { name: 'Pay into' })).toHaveTextContent('BDO · 0012 3456 7890');
    expect(within(form).getByRole('textbox', { name: 'Payment instructions' })).toHaveValue([
      'Please make payment to:',
      'Bank: BDO, Ortigas Center',
      'Account Name: APG Holdings OPC',
      'Account Number: 0012 3456 7890',
      '',
      'Kindly send proof of payment to accounting@alphapremiergroup.com',
    ].join('\n'));
    expect(paper).toHaveTextContent('Account Number: 0012 3456 7890');
    expect(paper).not.toHaveTextContent('4011 0258 68');
  });

  it('with none kept, adds one under Others and writes it into the payment instructions', async () => {
    const { form, paper } = await openBilling([billingModule, banks([])]);
    const payInto = within(form).getByRole('combobox', { name: 'Pay into' });

    fireEvent.click(payInto);
    await act(async () => {});
    const others = await screen.findByRole('option', { name: 'Others…' });
    fireEvent.pointerDown(others);
    fireEvent.click(others);
    await act(async () => {});

    const group = within(form).getByRole('group', { name: 'New bank account' });
    fireEvent.change(within(group).getByRole('textbox', { name: 'Bank name' }), { target: { value: 'BDO' } });
    fireEvent.change(within(group).getByRole('textbox', { name: 'Account number' }), { target: { value: '0012 3456 7890' } });
    fireEvent.click(within(group).getByRole('button', { name: 'Save account' }));
    await act(async () => {});

    expect(within(form).queryByRole('group', { name: 'New bank account' })).toBeNull();
    expect(within(form).getByRole('combobox', { name: 'Pay into' })).toHaveTextContent('BDO · 0012 3456 7890');
    expect(within(form).getByRole('textbox', { name: 'Payment instructions' })).toHaveDisplayValue(/Bank: BDO\nAccount Name: .+\nAccount Number: 0012 3456 7890/);
    expect(paper).toHaveTextContent('Account Number: 0012 3456 7890');
  });
});
