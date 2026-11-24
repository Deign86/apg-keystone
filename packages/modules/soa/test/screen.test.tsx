import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, buildRegistry, KeystoneStore } from '@keystone/kit';
import { memoryPlatform } from '@keystone/kit/testing';
import { UNDERSTOOD } from '@keystone/ui';
import { soaModule } from '../src';
import { statementsOf } from '../src/rules';

// The Statements of Account screen in the app, on a computer that has saved nothing: the form works the lease out as it
// is typed, saving refuses what is missing with the rule's sentence, and a saved statement opens again and can be
// removed. Only the clock is fixed, at 24 Nov 2026, so the number and dates hold.

async function open() {
  const store = await KeystoneStore.open(memoryPlatform().platform);

  window.location.hash = '#soa';
  render(<App store={store} registry={buildRegistry([soaModule], [])} />);
  await act(async () => {});

  return store;
}

const form = (name = 'New statement of account') => within(screen.getByRole('form', { name }));

function type(label: string, value: string) {
  fireEvent.change(form().getByLabelText(label), { target: { value } });
}

/** The company's form: 354.4 sqm at ₱600 from Jan 1, 2027, the default two months' deposit and advance. */
function fillLease() {
  type('Client', 'Northwind Retail Corp.');
  type('Property address', 'Unit 5, Ortigas Avenue, Pasig');
  type('Floor area (sqm)', '354.4');
  type('Rate per sqm', '600');
  type('Contract commencement', '2027-01-01');
}

async function save() {
  fireEvent.click(form().getByRole('button', { name: 'Save statement' }));
  await act(async () => {});
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 24, 9, 5));
});

afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

describe('the Statements of Account screen', () => {
  it('changes a check’s number where it is on the paper, and the checks after it follow', async () => {
    await open();
    fillLease();
    type('First check number', '029458');
    const preview = within(screen.getByRole('article', { name: 'Statement of account SOA-2026-001' }));

    fireEvent.click(preview.getByRole('button', { name: '029460', description: 'Change check 3’s number' }));
    const field = preview.getByRole('textbox', { name: 'Check 3 number' });

    fireEvent.change(field, { target: { value: '030001' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.blur(field);
    await act(async () => {});

    expect(preview.getByRole('button', { name: '030001', description: 'Change check 3’s number' })).toBeInTheDocument();
    expect(preview.getByRole('button', { name: '030002', description: 'Change check 4’s number' })).toBeInTheDocument();
    expect(preview.getByRole('button', { name: '029459', description: 'Change check 2’s number' })).toBeInTheDocument();
  });

  it('prints the payee under the title typed, and a detail added at the top', async () => {
    await open();
    fillLease();
    type('Payee', 'DC88 Corporation');
    type('Payee\u2019s title', 'Lessor');
    fireEvent.click(form().getByRole('button', { name: 'Add a detail at the top' }));
    type('Detail 1 label', 'Floor');
    type('Detail 1 value', '3rd floor, Room 7');
    const preview = within(screen.getByRole('article', { name: 'Statement of account SOA-2026-001' }));

    expect(preview.getByText('Lessor').nextElementSibling).toHaveTextContent('DC88 Corporation');
    expect(preview.getByText('Floor').nextElementSibling).toHaveTextContent('3rd floor, Room 7');
  });

  it('starts with none saved and the next number', async () => {
    await open();

    expect(screen.getByRole('heading', { name: 'Statements of Account', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/^No statements of account yet\. Each works out the rent/)).toBeInTheDocument();
    expect(form().getByRole('textbox', { name: 'SOA No.' })).toHaveValue('SOA-2026-001');
    expect(form().getByLabelText('Prepared as of')).toHaveValue('2026-11-24');
  });

  it('works the lease out as it is typed', async () => {
    await open();
    fillLease();

    expect(form().getByText('Base rent ₱212,640.00 · VAT ₱25,516.80 · EWT (₱10,632.00)')).toBeInTheDocument();
    expect(form().getByText('₱227,524.80 a month')).toBeInTheDocument();
    // Two months' deposit (₱425,280) and two months' advance (₱455,049.60), no reservation yet.
    expect(form().getByText('Due on signing ₱880,329.60')).toBeInTheDocument();

    type('Reservation paid', '212,640');
    expect(form().getByText('Due on signing ₱667,689.60')).toBeInTheDocument();

    fireEvent.click(form().getByRole('checkbox', { name: 'Add 12% VAT' }));
    // VAT off: ₱212,640 less ₱10,632 EWT.
    expect(form().getByText('₱202,008.00 a month')).toBeInTheDocument();
  });

  it('says where the checks start and how many there are until they are set', async () => {
    await open();
    fillLease();

    expect(screen.getByText('Empty: March 2027, the month after the advance.')).toBeInTheDocument();
    expect(screen.getByText('Empty: 10, the months the advance does not pay.')).toBeInTheDocument();
  });

  it('refuses a statement with something missing, with the sentence to show, and saves nothing', async () => {
    const store = await open();

    fillLease();
    type('Client', '');
    await save();

    expect(form().getByRole('alert')).toHaveTextContent('Enter the client.');
    expect(statementsOf(store.state)).toEqual([]);
  });

  it('saves a statement to the register and the log, then opens it again and removes it', async () => {
    const store = await open();

    fillLease();
    await save();

    expect(statementsOf(store.state).map((a) => [a.no, a.client, a.sqm, a.rate])).toEqual([['SOA-2026-001', 'Northwind Retail Corp.', 354.4, 600]]);
    expect(store.state.log[0]).toMatchObject({ mod: 'SOA', text: 'SOA-2026-001 for Northwind Retail Corp., Unit 5, Ortigas Avenue, Pasig (₱227,524.80 a month, ₱880,329.60 on signing) prepared as of November 24, 2026.' });
    expect(form().getByRole('textbox', { name: 'SOA No.' })).toHaveValue('SOA-2026-002');
    const register = within(screen.getByRole('table', { name: 'Statements saved' }));

    expect(register.getByRole('cell', { name: 'SOA-2026-001' }).closest('tr')).toHaveTextContent(/₱227,524\.80.*₱880,329\.60/);

    fireEvent.click(register.getByRole('cell', { name: 'SOA-2026-001' }));
    await act(async () => {});
    expect(form('Editing SOA-2026-001').getByRole('textbox', { name: 'Floor area (sqm)' })).toHaveValue('354.4');

    fireEvent.click(screen.getByRole('button', { name: /^Actions for .*SOA-2026-001/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove…' }));
    const dialog = within(await screen.findByRole('alertdialog', { name: 'Remove SOA-2026-001?' }));

    fireEvent.click(dialog.getByRole('checkbox', { name: UNDERSTOOD }));
    fireEvent.click(dialog.getByRole('button', { name: 'Remove statement' }));
    await act(async () => {});
    expect(statementsOf(store.state)).toEqual([]);
    expect(store.state.log[0]).toMatchObject({ mod: 'SOA', text: 'SOA-2026-001 for Northwind Retail Corp. removed.' });
  });
});
