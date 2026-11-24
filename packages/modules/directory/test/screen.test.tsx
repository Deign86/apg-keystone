import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Reference, type TerminalState } from '@keystone/core';
import { sampleState } from '@keystone/core/sample';
import { App, buildRegistry, KeystoneStore, type ModuleDef } from '@keystone/kit';
import { UNDERSTOOD } from '@keystone/ui';
import { memoryPlatform } from '@keystone/kit/testing';
import { directoryModule } from '../src';

// The Directory asks each installed module which records its saved data names. A module answers by decoding
// everything it has saved, so the screen asks each one once for a state, never once per row.

/** A module whose records name these codes, counting how often it is asked. */
function naming(id: string, tag: string, codes: string[]) {
  const asked = vi.fn((_: TerminalState) => codes);
  const reference: Reference = { tag, codes: asked };
  const module: ModuleDef = { id, title: id, blurb: '', order: 90, logTags: { [tag]: id }, refersTo: reference, Screen: () => null };

  return { module, asked };
}

async function open(saved: TerminalState, others: ModuleDef[]) {
  const store = await KeystoneStore.open(memoryPlatform(JSON.stringify(saved)).platform);

  window.location.hash = '#directory';
  render(<App store={store} registry={buildRegistry([directoryModule, ...others], [])} />);
  await act(async () => {});
}

const row = (code: string) => screen.getByRole('cell', { name: code }).closest('tr')!;

afterEach(() => { window.location.hash = ''; });

describe('the Directory screen and what the modules say they name', () => {
  it('marks a record with each module that names it; removing one says what names it, and either can be removed', async () => {
    const pay = naming('pay', 'PAY', ['E-001']);
    const dtr = naming('dtr', 'DTR', ['E-001', 'E-002']);

    await open(sampleState(), [pay.module, dtr.module]);

    expect(within(row('E-001')).getByText('PAY')).toBeInTheDocument();
    expect(within(row('E-001')).getByText('DTR')).toBeInTheDocument();
    expect(within(row('E-002')).queryByText('PAY')).toBeNull();
    expect(within(row('E-002')).getByText('DTR')).toBeInTheDocument();
    expect(within(row('V-001')).queryByText('PAY')).toBeNull();
    expect(within(row('V-001')).queryByText('DTR')).toBeNull();

    // A record a module names can be removed too, once the person is told which records name it.
    fireEvent.click(screen.getByRole('button', { name: /^Actions for .*E-001/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove…' }));
    const used = within(await screen.findByRole('alertdialog', { name: 'Remove E-001?' }));

    expect(used.getByText(/It is named on PAY, DTR records: they keep what was saved on them/)).toBeInTheDocument();
    fireEvent.click(used.getByRole('checkbox', { name: UNDERSTOOD }));
    fireEvent.click(used.getByRole('button', { name: 'Remove record' }));
    await act(async () => {});
    expect(screen.queryByRole('cell', { name: 'E-001' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Actions for .*V-001/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove…' }));
    const dialog = within(await screen.findByRole('alertdialog', { name: 'Remove V-001?' }));

    // A destructive confirmation works only once it is ticked as understood.
    expect(dialog.getByText(/Nothing refers to it yet, so no document changes\./)).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Remove record' })).toBeDisabled();
    fireEvent.click(dialog.getByRole('checkbox', { name: UNDERSTOOD }));
    fireEvent.click(dialog.getByRole('button', { name: 'Remove record' }));
    await act(async () => {});
    expect(screen.queryByRole('cell', { name: 'V-001' })).toBeNull();
    expect(screen.getByRole('cell', { name: 'E-002' })).toBeInTheDocument();
  });

  it('asks each module once for a state however many rows it draws, and not again until the state changes', async () => {
    const pay = naming('pay', 'PAY', ['E-001']);
    const dtr = naming('dtr', 'DTR', ['E-002']);
    const s = sampleState();
    const many: TerminalState = { ...s, dir: [...s.dir, ...Array.from({ length: 60 }, (_, i) => ({ code: `V-${900 + i}`, type: 'Vendor' as const, name: `Vendor ${i}`, tin: '', detail: '' }))] };

    await open(many, [pay.module, dtr.module]);
    expect(screen.getAllByRole('row').length).toBeGreaterThan(70);

    // React's StrictMode, which the app renders in, computes a memo twice on the first render; never once a row.
    const first = pay.asked.mock.calls.length;

    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(2);
    expect(dtr.asked.mock.calls.length).toBe(first);

    // Each keystroke in Search draws the rows again from the same state: nobody is asked again.
    for (const value of ['V', 'Ve', 'Ven', '']) {
      fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value } });
    }

    fireEvent.click(screen.getByRole('button', { name: /^Clients/ }));
    expect(pay.asked.mock.calls.length).toBe(first);
    expect(dtr.asked.mock.calls.length).toBe(first);
  });
});
