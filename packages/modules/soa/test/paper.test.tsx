import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { companyOf, emptyState } from '@keystone/core';
import { printElement } from '@keystone/kit';
import { newSoa, soaOf, type SoaDraft } from '../src/rules';
import { SoaPaper } from '../src/SoaPaper';

// The printed Statement of Account: its markup held whole on screen and at the printer, and each of its four parts read
// row by row, as a lessee reads them. The lease is the company's form: 354.4 sqm at ₱600, two months' deposit and
// advance, the reservation paid in cash, two years from Jan 1, 2027 at 5% a year, twelve BPI checks.

const ctx = { now: () => new Date(2026, 10, 24, 9, 5) };

const lease = (patch: Partial<SoaDraft> = {}) => soaOf({
  ...newSoa(emptyState(), ctx), client: 'Northwind Retail Corp.', property: 'Unit 5, Ortigas Avenue, Pasig', payee: 'Juan Dela Cruz',
  sqm: '354.4', rate: '600', reservation: '212640', reservationCoverage: '1 month deductible to advance rental', reservationCheck: 'CASH DEPOSIT',
  depositCoverage: 'Remaining 1 month', advanceCoverage: 'Jan – Feb 2027', commencement: '2027-01-01', termMonths: '24', escalation: '5',
  pdcFirst: '2027-02', pdcCount: '12', bank: 'BPI', firstCheck: '6000325749', notes: 'Checks are payable to the lessor.', ...patch,
});

/** The paper with the frame that scales it on screen, a tag to a line, with its images named by file only. */
const markup = (paper: HTMLElement) => (paper.closest('[data-sheet-frame]') ?? paper).outerHTML
  .replace(/ src="[^"]*?([^"/]+)"/g, ' src="$1"').replace(/></g, '>\n<');

/** The @page rules in the document's head. */
const pageRules = () => [...document.head.querySelectorAll('style')].flatMap((s) => (s.textContent?.startsWith('@page') ? [s.textContent] : []));

function paperOf(patch: Partial<SoaDraft> = {}) {
  const soa = lease(patch);

  render(<SoaPaper soa={soa} company={companyOf(emptyState())} />);

  return screen.getByRole('article', { name: `Statement of account ${soa.no}` });
}

/** A table's rows after its headings, each as its cells' text. */
const rows = (paper: HTMLElement, label: string) => within(paper).getByRole('table', { name: label }).querySelectorAll('tbody tr');
const cells = (paper: HTMLElement, label: string) => [...rows(paper, label)].map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent));

