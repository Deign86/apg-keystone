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

/**
 * Lines from a saved draft (docs/adr/0041), each with a new id: one saved in another session could share an id with a
 * line made in this one. What was typed is kept; anything missing starts blank. None saved: one blank line.
 */
export const linesFromDraft = (saved: readonly Partial<LineDraft>[] | undefined): LineDraft[] =>
  (saved?.length ? saved.map((l) => lineDraft({ desc: l.desc ?? '', qty: l.qty ?? '1', amount: l.amount ?? '' })) : [lineDraft()]);

/** Nothing typed on any line: no description and no amount. A quantity alone, which starts at 1, is not something typed. */
export const linesBlank = (lines: readonly LineDraft[]) => lines.every((l) => !l.desc.trim() && !l.amount.trim());

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

// ---------- repeated details (docs/adr/0053) ----------

/** How many earlier entries a field offers. */
export const EARLIER_MOST = 30;

/**
 * Earlier entries a field offers as it is typed: each text once, whatever its capitals and spaces, the newest first,
 * blanks left out. `newestFirst` is as saved, newest first.
 */
export function earlier(newestFirst: Iterable<string | undefined>, most = EARLIER_MOST): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of newestFirst) {
    const text = (value ?? '').trim();
    const key = descKey(text);

    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);

    if (out.length >= most) break;
  }

  return out;
}

/** A line as last saved under its description, to fill one typed again: its quantity and amount (or unit price) as typed. */
export type RememberedLine = Omit<LineDraft, 'id'>;

/** A description as lines are matched by it: capitals and spaces aside. */
const descKey = (desc: string) => desc.trim().replace(/\s+/g, ' ').toUpperCase();

/** The lines saved before, each description once, as last saved; `newestFirst` is the documents' lines, newest first. */
export function rememberedLines(newestFirst: Iterable<LineItem>, most = EARLIER_MOST): RememberedLine[] {
  const seen = new Set<string>();
  const out: RememberedLine[] = [];

  for (const l of newestFirst) {
    const key = descKey(l.desc);

    if (!key || seen.has(key)) continue;
    seen.add(key);
    const { id: _id, ...typed } = lineDraftOf(l);

    out.push({ ...typed, desc: l.desc.trim() });

    if (out.length >= most) break;
  }

  return out;
}

/**
 * A line with its description typed: when it is one remembered and nothing else on the line is typed yet, its quantity
 * and amount come with it. A line with an amount already keeps it.
 */
export function withLineDesc(line: LineDraft, desc: string, remembered: readonly RememberedLine[]): LineDraft {
  const key = descKey(desc);
  const known = key ? remembered.find((r) => descKey(r.desc) === key) : undefined;

  if (!known || line.amount.trim()) return { ...line, desc };

  return { ...line, desc, qty: known.qty, amount: known.amount };
}
