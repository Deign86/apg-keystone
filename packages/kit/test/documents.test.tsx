import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { HALF_PAGE_HEIGHT, PAGE_WIDTH, PAPER_WIDTH, Sheet } from '../src/documents';

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
});
