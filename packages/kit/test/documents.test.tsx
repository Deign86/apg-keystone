import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { FitWidth, HALF_PAGE_HEIGHT, LANDSCAPE_PAPER_WIDTH, PAGE_WIDTH, PAPER_WIDTH, Sheet } from '../src/documents';
import { printElement } from '../src/output';

/** The @page rules in the document's head. */
const pageRules = () => [...document.head.querySelectorAll('style')].flatMap((s) => (s.textContent?.startsWith('@page') ? [s.textContent] : []));

describe('document sheet', () => {
  it('lays the paper out at the printed width, whatever column it sits in', () => {
    const ref = createRef<HTMLElement>();
    render(<div style={{ width: 320 }}><Sheet ref={ref} label="Payroll sheet, Oct 16–31, 2026" fit="page">Paper</Sheet></div>);
    const paper = screen.getByRole('article', { name: 'Payroll sheet, Oct 16–31, 2026' });

    // 186 mm, an A4 page less the print margins: the preview, the print and the PDF share one layout.
    expect(PAPER_WIDTH).toBe(703);
    expect(paper.style.width).toBe('703px');
    expect(paper.style.transform).toBe('');
    expect(paper).toHaveAttribute('data-print-fit', 'page');
    // Print and Export PDF are handed the paper itself, not the frame that scales it on screen.
    expect(ref.current).toBe(paper);
  });

  it('lays a two-up sheet out twice on a whole A4 page, a copy on each half, for screen readers once', () => {
    render(<Sheet label="Check voucher 888-001" fit="halves">Paper</Sheet>);
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
  });

  it('turns a sheet too wide to stand upright on its side, and prints it on a landscape page', () => {
    render(<Sheet label="Payroll sheet, Oct 16–31, 2026" fit="page" orientation="landscape"><FitWidth><table><tbody><tr><td>Net pay</td></tr></tbody></table></FitWidth></Sheet>);
    const paper = screen.getByRole('article', { name: 'Payroll sheet, Oct 16–31, 2026' });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});

    // 273 mm, a landscape A4 less the print margins.
    expect(LANDSCAPE_PAPER_WIDTH).toBe(1032);
    expect(paper.style.width).toBe('1032px');
    expect(paper).toHaveAttribute('data-print-orientation', 'landscape');
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

  it('keeps a two-up sheet upright', () => {
    render(<Sheet label="Check voucher 888-001" fit="halves" orientation="landscape">Paper</Sheet>);
    const paper = screen.getByRole('article', { name: 'Check voucher 888-001' });

    expect(paper.style.width).toBe('793px');
    expect(paper).not.toHaveAttribute('data-print-orientation');
  });
});
