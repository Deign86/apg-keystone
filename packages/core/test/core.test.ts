import { describe, expect, it } from 'vitest';
import {
  addDays, addYears, amountInWords, applyDueDates, bundledSeed, editText, finding, importEmployees, issueID, lineDraft,
  longDate, newDirectoryDraft, newID, newStatement, newVoucher, nextCode, nextIDNo, nextNumber, nextStatementNo,
  nextVoucherNo, overviewFigures, parseAmount, parseState, payees, peso, percent, recordPayment, removeDirectoryRecord,
  saveDirectoryRecord, saveStatement, saveVoucher, setVoucherStatus, shortDate, statementTotals, toCentavos, usedBy,
  validateConnector, verificationCells, voucherDraftOf, withClient, withDeadline, withEmployee, type Ctx,
} from '../src';

// Expected values marked "prototype" were produced by running the web prototype's own
// JavaScript (prototype/index.html), so these tests hold Keystone to it.

/** 30 Oct 2026, 09:05 in Manila (vitest.config pins TZ). */
const ctx: Ctx = { seed: bundledSeed, now: () => new Date(2026, 9, 30, 9, 5) };
const state = () => structuredClone(bundledSeed.state);

describe('money', () => {
  it('formats pesos', () => {
    expect(peso(toCentavos(48230.55))).toBe('₱48,230.55');
    expect(peso(0)).toBe('₱0.00');
    expect(peso(toCentavos(1234567.8))).toBe('₱1,234,567.80');
    expect(peso(-65000)).toBe('-₱650.00');
  });
  it('parses what people type', () => {
    expect(parseAmount('12,500')).toBe(1250000);
    expect(parseAmount('₱ 650.5')).toBe(65050);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
  it('rounds percentages half away from zero', () => {
    expect(percent(toCentavos(548250), 5)).toBe(toCentavos(27412.5));
    expect(percent(10, 5)).toBe(1);
  });
  it('keeps editable text short', () => {
    expect(editText(12500)).toBe('12500');
    expect(editText(650.5)).toBe('650.50');
  });
});

describe('amount in words (prototype)', () => {
  const cases: [number, string][] = [
    [0, 'Zero Pesos Only'],
    [1, 'One Pesos Only'],
    [21, 'Twenty-One Pesos Only'],
    [101, 'One Hundred One Pesos Only'],
    [1000, 'One Thousand Pesos Only'],
    [48230.55, 'Forty-Eight Thousand Two Hundred Thirty Pesos and 55/100 Only'],
    [12500.5, 'Twelve Thousand Five Hundred Pesos and 50/100 Only'],
    [1234567.89, 'One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven Pesos and 89/100 Only'],
    [2000000000.07, 'Two Billion Pesos and 07/100 Only'],
    [586627.5, 'Five Hundred Eighty-Six Thousand Six Hundred Twenty-Seven Pesos and 50/100 Only'],
  ];
  it.each(cases)('%s', (pesos, words) => expect(amountInWords(toCentavos(pesos))).toBe(words));
});

describe('dates', () => {
  it('adds days and years without drifting', () => {
    expect(addDays('2026-10-30', 15)).toBe('2026-11-14');
    expect(addDays(addYears('2026-10-30', 1), -1)).toBe('2027-10-29');
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28');
  });
  it('formats', () => {
    expect(longDate('2026-10-05')).toBe('October 5, 2026');
    expect(shortDate('2026-10-05')).toBe('Oct 5, 2026');
    expect(shortDate(null)).toBe('—');
  });
});

describe('seed', () => {
  it('loads', () => {
    expect(bundledSeed.state.dir).toHaveLength(11);
    expect(bundledSeed.state.cv).toHaveLength(3);
    expect(bundledSeed.company.name).toBe('ALPHA PREMIER GROUP');
  });
  it('statement totals match the prototype', () => {
    const due = Object.fromEntries(bundledSeed.state.bs.map((b) => [b.no, statementTotals(b).due]));
    expect(due['BS-2026-0086']).toBe(toCentavos(426930));
    expect(due['BS-2026-0087']).toBe(toCentavos(91000));
    expect(due['BS-2026-0088']).toBe(toCentavos(586627.5));
  });
});

describe('terminal', () => {
  it('numbers documents', () => {
    const s = state();
    expect(nextVoucherNo(s, ctx)).toBe('CV-2026-0142');
    expect(nextStatementNo(s, ctx)).toBe('BS-2026-0089');
    expect(nextIDNo(s, ctx)).toBe('APG-2026-0031');
    expect(nextCode(s, 'Vendor')).toBe('V-005');
    expect(nextNumber([], 'CV-2027-')).toBe('CV-2027-0001');
  });

  it('saves a voucher, drops blank lines and logs it', () => {
    const d = { ...newVoucher(state(), ctx), payee: 'V-002', lines: [lineDraft({ desc: 'Water – Head Office', acct: '5210 Utilities', amount: '8,412.30' }), lineDraft()] };
    const r = saveVoucher(state(), d, ctx);
    expect(r.record.no).toBe('CV-2026-0142');
    expect(r.record.lines).toHaveLength(1);
    expect(r.state.log[0]).toEqual({ when: '2026-10-30 09:05', mod: 'CV', text: 'CV-2026-0142 for Manila Water Company saved and routed for approval (₱8,412.30).' });
  });

  it('refuses an empty voucher', () => {
    expect(() => saveVoucher(state(), newVoucher(state(), ctx), ctx)).toThrow('Add at least one particular with an amount.');
  });

  it('edits a voucher in place while it awaits approval, and copies one already approved', () => {
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

  it('takes statement defaults from the client', () => {
    const s = state();
    const d = newStatement(s, ctx);
    expect(d.due).toBe('2026-11-14');
    expect(withClient(s, d, 'C-002')).toMatchObject({ vat: false, ewt: false });
    expect(withClient(s, d, 'C-003')).toMatchObject({ vat: true, ewt: true });
  });

  it('refuses a statement due before it is dated', () => {
    const s = state();
    const d = { ...newStatement(s, ctx), due: '2026-10-01', lines: [lineDraft({ desc: 'Rent', amount: '100' })] };
    expect(() => saveStatement(s, d, ctx)).toThrow('The due date is before the statement date.');
  });

  it('issues an ID from the directory', () => {
    const s = state();
    const d = withEmployee(s, newID(s, ctx), 'E-004');
    expect(d.valid).toBe('2027-10-29');
    expect(d.pos).toBe('Admin Assistant');
    const r = issueID(s, d, ctx);
    expect(r.message).toBe('APG-2026-0031 issued and queued for printing.');
    expect(usedBy(r.state, 'E-004')).toEqual(['ID']);
  });

  it('adds, edits and removes directory records without collisions', () => {
    const s = state();
    const add = saveDirectoryRecord(s, { ...newDirectoryDraft('Client'), name: 'Ortigas Dental Clinic' }, ctx);
    expect(add.record).toMatchObject({ code: 'C-004', vat: true, ewt: false });
    expect(() => saveDirectoryRecord(add.state, { ...newDirectoryDraft('Client'), name: 'ortigas dental clinic' }, ctx)).toThrow(/already has that name/);
    expect(() => removeDirectoryRecord(s, 'V-001', ctx)).toThrow(/used by CV/);
    expect(removeDirectoryRecord(add.state, 'C-004', ctx).state.dir).toHaveLength(11);
    expect(payees(s).slice(0, 4).map((d) => d.code)).toEqual(['V-001', 'V-002', 'V-003', 'V-004']);
  });

  it('imports employees from another system without duplicates', () => {
    const s = state();
    const src = { id: 'attendance', name: 'the attendance tracker' };
    const first = importEmployees(s, src, [
      { externalId: 'APG-2026-102', name: 'Rafael D. Mendoza', department: 'Property Management' },
      { externalId: 'APG-2026-103', name: 'Bea Santos', department: 'Leasing' },
    ], ctx);
    expect(first.record.added.map((d) => d.code)).toEqual(['E-005']);
    expect(first.record.updated.map((d) => d.code)).toEqual(['E-003']);
    expect(first.state.dir.find((d) => d.code === 'E-003')?.links).toEqual({ attendance: 'APG-2026-102' });
    const again = importEmployees(first.state, src, [{ externalId: 'APG-2026-103', name: 'Bea Santos', department: 'Leasing' }], ctx);
    expect(again.record.unchanged).toBe(1);
    expect(again.state).toBe(first.state);
  });

  it('settles a statement with a reported payment, never a partial one', () => {
    const p = { amount: 91000, method: 'GCash', reference: '7731925', source: 'the website (ticket APG-1A2B3C4D)' };
    const r = recordPayment(state(), 'BS-2026-0087', p, ctx);
    expect(r.record.status).toBe('Paid');
    expect(r.state.log[0].text).toBe('BS-2026-0087 from Dela Cruz, Maria Teresa paid: ₱91,000.00 by GCash ref 7731925, reported on the website (ticket APG-1A2B3C4D).');
    expect(() => recordPayment(state(), 'BS-2026-0087', { ...p, amount: 50000 }, ctx)).toThrow(/less than the ₱91,000.00 due/);
    expect(() => recordPayment(r.state, 'BS-2026-0087', p, ctx)).toThrow(/already paid/);
  });

  it('marks overdue statements on open', () => {
    const s = applyDueDates(state(), ctx);
    expect(s.bs.find((b) => b.no === 'BS-2026-0088')?.status).toBe('Sent'); // due Nov 5
    const late = applyDueDates(state(), { ...ctx, now: () => new Date(2026, 10, 10) });
    expect(late.bs.find((b) => b.no === 'BS-2026-0088')?.status).toBe('Overdue');
  });

  it('summarises the books', () => {
    const f = overviewFigures(state(), ctx);
    expect(f[0]).toMatchObject({ value: '1', caption: '₱35,000.00 pending signature' });
    expect(f[1]).toMatchObject({ value: '₱677,627.50', caption: '2 statements open · 1 overdue' });
    expect(f[2].value).toBe('1');
    expect(finding(state())).toBe('₱91,000.00 from Dela Cruz, Maria Teresa has been overdue since Oct 10, 2026.');
  });

  it('reads backups and refuses other files', () => {
    expect(parseState(state()).dir).toHaveLength(11);
    expect(() => parseState({ hello: 1 })).toThrow('That file is not a Keystone backup.');
  });
});

describe('verification pattern (prototype)', () => {
  const rows = (t: string) => verificationCells(t).map((r) => r.map((c) => (c ? '1' : '0')).join(''));
  it('matches drawCode', () => {
    expect(rows('APG-2026-0028|Juan Miguel P. Reyes')).toEqual([
      '111111101101101111111', '100000100000001000001', '101110100110001011101', '101110100101101011101',
      '101110101100001011101', '100000101000001000001', '111111100100001111111', '000000000110100000000',
      '111100010001001010010', '010101001010000010010', '001110010010000011001', '110010010101111011000',
      '000111100111010001011', '000000001011010011011', '111111100000111100100', '100000101100001000010',
      '101110101001000000000', '101110101001111111001', '101110100101111110000', '100000100001010000101',
      '111111100100010011010',
    ]);
  });
});

describe('connector contract', () => {
  const base = { id: 'attendance', name: 'Attendance', about: '', platforms: [], settings: [], health: async () => ({ state: 'ready' as const, detail: '' }) };
  it('validates definitions', () => {
    expect(validateConnector(base, [])).toBeNull();
    expect(validateConnector(base, ['attendance'])).toMatch(/Two connectors/);
    expect(validateConnector({ ...base, id: 'Bad Id' }, [])).toMatch(/lowercase/);
    expect(validateConnector({ ...base, settings: [{ key: 'a', label: 'A', kind: 'text' }, { key: 'a', label: 'B', kind: 'text' }] }, [])).toMatch(/repeats/);
  });
  it('turns a hang into an error', async () => {
    await expect(withDeadline(new Promise(() => {}), 20, 'The kiosk')).rejects.toThrow('The kiosk did not answer within 0 seconds.');
  });
});
