import { parseAmount, toCentavos, toPesos } from './money';
import type { LineItem } from './schema';

// Line items as a form edits them, shared by any document with lines (vouchers,
// statements, and whatever comes next).

export interface LineDraft {
  id: string;
  desc: string;
  acct: string;
  ref: string;
  /** As typed. */
  amount: string;
}

let seq = 0;
export const lineDraft = (init: Partial<Omit<LineDraft, 'id'>> = {}): LineDraft => ({
  id: `line-${++seq}`, desc: '', acct: '', ref: '', amount: '', ...init,
});

export const lineDraftOf = (l: LineItem) => lineDraft({
  desc: l.desc, acct: l.acct ?? '', ref: l.ref ?? '',
  amount: toCentavos(l.amt) % 100 === 0 ? String(Math.round(l.amt)) : l.amt.toFixed(2),
});

/** Lines with no description and no amount are dropped, as in the prototype. */
export function lineItemsOf(drafts: LineDraft[], kind: 'acct' | 'ref'): LineItem[] {
  return drafts
    .map((d) => ({ d, c: parseAmount(d.amount) ?? 0 }))
    .filter(({ d, c }) => d.desc.trim() !== '' || c !== 0)
    .map(({ d, c }) => (kind === 'acct' ? { desc: d.desc, acct: d.acct, amt: toPesos(c) } : { desc: d.desc, ref: d.ref, amt: toPesos(c) }));
}
