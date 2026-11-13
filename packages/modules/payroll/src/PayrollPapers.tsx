import { forwardRef, type ReactNode } from 'react';
import { peso, periodLabel, type Centavos, type Company } from '@keystone/core';
import { FitWidth, Letterhead, Meta, Sheet, Signatures, orDash } from '@keystone/kit';
import { totalOf, type Cutoff, type PayKey, type PayLine } from './rules';

// These documents only lay out the fields of a Pay (./pay.ts). They add up nothing themselves: the payslip's late and
// half-day lines sit under deductions, so its totals are the engine's `earnings` and `totalDeductions`.

// The two documents a cut-off produces, laid out as the HR supervisor's spreadsheet lays them out: the payroll sheet
// everyone signs, and one payslip per employee.

/** "7,068.00", or a dash for nothing, as on the sheet. */
const figure = (c: Centavos) => (c ? peso(c).replace('₱', '') : '—');

interface SheetColumn { header: string; cell: (l: PayLine) => ReactNode; total?: PayKey }

// 22 columns, wider than even a landscape A4 at their narrowest: the sheet is printed on its side, and the table shrinks
// to fit across it (FitWidth), on screen as on paper. Each row keeps to one line, so a long payroll still fits one page.
const COLUMNS: SheetColumn[] = [
  { header: 'Employee no.', cell: (l) => orDash(l.setup.empNo) },
  { header: 'Employee name', cell: (l) => l.name },
  { header: 'Cut-off rate', cell: (l) => figure(l.pay.cutoffRate), total: 'cutoffRate' },
  { header: 'Daily rate', cell: (l) => figure(l.pay.daily) },
  { header: 'Standard days', cell: (l) => l.pay.scheduled },
  { header: 'Days worked', cell: (l) => l.pay.paidDays },
  { header: 'Basic', cell: (l) => figure(l.pay.basic), total: 'basic' },
  { header: 'Special holiday (30%)', cell: (l) => figure(l.pay.specialHoliday), total: 'specialHoliday' },
  { header: 'Regular holiday (100%)', cell: (l) => figure(l.pay.regularHoliday), total: 'regularHoliday' },
  { header: 'Total compensation', cell: (l) => figure(l.pay.compensation), total: 'compensation' },
  { header: 'Incentives allowance', cell: (l) => figure(l.pay.incentive), total: 'incentive' },
  { header: 'HRA', cell: (l) => figure(l.pay.housing), total: 'housing' },
  { header: 'Special allowance', cell: (l) => figure(l.pay.specialAllowance), total: 'specialAllowance' },
  { header: 'Total allowance', cell: (l) => figure(l.pay.allowances), total: 'allowances' },
  { header: 'Late / undertime', cell: (l) => figure(l.pay.late), total: 'late' },
  { header: 'Half day', cell: (l) => figure(l.pay.halfDay), total: 'halfDay' },
  { header: 'Absent', cell: (l) => figure(l.pay.absentAmount), total: 'absentAmount' },
  { header: 'Overtime', cell: (l) => figure(l.pay.overtime), total: 'overtime' },
  { header: 'Gross compensation', cell: (l) => figure(l.pay.gross), total: 'gross' },
  { header: 'Deductions', cell: (l) => figure(l.pay.deductions), total: 'deductions' },
  { header: 'Net pay', cell: (l) => figure(l.pay.net), total: 'net' },
  { header: 'Signature', cell: () => '' },
];

