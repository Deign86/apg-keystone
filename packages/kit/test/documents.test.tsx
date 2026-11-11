import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { PAPER_WIDTH, Sheet } from '../src/documents';

describe('document sheet', () => {
  it('lays the paper out at the printed width, whatever column it sits in', () => {
    const ref = createRef<HTMLElement>();
    render(<div style={{ width: 320 }}><Sheet ref={ref} label="Disbursement voucher CV-2026-0142, 3 copies" onePage>Paper</Sheet></div>);
    const paper = screen.getByRole('article', { name: 'Disbursement voucher CV-2026-0142, 3 copies' });

    // 186 mm, an A4 page less the print margins: the preview, the print and the PDF share one layout.
    expect(PAPER_WIDTH).toBe(703);
    expect(paper.style.width).toBe('703px');
    expect(paper.style.transform).toBe('');
    expect(paper).toHaveAttribute('data-print-fit');
    // Print and Export PDF are handed the paper itself, not the frame that scales it on screen.
    expect(ref.current).toBe(paper);
  });
});
