import { describe, expect, it } from 'vitest';
import { bundledSeed, logged, withModuleData, type Ctx, type Member, type TerminalState, type Voucher, type VoucherDrafts } from '@keystone/core';
import {
  dataOf, decideRefusal, decideRequest, fileRequest, fundsFigure, fundsFinding, fundsLine, fundsWaiting, newRequest, nextRequestNo,
  requestDraftOf, requestLock, waitingRequests, withdrawRequest, type RequestDraft,
} from '../src/rules';

/** Nov 2, 2026, 10:00 in Manila, as the end-to-end tests. */
const at = (who?: Member, day = 2): Ctx => ({ seed: bundledSeed, now: () => new Date(2026, 10, day, 10, 0), ...(who && { who }) });
const owner: Member = { uid: 'owner-1', name: 'Mark Reyes', role: 'owner' };
const hr: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };
const it2: Member = { uid: 'it-1', name: 'Paolo Santos', role: 'staff' };
const local = at();
const state = () => structuredClone(bundledSeed.state);

const ask = (extra: Partial<RequestDraft> = {}): RequestDraft => ({
  ...newRequest(state(), local), purpose: 'Christmas party: venue deposit', amount: '48,000', payee: 'V-002', requester: 'Ana Cruz', ...extra,
});

/** A Check Vouchers stand-in: numbers from 888-001 and keeps what it was asked. */
const vouchers: VoucherDrafts = {
  draft: (s, r, ctx) => {
    const v: Voucher = {
      no: `888-${String(s.cv.filter((x) => x.no.startsWith('888-')).length + 1).padStart(3, '0')}`, date: '2026-11-02', payee: r.payee, check: '',
      lines: [{ desc: r.particulars, amt: r.amount }], status: 'For Approval', prepared: '', checked: '', approved: '',
    };

    return { state: logged({ ...s, cv: [...s.cv, v] }, 'CV', `${v.no} saved and routed for approval.`, ctx), record: v, message: `${v.no} saved.` };
  },
};

/** The sample data with requests filed by HR and IT, as the owner reads them. */
function filed(): TerminalState {
  let s = fileRequest(state(), ask(), at(hr)).state;
  s = fileRequest(s, ask({ purpose: 'Replacement laptop charger', amount: '2,450.50', payee: 'V-001', when: 'date', by: '2026-11-20' }), at(it2)).state;

  return s;
}

