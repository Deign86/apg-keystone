import { describe, expect, it } from 'vitest';
import { refusalOf } from '@keystone/kit/testing';
import { CLOUD_LAYOUT, lineDraft, logged, withModuleData, type Ctx, type Member, type TerminalState, type Voucher, type VoucherDrafts } from '@keystone/core';
import {
  dataOf, decideRefusal, decideRequest, decisionLine, deleteRefusal, deleteRequest, deleteRequests, expensesOf, fileRequest, fundsFigure, fundsFinding, fundsLine, fundsWaiting, newRequest,
  nextRequestNo, paidLine, paymentStatus, payRequest, RECEIPTS_MOST, receiptsLock, REQUEST_STATUSES, requestDocuments, requestDraftFrom, requestDraftOf, requestDraftTitle, requestLock, requestPreview, transactionState, transferReady, waitingRequests, withdrawRequest, type RequestDraft,
} from '../src/rules';
import { sampleState } from '@keystone/core/sample';

/** Nov 2, 2026, 10:00 in Manila, as the end-to-end tests. */
const at = (who?: Member, day = 2): Ctx => ({ now: () => new Date(2026, 10, day, 10, 0), ...(who && { who }) });
const owner: Member = { uid: 'owner-1', name: 'Mark Reyes', role: 'owner' };
const hr: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };
const it2: Member = { uid: 'it-1', name: 'Paolo Santos', role: 'staff' };
const local = at();
const state = () => sampleState();

/** Expense lines as the form holds them: a description and the amount as typed. */
const lines = (...typed: [string, string][]) => typed.map(([desc, amount]) => lineDraft({ desc, amount }));

/** A request paid by check, to a payee in the directory. */
const ask = (extra: Partial<RequestDraft> = {}): RequestDraft => ({
  ...newRequest(state(), local), purpose: 'Christmas party: venue deposit', lines: lines(['Venue deposit', '48,000']), pay: 'check', payee: 'V-002',
  requester: 'Ana Cruz', ...extra,
});

/** The account HR's revolving fund is topped up into. */
const fund = { bank: 'BDO', branch: 'Makati Ayala', name: 'Liza Ramos', number: '0012 3456 7890' };

