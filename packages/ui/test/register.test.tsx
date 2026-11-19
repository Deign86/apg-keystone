import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageOf, Register, type Column } from '../src/register';

interface Row { no: string; payee: string }

const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ no: `888-${String(i + 1).padStart(3, '0')}`, payee: `Payee ${i + 1}` }));
const columns: Column<Row>[] = [{ key: 'no', header: 'No.', width: 120, cell: (r) => r.no }, { key: 'payee', header: 'Payee', cell: (r) => r.payee }];

/** The numbers of the rows on view, heading row left out. */
const shown = () => within(screen.getByRole('table', { name: 'Vouchers' })).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);

afterEach(cleanup);

describe('pageOf', () => {
  it('splits rows into pages, the last one short, and keeps a page asked for within them', () => {
    expect(pageOf(23, 10, 0)).toEqual({ page: 0, pages: 3, first: 0, end: 10 });
    expect(pageOf(23, 10, 2)).toEqual({ page: 2, pages: 3, first: 20, end: 23 });
    // Past the last page (rows deleted while it was shown), the last one; before the first, the first.
    expect(pageOf(23, 10, 7)).toEqual({ page: 2, pages: 3, first: 20, end: 23 });
    expect(pageOf(23, 10, -1)).toEqual({ page: 0, pages: 3, first: 0, end: 10 });
    // No rows still makes one page, an empty one.
    expect(pageOf(0, 10, 0)).toEqual({ page: 0, pages: 1, first: 0, end: 0 });
  });

  it('shows every row once, on exactly one page, for any count and page size', () => {
    for (let total = 0; total <= 40; total++) {
      for (let size = 1; size <= 12; size++) {
        const { pages } = pageOf(total, size, 0);
        const covered = Array.from({ length: pages }, (_, p) => pageOf(total, size, p)).flatMap((at) => Array.from({ length: at.end - at.first }, (_, i) => at.first + i));
        expect(covered).toEqual(Array.from({ length: total }, (_, i) => i));
      }
    }
  });
});

describe('Register', () => {
  it('shows a page of rows at a time with Previous and Next, and keeps the focus on either at the ends', () => {
    render(<Register label="Vouchers" columns={columns} rows={rows(23)} rowKey={(r) => r.no} pageSize={10} empty={null} />);
    const pages = screen.getByRole('navigation', { name: 'Vouchers, pages' });
    const previous = within(pages).getByRole('button', { name: 'Previous' });
    const next = within(pages).getByRole('button', { name: 'Next' });

    expect(shown()).toEqual(rows(10).map((r) => r.no));
    expect(pages.textContent).toContain('1–10 of 23');
    expect(previous.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(next);
    fireEvent.click(next);
    expect(shown()).toEqual(['888-021', '888-022', '888-023']);
    expect(pages.textContent).toContain('21–23 of 23');
    // At the end Next is marked off but stays a button to focus, and pressing it again does nothing.
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(next.hasAttribute('disabled')).toBe(false);
    fireEvent.click(next);
    expect(shown()).toEqual(['888-021', '888-022', '888-023']);

    fireEvent.click(previous);
    expect(shown()[0]).toBe('888-011');
  });

  it('has no pages when every row fits, or when no page size is given', () => {
    const { rerender } = render(<Register label="Vouchers" columns={columns} rows={rows(10)} rowKey={(r) => r.no} pageSize={10} empty={null} />);
    expect(screen.queryByRole('navigation')).toBeNull();
    rerender(<Register label="Vouchers" columns={columns} rows={rows(40)} rowKey={(r) => r.no} empty={null} />);
    expect(shown()).toHaveLength(40);
  });

  it('marks the row open elsewhere as current, and turns to its page when it becomes current', () => {
    const all = rows(23);
    const { rerender } = render(<Register label="Vouchers" columns={columns} rows={all} rowKey={(r) => r.no} pageSize={10} empty={null} />);
    expect(screen.getByRole('table').querySelector('[aria-current]')).toBeNull();

    rerender(<Register label="Vouchers" columns={columns} rows={all} rowKey={(r) => r.no} pageSize={10} current="888-015" empty={null} />);
    expect(shown()[0]).toBe('888-011');
    const current = within(screen.getByRole('table')).getAllByRole('row').filter((r) => r.getAttribute('aria-current') === 'true');
    expect(current).toHaveLength(1);
    expect(within(current[0]).getAllByRole('cell')[0].textContent).toBe('888-015');

    // Paging away from it is left alone while it stays current.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    rerender(<Register label="Vouchers" columns={columns} rows={all} rowKey={(r) => r.no} pageSize={10} current="888-015" empty={null} />);
    expect(shown()[0]).toBe('888-021');
  });

  it('opens on the page of the row current as it is first shown (opened from Home or Overview)', () => {
    render(<Register label="Vouchers" columns={columns} rows={rows(23)} rowKey={(r) => r.no} pageSize={10} current="888-022" empty={null} />);
    expect(shown()).toEqual(['888-021', '888-022', '888-023']);
  });

  it('ticks the rows on the page shown from the box over them, and keeps ticks on other pages', () => {
    const bulk = vi.fn(() => []);
    render(<Register label="Vouchers" columns={columns} rows={rows(23)} rowKey={(r) => r.no} pageSize={10} bulk={bulk} empty={null} />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select every row on this page of Vouchers' }));
    expect(screen.getByRole('toolbar').textContent).toContain('10 selected');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select 888-011' }));
    expect(screen.getByRole('toolbar').textContent).toContain('11 selected');
    expect(bulk).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ no: '888-001' }), expect.objectContaining({ no: '888-011' })]), expect.any(Function));
  });
});
