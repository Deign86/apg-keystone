import { forwardRef } from 'react';
import { amountInWords, longDate, peso, signatureOf, type Company, type CompanyDetails } from '@keystone/core';
import { amountColumn, Letterhead, Lines, Meta, orDash, paperLabel, Sheet, Signatures, usePaperPart } from '@keystone/kit';
import { expensesOf, requestTotal, settleText, type FundsRequest } from './rules';

// The fund transfer request (docs/adr/0021): once the CEO approves a request paid by transfer, the paper that asks
// for its total to be sent to the account it names, for the expenses it lists. One A4 page: who asked and when, the
// account in its own ruled box, the amount in figures and in words, the expenses, and who asked and who approved.

type Props = {
  request: FundsRequest;
  company: Company & Pick<CompanyDetails, 'signatures'>;
  /**
   * Whether the signatures Company Details keeps print above the lines (docs/adr/0051). Money is signed for by hand, so
   * by default the lines are left blank for wet signatures.
   */
  eSigned?: boolean;
};

/** "Nov 15, 2026 at 14:02", from a decision's "2026-11-15 14:02". */
const when = (at: string) => `${longDate(at.slice(0, 10))} at ${at.slice(11, 16)}`;

/** The line under the signatures: where the request stands, so a paper printed before the answer says so. */
function standing(r: FundsRequest): string {
  if (r.status === 'Approved' && r.decision) return `Approved in Keystone by ${r.decision.by} on ${when(r.decision.at)}.`;

  // Paid, its receipts were uploaded after the approval, which the paper still carries (docs/adr/0050).
  if (r.status === 'Paid' && r.decision) return `Approved in Keystone by ${r.decision.by} on ${when(r.decision.at)}. Paid${r.paid ? ` on ${when(r.paid)}` : ''}.`;

  if (r.status === 'For Approval') return 'Not approved yet: this request waits for the CEO\'s decision.';

  return `This request was ${r.status.toLowerCase()} and is not to be paid.`;
}

export const TransferPaper = forwardRef<HTMLElement, Props>(function TransferPaper({ request: r, company, eSigned = false }, ref) {
  const total = requestTotal(r);
  const a = r.account;
  const mark = usePaperPart();

  return (
    <Sheet ref={ref} label={`Fund transfer request ${r.no}`}>
      <Letterhead company={company} title="Fund Transfer Request" no={r.no} date={longDate(r.decision?.at.slice(0, 10) || r.date)} />

      <Meta rows={[['Requested by', orDash(r.requester), true, 'requester'], ['Date filed', longDate(r.date)], ['For', orDash(r.purpose), true, 'purpose'], ['Deadline', settleText(r), false, 'settle']]} />

      <p {...mark('pay')} className={`m-0 mb-1 ${paperLabel}`}>Transfer to</p>
      <Meta rows={[['Bank', orDash(a?.bank), true, 'bank'], ['Branch', orDash(a?.branch), false, 'branch'], ['Account name', orDash(a?.name), true, 'accountName'], ['Account no.', orDash(a?.number), true, 'accountNo']]} />

      <div {...mark('lines')} className="mb-3 flex items-baseline justify-between gap-4 border border-paper-ink px-2.5 py-1.5">
        <span className={paperLabel}>Amount</span>
        <span className="text-right">
          <span className="block text-sm font-bold tabular-nums">{peso(total)}</span>
          {total > 0 && <span className="block text-[11px] font-medium text-pretty">{amountInWords(total)}</span>}
        </span>
      </div>

      <Lines
        columns={[{ header: 'Expense', cell: (l) => l.desc }, amountColumn()]}
        // A request filed before 0021 is its purpose for its amount; a form with nothing typed yet lists nothing.
        lines={r.lines.length || r.amount ? expensesOf(r) : []}
        empty="No expenses listed yet."
        footer={[['Total', peso(total), true]]}
        part="lines"
      />

      <Signatures signed={eSigned ? (who) => signatureOf(company, who) : undefined} names={[[r.requester, 'Requested by', '', 'requester'], [r.checked ?? '', 'Checked by', '', 'checked'], [r.status === 'Approved' || r.status === 'Paid' ? r.decision?.by ?? '' : '', 'Approved by']]} />
      <p className="m-0 mt-3 text-[11px] font-medium text-pretty">{standing(r)}</p>
    </Sheet>
  );
});
