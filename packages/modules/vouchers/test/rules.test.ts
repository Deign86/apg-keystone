import { describe, expect, it } from 'vitest';
import { bundledSeed, lineDraft, type Ctx } from '@keystone/core';
import {
  copyVoucher, newVoucher, nextVoucherNo, saveVoucher, setVoucherStatus, voucherDraftOf, voucherFigure, voucherFinding, voucherLine,
  voucherLock, voucherWaiting,
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

  it('releases only an approved voucher, and a released one can only be voided', () => {
    // CV-2026-0141 waits for approval and already has its check number.
    expect(() => setVoucherStatus(state(), 'CV-2026-0141', 'Released', ctx)).toThrow('Approve CV-2026-0141 before releasing it.');
    const approved = setVoucherStatus(state(), 'CV-2026-0141', 'Approved', ctx).state;
    expect(setVoucherStatus(approved, 'CV-2026-0141', 'Released', ctx).state.log[0].text).toBe('CV-2026-0141 released; check 0001188 to Vergara & Associates Law Office.');

    // Approval can be taken back until the check is released.
    expect(setVoucherStatus(state(), 'CV-2026-0140', 'For Approval', ctx).state.log[0].text).toBe('CV-2026-0140 returned for approval.');
    expect(() => setVoucherStatus(state(), 'CV-2026-0139', 'For Approval', ctx)).toThrow('CV-2026-0139 is released and stays released. Void it if the check is cancelled.');
    expect(() => setVoucherStatus(state(), 'CV-2026-0139', 'Approved', ctx)).toThrow(/stays released/);
    expect(setVoucherStatus(state(), 'CV-2026-0139', 'Void', ctx).record.status).toBe('Void');
  });

  it('locks a voucher once approved, and copies it to a new voucher with no check', () => {
    const s = state();
    const byNo = (no: string) => s.cv.find((v) => v.no === no)!;
    expect(voucherLock(byNo('CV-2026-0141'))).toBeNull();
    expect(voucherLock(byNo('CV-2026-0140'))).toBe('CV-2026-0140 is approved and can no longer be changed. Copy it to a new voucher to change it.');
    expect(() => saveVoucher(s, voucherDraftOf(byNo('CV-2026-0139')), ctx)).toThrow(voucherLock(byNo('CV-2026-0139'))!);

    const copy = copyVoucher(s, byNo('CV-2026-0140'), ctx);
    expect(copy).toMatchObject({ no: 'CV-2026-0142', date: '2026-10-30', payee: 'V-003', check: '', checkDate: '', prepared: 'D. Lazaro', checked: 'A. Bautista', approved: 'CEO' });
    expect(copy).not.toHaveProperty('editing');
    expect(copy.lines.map((l) => [l.desc, l.amount])).toEqual([['Printing of lease folders (500 pcs)', '12500'], ['Delivery', '650']]);
    expect(saveVoucher(s, { ...copy, check: '0004520' }, ctx).record).toMatchObject({ no: 'CV-2026-0142', status: 'For Approval', check: '0004520' });
    expect(s.cv).toHaveLength(3);
  });

  it('contributes its figure, finding and waiting items', () => {
    const s = state();
    expect(voucherFigure(s)).toMatchObject({ value: '1', caption: '₱35,000.00 pending signature' });
    expect(voucherFinding(s)).toEqual({ priority: 20, text: '1 voucher worth ₱35,000.00 waits for approval.' });
    expect(voucherWaiting(s).map((w) => w.no)).toEqual(['CV-2026-0141']);
    expect(voucherLine(s)).toBe('1 voucher worth ₱35,000.00 waits for approval.');
    expect(voucherLine({ ...s, cv: s.cv.filter((v) => v.status !== 'For Approval') })).toBe('Every voucher is signed. Record a disbursement and route it for signatures.');
  });
});
