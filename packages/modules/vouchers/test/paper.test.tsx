import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { companyOf } from '@keystone/core';
import { printElement } from '@keystone/kit';
import { payeeOf } from '../src/rules';
import { VoucherPaper } from '../src/VoucherPaper';
import { sampleState } from '@keystone/core/sample';

// What the paper is on screen and at the printer, kept whole: every class name, inline style and data attribute of
// the element that is printed and saved as a PDF, and what printing does to it. CI's end-to-end suite measures the
// printed paper in a real browser; this holds the markup that produces it still while the kit's blocks are rearranged.

/** The paper with the frame that scales it on screen, a tag to a line, with its images named by file only. */
const markup = (paper: HTMLElement) => (paper.closest('[data-sheet-frame]') ?? paper).outerHTML
  .replace(/ src="[^"]*?([^"/]+)"/g, ' src="$1"').replace(/></g, '>\n<');

/** The @page rules in the document's head. */
const pageRules = () => [...document.head.querySelectorAll('style')].flatMap((s) => (s.textContent?.startsWith('@page') ? [s.textContent] : []));

/** Prints the paper and answers what it looked like to the printer, then finishes the print. */
function printed(paper: HTMLElement) {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});

  printElement(paper);
  const during = { page: pageRules(), paper: markup(paper) };

  window.dispatchEvent(new Event('afterprint'));
  print.mockRestore();

  return during;
}

describe('the check voucher on paper', () => {
  const s = sampleState();
  const v = s.cv[0];

  it('is laid out, and prints, exactly as it has', () => {
    render(<VoucherPaper voucher={v} payee={payeeOf(s, v)} company={companyOf(s)} />);
    const paper = screen.getByRole('article', { name: `Check voucher ${v.no}` });
    const before = markup(paper);

    expect(before).toMatchSnapshot('on screen');
    expect(printed(paper)).toMatchSnapshot('at the printer');
    // Once the print is done the paper is as it was.
    expect(markup(paper)).toBe(before);
    expect(pageRules()).toEqual([]);
  });

  it('shrinks a copy that runs past half the page, so the cut still falls at the middle, and puts it back after', () => {
    render(<VoucherPaper voucher={v} payee={payeeOf(s, v)} company={companyOf(s)} />);
    const paper = screen.getByRole('article', { name: `Check voucher ${v.no}` });
    const copies = [...paper.querySelectorAll<HTMLElement>('[data-sheet-copy]')];

    // A browser lays them out; here each copy is told it is 700px tall.
    for (const copy of copies) Object.defineProperty(copy, 'scrollHeight', { configurable: true, value: 700 });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});

    printElement(paper);
    expect({ copies: copies.map((c) => ({ zoom: c.style.zoom, height: c.style.height })), page: pageRules() }).toMatchSnapshot('long copies at the printer');
    window.dispatchEvent(new Event('afterprint'));
    print.mockRestore();
    expect(copies.map((c) => [c.style.zoom, c.style.height])).toEqual([['', ''], ['', '']]);
  });

  it('prints a voucher with nothing filled in yet the same way', () => {
    render(<VoucherPaper voucher={{ ...v, payee: '', address: '', tin: '', bank: '', issuer: '', check: '', checkDate: undefined, lines: [], prepared: '', checked: '', approved: '' }} payee={{ name: '', address: '' }} company={{ ...companyOf(s), address: '' }} />);

    expect(markup(screen.getByRole('article', { name: `Check voucher ${v.no}` }))).toMatchSnapshot('blank');
  });
});
