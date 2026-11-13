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
    <div className={`flex min-w-0 items-baseline gap-2.5 px-2.5 py-1.5 ${className}`}>
      <dt className="shrink-0 text-[10px] font-semibold tracking-[0.08em] text-paper-muted uppercase">{label}</dt>
      <dd className="m-0 min-w-0 font-bold tabular-nums break-words">{children || '\u00a0'}</dd>
    </div>
  );
}

/** A column heading or the total's label: the paper's gold, in tracked capitals, on the form's tinted bands. */
const heading = 'text-[10px] font-semibold tracking-[0.14em] text-paper-gold uppercase';

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

      {/* One ruled form: a firm line around it and between its parts, a light one between the boxes inside each part. */}
      <div className="flex flex-1 flex-col border border-paper-ink">
        {/* The payee and the bank each share their row: the TIN beside the payee, the issuer beside the bank. */}
        <dl className="m-0 grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_15rem]">
          <Box label="Payee" className="border-b border-paper-line">{payee?.name}</Box>
          <Box label="TIN" className="border-r border-b border-paper-line">{v.tin}</Box>
          <Box label="Date" className="border-b border-paper-line">{longDate(v.date)}</Box>
          <Box label="Address" className="col-span-2 border-r border-b border-paper-line">{payee?.detail}</Box>
          <Box label="Check no." className="border-b border-paper-line">{v.check}</Box>
          <Box label="Bank">{v.bank}</Box>
          <Box label="Issuer" className="border-r border-paper-line">{v.issuer}</Box>
          <Box label="Date of check">{v.checkDate ? longDate(v.checkDate) : ''}</Box>
        </dl>

        <div className="flex flex-1 flex-col border-t border-paper-ink">
          <table className="w-full border-collapse">
            <thead>
              <tr className={`border-b border-paper-line bg-paper-tint ${heading}`}>
                <th className="px-2.5 py-1.5 text-left font-semibold">Particulars</th>
                <th className="w-[15rem] border-l border-paper-line px-2.5 py-1.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {v.lines.map((l, i) => (
                <tr key={i} className="border-b border-paper-rule align-top font-bold">
                  <td className="px-2.5 py-1.5">{l.desc}</td>
                  <td className="border-l border-paper-line px-2.5 py-1.5 text-right whitespace-nowrap tabular-nums">{peso(toCentavos(l.amt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* The particulars box runs down to the total, however few lines there are. */}
          <div aria-hidden="true" className="grid flex-1 grid-cols-[1fr_15rem]"><span /><span className="border-l border-paper-line" /></div>
          <table className="w-full border-collapse">
            <tbody>
              <tr className="border-t border-paper-ink bg-paper-tint">
                <td className={`px-2.5 py-1.5 text-right ${heading}`}>Total</td>
                <td className="w-[15rem] border-l border-paper-line px-2.5 py-1.5 text-right text-sm font-bold whitespace-nowrap tabular-nums">{peso(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <dl className="m-0 border-t border-paper-line">
          <Box label="Pesos">{total > 0 ? amountInWords(total) : ''}</Box>
        </dl>

        <div className="grid grid-cols-4 border-t border-paper-ink text-[11px]">
          {signatures.map(([position, who, role], i) => (
            <div key={role} className={`flex min-h-20 flex-col px-2.5 pt-1.5 pb-1 ${i ? 'border-l border-paper-line' : ''}`}>
              <p className="m-0 text-[10px] font-semibold tracking-[0.08em] text-paper-muted uppercase">{role}</p>
              {/* Room to sign above the line; under it the signatory's position, then their name. */}
              <div className="mx-1 mt-auto border-t border-paper-ink pt-1 text-center">
                <p className="m-0 min-h-4 font-semibold">{position}</p>
                <p className="m-0 min-h-4 font-bold">{who}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
});
