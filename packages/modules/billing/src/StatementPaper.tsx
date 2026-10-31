import { forwardRef } from 'react';
import { longDate, peso, type Company, type DirectoryRecord, type Statement } from '@keystone/core';
import { statementTotals } from './rules';
import { Letterhead, Lines, Meta, orDash, Signatures, Sheet } from '@keystone/kit';

export const StatementPaper = forwardRef<HTMLDivElement, { statement: Statement; client?: DirectoryRecord; company: Company; terms: string }>(function StatementPaper({ statement: b, client, company, terms }, ref) {
  const t = statementTotals(b);
  const footer: [string, string, boolean?][] = [['Subtotal', peso(t.subtotal)]];
  if (b.vat) footer.push(['Add: 12% VAT', peso(t.vat)]);
  if (b.ewt) footer.push(['Less: 5% expanded withholding tax (BIR Form 2307 to follow)', `(${peso(t.ewt)})`]);
  footer.push(['Total amount due', peso(t.due), true]);
  return (
    <Sheet ref={ref} label={`Billing statement ${b.no}`}>
      <Letterhead company={company} title="Billing Statement" no={b.no} />
      <Meta rows={[
        ['Bill to', client?.name ?? '—', true], ['Statement date', longDate(b.date)],
        ['Address', orDash(client?.detail)], ['Due date', longDate(b.due), true],
        ['TIN', orDash(client?.tin)], ['Period', orDash(b.period)],
        ['Reference', orDash(b.ref)], ['Terms', terms],
      ]} />
      <Lines middle="Reference" lines={b.lines} empty="No charges yet." middleOf={(l) => l.ref ?? ''} footer={footer} />
      {b.notes && <p className="mt-3 mb-0 text-[11px] text-paper-muted">{b.notes}</p>}
      <Signatures className="max-w-[420px]" names={[['Accounting', 'Prepared by'], ['', 'Received by / Date']]} />
    </Sheet>
  );
});
