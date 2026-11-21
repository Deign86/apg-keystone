// The Alpha Premier Group of Companies logo made for white paper, as the check voucher carries it.
import companiesLogo from '@keystone/ui/logo-paper-companies.png';
import { forwardRef, type ReactNode } from 'react';
import { DASH, longDate, peso, toCentavos, type Company, type Statement } from '@keystone/core';
import { ewtRateOf, statementTotals, VAT_RATE } from './rules';
import { amountColumn, Lines, Masthead, orDash, paperHeading, paperLabel, paperLogo, Sheet, Signatures } from '@keystone/kit';

// The company's Billing Statement, laid out as its printed form under the check voucher's masthead: the logo with the
// address beside it, the title, number and date, who it is billed to, the invoice box with the penalty terms, the
// charges, then the totals box (subtotal, VAT, the expanded withholding tax taken off, the amount due), how to pay, and
// who signs. Once, on a whole upright A4 page: unlike the check voucher, it is not printed twice on a sheet cut in two.

function Note({ title, text }: { title: string; text?: string }) {
  if (!text?.trim()) return null;

  return (
    <section className="mt-4">
      <p className={`m-0 ${paperHeading}`}>{title}</p>
      <p className="m-0 mt-1 text-[11px] whitespace-pre-line">{text}</p>
    </section>
  );
}

/** One row of a ruled box: its label, then its value. `strong` is the row that counts: a band, in bold. */
function Row({ label, children, strong, first }: { label: string; children: ReactNode; strong?: boolean; first?: boolean }) {
  return (
    <tr className={`${first ? '' : 'border-t border-paper-line'} ${strong ? 'bg-paper-tint' : ''}`}>
      <th scope="row" className={`px-2.5 py-1.5 text-left font-semibold ${strong ? paperHeading : paperLabel}`}>{label}</th>
      <td className={`px-2.5 py-1.5 text-right whitespace-nowrap tabular-nums ${strong ? 'text-sm font-bold' : 'font-semibold'}`}>{children}</td>
    </tr>
  );
}

export const StatementPaper = forwardRef<HTMLDivElement, { statement: Statement; billTo: string; company: Company; terms: string }>(function StatementPaper({ statement: b, billTo, company, terms }, ref) {
  const t = statementTotals(b);

  return (
    <Sheet ref={ref} label={`Billing statement ${b.no}`}>
      {/* Headed as the check voucher is: the Group of Companies logo, with the company's address right beside it. */}
      <Masthead
        title="Billing Statement"
        no={`Invoice No. ${b.no}`}
        date={`Date: ${longDate(b.date)}`}
        mark={<>
          <img src={companiesLogo} alt="Alpha Premier Group of Companies" className={paperLogo} />
          {company.address && <p className="m-0 min-w-0 border-l border-paper-line pl-4 text-[11px] text-pretty text-paper-muted">{company.address}</p>}
        </>}
      />

      <dl className="m-0 mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        <dt className={paperLabel}>Bill to</dt>
        <dd className="m-0 font-bold uppercase">{orDash(billTo)}</dd>
        <dt className={paperLabel}>Attention</dt>
        <dd className="m-0 font-medium whitespace-pre-line">{orDash(b.attention)}</dd>
      </dl>

      <table aria-label="Invoice" className="mb-3 w-full border-collapse border border-paper-ink">
        <tbody>
          <Row label="Invoice No." strong first>{b.no}</Row>
          <Row label="Invoice date">{longDate(b.invoiceDate ?? b.date)}</Row>
          <Row label="Due date">{b.due ? longDate(b.due) : DASH}</Row>
          {terms.trim() && (
            <tr className="border-t border-paper-line">
              <td colSpan={2} className="px-2.5 py-1.5 text-[11px]">{terms}</td>
            </tr>
          )}
        </tbody>
      </table>

      <Lines
        columns={[
          { header: 'Qty', figure: true, cell: (l) => String(l.qty ?? 1) },
          { header: 'Description', cell: (l) => <span className="whitespace-pre-line">{l.desc}</span> },
          { header: 'Unit price', figure: true, cell: (l) => peso(toCentavos(l.price ?? l.amt)) },
          amountColumn(),
        ]}
        lines={b.lines}
        empty="No charges yet."
        footer={[]}
      />

      {/* Every line of the totals box shows, a dash where the tax does not apply, so each statement reads the same. */}
      <table aria-label="Totals" className="mt-3 w-full border-collapse border border-paper-ink">
        <tbody>
          <Row label="Subtotal" first>{peso(t.subtotal)}</Row>
          <Row label={`VAT (${VAT_RATE}%)`}>{b.vat ? peso(t.vat) : DASH}</Row>
          <Row label={`Less: EWT (${ewtRateOf(b)}%)`}>{b.ewt ? `(${peso(t.ewt)})` : DASH}</Row>
          <Row label="Total amount due" strong>{peso(t.due)}</Row>
        </tbody>
      </table>

      <Note title="Payment instructions" text={b.notes} />
      <Note title="Notes" text={b.note} />
      <Signatures names={[[b.prepared ?? '', 'Prepared by', b.preparedPos ?? ''], [b.checked ?? '', 'Checked by', b.checkedPos ?? ''], [b.approved ?? '', 'Approved by', b.approvedPos ?? '']]} />
    </Sheet>
  );
});
