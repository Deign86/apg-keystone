import { forwardRef, type ReactNode } from 'react';
import { amountInWords, longDate, peso, toCentavos, type Company, type DirectoryRecord, type Voucher } from '@keystone/core';
import { voucherTotal } from './rules';
import { Letterhead, Sheet } from '@keystone/kit';

// The company's Check Voucher: one voucher on the top half of an A4 sheet, cut once along the dashed line. Ruled into
// boxes as the printed cash voucher is: who and where on the left, the number and dates on the right, the particulars
// with their amounts, the total in figures and in words, and a box for each signature.

/** Lines the particulars box always has room for, so a short voucher keeps its shape. */
const ROWS = 4;

type Props = { voucher: Voucher; payee?: DirectoryRecord; company: Company };

/** One labelled box in the ruled grid. */
function Box({ label, children, strong, className = '' }: { label: string; children?: ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={`flex min-w-0 items-baseline gap-2 px-2 py-1 ${className}`}>
      <dt className="shrink-0 text-[10px] font-semibold tracking-[0.06em] text-paper-muted uppercase">{label}</dt>
      <dd className={`m-0 min-w-0 tabular-nums break-words ${strong ? 'font-semibold' : ''}`}>{children || ' '}</dd>
    </div>
  );
}

export const VoucherPaper = forwardRef<HTMLDivElement, Props>(function VoucherPaper({ voucher: v, payee, company }, ref) {
  const total = voucherTotal(v);
  const blank = Math.max(0, ROWS - v.lines.length);

  return (
    <Sheet ref={ref} fit="half" label={`Check voucher ${v.no}`}>
      {/* The company's name alone, on one line: no address or contact running down the top left. */}
      <Letterhead company={company} title="Check Voucher" no={`No. ${v.no}`} nameOnly />

      <dl className="m-0 grid grid-cols-[1fr_15rem] border border-paper-ink">
        <Box label="Payee" strong className="border-r border-b border-paper-ink">
          {payee && <>{payee.name}{payee.tin && <> <span className="whitespace-nowrap">(TIN {payee.tin})</span></>}</>}
        </Box>
        <Box label="Date" className="border-b border-paper-ink">{longDate(v.date)}</Box>
        <Box label="Address" className="border-r border-b border-paper-ink">{payee?.detail}</Box>
        <Box label="Check no." className="border-b border-paper-ink">{v.check}</Box>
        <Box label="Bank" className="border-r border-paper-ink">{v.bank}</Box>
        <Box label="Date of check">{v.checkDate ? longDate(v.checkDate) : ''}</Box>
      </dl>

      <table className="w-full border-collapse border-x border-paper-ink">
        <thead>
          <tr className="border-b border-paper-ink text-[10px] tracking-[0.12em] uppercase">
            <th className="px-2 py-1 text-center font-semibold">Particulars</th>
            <th className="w-[15rem] border-l border-paper-ink px-2 py-1 text-center font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {v.lines.map((l, i) => (
            <tr key={i} className="align-top">
              <td className="px-2 py-1">{l.desc}</td>
              <td className="border-l border-paper-ink px-2 py-1 text-right whitespace-nowrap tabular-nums">{peso(toCentavos(l.amt))}</td>
            </tr>
          ))}
          {Array.from({ length: blank }, (_, i) => (
            <tr key={`blank-${i}`} aria-hidden="true"><td className="px-2 py-1">&nbsp;</td><td className="border-l border-paper-ink" /></tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-y border-paper-ink text-[13px]">
            <td className="px-2 py-1 text-right font-semibold">Total</td>
            <td className="border-l border-paper-ink px-2 py-1 text-right font-semibold whitespace-nowrap tabular-nums">{peso(total)}</td>
          </tr>
        </tfoot>
      </table>

      <dl className="m-0 border-x border-b border-paper-ink">
        <Box label="Pesos" strong>{total > 0 ? amountInWords(total) : ''}</Box>
      </dl>

      <div className="grid grid-cols-4 border-x border-b border-paper-ink text-[11px]">
        {[[v.prepared, 'Prepared by'], [v.checked, 'Audited by'], [v.approved, 'Approved by'], ['', 'Received payment by']].map(([who, role], i) => (
          <div key={role} className={`flex min-h-16 flex-col justify-between px-2 py-1 ${i ? 'border-l border-paper-ink' : ''}`}>
            <p className="m-0 text-[10px] font-semibold tracking-[0.06em] text-paper-muted uppercase">{role}</p>
            <p className="m-0 min-h-4 border-t border-paper-line pt-0.5 text-center font-semibold">{who}</p>
          </div>
        ))}
      </div>
    </Sheet>
  );
});
