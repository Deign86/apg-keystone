import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { companyOf, type AttendanceTally, type Ctx, type EmployeeAttendance } from '@keystone/core';
import { printElement } from '@keystone/kit';
import { Payslip, PayrollSheet } from '../src/PayrollPapers';
import { cutoffOf, saveSetup, setupDraftOf } from '../src/rules';
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

const ctx: Ctx = { now: () => new Date(2026, 10, 2, 10) };

/** One cut-off with a day of every kind, the same for both employees on it. */
const tally: AttendanceTally = {
  scheduled: 11, worked: 10, halfDays: 1, absent: 1, regularHolidaysOff: 0, specialHolidaysWorked: 1, regularHolidaysWorked: 0,
  shortMinutes: 55, overtimeHours: 2.5, dayMinutes: 480,
};

const attendance: EmployeeAttendance = { tally: () => tally };

function cutoff() {
  let s = saveSetup(sampleState(), { ...setupDraftOf(sampleState(), 'E-002'), daily: '700', incentive: '1000' }, ctx).state;

  s = saveSetup(s, { ...setupDraftOf(s, 'E-001'), daily: '760', empNo: 'APGCO-0013' }, ctx).state;

  return { s, cut: cutoffOf(s, { from: '2026-10-01', to: '2026-10-15' }, attendance, ctx) };
}

describe('the payroll sheet on paper', () => {
  it('is laid out on its side, and prints on one landscape page, exactly as it has', () => {
    const { s, cut } = cutoff();

    render(<PayrollSheet cutoff={cut} company={companyOf(s)} />);
    const paper = screen.getByRole('article', { name: 'Payroll sheet, Oct 1–15, 2026' });
    const before = markup(paper);

    expect(before).toMatchSnapshot('on screen');
    expect(printed(paper)).toMatchSnapshot('at the printer');
    expect(markup(paper)).toBe(before);
    expect(pageRules()).toEqual([]);
  });

  it('is scaled down by its height to one page when it runs longer, and put back after', () => {
    const { s, cut } = cutoff();

    render(<PayrollSheet cutoff={cut} company={companyOf(s)} />);
    const paper = screen.getByRole('article', { name: 'Payroll sheet, Oct 1–15, 2026' });

    // A browser lays it out; here it is told the sheet is 1,400px tall at the page's width.
    Object.defineProperty(paper, 'scrollHeight', { configurable: true, value: 1400 });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});

    printElement(paper);
    expect({ zoom: paper.style.zoom, width: paper.style.width, page: pageRules() }).toMatchSnapshot('a long sheet at the printer');
    // The page has no margin; the clear band above and below the paper is widened against the zoom, so it prints 12mm.
    expect(Number.parseFloat(paper.style.borderBlockWidth) * Number(paper.style.zoom)).toBeCloseTo(12);
    window.dispatchEvent(new Event('afterprint'));
    print.mockRestore();
    expect(paper.style.zoom).toBe('');
    expect(paper.style.borderBlockWidth).toBe('');
  });
});

describe('the payslip on paper', () => {
  it('is laid out, and prints, exactly as it has', () => {
    const { s, cut } = cutoff();

    render(<Payslip line={cut.lines[0]} cutoff={cut} company={companyOf(s)} />);
    const paper = screen.getByRole('article', { name: `Payslip, ${cut.lines[0].name}, Oct 1–15, 2026` });
    const before = markup(paper);

    expect(before).toMatchSnapshot('on screen');
    expect(printed(paper)).toMatchSnapshot('at the printer');
    expect(markup(paper)).toBe(before);
    expect(pageRules()).toEqual([]);
  });
});
