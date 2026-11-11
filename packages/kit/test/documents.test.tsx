import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { HALF_PAGE_HEIGHT, PAPER_WIDTH, Sheet } from '../src/documents';

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

  it('keeps a half sheet to the top half of an A4 page, cut at the middle', () => {
    render(<Sheet label="Check voucher 8888-001" fit="half">Paper</Sheet>);
    const paper = screen.getByRole('article', { name: 'Check voucher 8888-001' });

    // 136.5 mm: from the top margin (12 mm) to the middle of the page (148.5 mm).
    expect(HALF_PAGE_HEIGHT).toBe(516);
    expect(paper.style.minHeight).toBe('516px');
    expect(paper).toHaveAttribute('data-print-fit', 'half');
  });
});