/** HR's expenses for the fortnight, to be paid back by a transfer into the fund's account. A blank line in the middle. */
const topUp = (extra: Partial<RequestDraft> = {}): RequestDraft => ask({
  purpose: 'Revolving fund, Nov 1 to 15', lines: lines(['Pantry groceries', '3,250.75'], ['', ''], ['Courier for payroll documents', '480']), pay: 'transfer',
  account: { ...fund }, ...extra,
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

/** The sample data with requests filed by HR and IT, as the CEO reads them. */
function filed(): TerminalState {
  let s = fileRequest(state(), ask(), at(hr)).state;
  s = fileRequest(s, ask({ purpose: 'Replacement laptop charger', lines: lines(['Laptop charger', '2,450.50']), payee: 'V-001', when: 'date', by: '2026-11-20' }), at(it2)).state;

  return s;
}

describe('requests in the cloud', () => {
  it('uses the collection, fields and statuses firestore.rules is checked against', () => {
    expect(new Map(Object.entries(CLOUD_LAYOUT.own)).get(requestDocuments.collection)).toEqual({ fields: requestDocuments.fields, statuses: [...REQUEST_STATUSES] });
  });
});

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
      no: 'RF-2026-0001', date: '2026-11-02', purpose: 'Christmas party: venue deposit', lines: [{ desc: 'Venue deposit', amt: 48000 }], amount: 48000,
      pay: 'check', payee: 'V-002', settle: 'ASAP', requester: 'Ana Cruz', uid: 'hr-1', status: 'For Approval',
    });
    expect(r.message).toBe('RF-2026-0001 sent to the CEO for approval.');
    expect(r.state.log[0]).toEqual({ when: '2026-11-02 10:00', mod: 'RF', text: 'RF-2026-0001 filed by Ana Cruz.', by: 'Ana Cruz' });
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
    expect(refusalOf(() => fileRequest(s, ask({ purpose: '  ' }), local))).toEqual({ error: 'Say what the money is for.', fields: ['purpose'] });
    expect(refusalOf(() => fileRequest(s, ask({ lines: [lineDraft()] }), local))).toEqual({ error: 'List the expenses, each with its amount.', fields: ['lines.0.desc'] });
    expect(refusalOf(() => fileRequest(s, ask({ lines: lines(['Venue deposit', '0']) }), local))).toEqual({ error: 'Enter the amount for line 1, Venue deposit.', fields: ['lines.0.amount'] });
    expect(refusalOf(() => fileRequest(s, ask({ lines: lines(['Venue deposit', '48000'], ['', '500']) }), local))).toEqual({ error: 'Say what line 2 is for.', fields: ['lines.1.desc'] });
    expect(refusalOf(() => fileRequest(s, ask({ payee: 'V-999' }), local))).toEqual({ error: 'Choose a payee from the directory.', fields: ['payee'] });
    expect(refusalOf(() => fileRequest(s, ask({ when: 'date', by: '' }), local))).toEqual({ error: 'Choose the deadline date, or ASAP.', fields: ['by'] });
    expect(refusalOf(() => fileRequest(s, ask({ when: 'date', by: '2026-11-01' }), local))).toEqual({ error: 'Nov 1, 2026 has passed. Choose a later date, or ASAP.', fields: ['by'] });
    expect(refusalOf(() => fileRequest(s, ask({ requester: ' ' }), local))).toEqual({ error: 'Enter your name, so the CEO knows who is asking.', fields: ['requester'] });
  });

  it('lets the requester change or withdraw their own request while it waits, and nobody else', () => {
    const s = filed();
    const mine = dataOf(s).requests[0];
    const edited = fileRequest(s, { ...requestDraftOf(mine), lines: lines(['Venue deposit', '45000']) }, at(hr));
    expect(edited.record).toMatchObject({ no: 'RF-2026-0001', amount: 45000, status: 'For Approval', uid: 'hr-1' });
    expect(edited.state.log[0].text).toBe('RF-2026-0001 edited by Ana Cruz.');

    expect(requestLock(mine, at(it2))).toBe('Only Ana Cruz can change RF-2026-0001.');
    expect(refusalOf(() => fileRequest(s, requestDraftOf(mine), at(it2)))).toEqual({ error: 'Only Ana Cruz can change RF-2026-0001.', fields: [] });
    expect(refusalOf(() => withdrawRequest(s, 'RF-2026-0001', at(it2)))).toEqual({ error: 'Only Ana Cruz can change RF-2026-0001.', fields: [] });

    const withdrawn = withdrawRequest(s, 'RF-2026-0001', at(hr));
    expect(withdrawn.record.status).toBe('Withdrawn');
    expect(withdrawn.state.log[0].text).toBe('RF-2026-0001 withdrawn by Ana Cruz.');
    expect(() => withdrawRequest(withdrawn.state, 'RF-2026-0001', at(hr))).toThrow('RF-2026-0001 is withdrawn and can no longer be changed.');
  });
});