describe('filing a request', () => {
  it('numbers RF-2026-0001 and on, continuing from the last number given out even when only some requests are read', () => {
    const s = filed();
    expect(dataOf(s).requests.map((r) => r.no)).toEqual(['RF-2026-0001', 'RF-2026-0002']);
    expect(dataOf(s).last).toBe('RF-2026-0002');

    // HR's computer in the cloud reads only HR's request, but still numbers the next one after IT's.
    const hrOnly = withModuleData(s, 'funds', { requests: dataOf(s).requests.filter((r) => r.uid === hr.uid), last: 'RF-2026-0002' });
    expect(nextRequestNo(hrOnly, at(hr))).toBe('RF-2026-0003');
  });

  it('files For Approval as the member signed in, and logs who filed it but never what for or how much', () => {
    const r = fileRequest(state(), { ...ask(), requester: 'Someone else' }, at(hr));
    expect(r.record).toEqual({
      no: 'RF-2026-0001', date: '2026-11-02', purpose: 'Christmas party: venue deposit', amount: 48000, payee: 'V-002', settle: 'ASAP',
      requester: 'Ana Cruz', uid: 'hr-1', status: 'For Approval',
    });
    expect(r.message).toBe('RF-2026-0001 sent to the owner for approval.');
    expect(r.state.log[0]).toEqual({ when: '2026-11-02 10:00', mod: 'RF', text: 'RF-2026-0001 filed by Ana Cruz.' });
  });

  it('takes the name typed when nobody is signed in, and keeps no uid', () => {
    const r = fileRequest(state(), ask({ when: 'date', by: '2026-12-15' }), local);
    expect(r.record).toMatchObject({ requester: 'Ana Cruz', settle: '2026-12-15' });
    expect(r.record).not.toHaveProperty('uid');
    expect(fileRequest(r.state, { ...requestDraftOf(r.record), requester: 'Ana C. Cruz' }, local).record.requester).toBe('Ana C. Cruz');
    // Signed in, the requester stays the member who filed it.
    const mine = fileRequest(state(), ask(), at(hr));
    expect(fileRequest(mine.state, { ...requestDraftOf(mine.record), requester: 'Someone else' }, at(hr)).record.requester).toBe('Ana Cruz');
  });

  it('refuses a request it cannot act on, with the sentence to show', () => {
    const s = state();
    expect(() => fileRequest(s, ask({ purpose: '  ' }), local)).toThrow('Say what the money is for.');
    expect(() => fileRequest(s, ask({ amount: '0' }), local)).toThrow('Enter the amount needed.');
    expect(() => fileRequest(s, ask({ payee: 'V-999' }), local)).toThrow('Choose a payee from the directory.');
    expect(() => fileRequest(s, ask({ when: 'date', by: '' }), local)).toThrow('Choose the date it must be settled by, or ASAP.');
    expect(() => fileRequest(s, ask({ when: 'date', by: '2026-11-01' }), local)).toThrow('Nov 1, 2026 has passed. Choose a later date, or ASAP.');
    expect(() => fileRequest(s, ask({ requester: ' ' }), local)).toThrow('Enter your name, so the owner knows who is asking.');
  });

  it('lets the requester change or withdraw their own request while it waits, and nobody else', () => {
    const s = filed();
    const mine = dataOf(s).requests[0];
    const edited = fileRequest(s, { ...requestDraftOf(mine), amount: '45000' }, at(hr));
    expect(edited.record).toMatchObject({ no: 'RF-2026-0001', amount: 45000, status: 'For Approval', uid: 'hr-1' });
    expect(edited.state.log[0].text).toBe('RF-2026-0001 edited by Ana Cruz.');

    expect(requestLock(mine, at(it2))).toBe('Only Ana Cruz can change RF-2026-0001.');
    expect(() => fileRequest(s, requestDraftOf(mine), at(it2))).toThrow('Only Ana Cruz can change RF-2026-0001.');
    expect(() => withdrawRequest(s, 'RF-2026-0001', at(it2))).toThrow('Only Ana Cruz can change RF-2026-0001.');

    const withdrawn = withdrawRequest(s, 'RF-2026-0001', at(hr));
    expect(withdrawn.record.status).toBe('Withdrawn');
    expect(withdrawn.state.log[0].text).toBe('RF-2026-0001 withdrawn by Ana Cruz.');
    expect(() => withdrawRequest(withdrawn.state, 'RF-2026-0001', at(hr))).toThrow('RF-2026-0001 is withdrawn and can no longer be changed.');
  });
});

