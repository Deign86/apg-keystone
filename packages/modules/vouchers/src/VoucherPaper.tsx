// The Alpha Premier Group of Companies logo made for white paper: GROUP OF COMPANIES under ALPHA PREMIER.
import { forwardRef, type ReactNode } from 'react';
import { amountInWords, longDate, peso, signatureOf, toCentavos, type Company, type CompanyDetails, type Voucher } from '@keystone/core';
import { caps, voucherTotal, type Payee } from './rules';
import { Letterhead, paperHeading as heading, paperLabel, paperStripe, SignatureImage, TwoUp } from '@keystone/kit';

// The company's Check Voucher, twice on one A4 sheet: once on each half, cut apart along the dashed line across the
// middle. Ruled into boxes as the printed cash voucher is, out to near the paper's edges: who and where on the left, the
// number and dates on the right, the particulars with their amounts, the total in figures and in words, and a box for
// each signature. Everything filled in is bold, so it reads at a glance.

/** `payee` is who the voucher pays, as printed (payeeOf). */
type Props = { voucher: Voucher; payee: Payee; company: Company & Pick<CompanyDetails, 'signatures'> };

/** One labelled box in the ruled grid. */
function Box({ label, children, className = '' }: { label: string; children?: ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 items-baseline gap-2.5 px-2.5 py-1.5 ${className}`}>
      <dt className={`shrink-0 ${paperLabel}`}>{label}</dt>
      <dd className="m-0 min-w-0 font-bold tabular-nums break-words">{children || '\u00a0'}</dd>
    </div>
  );
}

export const VoucherPaper = forwardRef<HTMLDivElement, Props>(function VoucherPaper({ voucher: v, payee, company }, ref) {
  const total = voucherTotal(v);

  const signatures = [
    [v.preparedPos, caps(v.prepared), 'Prepared by'], [v.checkedPos, caps(v.checked), 'Audited by'], [v.approvedPos, caps(v.approved), 'Approved by'],
    ['', '', 'Received payment by'],
  ];

  return (
    <TwoUp ref={ref} label={`Check voucher ${v.no}`}>
      <Letterhead company={company} title="Check Voucher" no={`No. ${v.no}`} />

      {/* One ruled form: a firm line between its parts, a light one between the boxes inside each part. No frame around
          it, so nothing is drawn along the paper's edges. */}
      <div className="flex flex-1 flex-col">
        {/* The payee and the issuer each share their row: the TIN beside the payee, the bank beside the issuer. Their
            column is as wide as the bank needs to print on one line beside its label (Security Bank · 9043569583906),
            up to 18rem, and never narrower than 13.5rem, room to write one in by hand; the payee and issuer take the
            rest. The line before the dates is drawn on their left, as it is down the amounts below, so the two meet
            in one straight line. */}
        <dl className="m-0 grid grid-cols-[minmax(0,1fr)_minmax(13.5rem,max-content)_15rem]">
          <Box label="Payee" className="border-b border-paper-line">{caps(payee.name)}</Box>
          <Box label="TIN" className="max-w-[18rem] border-b border-paper-line">{v.tin}</Box>
          <Box label="Date" className="border-b border-l border-paper-line">{longDate(v.date)}</Box>
          <Box label="Address" className="col-span-2 border-b border-paper-line">{payee.address}</Box>
          <Box label="Check no." className="border-b border-l border-paper-line">{v.check}</Box>
          <Box label="Issuer">{v.issuer && caps(v.issuer)}</Box>
          <Box label="Bank" className="max-w-[18rem]">{v.bank}</Box>
          <Box label="Date of check" className="border-l border-paper-line">{v.checkDate ? longDate(v.checkDate) : ''}</Box>
        </dl>

        <div className="flex flex-1 flex-col border-t border-paper-ink">
          {/* Separate borders, each inside its cell: collapsed ones sit astride the cell's edge, half a pixel off the
              line the boxes above and the filler below draw. */}
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr className={`bg-paper-tint ${heading}`}>
                <th className="border-b border-paper-line px-2.5 py-1.5 text-left font-semibold">Particulars</th>
                <th className="w-[15rem] border-b border-l border-paper-line px-2.5 py-1.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {v.lines.map((l, i) => (
                <tr key={i} className={`align-top font-bold ${paperStripe(i)}`}>
                  <td className="border-b border-paper-rule px-2.5 py-1.5">{l.desc}</td>
                  <td className="border-b border-l border-b-paper-rule border-l-paper-line px-2.5 py-1.5 text-right whitespace-nowrap tabular-nums">{peso(toCentavos(l.amt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* The particulars box runs down to the total, however few lines there are. */}
          <div aria-hidden="true" className="grid flex-1 grid-cols-[1fr_15rem]"><span /><span className="border-l border-paper-line" /></div>
          <table className="w-full border-separate border-spacing-0">
            <tbody>
              <tr className="bg-paper-tint">
                <td className={`border-t border-paper-ink px-2.5 py-1.5 text-right ${heading}`}>Total</td>
                <td className="w-[15rem] border-t border-l border-t-paper-ink border-l-paper-line px-2.5 py-1.5 text-right text-sm font-bold whitespace-nowrap tabular-nums">{peso(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <dl className="m-0 border-t border-paper-line">
          <Box label="Pesos">{total > 0 ? amountInWords(total) : ''}</Box>
        </dl>

        <div className="grid grid-cols-4 border-t border-paper-ink text-[11px]">
          {signatures.map(([position, who, role], i) => (
            <div key={role} className={`flex min-h-28 flex-col px-2.5 pt-1.5 pb-1 ${i ? 'border-l border-paper-line' : ''}`}>
              <p className={`m-0 ${paperLabel}`}>{role}</p>
              {/* Room to sign above the line; under it the signatory's name, then their position. */}
              <div className="relative mx-1 mt-auto border-t border-paper-ink pt-1 text-center">
                {/* Their signature over the line, when Company Details keeps one. */}
                {who && signatureOf(company, who) && <SignatureImage center src={signatureOf(company, who) ?? ''} who={who} />}
                <p className="m-0 min-h-4 font-bold">{who}</p>
                <p className="m-0 min-h-4 font-semibold">{position}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </TwoUp>
  );
});
