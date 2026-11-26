import { forwardRef } from 'react';
import { amountInWords, longDate, peso, type Company } from '@keystone/core';
import { amountColumn, Letterhead, Lines, Meta, orDash, paperHeading, paperValue, Sheet, Signatures, usePaperPart } from '@keystone/kit';
import { PAY_MODES, receiptTotal, type Receipt } from './rules';

// The acknowledgement receipt (docs/adr/0054), as the company's form lays it out on one A4 page: the receipt's numbers,
// who paid, the particulars and their total in figures and words, how it was paid, the remarks, the acknowledgement,
// who received it, and the note that it is not an official receipt.

/** The receiver's line is always left blank, to sign by hand: whoever takes the payment, with no saved signature. */
type Props = { receipt: Receipt; company: Company };

/** A section's heading, in the paper's gold, as the form heads each part. */
function Heading({ children, part }: { children: string; part?: string }) {
  const mark = usePaperPart();

  return <p {...mark(part)} className={`m-0 mt-3 mb-1 ${paperHeading}`}>{children}</p>;
}

const date = (d: string) => (d ? longDate(d) : '');

export const ReceiptPaper = forwardRef<HTMLElement, Props>(function ReceiptPaper({ receipt: r, company }, ref) {
  const total = receiptTotal(r);
  const mark = usePaperPart();

  return (
    <Sheet ref={ref} label={`Acknowledgement receipt ${r.no}`}>
      <Letterhead company={company} title="Acknowledgement Receipt" no={r.no} date={date(r.date)} />

      <Meta rows={[['Receipt No.', orDash(r.no), true, 'no'], ['Date', orDash(date(r.date)), false, 'date'], ['Transaction No.', orDash(r.transaction), false, 'transaction'], ['Reference', orDash(r.reference), false, 'reference']]} />

      <Heading part="payor">Client information</Heading>
      <Meta rows={[['Client / Payor name', orDash(r.payor), true, 'payor'], ['Company name', orDash(r.company), false, 'company'], ['Contact number', orDash(r.contact), false, 'contact'], ['Email', orDash(r.email), false, 'email']]} />

      <Heading part="lines">Payment details</Heading>
      <Lines
        columns={[{ header: 'Particulars', cell: (l) => l.desc }, amountColumn()]}
        lines={r.lines}
        empty="No particulars listed yet."
        footer={[['Total amount received', peso(total), true]]}
        part="lines"
      />
      <p {...mark('lines')} className="m-0 mb-1 text-[11px] font-medium text-pretty">
        <span className="font-semibold">Amount in words: </span>{total > 0 ? amountInWords(total) : ''}
      </p>

      <Heading part="mode">Mode of payment</Heading>
      <ul {...mark('mode')} aria-label="Mode of payment" className="m-0 mb-1.5 flex list-none flex-wrap gap-x-10 gap-y-1 p-0 text-[12px]">
        {PAY_MODES.map((m) => (
          <li key={m} className={m === r.mode ? paperValue : ''}>
            <span aria-hidden="true">{m === r.mode ? '■' : '□'}</span> {m}<span className="sr-only">{m === r.mode ? ', ticked' : ''}</span>
          </li>
        ))}
      </ul>
      <Meta rows={[
        ['Payment reference / Transaction ID', orDash(r.paymentRef), false, 'paymentRef'], ['Bank / Payment channel', orDash(r.channel), false, 'channel'],
        ['Check No.', orDash(r.check), false, 'check'], ['Check date', orDash(date(r.checkDate)), false, 'checkDate'],
      ]}
      />

      <Heading part="remarks">Transaction remarks</Heading>
      <p {...mark('remarks')} className={`m-0 min-h-8 border-b border-paper-line pb-1 text-[12px] whitespace-pre-line ${paperValue}`}>{r.remarks}</p>

      <Heading>Acknowledgement</Heading>
      <p className="m-0 text-[12px] text-pretty">
        This is to acknowledge receipt of the amount stated above from the client/payor for the particulars and transaction
        described herein. For checks and bank transfers, receipt is subject to successful clearing and verification.
      </p>

      <p className="m-0 mt-3 text-[12px] font-bold">RECEIVED BY:</p>
      <p className="m-0 text-[12px] uppercase">{company.name}</p>
      <div className="max-w-[60%]">
        <Signatures names={[[r.receivedBy, 'Received by', r.position, 'receivedBy']]} />
      </div>
      <p {...mark('receivedOn')} className="m-0 mt-1 text-[12px]"><span className="font-semibold">Date: </span><span className={paperValue}>{date(r.receivedOn)}</span></p>

      <p className="m-0 mt-5 text-[11px] text-pretty text-paper-muted">
        Note: This acknowledgement receipt is proof of payment received and is not, by itself, an Official Receipt or Invoice
        for tax purposes.
      </p>
    </Sheet>
  );
});