describe('a request paid by transfer', () => {
  it('lists the expenses, totals them, and names the account to transfer to instead of a payee', () => {
    const r = fileRequest(state(), topUp(), at(hr));
    expect(r.record).toEqual({
      no: 'RF-2026-0001', date: '2026-11-02', purpose: 'Revolving fund, Nov 1 to 15',
      lines: [{ desc: 'Pantry groceries', amt: 3250.75 }, { desc: 'Courier for payroll documents', amt: 480 }], amount: 3730.75,
      pay: 'transfer', account: fund, payee: '', settle: 'ASAP', requester: 'Ana Cruz', uid: 'hr-1', status: 'For Approval',
    });
    // The log, which everyone reads, still names only the request and who filed it.
    expect(r.state.log[0].text).toBe('RF-2026-0001 filed by Ana Cruz.');
  });

  it('refuses an account it could not transfer to', () => {
    const s = state();
    expect(refusalOf(() => fileRequest(s, topUp({ account: { ...fund, bank: ' ' } }), local))).toEqual({ error: 'Enter the bank of the account to transfer to.', fields: ['account.bank'] });
    expect(refusalOf(() => fileRequest(s, topUp({ account: { ...fund, name: '' } }), local))).toEqual({ error: 'Enter the account name, as the bank holds it.', fields: ['account.name'] });
    expect(refusalOf(() => fileRequest(s, topUp({ account: { ...fund, number: 'n/a' } }), local))).toEqual({ error: 'Enter the account number to transfer to.', fields: ['account.number'] });
    // A check needs no account, and a transfer no payee.
    expect(fileRequest(s, topUp({ payee: 'V-999' }), local).record.payee).toBe('');
    expect(fileRequest(s, ask({ account: { ...fund, bank: '' } }), local).record).not.toHaveProperty('account');
  });

  it('starts each person\'s next request as their last one was paid, with the account their last transfer went to', () => {
    const s = fileRequest(state(), topUp(), at(hr)).state;
    expect(newRequest(s, at(hr))).toMatchObject({ pay: 'transfer', account: fund, purpose: '', lines: [{ desc: '', amount: '' }] });
    // Nobody else's account is offered: IT starts as anyone who has filed nothing does, with a transfer to an account it types.
    expect(newRequest(s, at(it2))).toMatchObject({ pay: 'transfer', account: { bank: '', branch: '', name: '', number: '' } });

    const thenCheck = fileRequest(s, ask(), at(hr)).state;
    expect(newRequest(thenCheck, at(hr))).toMatchObject({ pay: 'check', payee: 'V-002', account: fund });
  });

  it('starts a transfer with the bank account the person keeps on Profile, before any request of theirs (docs/adr/0052)', () => {
    const own = { bank: 'BPI', branch: '', name: 'Paolo Santos', number: '4011 0258 68' };
    const s = fileRequest(state(), topUp(), at(hr)).state;
    expect(newRequest(s, at({ ...it2, bank: own }))).toMatchObject({ pay: 'transfer', account: own });
    // Their saved account wins over the one their last transfer went to.
    expect(newRequest(s, at({ ...hr, bank: own })).account).toEqual(own);
    expect(newRequest(s, at({ ...hr, bank: own })).account).not.toBe(own);
  });

  it('keeps no account once switched to a check, and no payee once switched to a transfer', () => {
    const r = fileRequest(state(), topUp(), at(hr));
    const check = fileRequest(r.state, { ...requestDraftOf(r.record), pay: 'check', payee: 'V-002' }, at(hr)).record;
    expect(check).toMatchObject({ pay: 'check', payee: 'V-002' });
    expect(check).not.toHaveProperty('account');
  });

  it('approving makes the fund transfer request and drafts no voucher, even with Check Vouchers installed', () => {
    const s = fileRequest(state(), topUp(), at(hr)).state;
    const r = decideRequest(s, 'RF-2026-0001', 'Approved', '', at(owner), vouchers);
    expect(r.record).toMatchObject({ status: 'Approved', decision: { by: 'Mark Reyes', at: '2026-11-02 10:00' } });
    expect(r.record).not.toHaveProperty('voucher');
    expect(r.state.cv).toEqual(s.cv);
    expect(transferReady(r.record)).toBe(true);
    expect(transferReady(dataOf(s).requests[0])).toBe(false);
    expect(r.message).toBe('RF-2026-0001 approved. Its fund transfer request is ready to print or save as a PDF.');
    expect(r.state.log[0].text).toBe('RF-2026-0001 approved by Mark Reyes.');
    expect(fundsFinding(r.state, at(hr))).toEqual({ priority: 40, text: 'RF-2026-0001 was approved; open it to print or save its fund transfer request, and upload its receipts once the money is spent.' });

    const declined = decideRequest(s, 'RF-2026-0001', 'Declined', '', at(owner), vouchers).record;
    expect(transferReady(declined)).toBe(false);
  });

  it('previews the paper as the form is typed, before anything is checked', () => {
    const s = fileRequest(state(), ask(), at(hr)).state;
    const preview = requestPreview(s, { ...topUp(), lines: lines(['Pantry groceries', '3,250.75'], ['Courier', '']) }, at(hr));
    expect(preview).toMatchObject({
      no: 'RF-2026-0002', date: '2026-11-02', lines: [{ desc: 'Pantry groceries', amt: 3250.75 }, { desc: 'Courier', amt: 0 }], amount: 3250.75,
      pay: 'transfer', account: fund, requester: 'Ana Cruz', status: 'For Approval',
    });
  });
});

