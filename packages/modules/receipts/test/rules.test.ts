import { describe, expect, it } from 'vitest';
import { refusalOf } from '@keystone/kit/testing';
import { emptyState, lineDraft, withModuleData, type Ctx, type Member } from '@keystone/core';
import {
  earlierReceiptEntries, newReceipt, nextReceiptNo, receiptDraftBlank, receiptDraftFrom, receiptDraftOf, receiptDraftTitle, receiptsLine, receiptsOf,
  rememberedReceiptLines, removeReceipt, saveReceipt, withPayor, type ReceiptDraft,
} from '../src/rules';

/** Nov 26, 2026, 10:00 in Manila. */
const ctx: Ctx = { now: () => new Date(2026, 10, 26, 10, 0) };
const cashier: Member = { uid: 'staff-1', name: 'Rosa Lim', role: 'staff' };

/** A payment for a virtual office, paid by check. */
const paid = (patch: Partial<ReceiptDraft> = {}): ReceiptDraft => ({
  ...newReceipt(emptyState(), ctx), payor: 'Juan Dela Cruz', company: 'Sunrise Bakeshop Co.', contact: '0917 123 4567', email: 'juan@sunrise.ph',
  lines: [lineDraft({ desc: 'Virtual office, December 2026', amount: '2,299' }), lineDraft({ desc: 'Mail handling', amount: '500' })],
  mode: 'Check', check: '0004512', checkDate: '2026-11-30', channel: 'BPI', receivedBy: 'Rosa Lim', position: 'Cashier', ...patch,
});

