import { describe, expect, it } from 'vitest';
import { bundledSeed, lineDraft, type Ctx } from '@keystone/core';
import {
  newVoucher, nextVoucherNo, saveVoucher, setVoucherStatus, voucherDraftOf, voucherFigure, voucherFinding, voucherWaiting,
} from '../src/rules';

/** 30 Oct 2026, 09:05 in Manila. */
const ctx: Ctx = { seed: bundledSeed, now: () => new Date(2026, 9, 30, 9, 5) };
const state = () => structuredClone(bundledSeed.state);

describe('check vouchers', () => {
  it('numbers after the highest voucher', () => {
    expect(nextVoucherNo(state(), ctx)).toBe('CV-2026-0142');
  });

  it('saves a voucher, drops blank lines and logs it', () => {
    const d = { ...newVoucher(state(), ctx), payee: 'V-002', lines: [lineDraft({ desc: 'Water – Head Office', amount: '8,412.30' }), lineDraft()] };
    const r = saveVoucher(state(), d, ctx);
    expect(r.record.no).toBe('CV-2026-0142');
    expect(r.record.lines).toHaveLength(1);
    expect(r.state.log[0]).toEqual({ when: '2026-10-30 09:05', mod: 'CV', text: 'CV-2026-0142 for Manila Water Company saved and routed for approval (₱8,412.30).' });
  });

  it('keeps the date of check, and no longer carries a bank or account code', () => {
    const d = { ...newVoucher(state(), ctx), check: '0004512', checkDate: '2026-11-02', lines: [lineDraft({ desc: 'Retainer – November 2026', amount: '35,000' })] };
    const r = saveVoucher(state(), d, ctx);
    expect(r.record).toMatchObject({ check: '0004512', checkDate: '2026-11-02', lines: [{ desc: 'Retainer – November 2026', amt: 35000 }] });
    expect(r.record).not.toHaveProperty('bank');
    expect(saveVoucher(state(), { ...d, checkDate: '' }, ctx).record).not.toHaveProperty('checkDate');
    expect(voucherDraftOf({ ...state().cv[0], checkDate: undefined }).checkDate).toBe('');
  });

  it('refuses an empty voucher', () => {
    expect(() => saveVoucher(state(), newVoucher(state(), ctx), ctx)).toThrow('Add at least one particular with an amount.');
  });

  it('edits in place while awaiting approval, and copies one already approved', () => {
    const s = state();
    const pending = s.cv.find((v) => v.status === 'For Approval')!;
    const edited = saveVoucher(s, { ...voucherDraftOf(pending), check: '0001190' }, ctx);
    expect(edited.record.no).toBe(pending.no);
    expect(edited.state.cv).toHaveLength(3);
    expect(edited.message).toBe(`${pending.no} updated.`);
    const approved = s.cv.find((v) => v.status === 'Approved')!;
    expect(() => saveVoucher(s, voucherDraftOf(approved), ctx)).toThrow(/can no longer be changed/);
    expect(saveVoucher(s, voucherDraftOf(approved), ctx, true).record.no).toBe('CV-2026-0142');
  });

  it('logs status changes and needs a check number to release', () => {
    const r = setVoucherStatus(state(), 'CV-2026-0141', 'Approved', ctx);
    expect(r.state.log[0].text).toBe('CV-2026-0141 approved by CEO.');
    const blank = { ...state(), cv: state().cv.map((v) => ({ ...v, check: '' })) };
    expect(() => setVoucherStatus(blank, 'CV-2026-0140', 'Released', ctx)).toThrow(/check number/);
  });

  it('contributes its figure, finding and waiting items', () => {
    const s = state();
    expect(voucherFigure(s)).toMatchObject({ value: '1', caption: '₱35,000.00 pending signature' });
    expect(voucherFinding(s)).toEqual({ priority: 20, text: '1 voucher worth ₱35,000.00 waits for approval.' });
    expect(voucherWaiting(s).map((w) => w.no)).toEqual(['CV-2026-0141']);
  });
});
