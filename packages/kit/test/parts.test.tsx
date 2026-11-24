import { FeedbackProvider, Field, SelectInput, TextInput } from '@keystone/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { COMPANY } from '@keystone/core';
import { Workspace } from '../src/components';
import { KeystoneProvider } from '../src/context';
import { Letterhead, Lines, Meta, Sheet, Signatures, TwoUp } from '../src/documents';
import { MARKS } from '../src/paper';
import { Fills, usePaperPart } from '../src/parts';
import { buildRegistry } from '../src/registry';
import { KeystoneStore } from '../src/store';
import { memoryPlatform } from './fakes';

// Focus in a form field marks the part of the paper beside it that the field fills, on screen only.

const css = readFileSync(createRequire(import.meta.url).resolve('@keystone/ui/styles.css'), 'utf8');

const noop = () => {};

/** A paper made of the kit's blocks, each naming the part it shows. */
function Paper() {
  return (
    <Sheet label="Request RF-1">
      <Letterhead company={COMPANY} title="Request" no="RF-1" date="Nov 2, 2026" />
      <Meta rows={[['Payee', 'Ana Cruz', true, 'payee'], ['Branch', 'Ortigas']]} />
      <Lines columns={[{ header: 'Expense', cell: (l) => l.desc }]} lines={[{ desc: 'Paper', amt: 1 }]} empty="None" footer={[]} part="lines" />
      <Signatures names={[['Ana Cruz', 'Requested by', '', 'payee'], ['', 'Approved by']]} />
    </Sheet>
  );
}

async function workspace(paper = <Paper />) {
  const store = await KeystoneStore.open(memoryPlatform().platform);

  render(
    <FeedbackProvider>
      <KeystoneProvider store={store} registry={buildRegistry([], [])}>
        <Workspace
          previewTitle="Document preview"
          form={(
            <form aria-label="Request">
              <Fills part="no"><Field label="No."><TextInput value="RF-1" onChange={noop} /></Field></Fills>
              <Fills part="payee"><Field label="Payee"><TextInput value="Ana Cruz" onChange={noop} /></Field></Fills>
              <Fills part="lines">
                <Field label="Expense"><TextInput value="Paper" onChange={noop} /></Field>
                <SelectInput label="Bank" value="bdo" onChange={noop} options={[{ value: 'bdo', label: 'BDO' }, { value: 'bpi', label: 'BPI' }]} />
              </Fills>
              <Field label="Memo"><TextInput value="" onChange={noop} /></Field>
            </form>
          )}
          preview={paper}
        />
      </KeystoneProvider>
    </FeedbackProvider>,
  );
}

/** What on the paper is marked, by its text. */
const marked = () => [...document.querySelectorAll(`[${MARKS.active}]`)].map((el) => el.textContent);

afterEach(() => vi.restoreAllMocks());

describe('the part of the paper a field fills', () => {
  it('is marked while the field has focus, everywhere the paper shows it, and nothing else is', async () => {
    await workspace();

    act(() => screen.getByRole('textbox', { name: 'Payee' }).focus());
    // The value in the facts box and the signatory's place, the two places the payee prints.
    expect(marked()).toEqual(['Ana Cruz', expect.stringContaining('Requested by')]);

    act(() => screen.getByRole('textbox', { name: 'No.' }).focus());
    expect(marked()).toEqual(['RF-1']);

    act(() => screen.getByRole('textbox', { name: 'Expense' }).focus());
    expect(document.querySelector(`[${MARKS.active}]`)?.tagName).toBe('TABLE');
  });

  it('is cleared by leaving the form, or by a field that fills no part', async () => {
    await workspace();
    const payee = screen.getByRole('textbox', { name: 'Payee' });

    act(() => payee.focus());
    act(() => screen.getByRole('textbox', { name: 'Memo' }).focus());
    expect(marked()).toEqual([]);

    act(() => payee.focus());
    act(() => payee.blur());
    expect(marked()).toEqual([]);
  });

  it('stays marked while a picker in the field has its list open outside the form', async () => {
    await workspace();
    const form = screen.getByRole('form', { name: 'Request' });

    const bank = screen.getByRole('combobox', { name: 'Bank' });

    // As a click does: focus on the picker, then its list opens.
    act(() => bank.focus());
    fireEvent.click(bank);
    const option = await screen.findByRole('option', { name: 'BPI' });

    act(() => option.focus());
    expect(form.contains(option)).toBe(false);
    expect(document.querySelector(`[${MARKS.active}]`)?.tagName).toBe('TABLE');
  });

  it('is marked on each copy of a two-up sheet', async () => {
    function Copies() {
      const part = usePaperPart();

      return <TwoUp label="Voucher CV-1"><p {...part('payee')}>Ana Cruz</p></TwoUp>;
    }

    await workspace(<Copies />);
    act(() => screen.getByRole('textbox', { name: 'Payee' }).focus());
    expect(marked()).toEqual(['Ana Cruz', 'Ana Cruz']);
  });

  it('leaves a paper outside a Workspace exactly as it was', () => {
    const { container: named } = render(<Paper />);

    const { container: plain } = render(
      <Sheet label="Request RF-1">
        <Letterhead company={COMPANY} title="Request" no="RF-1" date="Nov 2, 2026" />
        <Meta rows={[['Payee', 'Ana Cruz', true], ['Branch', 'Ortigas']]} />
        <Lines columns={[{ header: 'Expense', cell: (l) => l.desc }]} lines={[{ desc: 'Paper', amt: 1 }]} empty="None" footer={[]} />
        <Signatures names={[['Ana Cruz', 'Requested by', ''], ['', 'Approved by']]} />
      </Sheet>,
    );

    expect(named.innerHTML).toBe(plain.innerHTML);
  });

  it('takes no room in the form: a field it wraps is laid out as if it were not there', async () => {
    await workspace();

    const wrapper = screen.getByRole('textbox', { name: 'Payee' }).closest('[data-fills]');

    expect(wrapper?.className).toBe('contents');
  });
});