describe('deciding a request', () => {
  it('is the CEO\'s alone, signed in to the cloud', () => {
    const s = filed();
    expect(decideRefusal(at(owner))).toBeNull();
    expect(() => decideRequest(s, 'RF-2026-0001', 'Approved', '', local, vouchers)).toThrow(/^Only the CEO approves or declines requests, signed in to APG's records in the cloud\./);
    expect(() => decideRequest(s, 'RF-2026-0001', 'Approved', '', at(hr), vouchers)).toThrow('Only the CEO approves or declines requests. The answer shows here once it is given.');
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

  it('declining keeps the CEO\'s note for the requester, and drafts nothing', () => {
    const r = decideRequest(filed(), 'RF-2026-0002', 'Declined', '  Use the spare in the IT cabinet  ', at(owner), vouchers);
    expect(r.record).toMatchObject({ status: 'Declined', decision: { by: 'Mark Reyes', note: 'Use the spare in the IT cabinet' } });
    expect(r.record).not.toHaveProperty('voucher');
    expect(r.state.log[0].text).toBe('RF-2026-0002 declined by Mark Reyes.');
    expect(r.message).toBe('RF-2026-0002 declined.');
  });
});

/** A receipt as the screen keeps a picked photo: a small JPEG as a data URL. */
const photo = { name: 'venue-deposit.jpg', data: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' };
const pdf = { name: 'courier.pdf', data: 'data:application/pdf;base64,JVBERi0xLjQ=' };

describe('marking a request paid (docs/adr/0050)', () => {
  const approved = () => decideRequest(filed(), 'RF-2026-0001', 'Approved', '', at(owner), vouchers).state;

  it('is its requester\'s, once it is approved, with its receipts kept and the log naming no amount', () => {
    const r = payRequest(approved(), 'RF-2026-0001', [photo, pdf], at(hr, 5));
    expect(r.record).toMatchObject({ status: 'Paid', receipts: [photo, pdf], paid: '2026-11-05 10:00', voucher: '888-001', decision: { by: 'Mark Reyes' } });
    expect(r.message).toBe('RF-2026-0001 is paid. 2 receipts kept with it.');
    expect(r.state.log[0]).toMatchObject({ mod: 'RF', text: 'RF-2026-0001 paid; receipts uploaded by Ana Cruz.' });
    expect(dataOf(r.state).requests[0]).toEqual(r.record);
    expect(paidLine(r.record)).toBe('Paid on Nov 5, 2026, with 2 receipts from Ana Cruz.');
    // The CEO's decision still reads as the approval it was, and the request can no longer change.
    expect(decisionLine(r.record)).toBe('Approved by Mark Reyes on Nov 2, 2026.');
    expect(requestLock(r.record, at(hr))).toBe('RF-2026-0001 is paid and can no longer be changed.');
    expect(() => payRequest(r.state, 'RF-2026-0001', [photo], at(hr))).toThrow('RF-2026-0001 is paid; its receipts are kept with it.');
  });

  it('keeps the fund transfer request printable once paid', () => {
    const s = decideRequest(fileRequest(state(), topUp(), at(hr)).state, 'RF-2026-0001', 'Approved', '', at(owner)).state;
    expect(transferReady(payRequest(s, 'RF-2026-0001', [photo], at(hr)).record)).toBe(true);
  });

  it('refuses before the approval, for anyone but the requester, and with no receipt, an odd file or too much', () => {
    const s = approved();
    expect(() => payRequest(filed(), 'RF-2026-0001', [photo], at(hr))).toThrow('The receipts for RF-2026-0001 are uploaded once it is approved.');
    expect(() => payRequest(s, 'RF-2026-0001', [photo], at(it2))).toThrow('RF-2026-0001 is paid once Ana Cruz uploads its receipts.');
    expect(() => payRequest(s, 'RF-2026-0001', [photo], at(owner))).toThrow('RF-2026-0001 is paid once Ana Cruz uploads its receipts.');
    expect(receiptsLock(dataOf(s).requests[0], at(hr))).toBeNull();
    expect(refusalOf(() => payRequest(s, 'RF-2026-0001', [], at(hr)))).toEqual({ error: 'Upload the receipt, or other proof of what RF-2026-0001 paid for.', fields: ['receipts'] });
    expect(() => payRequest(s, 'RF-2026-0001', [{ name: 'notes.html', data: 'data:text/html;base64,PGI+' }], at(hr))).toThrow('notes.html is not a photo or a PDF.');
    const big = { name: 'scan.pdf', data: `data:application/pdf;base64,${'A'.repeat(RECEIPTS_MOST)}` };
    expect(() => payRequest(s, 'RF-2026-0001', [big], at(hr))).toThrow(/^The receipts come to 513 KB; RF-2026-0001 keeps up to 513 KB\. Remove one/);
  });

  it('on a computer where nobody signs in, takes the receipts from whoever is there', () => {
    // Nobody decides on such a computer; a request approved in the cloud and restored here is paid from it.
    const s = approved();
    expect(payRequest(s, 'RF-2026-0001', [photo], local).state.log[0].text).toBe('RF-2026-0001 paid; receipts uploaded by Ana Cruz.');
  });
});

describe('the transaction state and the payment status', () => {
  it('shows the decision as the transaction state, and whether the receipts are in as the payment status', () => {
    expect(REQUEST_STATUSES).toEqual(['For Approval', 'Approved', 'Paid', 'Declined', 'Withdrawn']);
    expect(REQUEST_STATUSES.map(transactionState)).toEqual(['Pending', 'Processing', 'Processing', 'Declined', 'Withdrawn']);
    expect(REQUEST_STATUSES.map((s) => paymentStatus(s)?.label ?? null)).toEqual(['Pending', 'Pending', 'Paid', null, null]);
  });
});

describe('deleting a request (docs/adr/0051)', () => {
  it('is the CEO\'s, or anyone\'s where nobody signs in, whatever its status, and never frees its number', () => {
    const s = decideRequest(filed(), 'RF-2026-0002', 'Declined', '', at(owner)).state;
    expect(deleteRefusal(at(owner))).toBeNull();
    expect(deleteRefusal(local)).toBeNull();
    expect(() => deleteRequest(s, 'RF-2026-0001', at(hr))).toThrow('Only the CEO deletes requests for funds.');

    const r = deleteRequest(s, 'RF-2026-0002', at(owner));
    expect(r.message).toBe('RF-2026-0002 deleted.');
    expect(r.state.log[0].text).toBe('RF-2026-0002 deleted by Mark Reyes.');
    expect(dataOf(r.state).requests.map((x) => x.no)).toEqual(['RF-2026-0001']);
    expect(nextRequestNo(r.state, at(hr))).toBe('RF-2026-0003');
    expect(() => deleteRequest(r.state, 'RF-2026-0002', at(owner))).toThrow('RF-2026-0002 is not among the requests.');

    // Every one, or none: a request that cannot be deleted stops them all.
    const both = deleteRequests(s, ['RF-2026-0001', 'RF-2026-0002'], local);
    expect(dataOf(both.state).requests).toEqual([]);
    expect(both.message).toBe('2 requests deleted.');
    expect(nextRequestNo(both.state, local)).toBe('RF-2026-0003');
    expect(() => deleteRequests(s, ['RF-2026-0001', 'RF-2026-0009'], at(owner))).toThrow('RF-2026-0009 is not among the requests.');
  });

  it('keeps the voucher an approval drafted', () => {
    const s = decideRequest(filed(), 'RF-2026-0001', 'Approved', '', at(owner), vouchers).state;
    expect(deleteRequest(s, 'RF-2026-0001', at(owner)).state.cv).toEqual(s.cv);
  });
});

describe('what it tells Home and Overview', () => {
  it('shows the CEO what waits for a decision, ASAP first', () => {
    const s = filed();
    expect(waitingRequests(s).map((r) => r.no)).toEqual(['RF-2026-0001', 'RF-2026-0002']);
    expect(fundsFinding(s, at(owner))).toEqual({ priority: 35, text: '2 requests for funds worth ₱50,450.50 wait for your decision, 1 of them ASAP.' });
    expect(fundsFigure(s)).toMatchObject({ value: '2', caption: '₱50,450.50 waiting for a decision' });
    expect(fundsWaiting(s)).toEqual([
      { no: 'RF-2026-0001', who: 'Ana Cruz · ASAP', amount: 4800000, status: 'Pending', tone: 'warn', rank: -1 },
      { no: 'RF-2026-0002', who: 'Paolo Santos · by Nov 20, 2026', amount: 245050, status: 'Pending', tone: 'warn', rank: 5 },
    ]);

    const one = withdrawRequest(s, 'RF-2026-0001', at(hr)).state;
    expect(fundsFinding(one, at(owner))).toEqual({ priority: 25, text: 'Paolo Santos asks for ₱2,450.50 by Nov 20, 2026; it waits for your decision.' });
  });

  it('on a computer where nobody signs in, says the requests wait for the CEO', () => {
    expect(fundsFinding(filed(), local)).toEqual({ priority: 15, text: '2 requests for funds worth ₱50,450.50 wait for the CEO\'s decision, 1 of them ASAP.' });
    expect(fundsLine(state(), local)).toBe('No request is waiting. Ask for funds here, and the CEO approves or declines.');
  });

  it('tells a requester the answer for a week, then only what still waits', () => {
    const approved = decideRequest(filed(), 'RF-2026-0001', 'Approved', '', at(owner), vouchers).state;
    expect(fundsFinding(approved, at(hr))).toEqual({ priority: 40, text: 'RF-2026-0001 was approved; 888-001 is drafted. Upload its receipts once the money is spent.' });
    expect(fundsFinding(approved, at(hr, 9))).toEqual({ priority: 40, text: 'RF-2026-0001 was approved; 888-001 is drafted. Upload its receipts once the money is spent.' });
    // After the week, it is still owed its receipts; once they are uploaded, nothing is left to say.
    expect(fundsFinding(approved, at(hr, 10))).toEqual({ priority: 20, text: 'RF-2026-0001 waits for your receipts; upload them to mark it paid.' });
    expect(fundsFinding(payRequest(approved, 'RF-2026-0001', [photo], at(hr, 10)).state, at(hr, 10))).toBeNull();
    // IT's own request still waits; HR's answer is not theirs.
    expect(fundsFinding(approved, at(it2))).toEqual({ priority: 5, text: '1 request for funds waits for the CEO\'s decision.' });

    const declined = decideRequest(filed(), 'RF-2026-0002', 'Declined', 'Use the spare in the IT cabinet', at(owner)).state;
    expect(fundsFinding(declined, at(it2))).toEqual({ priority: 40, text: 'RF-2026-0002 was declined: Use the spare in the IT cabinet.' });
  });
});

describe('the saved data', () => {
  it('reads damaged or older data as what it can', () => {
    const s = withModuleData(state(), 'funds', { requests: [{ no: 'RF-2026-0007', amount: 'lots', status: 'Reimbursed', decision: 'yes' }, 'junk'], last: 3 });
    expect(dataOf(s)).toEqual({
      requests: [{ no: 'RF-2026-0007', date: '', purpose: '', lines: [], amount: 0, pay: 'check', payee: '', settle: 'ASAP', requester: '', status: 'For Approval' }],
      last: '',
    });
    expect(dataOf(state())).toEqual({ requests: [], last: '' });
  });

  it('reads a request filed before expenses and transfers as a check for its purpose', () => {
    const s = withModuleData(state(), 'funds', {
      requests: [{ no: 'RF-2026-0001', date: '2026-11-02', purpose: 'Christmas party: venue deposit', amount: 48000, payee: 'V-002', status: 'Approved', account: { bank: 'BDO' } }],
      last: 'RF-2026-0001',
    });

    const [r] = dataOf(s).requests;
    expect(r).toMatchObject({ pay: 'check', lines: [] });
    expect(r).not.toHaveProperty('account');
    expect(expensesOf(r)).toEqual([{ desc: 'Christmas party: venue deposit', amt: 48000 }]);
    expect(requestDraftOf(r).lines).toMatchObject([{ desc: 'Christmas party: venue deposit', amount: '48000' }]);
  });
});

describe('a saved draft of a request (docs/adr/0041)', () => {
  it('is called by what the money is for and how much so far', () => {
    const s = state();
    const d: RequestDraft = { ...newRequest(s, at(hr)), purpose: 'Pantry, November', lines: lines(['Coffee', '1,250'], ['Sugar', '300.50']) };

    expect(requestDraftTitle(s, d, at(hr))).toBe('Pantry, November · ₱1,550.50');
    expect(requestDraftTitle(s, newRequest(s, at(hr)), at(hr))).toBe('No purpose yet · ₱0.00');
  });

  it('goes back in the form over a new request, its expenses as typed and its account filled out', () => {
    const s = state();
    const back = requestDraftFrom(s, at(hr), { purpose: 'Pantry', account: { bank: 'BDO', branch: '', name: '', number: '' }, lines: [{ id: 'line-1', desc: 'Coffee', qty: '1', amount: '1250' }] });

    expect(back).toMatchObject({ purpose: 'Pantry', requester: 'Ana Cruz', account: { bank: 'BDO', branch: '', name: '', number: '' } });
    expect(back.lines.map((l) => [l.desc, l.amount])).toEqual([['Coffee', '1250']]);
  });
});
