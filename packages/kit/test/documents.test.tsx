import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { FitWidth, LandscapePage, Sheet, TwoUp } from '../src/documents';
import { HALF_PAGE_HEIGHT, LANDSCAPE_PAPER_WIDTH, MARKS, PAGE_WIDTH, PAPER, PAPER_WIDTH, PRINTABLE } from '../src/paper';
import { printElement } from '../src/output';

/** The @page rules in the document's head. */
const pageRules = () => [...document.head.querySelectorAll('style')].flatMap((s) => (s.textContent?.startsWith('@page') ? [s.textContent] : []));

/** The design system's stylesheet as written, found the way an import finds it. (Vitest hands an imported .css over empty.) */
const css = readFileSync(createRequire(import.meta.url).resolve('@keystone/ui/styles.css'), 'utf8');

describe('the paper', () => {
  it('is an A4 page with the margin the print stylesheet gives it, written once', () => {
    const page = /@page\s*\{\s*size:\s*(\w+);\s*margin:\s*(\d+)mm;\s*\}/.exec(css);

    // The stylesheet cannot read the constant, so this holds the two together.
    expect(page?.slice(1)).toEqual(['A4', String(PAPER.margin)]);
    // What is left inside those margins is what a paper is laid out to: 186 × 273 mm.
    expect(PRINTABLE).toEqual({ width: PAPER.width - 24, height: PAPER.height - 24 });
  });

  it('carries marks the print stylesheet knows by the same names', () => {
    // Printing shows only the print root, and undoes the preview's frame and scale.
    for (const mark of [MARKS.printRoot, MARKS.frame, MARKS.scale]) expect(css, mark).toContain(`[${mark}]`);
    expect(MARKS).toMatchObject({ fit: 'data-print-fit', orientation: 'data-print-orientation', copy: 'data-sheet-copy' });
  });
});

describe('document sheet', () => {
  it('lays the paper out at the printed width, whatever column it sits in', () => {
    const ref = createRef<HTMLElement>();
    render(<div style={{ width: 320 }}><Sheet ref={ref} label="Payslip, Oct 16–31, 2026">Paper</Sheet></div>);
    const paper = screen.getByRole('article', { name: 'Payslip, Oct 16–31, 2026' });

    // 186 mm, an A4 page less the print margins: the preview, the print and the PDF share one layout.
    expect(PAPER_WIDTH).toBe(703);
    expect(paper.style.width).toBe('703px');
    // As tall as what it holds: no minimum leaves a blank band under a short paper.
    expect(paper.style.minHeight).toBe('');
    expect(paper.style.transform).toBe('');
    // An upright sheet inside the margins carries no mark: it prints as the stylesheet says.
    expect(paper).not.toHaveAttribute('data-print-fit');
    expect(paper).not.toHaveAttribute('data-print-orientation');
    // Print and Export PDF are handed the paper itself, not the frame that scales it on screen.
    expect(ref.current).toBe(paper);
  });

  it('lays a two-up sheet out twice on a whole A4 page, a copy on each half, for screen readers once', () => {
    render(<TwoUp label="Check voucher 888-001">Paper</TwoUp>);
    const paper = screen.getByRole('article', { name: 'Check voucher 888-001' });
    const [top, bottom] = paper.querySelectorAll<HTMLElement>('[data-sheet-copy]');

    // 210 mm wide with no print margin, and 148.5 mm a copy: the dashed line between them is the middle of the page.
    expect(PAGE_WIDTH).toBe(793);
    expect(HALF_PAGE_HEIGHT).toBe(561);
    expect(paper.style.width).toBe('793px');
    expect(paper).toHaveAttribute('data-print-fit', 'halves');
    expect([top.style.minHeight, bottom.style.minHeight]).toEqual(['561px', '561px']);
    expect(top).toHaveTextContent('Paper');
    expect(bottom).toHaveTextContent('Paper');
    expect(bottom).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByText('Paper', { ignore: '[aria-hidden], [aria-hidden] *' })).toHaveLength(1);
    // Upright, always: a two-up sheet has no other way round to be asked for.
    expect(paper).not.toHaveAttribute('data-print-orientation');
  });

  it('turns a sheet too wide to stand upright on its side, and prints it on a landscape page', () => {
    render(<LandscapePage label="Payroll sheet, Oct 16–31, 2026"><FitWidth><table><tbody><tr><td>Net pay</td></tr></tbody></table></FitWidth></LandscapePage>);
    const paper = screen.getByRole('article', { name: 'Payroll sheet, Oct 16–31, 2026' });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});

    // 273 mm, a landscape A4 less the print margins.
    expect(LANDSCAPE_PAPER_WIDTH).toBe(1032);
    expect(paper.style.width).toBe('1032px');
    expect(paper).toHaveAttribute('data-print-orientation', 'landscape');
    // And fitted to one page when it prints.
    expect(paper).toHaveAttribute('data-print-fit', 'page');
    expect(paper).toHaveTextContent('Net pay');

    printElement(paper);
    expect(print).toHaveBeenCalledOnce();
    expect(pageRules()).toEqual(['@page { size: A4 landscape; }']);

    // The page goes back to upright once the print is done.
    window.dispatchEvent(new Event('afterprint'));
    expect(pageRules()).toEqual([]);
    expect(paper).not.toHaveAttribute('data-print-root');
    print.mockRestore();
  });
});
