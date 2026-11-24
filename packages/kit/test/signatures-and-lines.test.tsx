import { FeedbackProvider } from '@keystone/ui';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { companyOf, emptyState, lineDraft, SERVICES, signatureSizeOf, type Ctx, type LineDraft, type TerminalState } from '@keystone/core';
import { LineEditor } from '../src/components';
import { KeystoneProvider } from '../src/context';
import { Signatures } from '../src/documents';
import { buildRegistry, type ModuleDef } from '../src/registry';
import { KeystoneStore } from '../src/store';
import { memoryPlatform } from './fakes';

afterEach(cleanup);

// ---------- the line editor: Enter moves on ----------

function Lines({ onSubmit, pricing }: { onSubmit: () => void; pricing?: 'unit' }) {
  const [lines, setLines] = useState<LineDraft[]>([lineDraft()]);

  return (
    <form aria-label="Voucher" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <LineEditor title="Particulars" pricing={pricing} lines={lines} onChange={setLines} />
    </form>
  );
}

const cell = (name: string) => screen.getByRole('textbox', { name });

describe('Enter in a line of particulars', () => {
  it('adds a new line after a filled-in last line, and moves to its description, without submitting the form', () => {
    const submit = vi.fn();

    render(<Lines onSubmit={submit} />);
    fireEvent.change(cell('Line 1 description'), { target: { value: 'Office supplies' } });
    fireEvent.change(cell('Line 1 amount'), { target: { value: '1250.50' } });
    fireEvent.keyDown(cell('Line 1 amount'), { key: 'Enter' });

    expect(screen.getAllByRole('group', { name: /^Line \d+$/ })).toHaveLength(2);
    expect(cell('Line 2 description')).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();
  });

  it('moves to the next line when there is one, adding none', () => {
    render(<Lines onSubmit={() => {}} />);
    fireEvent.change(cell('Line 1 description'), { target: { value: 'Office supplies' } });
    fireEvent.change(cell('Line 1 amount'), { target: { value: '100' } });
    fireEvent.keyDown(cell('Line 1 amount'), { key: 'Enter' });
    fireEvent.keyDown(cell('Line 1 description'), { key: 'Enter' });

    expect(screen.getAllByRole('group', { name: /^Line \d+$/ })).toHaveLength(2);
    expect(cell('Line 2 description')).toHaveFocus();
  });

  it('moves to the empty box of a line not filled in yet, adding no line', () => {
    const submit = vi.fn();

    render(<Lines onSubmit={submit} pricing="unit" />);
    fireEvent.change(cell('Line 1 description'), { target: { value: 'Rent, November' } });
    fireEvent.change(cell('Line 1 quantity'), { target: { value: '' } });
    fireEvent.keyDown(cell('Line 1 description'), { key: 'Enter' });

    expect(screen.getAllByRole('group', { name: /^Line \d+$/ })).toHaveLength(1);
    expect(cell('Line 1 quantity')).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();
  });

  it('leaves Shift+Enter and other keys alone', () => {
    render(<Lines onSubmit={() => {}} />);
    fireEvent.change(cell('Line 1 description'), { target: { value: 'Office supplies' } });
    fireEvent.change(cell('Line 1 amount'), { target: { value: '100' } });
    fireEvent.keyDown(cell('Line 1 amount'), { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(cell('Line 1 amount'), { key: 'Tab' });

    expect(screen.getAllByRole('group', { name: /^Line \d+$/ })).toHaveLength(1);
  });
});

// ---------- a signature, resized where a paper shows it ----------

const png = 'data:image/png;base64,iVBORw0KGgo=';
const signed: TerminalState = { ...emptyState(), company: { ...companyOf(emptyState()), signatures: { 'D. LAZARO': png } } };

/** A stand-in for the company module's service: the CEO (or a computer nobody signs in on) resizes. */
const resize = vi.fn((s: TerminalState, name: string, size: number) => ({
  state: { ...s, company: { ...companyOf(s), signatureSizes: { [name.toUpperCase()]: size } } }, record: companyOf(s), message: 'resized',
}));

const company: ModuleDef = {
  id: 'company', title: 'Company Details', blurb: '', order: 92, Screen: () => null,
  provides: { [SERVICES.signatureSizes]: { canResize: (ctx: Ctx) => ctx.who?.role !== 'staff', resize } },
};

async function paper(modules: ModuleDef[], who?: Ctx['who']) {
  const store = await KeystoneStore.open({ ...memoryPlatform(JSON.stringify(signed)).platform, ...(who && { who }) });

  render(
    <FeedbackProvider>
      <KeystoneProvider store={store} registry={buildRegistry(modules, [])}>
        <Signatures signed={() => png} names={[['D. Lazaro', 'Prepared by']]} />
      </KeystoneProvider>
    </FeedbackProvider>,
  );
  await act(async () => {});

  return store;
}

describe('a signature on a paper', () => {
  it('shows no resize handle on a paper drawn outside the app', () => {
    render(<Signatures signed={() => png} names={[['D. Lazaro', 'Prepared by']]} />);

    expect(screen.getByRole('img', { name: 'Signature of D. Lazaro' })).toBeInTheDocument();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('is resized from its handle with the keyboard, kept for that signatory, and back to the standard with Home', async () => {
    resize.mockClear();
    const store = await paper([company]);
    const handle = screen.getByRole('slider', { name: 'Size of D. Lazaro\'s signature' });

    expect(handle).toHaveAttribute('aria-valuenow', '100');
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    await act(async () => {});

    expect(resize).toHaveBeenLastCalledWith(expect.anything(), 'D. Lazaro', 1.1, expect.anything());
    expect(signatureSizeOf(companyOf(store.state), 'D. Lazaro')).toBeCloseTo(1.1);
    expect(within(screen.getByRole('img', { name: 'Signature of D. Lazaro' }).parentElement!).getByRole('slider')).toHaveAttribute('aria-valuenow', '110');

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' });
    expect(resize).toHaveBeenLastCalledWith(expect.anything(), 'D. Lazaro', 1, expect.anything());
  });

  it('cannot be resized by staff, or where no part offers resizing', async () => {
    await paper([company], { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' });
    expect(screen.queryByRole('slider')).toBeNull();
    cleanup();

    await paper([]);
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