describe('deciding a request', () => {
  it('is the owner\'s alone, signed in to the cloud', () => {
    const s = filed();
    expect(decideRefusal(at(owner))).toBeNull();
    expect(() => decideRequest(s, 'RF-2026-0001', 'Approved', '', local, vouchers)).toThrow(/^Only the owner approves or declines requests, signed in to APG's records in the cloud\./);
    expect(() => decideRequest(s, 'RF-2026-0001', 'Approved', '', at(hr), vouchers)).toThrow('Only the owner approves or declines requests. The answer shows here once it is given.');
  });

  it('approving drafts the check voucher for the amount, and the request keeps its number', () => {
    const r = decideRequest(filed(), 'RF-2026-0001', 'Approved', '', at(owner), vouchers);
    expect(r.record).toMatchObject({ status: 'Approved', voucher: '888-001', decision: { by: 'Mark Reyes', uid: 'owner-1', at: '2026-11-02 10:00' } });
    expect(r.record.decision).not.toHaveProperty('note');
    expect(r.state.cv.at(-1)).toMatchObject({ no: '888-001', payee: 'V-002', lines: [{ desc: 'Christmas party: venue deposit (RF-2026-0001)', amt: 48000 }] });
    expect(r.message).toBe('RF-2026-0001 approved. 888-001 is drafted for accounting.');
    expect(r.state.log.slice(0, 2).map((e) => e.text)).toEqual(['RF-2026-0001 approved by Mark Reyes; 888-001 drafted.', '888-001 saved and routed for approval.']);
    expect(() => decideRequest(r.state, 'RF-2026-0001', 'Declined', '', at(owner), vouchers)).toThrow('RF-2026-0001 is already approved.');
  });

  it('approves without a voucher when Check Vouchers is not installed, or the payee left the directory', () => {
    const s = filed();
    const alone = decideRequest(s, 'RF-2026-0001', 'Approved', '', at(owner));
    expect(alone.record).not.toHaveProperty('voucher');
    expect(alone.state.cv).toEqual(s.cv);
    expect(alone.message).toBe('RF-2026-0001 approved. Check Vouchers is not installed, so no voucher was drafted.');

    const gone = decideRequest({ ...s, dir: s.dir.filter((d) => d.code !== 'V-002') }, 'RF-2026-0001', 'Approved', '', at(owner), vouchers);
    expect(gone.message).toBe('RF-2026-0001 approved. V-002 is no longer in the directory, so no voucher was drafted.');
  });

  it('declining keeps the owner\'s note for the requester, and drafts nothing', () => {
    const r = decideRequest(filed(), 'RF-2026-0002', 'Declined', '  Use the spare in the IT cabinet  ', at(owner), vouchers);
    expect(r.record).toMatchObject({ status: 'Declined', decision: { by: 'Mark Reyes', note: 'Use the spare in the IT cabinet' } });
    expect(r.record).not.toHaveProperty('voucher');
    expect(r.state.log[0].text).toBe('RF-2026-0002 declined by Mark Reyes.');
    expect(r.message).toBe('RF-2026-0002 declined.');
  });
});

describe('what it tells Home and Overview', () => {
  it('shows the owner what waits for a decision, ASAP first', () => {
    const s = filed();
    expect(waitingRequests(s).map((r) => r.no)).toEqual(['RF-2026-0001', 'RF-2026-0002']);
    expect(fundsFinding(s, at(owner))).toEqual({ priority: 35, text: '2 requests for funds worth ₱50,450.50 wait for your decision, 1 of them ASAP.' });
    expect(fundsFigure(s)).toMatchObject({ value: '2', caption: '₱50,450.50 waiting for a decision' });
    expect(fundsWaiting(s)).toEqual([
      { no: 'RF-2026-0001', who: 'Ana Cruz · ASAP', amount: 4800000, status: 'For Approval', tone: 'warn', rank: -1 },
      { no: 'RF-2026-0002', who: 'Paolo Santos · by Nov 20, 2026', amount: 245050, status: 'For Approval', tone: 'warn', rank: 5 },
    ]);

    const one = withdrawRequest(s, 'RF-2026-0001', at(hr)).state;
    expect(fundsFinding(one, at(owner))).toEqual({ priority: 25, text: 'Paolo Santos asks for ₱2,450.50 by Nov 20, 2026; it waits for your decision.' });
  });

  it('on a computer where nobody signs in, says the requests wait for the owner', () => {
    expect(fundsFinding(filed(), local)).toEqual({ priority: 15, text: '2 requests for funds worth ₱50,450.50 wait for the owner\'s decision, 1 of them ASAP.' });
    expect(fundsLine(state(), local)).toBe('No request is waiting. Ask for funds here, and the owner approves or declines.');
  });

  it('tells a requester the answer for a week, then only what still waits', () => {
    const approved = decideRequest(filed(), 'RF-2026-0001', 'Approved', '', at(owner), vouchers).state;
    expect(fundsFinding(approved, at(hr))).toEqual({ priority: 40, text: 'RF-2026-0001 was approved; 888-001 is drafted.' });
    expect(fundsFinding(approved, at(hr, 9))).toEqual({ priority: 40, text: 'RF-2026-0001 was approved; 888-001 is drafted.' });
    expect(fundsFinding(approved, at(hr, 10))).toBeNull();
    // IT's own request still waits; HR's answer is not theirs.
    expect(fundsFinding(approved, at(it2))).toEqual({ priority: 5, text: '1 request for funds waits for the owner\'s decision.' });

    const declined = decideRequest(filed(), 'RF-2026-0002', 'Declined', 'Use the spare in the IT cabinet', at(owner)).state;
    expect(fundsFinding(declined, at(it2))).toEqual({ priority: 40, text: 'RF-2026-0002 was declined: Use the spare in the IT cabinet.' });
  });
});

describe('the saved data', () => {
  it('reads damaged or older data as what it can', () => {
    const s = withModuleData(state(), 'funds', { requests: [{ no: 'RF-2026-0007', amount: 'lots', status: 'Paid', decision: 'yes' }, 'junk'], last: 3 });
    expect(dataOf(s)).toEqual({
      requests: [{ no: 'RF-2026-0007', date: '', purpose: '', amount: 0, payee: '', settle: 'ASAP', requester: '', status: 'For Approval' }],
      last: '',
    });
    expect(dataOf(state())).toEqual({ requests: [], last: '' });
  });
});
