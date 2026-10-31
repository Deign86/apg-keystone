import { parseAmount, toCentavos, toPesos } from './money';
import type { LineItem } from './schema';

// Line items as a form edits them, shared by any document with lines (vouchers,
// statements, and whatever comes next). A voucher line is a description and an amount;
// a statement line is a quantity at a unit price.

export interface LineDraft {
  id: string;
  desc: string;
  /** As typed: how many (statement lines). */
  qty: string;
  /** As typed: the amount (voucher lines) or the unit price (statement lines). */
  amount: string;
}

/** How a document's lines are entered. */
export type LinePricing = 'amount' | 'unit';

let seq = 0;

export const lineDraft = (init: Partial<Omit<LineDraft, 'id'>> = {}): LineDraft => ({
  id: `line-${++seq}`, desc: '', qty: '1', amount: '', ...init,
});

const asTyped = (pesos: number) => (toCentavos(pesos) % 100 === 0 ? String(Math.round(pesos)) : pesos.toFixed(2));

export const lineDraftOf = (l: LineItem) => lineDraft({ desc: l.desc, qty: String(l.qty ?? 1), amount: asTyped(l.price ?? l.amt) });

/** A typed quantity: blank means one; anything that is not a number of zero or more is 0. */
export function parseQuantity(typed: string): number {
  const t = typed.replace(/,/g, '').trim();

  if (t === '') return 1;
  const n = Number(t);

  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Lines with no description and no amount are dropped, as in the prototype. */
export function lineItemsOf(drafts: LineDraft[], pricing: LinePricing): LineItem[] {
  return drafts.flatMap((d) => {
    const c = parseAmount(d.amount) ?? 0;

    if (d.desc.trim() === '' && c === 0) return [];

    if (pricing === 'amount') return [{ desc: d.desc, amt: toPesos(c) }];
    const qty = parseQuantity(d.qty);

    return [{ desc: d.desc, qty, price: toPesos(c), amt: toPesos(Math.round(qty * c)) }];
  });
}
