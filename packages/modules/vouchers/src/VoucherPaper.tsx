import { forwardRef } from 'react';
import { longDate, peso, type Company, type DirectoryRecord, type Voucher } from '@keystone/core';
import { voucherTotal } from './rules';
import { amountColumn, Letterhead, Lines, Meta, orDash, Signatures, Sheet } from '@keystone/kit';

// The company's Disbursement Voucher: three copies to a sheet, cut apart after printing.
const COPIES = 3;
const BLANK = '________';

type Props = { voucher: Voucher; payee?: DirectoryRecord; company: Company };

function Slip({ voucher: v, payee, company }: Props) {
  return (
    <>
      <Letterhead company={company} title="Disbursement Voucher" no={`CV No. ${v.no}`} date={`Date: ${longDate(v.date)}`} />
      <Meta rows={[
        ['Payee', payee?.name ?? '—', true], ['Check no.', v.check || BLANK],
        ['Address', orDash(payee?.detail)], ['Date of check', v.checkDate ? longDate(v.checkDate) : BLANK],
      ]} />
      <Lines
        columns={[{ header: 'Particulars', cell: (l) => l.desc }, amountColumn()]}
        lines={v.lines}
        rows={3}
        empty="No particulars yet."
        footer={[['Total', peso(voucherTotal(v)), true]]}
      />
      <Signatures className="mt-5" names={[[v.prepared, 'Prepared by'], [v.checked, 'Audited by'], [v.approved, 'Approved by'], ['', 'Received by']]} />
    </>
  );
}

export const VoucherPaper = forwardRef<HTMLDivElement, Props>(function VoucherPaper(props, ref) {
  return (
    <Sheet ref={ref} onePage label={`Disbursement voucher ${props.voucher.no}, ${COPIES} copies`}>
      {Array.from({ length: COPIES }, (_, i) => (
        // The copies repeat the first, so only the first is read out.
        <div key={i} aria-hidden={i > 0 || undefined} className={i > 0 ? 'mt-5 border-t border-dashed border-paper-line pt-5' : undefined}>
          <Slip {...props} />
        </div>
      ))}
    </Sheet>
  );
});
