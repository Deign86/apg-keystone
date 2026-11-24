// The Alpha Premier Group of Companies logo made for white paper, as the check voucher carries it.
import { forwardRef, type ReactNode } from 'react';
import { DASH, longDate, peso, signatureOf, toCentavos, type Company, type CompanyDetails, type Statement } from '@keystone/core';
import { ewtRateOf, statementTotals, VAT_RATE } from './rules';
import { amountColumn, Letterhead, Lines, orDash, paperHeading, paperLabel, Sheet, Signatures, usePaperPart } from '@keystone/kit';

// The company's Billing Statement, laid out as its printed form under every paper's letterhead (the title on top, the
// logo with the address beside it, the number and date): who it is billed to, the invoice box, the charges, then the
// totals box (subtotal, VAT, the expanded withholding tax taken off, the amount due), how to pay, the late-payment
// penalty, and who signs, each with their signature when Company Details keeps one. Once, on a whole upright A4 page: unlike the check voucher, it is not printed twice on a sheet cut in two.

function Note({ title, text, part }: { title: string; text?: string; part: string }) {
  const mark = usePaperPart();

  if (!text?.trim()) return null;

  return (
    <section {...mark(part)} className="mt-4">
      <p className={`m-0 ${paperHeading}`}>{title}</p>
      <p className="m-0 mt-1 text-[11px] whitespace-pre-line">{text}</p>
    </section>
  );
}

/**
 * One row of a ruled box: its label, then its value. `strong` is the row that counts: a band, in bold. `part` is the
 * part of the paper the form's field for it fills.
 */
function Row({ label, children, strong, first, part }: { label: string; children: ReactNode; strong?: boolean; first?: boolean; part?: string }) {
  const mark = usePaperPart();

  return (
    <tr {...mark(part)} className={`${first ? '' : 'border-t border-paper-line'} ${strong ? 'bg-paper-tint' : ''}`}>
      <th scope="row" className={`px-2.5 py-1.5 text-left font-semibold ${strong ? paperHeading : paperLabel}`}>{label}</th>
      <td className={`px-2.5 py-1.5 text-right whitespace-nowrap tabular-nums ${strong ? 'text-sm font-bold' : 'font-semibold'}`}>{children}</td>
    </tr>
  );
}

export const StatementPaper = forwardRef<HTMLDivElement, { statement: Statement; billTo: string; company: Company & Pick<CompanyDetails, 'signatures'>; terms: string }>(function StatementPaper({ statement: b, billTo, company, terms }, ref) {
  const t = statementTotals(b);
  const mark = usePaperPart();

  return (
    <Sheet ref={ref} label={`Billing statement ${b.no}`}>
      <Letterhead company={company} title="Billing Statement" no={`Invoice No. ${b.no}`} date={`Date: ${longDate(b.date)}`} />

      <dl className="m-0 mb-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        <dt className={paperLabel}>Bill to</dt>
        <dd {...mark('billTo')} className="m-0 font-bold uppercase">{orDash(billTo)}</dd>
        <dt className={paperLabel}>Address</dt>
        <dd {...mark('address')} className="m-0 font-medium">{orDash(b.address)}</dd>
        <dt className={paperLabel}>Attention</dt>
        <dd {...mark('attention')} className="m-0 font-medium whitespace-pre-line">{orDash(b.attention)}</dd>
      </dl>

      <table aria-label="Invoice" className="mb-3 w-full border-collapse border border-paper-ink">
        <tbody>
          <Row label="Invoice No." strong first part="no">{b.no}</Row>
          <Row label="Invoice date" part="invoiceDate">{longDate(b.invoiceDate ?? b.date)}</Row>
          <Row label="Due date" part="due">{b.due ? longDate(b.due) : DASH}</Row>
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
        part="lines"
      />

      {/* Every line of the totals box shows, a dash where the tax does not apply, so each statement reads the same. */}
      <table {...mark('totals')} aria-label="Totals" className="mt-3 w-full border-collapse border border-paper-ink">
        <tbody>
          <Row label="Subtotal" first>{peso(t.subtotal)}</Row>
          <Row label={`VAT (${VAT_RATE}%)`}>{b.vat ? peso(t.vat) : DASH}</Row>
          {/* EWT shows only when it is withheld: a statement that withholds none has no line for it. */}
          {b.ewt && <Row label={`Less: EWT (${ewtRateOf(b)}%)`}>{`(${peso(t.ewt)})`}</Row>}
          <Row label="Total amount due" strong>{peso(t.due)}</Row>
        </tbody>
      </table>

      <Note title="Payment instructions" text={b.notes} part="notes" />
      {/* The late-payment penalty: the statement's own, or Company Details' terms on one saved before it kept one. */}
      <Note title="Penalty" text={b.penalty ?? terms} part="penalty" />
      <Note title="Notes" text={b.note} part="note" />
      <Signatures signed={(who) => signatureOf(company, who)} names={[[b.prepared ?? '', 'Prepared by', b.preparedPos ?? '', 'prepared'], [b.checked ?? '', 'Checked by', b.checkedPos ?? '', 'checked'], [b.approved ?? '', 'Approved by', b.approvedPos ?? '', 'approved']]} />
    </Sheet>
  );
});
