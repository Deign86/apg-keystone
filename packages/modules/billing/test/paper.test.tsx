import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { companyOf, nameOf } from '@keystone/core';
import { printElement } from '@keystone/kit';
import { StatementPaper } from '../src/StatementPaper';
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

describe('the billing statement on paper', () => {
  const s = sampleState();

  it('is laid out, and prints, exactly as it has', () => {
    const b = s.bs[0];

    render(<StatementPaper statement={b} billTo={nameOf(s, b.client)} company={companyOf(s)} terms={companyOf(s).billingTerms} />);
    const paper = screen.getByRole('article', { name: `Billing statement ${b.no}` });
    const before = markup(paper);

    expect(before).toMatchSnapshot('on screen');
    expect(printed(paper)).toMatchSnapshot('at the printer');
    expect(markup(paper)).toBe(before);
    expect(pageRules()).toEqual([]);
  });

  it('prints once, a single copy on a whole upright A4 page, not two to cut apart as a check voucher is', () => {
    const b = s.bs[0];

    render(<StatementPaper statement={b} billTo={nameOf(s, b.client)} company={companyOf(s)} terms="" />);
    const paper = screen.getByRole('article', { name: `Billing statement ${b.no}` });

    expect(paper.querySelectorAll('[data-sheet-copy]')).toHaveLength(0);
    expect(paper.querySelectorAll('table[aria-label="Totals"]')).toHaveLength(1);
    expect(paper.hasAttribute('data-print-fit')).toBe(false);
    expect(paper.hasAttribute('data-print-orientation')).toBe(false);
  });

  it('prints each signatory\'s position under their name, and nothing where none is kept', () => {
    const b = { ...s.bs[0], prepared: 'D. Lazaro', checked: 'Mark Anthony Santos', checkedPos: 'Finance Manager', approved: 'Brian Sy', approvedPos: 'Chief Executive Officer' };

    render(<StatementPaper statement={b} billTo={nameOf(s, b.client)} company={companyOf(s)} terms="" />);
    const paper = screen.getByRole('article', { name: `Billing statement ${b.no}` });

    expect(paper.textContent).toMatch(/Mark Anthony SantosFinance ManagerChecked by/);
    expect(paper.textContent).toMatch(/Brian SyChief Executive OfficerApproved by/);
    expect(paper.textContent).toMatch(/D\. LazaroPrepared by/);
  });

  it('lays out every statement in the sample the same way, with and without tax, and one with no charges', () => {
    for (const b of [...s.bs.slice(1), { ...s.bs[0], no: 'blank', lines: [], notes: '', note: '' }]) {
      const { unmount } = render(<StatementPaper statement={b} billTo={nameOf(s, b.client)} company={companyOf(s)} terms="" />);

      expect(markup(screen.getByRole('article', { name: `Billing statement ${b.no}` }))).toMatchSnapshot(b.no);
      unmount();
    }
  });
});