describe('acknowledgement receipts', () => {
  it('numbers AR-2026-0001 and on, within the year, and starts blank, dated and received today', () => {
    const d = newReceipt(emptyState(), ctx);
    expect(d).toMatchObject({ no: 'AR-2026-0001', date: '2026-11-26', receivedOn: '2026-11-26', mode: 'Cash', payor: '', receivedBy: '' });
    expect(newReceipt(emptyState(), { ...ctx, who: cashier }).receivedBy).toBe('Rosa Lim');
    const s = saveReceipt(emptyState(), paid(), ctx).state;
    expect(nextReceiptNo(s, ctx)).toBe('AR-2026-0002');
    // The next starts received by the same person, in the same position.
    expect(newReceipt(s, ctx)).toMatchObject({ receivedBy: 'Rosa Lim', position: 'Cashier' });
  });

  it('saves who paid, the particulars and their total, how it was paid, and logs it', () => {
    const r = saveReceipt(emptyState(), paid(), ctx);
    expect(r.record).toMatchObject({
      no: 'AR-2026-0001', payor: 'Juan Dela Cruz', lines: [{ desc: 'Virtual office, December 2026', amt: 2299 }, { desc: 'Mail handling', amt: 500 }],
      amount: 2799, mode: 'Check', check: '0004512', checkDate: '2026-11-30',
    });
    expect(r.message).toBe('AR-2026-0001 saved.');
    expect(r.state.log[0]).toMatchObject({ mod: 'AR', text: 'AR-2026-0001 from Juan Dela Cruz, ₱2,799.00 by check received.' });
    expect(receiptsOf(r.state)).toEqual([r.record]);
    expect(receiptsLine(r.state)).toBe('1 receipt issued, for ₱2,799.00 received.');
  });

  it('refuses a receipt it cannot issue, naming the field', () => {
    const s = emptyState();
    expect(refusalOf(() => saveReceipt(s, paid({ payor: ' ' }), ctx))).toEqual({ error: 'Enter who paid.', fields: ['payor'] });
    expect(refusalOf(() => saveReceipt(s, paid({ lines: [lineDraft()] }), ctx))).toEqual({ error: 'List what was paid for, each with its amount.', fields: ['lines.0.desc'] });
    expect(refusalOf(() => saveReceipt(s, paid({ lines: [lineDraft({ desc: 'Rent' })] }), ctx))).toEqual({ error: 'Enter the amount for line 1, Rent.', fields: ['lines.0.amount'] });
    expect(refusalOf(() => saveReceipt(s, paid({ lines: [lineDraft({ amount: '10' })] }), ctx))).toEqual({ error: 'Say what line 1 is for.', fields: ['lines.0.desc'] });
    expect(refusalOf(() => saveReceipt(s, paid({ check: '' }), ctx))).toEqual({ error: 'Enter the check number.', fields: ['check'] });
    expect(refusalOf(() => saveReceipt(s, paid({ email: 'juan' }), ctx))).toEqual({ error: 'Enter a whole email address, like juan.delacruz@gmail.com, or leave it blank.', fields: ['email'] });
    // Cash needs no check number.
    expect(saveReceipt(s, paid({ mode: 'Cash', check: '' }), ctx).record.mode).toBe('Cash');
    const one = saveReceipt(s, paid(), ctx).state;
    expect(refusalOf(() => saveReceipt(one, paid({ no: 'AR-2026-0001' }), ctx))).toEqual({ error: 'AR-2026-0001 is already used. The next free one is AR-2026-0002.', fields: ['no'] });
  });

  it('edits a saved receipt in place, saves a copy as new, and removes one', () => {
    const s = saveReceipt(emptyState(), paid(), ctx).state;
    const d = receiptDraftOf(receiptsOf(s)[0]);
    const edited = saveReceipt(s, { ...d, remarks: 'Paid in full.' }, ctx);
    expect(edited.message).toBe('AR-2026-0001 updated.');
    expect(receiptsOf(edited.state)).toHaveLength(1);
    expect(saveReceipt(s, d, ctx, true).record.no).toBe('AR-2026-0002');
    const removed = removeReceipt(s, 'AR-2026-0001', ctx);
    expect(receiptsOf(removed.state)).toEqual([]);
    expect(removed.state.log[0].text).toBe('AR-2026-0001 from Juan Dela Cruz removed.');
  });

  it('keeps a draft by who paid and how much, and puts one back over a new receipt', () => {
    expect(receiptDraftBlank(newReceipt(emptyState(), ctx))).toBe(true);
    expect(receiptDraftTitle(paid())).toBe('Juan Dela Cruz · ₱2,799.00');
    expect(receiptDraftFrom(emptyState(), ctx, { payor: 'Juan', no: 'AR-2026-0009' })).toMatchObject({ payor: 'Juan', no: 'AR-2026-0001', mode: 'Cash' });
  });

  it('reads damaged data as what it can', () => {
    const s = withModuleData(emptyState(), 'receipts', { receipts: [{ no: 'AR-2026-0003', mode: 'Barter', amount: 'lots' }, 'junk', { payor: 'No number' }] });
    expect(receiptsOf(s)).toMatchObject([{ no: 'AR-2026-0003', mode: 'Cash', amount: 0, lines: [] }]);
  });
});

describe('repeated details on a receipt (docs/adr/0053)', () => {
  it('brings a payor\'s company, contact and email from their last receipt, and offers what was typed before', () => {
    const s = saveReceipt(emptyState(), paid({ remarks: 'Thank you.' }), ctx).state;
    expect(withPayor(s, newReceipt(s, ctx), 'juan  dela cruz')).toMatchObject({ company: 'Sunrise Bakeshop Co.', contact: '0917 123 4567', email: 'juan@sunrise.ph' });
    expect(withPayor(s, { ...newReceipt(s, ctx), company: 'Typed' }, 'Juan Dela Cruz').company).toBe('Typed');
    expect(withPayor(s, newReceipt(s, ctx), 'Someone New')).toMatchObject({ company: '', email: '' });
    expect(earlierReceiptEntries(s)).toMatchObject({ payors: ['Juan Dela Cruz'], channels: ['BPI'], positions: ['Cashier'], remarks: ['Thank you.'] });
    expect(rememberedReceiptLines(s)[0]).toEqual({ desc: 'Virtual office, December 2026', qty: '1', amount: '2299' });
  });
});
