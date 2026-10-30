import { forwardRef } from 'react';
import { amountInWords, longDate, peso, voucherTotal, type Company, type DirectoryRecord, type Voucher } from '@keystone/core';
import { Letterhead, Lines, Meta, orDash, Signatures, Sheet } from '../../app/documents';

export const VoucherPaper = forwardRef<HTMLDivElement, { voucher: Voucher; payee?: DirectoryRecord; company: Company }>(function VoucherPaper({ voucher: v, payee, company }, ref) {
  const total = voucherTotal(v);
  return (
    <Sheet ref={ref} label={`Check voucher ${v.no}`}>
      <Letterhead company={company} title="Check Voucher" no={v.no} />
      <Meta rows={[
        ['Payee', payee?.name ?? '—', true], ['Date', longDate(v.date)],
        ['Address', orDash(payee?.detail)], ['TIN', orDash(payee?.tin)],
        ['Bank', v.bank], ['Check No.', v.check || '________'],
      ]} />
      <Lines middle="Account" lines={v.lines} empty="No particulars yet." middleOf={(l) => l.acct ?? ''} footer={[['Total', peso(total), true]]} />
      <p className="my-2.5 border border-paper-line px-2.5 py-2 italic"><b className="not-italic">Amount in words:</b> {amountInWords(total)}</p>
      <Signatures names={[[v.prepared, 'Prepared by'], [v.checked, 'Checked by'], [v.approved, 'Approved by'], ['', 'Received by / Date']]} />
      <p className="mt-5 mb-0 border-t border-dashed border-paper-line pt-2.5 text-[11px] text-paper-muted">
        Received from Alpha Premier Group the amount of {peso(total)} in full payment of the above. Signature over printed name: ____________________ Date: __________
      </p>
    </Sheet>
  );
});