describe('the statement of account on paper', () => {
  it('is laid out, and prints, exactly as it has', () => {
    const paper = paperOf();
    const before = markup(paper);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});

    expect(before).toMatchSnapshot('on screen');
    printElement(paper);
    expect({ page: pageRules(), paper: markup(paper) }).toMatchSnapshot('at the printer');
    window.dispatchEvent(new Event('afterprint'));
    print.mockRestore();
    expect(markup(paper)).toBe(before);
    expect(pageRules()).toEqual([]);
  });

  it('is one upright A4 page, not two copies to cut apart and not turned on its side', () => {
    const paper = paperOf();

    expect(paper.querySelectorAll('[data-sheet-copy]')).toHaveLength(0);
    expect(paper.hasAttribute('data-print-fit')).toBe(false);
    expect(paper.hasAttribute('data-print-orientation')).toBe(false);
  });

  it('heads the page with the title, the number and the date it is prepared as of, then who and what the lease is for', () => {
    const paper = paperOf();

    expect(within(paper).getByText('Statement of Account')).toBeInTheDocument();
    expect(within(paper).getByText('SOA-2026-001')).toBeInTheDocument();
    expect(within(paper).getByText('Prepared as of: November 24, 2026')).toBeInTheDocument();
    const facts = [...paper.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);

    expect(facts).toEqual([
      ['Client', 'Northwind Retail Corp.'],
      ['Property address', 'Unit 5, Ortigas Avenue, Pasig'],
      ['Lease terms', '2 years, 5% escalation a year from the second year'],
      ['Payee', 'Juan Dela Cruz'],
      ['Contract commencement', 'January 1, 2027'],
    ]);
  });

  it('shows the working of the monthly rent: area × rate, VAT and EWT on the base', () => {
    const paper = paperOf();

    expect(cells(paper, 'Breakdown')).toEqual([
      ['Base rent', '354.4', '₱600.00', '354.4 sqm × ₱600.00', '₱212,640.00'],
      ['12% VAT', '', '', '₱212,640.00 × 12%', '₱25,516.80'],
      ['Less: 5% EWT', '', '', '₱212,640.00 × 5%', '(₱10,632.00)'],
    ]);
    expect(within(paper).getByRole('table', { name: 'Breakdown' }).querySelector('tfoot')?.textContent).toBe('Monthly rent: base + VAT − EWT₱227,524.80');
  });

  it('dashes VAT and EWT where they are off, and says why', () => {
    expect(cells(paperOf({ vat: false, ewt: false }), 'Breakdown').slice(1)).toEqual([
      ['12% VAT', '', '', 'Not VAT-registered', '—'],
      ['Less: 5% EWT', '', '', 'Not withheld', '—'],
    ]);
  });

  it('lists the deposit and advance with their coverage and checks, the reservation taken off', () => {
    const paper = paperOf();

    expect(cells(paper, 'Deposit and advance')).toEqual([
      ['Less: Reservation', '₱212,640.00', '1', '(₱212,640.00)', '1 month deductible to advance rental', 'CASH DEPOSIT'],
      ['Security deposit (2 months base rent)', '₱212,640.00', '2', '₱425,280.00', 'Remaining 1 month', '—'],
      ['Advance rental (2 months)', '₱227,524.80', '2', '₱455,049.60', 'Jan – Feb 2027', '—'],
    ]);
    expect(within(paper).getByText('Total due on signing').nextElementSibling?.textContent).toBe('₱667,689.60');
  });

  it('gives each lease year its dates and its escalated rent', () => {
    expect(cells(paperOf(), 'Lease term and escalation')).toEqual([
      ['1', 'Jan 1, 2027 – Dec 31, 2027', '—', '₱212,640.00', '₱25,516.80', '(₱10,632.00)', '₱227,524.80'],
      ['2', 'Jan 1, 2028 – Dec 31, 2028', '5%', '₱223,272.00', '₱26,792.64', '(₱11,163.60)', '₱238,901.04'],
    ]);
  });

  it('schedules the checks, totals them, and pays the second year’s first month at its escalated rent', () => {
    const paper = paperOf();
    const checks = cells(paper, 'Postdated checks');

    expect(checks).toHaveLength(12);
    expect(checks[0]).toEqual(['1', 'January 28, 2027', 'BPI', '6000325749', '₱227,524.80', 'February 2027 Rent']);
    expect(checks[11]).toEqual(['12', 'December 28, 2027', 'BPI', '6000325760', '₱238,901.04', 'January 2028 Rent']);
    // 11 × ₱227,524.80 + ₱238,901.04
    expect(within(paper).getByText('Total of 12 checks').nextElementSibling?.textContent).toBe('₱2,741,673.84');
  });

  it('bands the lines of every part white and gold, as every paper’s are', () => {
    const paper = paperOf();

    for (const label of ['Breakdown', 'Deposit and advance', 'Lease term and escalation', 'Postdated checks']) {
      const bands = [...rows(paper, label)].map((r) => (r.classList.contains('bg-paper-tint') ? 'gold' : 'white'));

      expect(bands.slice(0, 3)).toEqual(['white', 'gold', 'white'].slice(0, bands.length));
    }
  });

  it('says what to enter before the lease years and checks can be worked out, and prints no total of checks', () => {
    const paper = paperOf({ commencement: '' });

    expect(cells(paper, 'Lease term and escalation')).toEqual([['Enter the commencement date to see each lease year.']]);
    expect(cells(paper, 'Postdated checks')).toEqual([['Enter the commencement date to schedule the checks.']]);
    expect(within(paper).queryByText(/^Total of /)).toBeNull();
    expect(within(paper).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('prints the notes when there are some', () => {
    expect(within(paperOf()).getByRole('heading', { name: 'Notes' }).nextElementSibling?.textContent).toBe('Checks are payable to the lessor.');
  });

  it('prints no notes when there are none', () => {
    expect(within(paperOf({ notes: '  ' })).queryByRole('heading', { name: 'Notes' })).toBeNull();
  });
});
