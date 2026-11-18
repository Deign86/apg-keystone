import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { companyOf } from '@keystone/core';
import { printElement } from '@keystone/kit';
import type { FundsRequest } from '../src/rules';
import { TransferPaper } from '../src/TransferPaper';
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

const request: FundsRequest = {
  no: 'RF-2026-0007', date: '2026-11-02', purpose: 'Christmas party venue and catering', amount: 48230.55, pay: 'transfer', payee: '',
  lines: [{ desc: 'Venue deposit', amt: 30000 }, { desc: 'Catering, 60 persons', amt: 18230.55 }],
  account: { bank: 'BDO', branch: 'Ortigas', name: 'Casa Milagros Events Inc.', number: '0012 3456 7890' },
  settle: '2026-11-15', requester: 'Ana Cruz', uid: 'hr-1', status: 'Approved',
  decision: { by: 'Mark Reyes', uid: 'owner-1', at: '2026-11-03 14:02', note: 'Go ahead.' },
};

describe('the fund transfer request on paper', () => {
  const company = companyOf(sampleState());

  it('is laid out, and prints, exactly as it has', () => {
    render(<TransferPaper request={request} company={company} />);
    const paper = screen.getByRole('article', { name: 'Fund transfer request RF-2026-0007' });
    const before = markup(paper);

    expect(before).toMatchSnapshot('on screen');
    expect(printed(paper)).toMatchSnapshot('at the printer');
    expect(markup(paper)).toBe(before);
    expect(pageRules()).toEqual([]);
  });

  it('lays out one still waiting, with no account and no expenses listed, the same way', () => {
    render(<TransferPaper request={{ ...request, no: 'RF-2026-0008', status: 'For Approval', decision: undefined, account: undefined, lines: [], settle: 'ASAP' }} company={company} />);

    expect(markup(screen.getByRole('article', { name: 'Fund transfer request RF-2026-0008' }))).toMatchSnapshot('waiting');
  });
});
