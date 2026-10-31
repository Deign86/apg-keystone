import { forwardRef } from 'react';
import { longDate, peso, toCentavos, type Company, type DirectoryRecord, type Statement } from '@keystone/core';
import { EWT_RATE, lineWithTax, statementTotals, VAT_RATE } from './rules';
import { Letterhead, Lines, Meta, orDash, Sheet } from '@keystone/kit';

// The company's Billing Statement: who it is for, the invoice dates and penalty terms, the
// charges with tax, then how to pay.

function Note({ title, text }: { title: string; text?: string }) {
  if (!text?.trim()) return null;

  return (
    <section className="mt-3">
      <p className="m-0 text-[11px] font-semibold tracking-[0.04em] uppercase">{title}</p>
      <p className="m-0 mt-0.5 text-[11px] whitespace-pre-line text-paper-muted">{text}</p>
    </section>
  );
}

export const StatementPaper = forwardRef<HTMLDivElement, { statement: Statement; client?: DirectoryRecord; company: Company; terms: string }>(function StatementPaper({ statement: b, client, company, terms }, ref) {
  const t = statementTotals(b);
  const footer: [string, string, boolean?][] = [['Subtotal', peso(t.subtotal)]];

  if (b.vat) footer.push([`VAT (${VAT_RATE}%)`, peso(t.vat)]);

  if (b.ewt) footer.push([`Less: ${EWT_RATE}% expanded withholding tax (BIR Form 2307 to follow)`, `(${peso(t.ewt)})`]);
  footer.push(['Total amount due', peso(t.due), true]);

  return (
    <Sheet ref={ref} label={`Billing statement ${b.no}`}>
      <Letterhead company={company} title="Billing Statement" no={`Invoice No. ${b.no}`} date={`Date: ${longDate(b.date)}`} />
      <Meta rows={[
        ['Bill to', client?.name ?? '—', true], ['Invoice date', longDate(b.invoiceDate ?? b.date)],
        ['Attention', orDash(b.attention)], ['Due date', longDate(b.due), true],
      ]} />
      <p className="mt-0 mb-2 text-[11px] text-paper-muted">{terms}</p>
      <Lines
        columns={[
          { header: 'Qty', figure: true, cell: (l) => String(l.qty ?? 1) },
          { header: 'Description', cell: (l) => l.desc },
          { header: 'Unit price', figure: true, cell: (l) => peso(toCentavos(l.price ?? l.amt)) },
          { header: b.vat ? 'Amount with tax' : 'Amount', figure: true, cell: (l) => peso(lineWithTax(b, l)) },
        ]}
        lines={b.lines}
        empty="No charges yet."
        footer={footer}
      />
      <Note title="Payment instructions" text={b.notes} />
      <Note title="Notes" text={b.note} />
    </Sheet>
  );
});
