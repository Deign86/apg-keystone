import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bundledSeed, withModuleData, type TerminalState } from '@keystone/core';
import { App, buildRegistry, KeystoneStore, type ModuleDef, type Platform } from '@keystone/kit';
import { plugins } from '../connectors';
import { builtInModules } from '../modules';
import { browserPlatform } from '../platform/browser';

// The payroll regression, across the parts as shipped: days saved by Timekeeping, counted by it, handed to Payroll
// through the employee-attendance service, priced by Payroll's engine and shown on its screen, sheet and payslip.
// The cut-off is the same one the two modules' own tests pin down (Juan, Oct 16–31, 2026, every kind of day once), so
// a change anywhere along the way that moves a centavo fails here.

/** Exactly what Timekeeping and Payroll save, written by hand. */
function savedState(): TerminalState {
  const day = (date: string, tin: string, tout: string, ot = 0) => ({ emp: 'E-001', date, in: tin, out: tout, ot, note: '' });
  let s = structuredClone(bundledSeed.state);

  s = withModuleData(s, 'timekeeping', {
    days: [
      day('2026-10-16', '07:58', '17:00'), day('2026-10-19', '08:12', '17:00'), day('2026-10-20', '08:05', '17:00'),
      day('2026-10-21', '08:00', '19:00', 2), day('2026-10-22', '12:30', '17:00'), day('2026-10-26', '07:50', '16:30'),
      day('2026-10-27', '08:20', '17:00'), day('2026-10-28', '08:10', '17:00'), day('2026-10-29', '08:00', '17:00'),
    ],
    holidays: [{ date: '2026-10-29', name: 'Special day', kind: 'Special' }, { date: '2026-10-30', name: 'Regular day', kind: 'Regular' }],
  });

  return withModuleData(s, 'payroll', {
    setups: [{
      emp: 'E-001', empNo: 'APGCO-0013', daily: 760, monthly: null, incentive: 1000, housing: 0, special: 150, sss: null,
      philhealth: null, pagibig: null, advance: 0, bank: '', account: '',
    }],
    runs: [],
  });
}

async function openPayroll(modules: ModuleDef[]) {
  const platform: Platform = { ...browserPlatform, loadState: async () => JSON.stringify(savedState()), saveState: async () => {} };
  const store = await KeystoneStore.open(platform);

  window.location.hash = '#payroll';
  render(<App store={store} registry={buildRegistry(modules, plugins)} />);
  await act(async () => {});

  return within(screen.getByRole('table', { name: 'Cut-off' })).getByRole('row', { name: /Juan Miguel P\. Reyes/ });
}

const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => c.textContent);

beforeEach(() => {
  // 10:00 on Monday, Nov 2, 2026, as the end-to-end suite: the cut-off to close is Oct 16–31.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 10));
});

afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

describe('the regression cut-off, as shipped', () => {
  it('shows on the Payroll screen exactly what the engine works out by hand', async () => {
    const row = await openPayroll(builtInModules);

    // Days · compensation · allowances · late and half day · overtime · gross · deductions · net.
    expect(cells(row)).toEqual(['Juan Miguel P. Reyes', '10/11', '₱7,828.00', '₱2,350.00', '-₱467.08', '₱237.50', '₱9,948.42', '-₱719.12', '₱9,229.30']);
    expect(screen.getByText('Oct 16–31, 2026: 1 employee, ₱9,229.30 net so far.')).toBeInTheDocument();
  });

  it('prints the same figures on the payroll sheet and the payslip', async () => {
    const row = await openPayroll(builtInModules);
    const sheet = screen.getByRole('article', { name: 'Payroll sheet, Oct 16–31, 2026' });

    for (const amount of ['8,360.00', '7,600.00', '228.00', '7,828.00', '2,350.00', '87.08', '380.00', '760.00', '237.50', '9,948.42', '719.12', '9,229.30']) {
      expect(sheet).toHaveTextContent(amount);
    }

    fireEvent.click(row);
    const slip = screen.getByRole('article', { name: 'Payslip, Juan Miguel P. Reyes, Oct 16–31, 2026' });

    // Earnings 10,415.50 less deductions 1,186.20 (shares 719.12, late 87.08, half day 380) is the same 9,229.30.
    expect(slip).toHaveTextContent('Total earnings₱10,415.50');
    expect(slip).toHaveTextContent('Total deductions₱1,186.20');
    expect(slip).toHaveTextContent('PhilHealth employee share206.62');
    expect(slip).toHaveTextContent('₱9,229.30');
  });

  it('pays every weekday in full when Timekeeping is taken out, and says so', async () => {
    const row = await openPayroll(builtInModules.filter((m) => m.id !== 'timekeeping'));

    expect(cells(row)).toEqual(['Juan Miguel P. Reyes', '11/11', '₱8,360.00', '₱2,650.00', '₱0.00', '₱0.00', '₱11,010.00', '-₱719.12', '₱10,290.88']);
    expect(screen.getByText('Timekeeping is not installed, so every weekday of the cut-off is paid in full.')).toBeInTheDocument();
  });
});
