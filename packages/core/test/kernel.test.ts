import { describe, expect, it } from 'vitest';
import {
  addDays, addYears, amountInWords, bundledSeed, editText, importEmployees, lineDraft, lineItemsOf, longDate, newDirectoryDraft,
  nextCode, nextNumber, parseAmount, parseState, payees, peso, percent, removeDirectoryRecord, saveDirectoryRecord, shortDate,
  toCentavos, topFinding, validateConnector, withDeadline, type Ctx,
} from '../src';

// The kernel only. Each module's rules are tested in its own package
// (packages/modules/*/test). Expected values marked "prototype" were produced by running
// the web prototype's own JavaScript (prototype/index.html).

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
});

describe('state and numbering', () => {
  it('numbers from the highest in use', () => {
    expect(nextNumber(['CV-2026-0139', 'CV-2026-0141'], 'CV-2026-')).toBe('CV-2026-0142');
    expect(nextNumber([], 'CV-2027-')).toBe('CV-2027-0001');
    expect(nextCode(state(), 'Vendor')).toBe('V-005');
  });

  it('drops blank lines as the prototype did', () => {
    const items = lineItemsOf([lineDraft({ desc: 'Rent', amount: '12,500' }), lineDraft()], 'ref');
    expect(items).toEqual([{ desc: 'Rent', ref: '', amt: 12500 }]);
  });

  it('reads backups, keeps unknown module data, refuses other files', () => {
    const withExt = { ...state(), ext: { payroll: { cutoffs: 2 } } };
    expect(parseState(withExt).ext).toEqual({ payroll: { cutoffs: 2 } });
    expect(() => parseState({ hello: 1 })).toThrow('That file is not a Keystone backup.');
  });

  it('the finding is the highest priority any installed module reports', () => {
    expect(topFinding([{ priority: 20, text: 'B' }, null, { priority: 30, text: 'A' }])).toBe('A');
    expect(topFinding([])).toBe('Nothing is waiting on you.');
  });
});

describe('directory (the shared kernel)', () => {
  it('adds, edits and removes records without collisions', () => {
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