export const PayrollSheet = forwardRef<HTMLDivElement, { cutoff: Cutoff; company: Company }>(function PayrollSheet({ cutoff, company }, ref) {
  const label = periodLabel(cutoff.period);

  return (
    <Sheet ref={ref} label={`Payroll sheet, ${label}`} fit="page" orientation="landscape">
      <Letterhead company={company} title="Payroll" no={label} date={cutoff.closed ? `Closed ${cutoff.closed.slice(0, 10)}` : 'Open'} />
      <FitWidth>
        <table className="w-full border-collapse text-[11px] leading-tight">
          <thead>
            <tr className="border-y border-paper-ink align-bottom">
              {COLUMNS.map((c, i) => <th key={c.header} className={`px-1 py-1 font-semibold uppercase ${i > 1 ? 'text-right' : 'text-left'}`}>{c.header}</th>)}
            </tr>
          </thead>
          <tbody>
            {cutoff.lines.map((l) => (
              <tr key={l.setup.emp} className="border-b border-paper-rule">
                {COLUMNS.map((c, i) => <td key={c.header} className={`px-1 py-1.5 whitespace-nowrap ${i > 1 ? 'text-right tabular-nums' : ''} ${c.header === 'Signature' ? 'min-w-20' : ''}`}>{c.cell(l)}</td>)}
              </tr>
            ))}
            {!cutoff.lines.length && <tr><td colSpan={COLUMNS.length} className="px-1 py-2 text-paper-muted">No employee has a pay setup yet.</td></tr>}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-paper-gold font-semibold">
              {COLUMNS.map((c, i) => <td key={c.header} className={`px-1 py-1 ${i > 1 ? 'text-right tabular-nums whitespace-nowrap' : ''}`}>{i === 0 ? 'Total' : c.total ? figure(totalOf(cutoff, c.total)) : ''}</td>)}
            </tr>
          </tfoot>
        </table>
      </FitWidth>
      <Signatures names={[['', 'Prepared by'], ['', 'Checked by'], ['', 'Approved by']]} />
    </Sheet>
  );
});

function Rows({ title, rows, total }: { title: string; rows: [string, Centavos][]; total: [string, Centavos] }) {
  return (
    <table className="w-full border-collapse self-start">
      <thead>
        <tr className="border-y border-paper-ink text-[11px] uppercase">
          <th className="px-1.5 py-1 text-left font-semibold">{title}</th>
          <th className="px-1.5 py-1 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-paper-rule">
            <td className="px-1.5 py-1">{k}</td>
            <td className="px-1.5 py-1 text-right tabular-nums">{figure(v)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-paper-gold font-semibold">
          <td className="px-1.5 py-1">{total[0]}</td>
          <td className="px-1.5 py-1 text-right tabular-nums">{peso(total[1])}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export const Payslip = forwardRef<HTMLDivElement, { line: PayLine; cutoff: Cutoff; company: Company }>(function Payslip({ line, cutoff, company }, ref) {
  const p = line.pay;
  const label = periodLabel(cutoff.period);

  return (
    <Sheet ref={ref} label={`Payslip, ${line.name}, ${label}`}>
      <Letterhead company={company} title="Payslip" no={label} />
      <Meta rows={[
        ['Employee ID', orDash(line.setup.empNo)], ['Bank', line.setup.bank || 'Cash'],
        ['Employee name', line.name, true], ['Account no.', orDash(line.setup.account)],
        ['Designation', orDash(line.position)], ['Standard working days', p.scheduled],
        ['Department', orDash(line.dept)], ['Paid days', p.paidDays],
        ['TIN', orDash(line.tin)], ['LWOP days', p.absent],
        ['Rate per day', peso(p.daily)], ['Half days', p.halfDays],
      ]} />
      <div className="mt-2 grid grid-cols-2 gap-4">
        <Rows
          title="Earnings"
          rows={[
            ['Basic', p.basic], ['HRA', p.housing], ['Incentives allowance', p.incentive], ['Special allowance', p.specialAllowance],
            ['Regular holiday', p.regularHoliday], ['Special holiday', p.specialHoliday], ['Overtime pay', p.overtime],
          ]}
          total={['Total earnings', p.earnings]}
        />
        <Rows
          title="Deductions"
          rows={[
            ['SSS employee share', p.sss], ['PhilHealth employee share', p.philhealth], ['Pag-IBIG employee share', p.pagibig],
            ['Salary advance', p.advance], ['Late / undertime', p.late], ['Half day', p.halfDay],
          ]}
          total={['Total deductions', p.totalDeductions]}
        />
      </div>
      <div className="mt-4 flex items-baseline justify-between border-y-2 border-paper-gold px-1.5 py-2">
        <span className="font-display text-[13px] font-semibold tracking-[0.08em] uppercase">Net pay</span>
        <span className="text-[15px] font-semibold tabular-nums">{peso(p.net)}</span>
      </div>
      <p className="m-0 mt-2 text-center text-[10.5px] tracking-[0.2em] text-paper-muted uppercase">Confidential</p>
      <Signatures names={[['', 'Prepared by'], [line.name, 'Employee signature']]} />
    </Sheet>
  );
});
