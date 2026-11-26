import { Button, Panel, SectionLabel, useConfirm } from '@keystone/ui';
import { useState } from 'react';
import { count, sentenceOf } from '@keystone/core';
import { useKeystone } from '@keystone/kit';
import { paidLine, payRequest, receiptsLock, receiptSize, type FundsRequest, type Receipt } from './rules';
import { RECEIPT_EXTENSIONS, receiptBytes, receiptOf } from './receipt-file';

const isPdf = (r: Receipt) => r.data.startsWith('data:application/pdf');

/**
 * An approved request's receipts (docs/adr/0050). Its requester adds the receipts or other proof of what the money paid
 * for, a photo or a PDF each, and sending them marks the request paid. A paid request shows them, to save, to its
 * requester and the CEO. Nothing shows before it is approved.
 */
export function Receipts({ request: r }: { request: FundsRequest }) {
  const { ctx, run, files, notify } = useKeystone();
  const confirm = useConfirm();
  const [picked, setPicked] = useState<Receipt[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (r.status !== 'Approved' && r.status !== 'Paid') return null;
  const lock = receiptsLock(r, ctx);
  const paid = r.status === 'Paid';
  const shown = paid ? r.receipts ?? [] : picked;

  const add = async () => {
    try {
      const file = await files.open([{ name: 'Receipt', extensions: RECEIPT_EXTENSIONS }]);

      if (!file) return;
      const receipt = await receiptOf(file);
      setPicked((now) => [...now, receipt]);
      setError(null);
    } catch (e) {
      setError(`That file could not be used as a receipt: ${sentenceOf(e)}`);
    }
  };

  const send = () => confirm({
    title: `Mark ${r.no} paid?`,
    body: `${count(picked.length, 'receipt')} ${picked.length === 1 ? 'is' : 'are'} kept with it, for the CEO to see. A paid request cannot be changed.`,
    confirm: 'Mark paid',
    onConfirm: () => {
      const out = run((s, c) => payRequest(s, r.no, picked, c));

      if (out.ok) setPicked([]);
      else setError(out.error);
    },
  });

  const save = (x: Receipt) => files.save(x.name, receiptBytes(x), [{ name: isPdf(x) ? 'PDF' : 'Photo', extensions: [isPdf(x) ? 'pdf' : 'jpg'] }])
    .then((n) => n && notify(`Saved ${n}.`), (e) => notify(sentenceOf(e), 'error'));

  return (
    <Panel aria-labelledby="rf-receipts" className="flex flex-col gap-3">
      <div>
        <SectionLabel id="rf-receipts">Receipts</SectionLabel>
        <p className="m-0 mt-1 text-[13px] text-pretty text-ink-2">
          {paid ? paidLine(r) : lock ?? 'Once the money is spent, upload the receipt or other proof of each expense, a photo or a PDF. Sending them marks this request paid.'}
        </p>
      </div>
      {shown.length > 0 && (
        <ul aria-label={`Receipts for ${r.no}`} className="m-0 flex list-none flex-col p-0">
          {shown.map((x, i) => (
            <li key={i} className="flex items-center gap-3 border-t border-line py-2">
              {isPdf(x)
                ? <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-control bg-surface-2 text-xs font-semibold text-ink-2">PDF</span>
                : <img src={x.data} alt="" className="size-12 shrink-0 rounded-control bg-white object-cover" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{x.name}</span>
                <span className="block text-xs text-ink-2 tabular-nums">{receiptSize(x.data)}</span>
              </span>
              {paid
                ? <Button size="sm" onClick={() => void save(x)} aria-label={`Save ${x.name}`}>Save…</Button>
                : <Button size="sm" kind="quiet" onClick={() => setPicked((now) => now.filter((_, j) => j !== i))} aria-label={`Remove ${x.name}`}>Remove</Button>}
            </li>
          ))}
        </ul>
      )}
      {!paid && !lock && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
          {error && <p role="alert" className="m-0 mr-auto max-w-[44ch] text-[13px] text-bad">{error}</p>}
          <Button onClick={() => void add()}>Add receipt…</Button>
          <Button kind="primary" disabled={!picked.length} onClick={send}>Mark paid…</Button>
        </div>
      )}
    </Panel>
  );
}
