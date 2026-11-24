import { FeedbackProvider } from '@keystone/ui';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { companyOf, emptyState, lineDraft, SERVICES, signatureOffsetOf, signatureSizeOf, type Ctx, type LineDraft, type SignatureOffset, type TerminalState } from '@keystone/core';
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

// ---------- a signature, resized and moved where a paper shows it ----------

const png = 'data:image/png;base64,iVBORw0KGgo=';
const signed: TerminalState = { ...emptyState(), company: { ...companyOf(emptyState()), signatures: { 'D. LAZARO': png } } };

/** A stand-in for the company module's service: the CEO (or a computer nobody signs in on) resizes and moves. */
const resize = vi.fn((s: TerminalState, name: string, size: number) => ({
  state: { ...s, company: { ...companyOf(s), signatureSizes: { [name.toUpperCase()]: size } } }, record: companyOf(s), message: 'resized',
}));

const move = vi.fn((s: TerminalState, name: string, offset: SignatureOffset) => ({
  state: { ...s, company: { ...companyOf(s), signatureOffsets: { [name.toUpperCase()]: offset } } }, record: companyOf(s), message: 'moved',
}));

const company: ModuleDef = {
  id: 'company', title: 'Company Details', blurb: '', order: 92, Screen: () => null,
  provides: { [SERVICES.signatureSizes]: { canResize: (ctx: Ctx) => ctx.who?.role !== 'staff', resize, move } },
};

/** The box a signature is drawn in, as its style sets it. */
const box = () => screen.getByRole('img', { name: 'Signature of D. Lazaro' }).parentElement!;

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
  it('is drawn in the standard box, three times as wide as high, on the middle of its line, with no frame outside the app', () => {
    render(<Signatures signed={() => png} names={[['D. Lazaro', 'Prepared by']]} />);

    expect(screen.getByRole('img', { name: 'Signature of D. Lazaro' })).toBeInTheDocument();
    expect([box().style.height, box().style.width, box().style.transform]).toEqual(['3rem', '9rem', 'translate(calc(-50% + 0rem), 0rem)']);
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('scales its whole box with its size, not held to the line, and sits where it was moved', async () => {
    const sized: TerminalState = { ...signed, company: { ...companyOf(signed), signatureSizes: { 'D. LAZARO': 2 }, signatureOffsets: { 'D. LAZARO': { x: -1.5, y: 0.5 } } } };
    const store = await KeystoneStore.open(memoryPlatform(JSON.stringify(sized)).platform);

    render(<FeedbackProvider><KeystoneProvider store={store} registry={buildRegistry([company], [])}><Signatures signed={() => png} names={[['D. Lazaro', 'Prepared by']]} /></KeystoneProvider></FeedbackProvider>);
    await act(async () => {});

    expect([box().style.height, box().style.width, box().style.transform]).toEqual(['6rem', '18rem', 'translate(calc(-50% + -1.5rem), 0.5rem)']);
  });

  it('is moved with Shift and the arrow keys, presses adding up, kept for that signatory', async () => {
    move.mockClear();
    const store = await paper([company]);
    const frame = screen.getByRole('slider', { name: 'Size of D. Lazaro\'s signature' });

    fireEvent.keyDown(frame, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(frame, { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(frame, { key: 'ArrowUp', shiftKey: true });
    await act(async () => {});

    expect(move).toHaveBeenLastCalledWith(expect.anything(), 'D. Lazaro', { x: 0.5, y: -0.25 }, expect.anything());
    expect(signatureOffsetOf(companyOf(store.state), 'D. Lazaro')).toEqual({ x: 0.5, y: -0.25 });
    expect(box().style.transform).toBe('translate(calc(-50% + 0.5rem), -0.25rem)');
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
    expect(within(box()).getByRole('slider')).toHaveAttribute('aria-valuenow', '110');
    expect([box().style.height, box().style.width]).toEqual(['3.3rem', '9.9rem']);

    // Quick presses add up, though the paper has not redrawn between them.
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowUp' });
    expect(resize).toHaveBeenLastCalledWith(expect.anything(), 'D. Lazaro', 1.3, expect.anything());

    move.mockClear();
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' });
    expect(resize).toHaveBeenLastCalledWith(expect.anything(), 'D. Lazaro', 1, expect.anything());
    expect(move).toHaveBeenLastCalledWith(expect.anything(), 'D. Lazaro', { x: 0, y: 0 }, expect.anything());
  });

  it('cannot be resized by staff, or where no part offers resizing', async () => {
    await paper([company], { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' });
    expect(screen.queryByRole('slider')).toBeNull();
    cleanup();

    await paper([]);
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
