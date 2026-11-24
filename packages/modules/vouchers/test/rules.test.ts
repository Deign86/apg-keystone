import { describe, expect, it } from 'vitest';
import { refusalOf } from '@keystone/kit/testing';
import { companyOf, lineDraft, type Ctx } from '@keystone/core';
import {
  canMoveTo, clearVoided, copyVoucher, draftNo, freesNumber, returnsForApproval, deleteVoucher, deleteVouchers, setVouchersStatus, newVoucher, nextVoucherNo, payeeFoldLabel, payeeKey, payeeOf, saveVoucher, setVoucherStatus, voucherDraftOf, voucherDrafts, voucherFigure, voucherFinding,
  voucherLine, voucherLock, voucherRegister, voucherTone, voucherTotal, voucherWaiting, VOUCHER_STATUSES,
} from '../src/rules';
import { sampleState } from '@keystone/core/sample';

/** 30 Oct 2026, 09:05 in Manila. */
const ctx: Ctx = { now: () => new Date(2026, 9, 30, 9, 5) };
const state = () => sampleState();

/** Manila Water (V-002 in the directory), as typed on a voucher. */
const water = { payee: 'Manila Water Company', address: 'MWSS Compound, Quezon City' };

describe('check vouchers', () => {
  it('keeps the statuses and tones a voucher has always had, and reads one it does not know as neutral', () => {
    // Core held these until the module took them; saved vouchers carry the words.
    expect(VOUCHER_STATUSES.map((s) => [s, voucherTone(s)])).toEqual([['For Approval', 'warn'], ['Approved', 'good'], ['Released', 'neutral'], ['Void', 'neutral']]);
    expect(voucherTone('Cancelled')).toBe('neutral');
  });

  it('numbers 888-001 and on, with no year, after the highest in that series', () => {
    const s = state();
    expect(nextVoucherNo(s)).toBe('888-001');
    s.cv.push({ ...s.cv[0], no: '888-001' }, { ...s.cv[0], no: '888-025' });
    expect(nextVoucherNo(s)).toBe('888-026');
    s.cv.push({ ...s.cv[0], no: '888-999' });
    expect(nextVoucherNo(s)).toBe('888-1000');
  });

  it('leaves vouchers numbered in the old 8888- series out of the count', () => {
    const s = state();
    s.cv.push({ ...s.cv[0], no: '8888-001' }, { ...s.cv[0], no: '8888-042' });
    expect(nextVoucherNo(s)).toBe('888-001');
  });

  it('starts a new voucher with the last voucher\'s signatories, or the reference defaults before the first', () => {
    const s = state();
    s.cv.push({ ...s.cv[0], no: '888-001', prepared: 'Kristine Joy L. Villanueva', checked: 'Angelica S. Bautista', approved: 'Chief Executive Officer' });
    // Names are kept and shown in capitals.
    expect(newVoucher(s, ctx)).toMatchObject({ prepared: 'KRISTINE JOY L. VILLANUEVA', checked: 'ANGELICA S. BAUTISTA', approved: 'CHIEF EXECUTIVE OFFICER' });
    const { preparedBy, checkedBy, approvedBy } = companyOf(sampleState());
    expect(newVoucher({ ...s, cv: [] }, ctx)).toMatchObject({ prepared: preparedBy.toUpperCase(), checked: checkedBy.toUpperCase(), approved: approvedBy.toUpperCase() });
  });

  it('saves a voucher, drops blank lines and logs it', () => {
    const d = { ...newVoucher(state(), ctx), ...water, lines: [lineDraft({ desc: 'Water – Head Office', amount: '8,412.30' }), lineDraft()] };
    const r = saveVoucher(state(), d, ctx);
    expect(r.record.no).toBe('888-001');
    expect(r.record.lines).toHaveLength(1);
    expect(r.state.log[0]).toEqual({ when: '2026-10-30 09:05', mod: 'CV', text: '888-001 for MANILA WATER COMPANY saved and routed for approval (₱8,412.30).' });
  });

  it('offers the next CV No. on a new voucher, keeps one typed in instead, and refuses a number already used', () => {
    const s = state();
    const d = { ...newVoucher(s, ctx), ...water, lines: [lineDraft({ desc: 'Water – Head Office', amount: '8,412.30' })] };

    // Typed, the number is kept, and numbering carries on after it when it is in the series.
    const typed = saveVoucher(s, { ...d, no: ' 888-120 ', typedNo: true }, ctx);
    expect(typed.record.no).toBe('888-120');
    expect(nextVoucherNo(typed.state)).toBe('888-121');
    // A number outside the series is kept too, and leaves the series' count alone.
    expect(saveVoucher(s, { ...d, no: 'CV-2027-0001', typedNo: true }, ctx).record.no).toBe('CV-2027-0001');

    expect(refusalOf(() => saveVoucher(typed.state, { ...d, no: '888-120', typedNo: true }, ctx))).toEqual({ error: 'CV No. 888-120 is already used. The next free one is 888-121.', fields: [] });
    expect(refusalOf(() => saveVoucher(s, { ...d, no: 'CV-2026-0141', typedNo: true }, ctx))).toEqual({ error: 'CV No. CV-2026-0141 is already used. The next free one is 888-001.', fields: [] });
    // Cleared, it takes the next number.
    expect(saveVoucher(s, { ...d, no: '  ', typedNo: true }, ctx).record.no).toBe('888-001');
  });

  it('saves a number it only offered as the next one when it is saved, and a saved voucher under its own', () => {
    const s = state();
    const d = { ...newVoucher(s, ctx), ...water, lines: [lineDraft({ desc: 'Water – Head Office', amount: '8,412.30' })] };
    // Someone else saves 888-001 while this draft still shows it.
    const meanwhile = saveVoucher(s, d, ctx).state;

    expect(draftNo(meanwhile, d)).toBe('888-002');
    expect(saveVoucher(meanwhile, d, ctx).record.no).toBe('888-002');

    const pending = s.cv.find((v) => v.status === 'For Approval')!;
    expect(draftNo(s, voucherDraftOf(s, pending))).toBe(pending.no);
    // A copy saved from it takes the next number, whatever is in the field.
    expect(saveVoucher(s, { ...voucherDraftOf(s, pending), no: '888-500', typedNo: true }, ctx, true).record.no).toBe('888-001');
  });

  it('pays whoever is typed in, at the address typed in, and needs a payee', () => {
    const d = { ...newVoucher(state(), ctx), payee: ' Pasig Office Depot ', address: ' Shaw Blvd., Pasig City ', lines: [lineDraft({ desc: 'Bond paper', amount: '980' })] };

    // A new voucher starts with nobody: the payee is typed, not picked from the directory.
    expect(newVoucher(state(), ctx)).toMatchObject({ payee: '', address: '' });
    const r = saveVoucher(state(), d, ctx);
    expect(r.record).toMatchObject({ payee: 'PASIG OFFICE DEPOT', address: 'Shaw Blvd., Pasig City' });
    expect(payeeOf(r.state, r.record)).toEqual({ name: 'PASIG OFFICE DEPOT', address: 'Shaw Blvd., Pasig City' });
    expect(saveVoucher(state(), { ...d, address: ' ' }, ctx).record).not.toHaveProperty('address');
    expect(refusalOf(() => saveVoucher(state(), { ...d, payee: ' ' }, ctx))).toEqual({ error: 'Enter the payee.', fields: ['payee'] });
  });

  it('reads a voucher saved with a directory code through the directory, and loads it into the form as text', () => {
    const s = state();
    const old = s.cv.find((v) => v.no === 'CV-2026-0140')!;

    expect(old.payee).toBe('V-003');
    expect(payeeOf(s, old)).toEqual({ name: 'JL Santos Printing Services', address: 'Makati City' });
    expect(voucherDraftOf(s, old)).toMatchObject({ payee: 'JL SANTOS PRINTING SERVICES', address: 'Makati City' });
  });

  it('keeps the date of check and the bank the check is drawn on, and no account code', () => {
    const d = { ...newVoucher(state(), ctx, 'BPI · 4011 0258 68'), ...water, check: '0004512', checkDate: '2026-11-02', lines: [lineDraft({ desc: 'Retainer – November 2026', amount: '35,000' })] };
    const r = saveVoucher(state(), d, ctx);
    expect(r.record).toMatchObject({ check: '0004512', checkDate: '2026-11-02', bank: 'BPI · 4011 0258 68', lines: [{ desc: 'Retainer – November 2026', amt: 35000 }] });
    expect(r.record.lines[0]).not.toHaveProperty('acct');
    expect(saveVoucher(state(), { ...d, bank: ' ' }, ctx).record).not.toHaveProperty('bank');
    // The next voucher starts with the bank the last one was drawn on.
    expect(newVoucher(r.state, ctx).bank).toBe('BPI · 4011 0258 68');
    expect(saveVoucher(state(), { ...d, checkDate: '' }, ctx).record).not.toHaveProperty('checkDate');
    expect(voucherDraftOf(state(), { ...state().cv[0], checkDate: undefined }).checkDate).toBe('');
  });

  it('keeps a typed TIN, the issuer and each signatory\'s position, and starts the next voucher with all but the TIN', () => {
    const d = {
      ...newVoucher(state(), ctx), ...water, tin: ' 000-101-528-000 ', issuer: 'Alpha Premier Group of Companies OPC', preparedPos: 'Accounting Staff',
      checkedPos: 'Finance Officer', approvedPos: 'CEO', lines: [lineDraft({ desc: 'Water bill', amount: '980' })],
    };

    const r = saveVoucher(state(), d, ctx);
    expect(r.record).toMatchObject({ tin: '000-101-528-000', issuer: 'ALPHA PREMIER GROUP OF COMPANIES OPC', preparedPos: 'Accounting Staff', checkedPos: 'Finance Officer', approvedPos: 'CEO' });
    // Nothing typed, nothing kept: the TIN is never taken from the directory.
    const blank = saveVoucher(state(), { ...d, tin: '', issuer: ' ', preparedPos: '', checkedPos: '', approvedPos: '' }, ctx).record;

    for (const key of ['tin', 'issuer', 'preparedPos', 'checkedPos', 'approvedPos']) expect(blank).not.toHaveProperty(key);
    expect(newVoucher(r.state, ctx)).toMatchObject({ tin: '', issuer: 'ALPHA PREMIER GROUP OF COMPANIES OPC', preparedPos: 'Accounting Staff', checkedPos: 'Finance Officer', approvedPos: 'CEO' });
    expect(copyVoucher(r.state, r.record, ctx)).toMatchObject({ tin: '000-101-528-000', issuer: 'ALPHA PREMIER GROUP OF COMPANIES OPC', approvedPos: 'CEO' });
  });

  it('refuses an empty voucher', () => {
    expect(refusalOf(() => saveVoucher(state(), newVoucher(state(), ctx), ctx))).toEqual({ error: 'Add at least one particular with an amount.', fields: ['lines.0.amount'] });
  });

  it('edits in place while awaiting approval, and copies one already approved', () => {
    const s = state();
    const pending = s.cv.find((v) => v.status === 'For Approval')!;
    const edited = saveVoucher(s, { ...voucherDraftOf(state(), pending), check: '0001190' }, ctx);
    expect(edited.record.no).toBe(pending.no);
    expect(edited.state.cv).toHaveLength(3);
    expect(edited.message).toBe(`${pending.no} updated.`);
    const approved = s.cv.find((v) => v.status === 'Approved')!;
    expect(saveVoucher(s, voucherDraftOf(state(), approved), ctx, true).record.no).toBe('888-001');
  });

  it('approves the CEO\'s voucher as it is saved, and routes anyone else\'s for approval', () => {
    const ceo: Ctx = { ...ctx, who: { uid: 'ceo-1', name: 'Mark Reyes', role: 'owner' } };
    const staff: Ctx = { ...ctx, who: { uid: 'staff-1', name: 'Ana Cruz', role: 'staff' } };
    const d = { ...newVoucher(state(), ceo), ...water, lines: [lineDraft({ desc: 'Water – Head Office', amount: '8,412.30' })] };

    const mine = saveVoucher(state(), d, ceo);
    expect(mine.record).toMatchObject({ no: '888-001', status: 'Approved', prepared: 'MARK REYES' });
    expect(mine.message).toBe('888-001 saved and approved.');
    expect(mine.state.log[0].text).toBe('888-001 for MANILA WATER COMPANY saved and approved by Mark Reyes (₱8,412.30).');
    expect(voucherWaiting(mine.state).map((w) => w.no)).toEqual(['CV-2026-0141']);
    // Save as new is a new voucher too.
    expect(saveVoucher(state(), { ...d, editing: 'CV-2026-0141' }, ceo, true).record.status).toBe('Approved');

    const theirs = saveVoucher(state(), d, staff);
    expect(theirs.record.status).toBe('For Approval');
    expect(theirs.message).toBe('888-001 saved and routed for approval.');
    // An edit approves nothing, even the CEO's: one waiting still waits.
    expect(saveVoucher(theirs.state, { ...voucherDraftOf(state(), theirs.record), check: '0004512' }, ceo).record.status).toBe('For Approval');
  });

  it('edits an approved voucher until it is released: the CEO keeps its approval, anyone else sends it back', () => {
    const s = state();
    const approved = s.cv.find((v) => v.no === 'CV-2026-0140')!;
    const d = { ...voucherDraftOf(state(), approved), check: ' 0004530 ', checkDate: '2026-11-03', lines: [lineDraft({ desc: 'Printing of lease folders (500 pcs)', amount: '12000' })] };

    // Nobody signed in, or staff: the corrected voucher waits for approval again.
    const r = saveVoucher(s, d, ctx);

    expect(r.record).toMatchObject({ no: 'CV-2026-0140', status: 'For Approval', check: '0004530', checkDate: '2026-11-03', lines: [{ amt: 12000 }] });
    expect(r.message).toBe('CV-2026-0140 updated and returned for approval.');
    expect(r.state.log[0].text).toBe('CV-2026-0140 for JL SANTOS PRINTING SERVICES edited after approval, and returned for approval (₱12,000.00).');
    // The CEO's correction stays approved.
    const ceo: Ctx = { ...ctx, who: { uid: 'ceo-1', name: 'Mark Reyes', role: 'owner' } };
    const mine = saveVoucher(s, d, ceo);

    expect(mine.record.status).toBe('Approved');
    expect(mine.message).toBe('CV-2026-0140 updated.');
    expect(mine.state.log[0].text).toBe('CV-2026-0140 for JL SANTOS PRINTING SERVICES edited after approval (₱12,000.00).');

    const released = s.cv.find((v) => v.no === 'CV-2026-0139')!;
    expect(() => saveVoucher(s, { ...voucherDraftOf(state(), released), check: '0009999' }, ctx)).toThrow(/released and can no longer be changed/);
  });

  it('keeps an approved voucher approved when only its check is written in, by anyone, older vouchers too', () => {
    const s = state();
    // CV-2026-0140 names its payee by directory code and was saved before names were in capitals.
    const approved = s.cv.find((v) => v.no === 'CV-2026-0140')!;
    const d = { ...voucherDraftOf(state(), approved), check: ' 0004530 ', checkDate: '2026-11-03' };

    expect(returnsForApproval(s, d, ctx)).toBe(false);
    expect(returnsForApproval(s, { ...d, address: 'Pasig City' }, ctx)).toBe(true);
    const r = saveVoucher(s, d, ctx);

    expect(r.record).toMatchObject({ status: 'Approved', check: '0004530', checkDate: '2026-11-03' });
    expect(r.state.log[0].text).toBe('CV-2026-0140 check 0004530 entered, dated Nov 3, 2026.');
    expect(saveVoucher(r.state, voucherDraftOf(r.state, r.record), ctx)).toMatchObject({ state: r.state, message: 'CV-2026-0140 is unchanged.' });
    const cleared = saveVoucher(r.state, { ...voucherDraftOf(r.state, r.record), check: '', checkDate: '' }, ctx);

    expect(cleared.record).toMatchObject({ status: 'Approved', check: '' });
    expect(cleared.state.log[0].text).toBe('CV-2026-0140 check number cleared.');
  });

  it('locks a voucher once released, and copies it to a new voucher with no check', () => {
    const s = state();
    const byNo = (no: string) => s.cv.find((v) => v.no === no)!;
    expect(voucherLock(byNo('CV-2026-0141'))).toBeNull();
    expect(voucherLock(byNo('CV-2026-0140'))).toBeNull();
    expect(voucherLock(byNo('CV-2026-0139'))).toBe('CV-2026-0139 is released and can no longer be changed. Copy it to a new voucher to change it.');
    expect(() => saveVoucher(s, voucherDraftOf(state(), byNo('CV-2026-0139')), ctx)).toThrow(voucherLock(byNo('CV-2026-0139'))!);

    const copy = copyVoucher(s, byNo('CV-2026-0140'), ctx);
    expect(copy).toMatchObject({ no: '888-001', date: '2026-10-30', payee: 'JL SANTOS PRINTING SERVICES', address: 'Makati City', check: '', checkDate: '', prepared: 'D. LAZARO', checked: 'A. BAUTISTA', approved: 'CEO' });
    expect(copy).not.toHaveProperty('editing');
    expect(copy.lines.map((l) => [l.desc, l.amount])).toEqual([['Printing of lease folders (500 pcs)', '12500'], ['Delivery', '650']]);
    expect(saveVoucher(s, { ...copy, check: '0004520' }, ctx).record).toMatchObject({ no: '888-001', status: 'For Approval', check: '0004520' });
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

  it('drafts a voucher for spending approved elsewhere, For Approval with one particular and no check (vouchers.drafts)', () => {
    const s = state();
    const r = voucherDrafts.draft(s, { payee: 'V-002', amount: 48230.55, particulars: 'Christmas party venue (RF-2026-0001)' }, ctx);
    expect(r.record).toMatchObject({ no: '888-001', payee: 'MANILA WATER COMPANY', address: water.address, status: 'For Approval', check: '', lines: [{ desc: 'Christmas party venue (RF-2026-0001)', amt: 48230.55 }] });
    expect(r.record).not.toHaveProperty('checkDate');
    expect(r.state.cv).toHaveLength(s.cv.length + 1);
    expect(r.state.log[0].text).toBe('888-001 for MANILA WATER COMPANY saved and routed for approval (₱48,230.55).');
    expect(refusalOf(() => voucherDrafts.draft(s, { payee: 'V-999', amount: 100, particulars: 'Nothing' }, ctx))).toEqual({ error: 'Choose a payee from the directory.', fields: [] });
    expect(refusalOf(() => voucherDrafts.draft(s, { payee: 'V-002', amount: 0, particulars: 'Nothing' }, ctx))).toEqual({ error: 'Add at least one particular with an amount.', fields: ['lines.0.amount'] });
    // The CEO's decision drafts it, and accounting still completes it: it waits for approval like any other.
    const ceo: Ctx = { ...ctx, who: { uid: 'ceo-1', name: 'Mark Reyes', role: 'owner' } };
    expect(voucherDrafts.draft(s, { payee: 'V-002', amount: 100, particulars: 'Venue deposit' }, ceo).record.status).toBe('For Approval');
  });

  describe('void vouchers, and the register over time', () => {
    /** A day in Manila, at 09:05. */
    const on = (iso: string): Ctx => {
      const [y, m, d] = iso.split('-').map(Number);

      return { now: () => new Date(y, m - 1, d, 9, 5) };
    };

    it('dates a voucher as it is voided', () => {
      expect(setVoucherStatus(state(), 'CV-2026-0139', 'Void', ctx).record.voided).toBe('2026-10-30');
    });

    it('deletes only a void voucher, and numbering closes up behind the last ones deleted', () => {
      const s = { ...state(), cv: [...state().cv, { ...state().cv[0], no: '888-003', status: 'Void' }, { ...state().cv[0], no: '888-004', status: 'Void' }] };

      expect(() => deleteVoucher(s, 'CV-2026-0141', ctx)).toThrow('Only a void voucher can be deleted. Void CV-2026-0141 first.');
      expect(() => deleteVoucher(s, '888-009', ctx)).toThrow('888-009 is not in the register.');
      expect(nextVoucherNo(s)).toBe('888-005');
      expect([freesNumber(s, '888-004'), freesNumber(s, '888-003')]).toEqual([true, false]);
      const r = deleteVoucher(s, '888-004', ctx);

      expect(r.state.log[0].text).toBe('888-004 (void, ₱48,230.55) deleted from the register.');
      expect(nextVoucherNo(r.state)).toBe('888-004');
      // Every 888- voucher gone: the series starts again.
      expect(nextVoucherNo(deleteVouchers(s, ['888-003', '888-004'], ctx).state)).toBe('888-001');
    });

    it('drops a number an earlier build held back, from what is already saved', () => {
      const held = { ...state(), ext: { vouchers: { highest: '888-018' }, banks: { accounts: [] } } };

      expect(nextVoucherNo(held)).toBe('888-001');
      expect(clearVoided(held, ctx).ext).toEqual({ banks: { accounts: [] } });
      expect(clearVoided(state(), ctx)).toEqual(state());
    });

    it('clears a void voucher on its own seven days after it was voided', () => {
      const voided = setVoucherStatus(state(), 'CV-2026-0139', 'Void', ctx).state;

      expect(clearVoided(voided, on('2026-11-05'))).toBe(voided);
      const cleared = clearVoided(voided, on('2026-11-06'));

      expect(cleared.cv.map((v) => v.no)).toEqual(['CV-2026-0140', 'CV-2026-0141']);
      expect(cleared.log[0].text).toBe('1 void voucher cleared from the register, 7 days after voiding: CV-2026-0139.');
      // One voided before vouchers were dated as voided counts from its own date.
      const old = { ...state(), cv: state().cv.map((v) => (v.no === 'CV-2026-0139' ? { ...v, status: 'Void' } : v)) };

      expect(clearVoided(old, on('2026-10-27')).cv).toHaveLength(2);
    });

    it('folds vouchers released before this month into their month, and keeps the rest on top', () => {
      const s = state();

      // In October every voucher is on top.
      expect(voucherRegister(s, ctx)).toEqual({ current: [...s.cv].reverse(), earlier: [] });
      // In December the October voucher released before then folds into October. One dated October but released in
      // December, the approved and the waiting ones, and a void one stay on top.
      const late = { ...s.cv[0], no: '888-001', released: '2026-12-01' };
      const voided = { ...s.cv[0], no: '888-002', status: 'Void', voided: '2026-11-30' };
      const later = voucherRegister({ ...s, cv: [...s.cv, late, voided] }, on('2026-12-02'));

      expect(later.current.map((v) => v.no)).toEqual(['CV-2026-0141', 'CV-2026-0140', '888-002', '888-001']);
      expect(later.earlier.map((m) => [m.label, m.vouchers.map((v) => v.no), m.total])).toEqual([['October 2026', ['CV-2026-0139'], voucherTotal(s.cv[0])]]);
    });

    it('takes vouchers to one payee as one, whatever its capitals, spacing or stops', () => {
      const s = state();
      const v = (payee: string) => ({ payee, address: '' });

      expect(payeeKey(s, v('Meralco'))).toBe(payeeKey(s, v('MERALCO.')));
      expect(payeeKey(s, v('Juan  Dela Cruz'))).toBe(payeeKey(s, v('JUAN DELA CRUZ')));
      expect(payeeKey(s, v('Meralco'))).not.toBe(payeeKey(s, v('Maynilad')));
      expect(payeeFoldLabel(s, [s.cv[0], s.cv[0]])).toBe(`${payeeOf(s, s.cv[0]).name.toUpperCase()}, 2 vouchers`);
    });

    it('dates a voucher as it is released', () => {
      const approved = setVoucherStatus(state(), 'CV-2026-0141', 'Approved', ctx).state;

      expect(setVoucherStatus(approved, 'CV-2026-0141', 'Released', ctx).record.released).toBe('2026-10-30');
    });

    it('acts on several vouchers at once, all of them or none', () => {
      const s = state();
      const byNo = (no: string) => s.cv.find((v) => v.no === no)!;

      // 0139 released, 0140 approved, 0141 waiting.
      expect(['CV-2026-0139', 'CV-2026-0140', 'CV-2026-0141'].map((no) => canMoveTo(byNo(no), 'Approved'))).toEqual([false, false, true]);
      expect(['CV-2026-0139', 'CV-2026-0140', 'CV-2026-0141'].map((no) => canMoveTo(byNo(no), 'Released'))).toEqual([false, true, false]);
      expect(['CV-2026-0139', 'CV-2026-0140', 'CV-2026-0141'].map((no) => canMoveTo(byNo(no), 'Void'))).toEqual([true, true, true]);

      const voided = setVouchersStatus(s, ['CV-2026-0140', 'CV-2026-0141'], 'Void', ctx);

      expect(voided.message).toBe('2 vouchers marked void.');
      expect(voided.state.cv.filter((v) => v.status === 'Void').map((v) => v.no)).toEqual(['CV-2026-0140', 'CV-2026-0141']);
      const gone = deleteVouchers(voided.state, ['CV-2026-0140', 'CV-2026-0141'], ctx);

      expect(gone.message).toBe('2 void vouchers deleted.');
      expect(gone.state.cv.map((v) => v.no)).toEqual(['CV-2026-0139']);
      // One not void: none are deleted.
      expect(() => deleteVouchers(voided.state, ['CV-2026-0140', 'CV-2026-0139'], ctx)).toThrow('Only a void voucher can be deleted. Void CV-2026-0139 first.');
    });
  });
});