describe('the pinned preview', () => {
  /** Lays the preview box out 500px tall, its content `content` tall, and the marked part at `top`. */
  function layOut(content: number, top: number) {
    const box = screen.getByRole('region', { name: 'Document preview' });
    let scrolled = 0;

    Object.defineProperties(box, {
      clientHeight: { value: 500 },
      scrollHeight: { value: content },
      scrollTop: { get: () => scrolled, set: (v: number) => { scrolled = v; } },
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function rect(this: Element) {
      const [t, h] = this === box ? [0, 500] : [top, 40];

      return DOMRect.fromRect({ x: 0, y: t, width: 100, height: h });
    });

    return () => scrolled;
  }

  it('scrolls, at once, to bring the marked part to the middle of the box', async () => {
    await workspace();
    const scrolled = layOut(1400, 900);

    act(() => screen.getByRole('textbox', { name: 'Payee' }).focus());
    // 900 down, less the room above it in the middle of the 500px box: (500 − 40) / 2.
    expect(scrolled()).toBe(900 - 230);
  });

  it('stays put when the part is already in view', async () => {
    await workspace();
    const inView = layOut(1400, 200);

    act(() => screen.getByRole('textbox', { name: 'Payee' }).focus());
    expect(inView()).toBe(0);
  });

  it('never scrolls when the whole paper fits, as it does unpinned or stacked', async () => {
    await workspace();
    const scrolled = layOut(500, 900);

    act(() => screen.getByRole('textbox', { name: 'Payee' }).focus());
    expect(scrolled()).toBe(0);
  });
});

describe('the mark on paper', () => {
  it('is drawn on screen only, takes no room, and is left out while Export PDF draws the paper', () => {
    const screenOnly = /@media screen\s*\{\s*\[data-paper-active\]:not\(\[data-pdf-drawing\] \*\)\s*\{([^}]*)\}/.exec(css);

    expect(MARKS).toMatchObject({ active: 'data-paper-active', drawing: 'data-pdf-drawing' });
    expect(screenOnly).not.toBeNull();
    // An outline, pulsing: nothing that changes the size or place of anything on the paper.
    expect(screenOnly?.[1].match(/^\s*([\w-]+):/gm)?.map((p) => p.trim().slice(0, -1))).toEqual(['outline', 'outline-offset', 'animation']);
    // The pulse moves only the outline, and stops for whoever asks for less motion.
    const pulse = /@keyframes paper-mark-pulse\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';

    expect([...new Set(pulse.match(/^\s*([\w-]+):/gm)?.map((p) => p.trim().slice(0, -1)))]).toEqual(['outline-offset']);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\[data-paper-active\]\s*\{\s*animation: none;/);
    // The print stylesheet never names it.
    expect(css.slice(css.indexOf('@media print'))).not.toContain(MARKS.active);
  });
});
