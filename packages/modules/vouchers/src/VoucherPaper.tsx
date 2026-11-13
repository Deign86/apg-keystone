import { forwardRef, type ReactNode } from 'react';
import { amountInWords, longDate, peso, toCentavos, type Company, type DirectoryRecord, type Voucher } from '@keystone/core';
import { voucherTotal } from './rules';
import { Letterhead, Sheet } from '@keystone/kit';

// The company's Check Voucher, twice on one A4 sheet: once on each half, cut apart along the dashed line across the
// middle. Ruled into boxes as the printed cash voucher is, out to near the paper's edges: who and where on the left, the
// number and dates on the right, the particulars with their amounts, the total in figures and in words, and a box for
// each signature. Everything filled in is bold, so it reads at a glance.

type Props = { voucher: Voucher; payee?: DirectoryRecord; company: Company };

/** One labelled box in the ruled grid. */
function Box({ label, children, className = '' }: { label: string; children?: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 items-baseline gap-2 px-2 py-1 ${className}`}>
      <dt className="shrink-0 text-[10px] font-semibold tracking-[0.06em] text-paper-muted uppercase">{label}</dt>
      <dd className="m-0 min-w-0 font-bold tabular-nums break-words">{children || ' '}</dd>
    </div>
  );
}

export const VoucherPaper = forwardRef<HTMLDivElement, Props>(function VoucherPaper({ voucher: v, payee, company }, ref) {
  const total = voucherTotal(v);

  const signatures = [
    [v.preparedPos, v.prepared, 'Prepared by'], [v.checkedPos, v.checked, 'Audited by'], [v.approvedPos, v.approved, 'Approved by'],
    ['', '', 'Received payment by'],
  ];

  return (
    <Sheet ref={ref} fit="halves" label={`Check voucher ${v.no}`}>
      {/* The company's name alone, on one line: no address or contact running down the top left. */}
      <Letterhead company={company} title="Check Voucher" no={`No. ${v.no}`} nameOnly />

      {/* The payee and the bank each share their row: the TIN beside the payee, the issuer beside the bank. */}
      <dl className="m-0 grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_15rem] border border-paper-ink">
        <Box label="Payee" className="border-b border-paper-ink">{payee?.name}</Box>
        <Box label="TIN" className="border-r border-b border-paper-ink">{v.tin}</Box>
        <Box label="Date" className="border-b border-paper-ink">{longDate(v.date)}</Box>
        <Box label="Address" className="col-span-2 border-r border-b border-paper-ink">{payee?.detail}</Box>
        <Box label="Check no." className="border-b border-paper-ink">{v.check}</Box>
        <Box label="Bank">{v.bank}</Box>
        <Box label="Issuer" className="border-r border-paper-ink">{v.issuer}</Box>
        <Box label="Date of check">{v.checkDate ? longDate(v.checkDate) : ''}</Box>
      </dl>

      <div className="flex flex-1 flex-col border-x border-paper-ink">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-paper-ink text-[10px] tracking-[0.12em] uppercase">
              <th className="px-2 py-1 text-center font-semibold">Particulars</th>
              <th className="w-[15rem] border-l border-paper-ink px-2 py-1 text-center font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {v.lines.map((l, i) => (
              <tr key={i} className="align-top font-bold">
                <td className="px-2 py-1">{l.desc}</td>
                <td className="border-l border-paper-ink px-2 py-1 text-right whitespace-nowrap tabular-nums">{peso(toCentavos(l.amt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* The particulars box runs down to the total, however few lines there are. */}
        <div aria-hidden="true" className="grid flex-1 grid-cols-[1fr_15rem]"><span /><span className="border-l border-paper-ink" /></div>
        <table className="w-full border-collapse">
          <tbody>
            <tr className="border-y border-paper-ink text-[13px] font-bold">
              <td className="px-2 py-1 text-right">Total</td>
              <td className="w-[15rem] border-l border-paper-ink px-2 py-1 text-right whitespace-nowrap tabular-nums">{peso(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <dl className="m-0 border-x border-b border-paper-ink">
        <Box label="Pesos">{total > 0 ? amountInWords(total) : ''}</Box>
      </dl>

      <div className="grid grid-cols-4 border-x border-b border-paper-ink text-[11px]">
        {signatures.map(([position, who, role], i) => (
          <div key={role} className={`flex min-h-20 flex-col px-2 py-1 ${i ? 'border-l border-paper-ink' : ''}`}>
            <p className="m-0 text-[10px] font-semibold tracking-[0.06em] text-paper-muted uppercase">{role}</p>
            {/* Room to sign above the line; under it the signatory's position, then their name. */}
            <div className="mt-auto border-t border-paper-line pt-0.5 text-center">
              <p className="m-0 min-h-4 font-semibold">{position}</p>
              <p className="m-0 min-h-4 font-bold">{who}</p>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
});
