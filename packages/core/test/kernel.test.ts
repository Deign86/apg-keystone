import { describe, expect, it } from 'vitest';
import {
  addDays, addYears, amountInWords, companyOf, datesBetween, emptyState, editText, halfMonthOf, halfMonthsTo, isWeekday, lineDraft, lineDraftOf,
  isJsonObject, jsonNumber, jsonObjects, jsonText, lineItemsOf, longDate, mondayOf, moduleData, periodLabel, withModuleData,
  newDirectoryDraft, nextCode, nextNumber, parseAmount, parseBackup, parseQuantity, parseState, payees, peso, percent, removeDirectoryRecord, saveDirectoryRecord, shortDate,
  openDesktopApp, toCentavos, topFinding, validateConnector, withDeadline, type Ctx, type InstalledApp, type PlatformName, type SystemBridge,
} from '../src';
import { sampleState } from '../sample';

// The kernel only. Each module's rules are tested in its own package
// (packages/modules/*/test). Expected values marked "prototype" were produced by running
// the web prototype's own JavaScript (prototype/index.html).

/** 30 Oct 2026, 09:05 in Manila (vitest.config pins TZ). */
const ctx: Ctx = { now: () => new Date(2026, 9, 30, 9, 5) };
const state = () => sampleState();

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
  it('finds the semi-monthly cut-off a date falls in', () => {
    expect(halfMonthOf('2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-15' });
    expect(halfMonthOf('2026-10-15')).toEqual({ from: '2026-10-01', to: '2026-10-15' });
    expect(halfMonthOf('2026-10-16')).toEqual({ from: '2026-10-16', to: '2026-10-31' });
    expect(halfMonthOf('2026-11-30')).toEqual({ from: '2026-11-16', to: '2026-11-30' });
    expect(halfMonthOf('2028-02-20')).toEqual({ from: '2028-02-16', to: '2028-02-29' });
    expect(halfMonthOf('2026-12-31')).toEqual({ from: '2026-12-16', to: '2026-12-31' });
    expect(halfMonthsTo('2026-11-02', 3).map(periodLabel)).toEqual(['Nov 1–15, 2026', 'Oct 16–31, 2026', 'Oct 1–15, 2026']);
    expect(periodLabel({ from: '2026-12-28', to: '2027-01-03' })).toBe('Dec 28, 2026 – Jan 3, 2027');
  });
  it('counts weekdays and weeks', () => {
    // The HR sheet's Oct 1–15, 2026 cut-off has 11 standard working days.
    expect(datesBetween('2026-10-01', '2026-10-15').filter(isWeekday)).toHaveLength(11);
    expect(datesBetween('2026-10-02', '2026-10-01')).toEqual([]);
    expect(mondayOf('2026-11-02')).toBe('2026-11-02');
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
    expect(mondayOf('2026-10-01')).toBe('2026-09-28');
  });
});

describe('module data', () => {
  it('keeps each module\'s data apart and leaves the rest alone', () => {
    const s = { ...state(), ext: { other: { kept: true } } };
    const next = withModuleData(s, 'timekeeping', { days: [] });

    expect(moduleData(next, 'timekeeping')).toEqual({ days: [] });
    expect(moduleData(next, 'other')).toEqual({ kept: true });
    expect(moduleData(state(), 'timekeeping')).toBeUndefined();
    expect(s.ext).toEqual({ other: { kept: true } });
  });

  it('decodes saved fields into what they should be, or a safe fallback', () => {
    expect([jsonText('8:00'), jsonText(8), jsonText(null), jsonText(undefined)]).toEqual(['8:00', '', '', '']);
    expect([jsonNumber(760), jsonNumber('760'), jsonNumber(null), jsonNumber(Number.NaN)]).toEqual([760, 0, 0, 0]);
    expect([isJsonObject({}), isJsonObject([]), isJsonObject('x'), isJsonObject(null), isJsonObject(3)]).toEqual([true, false, false, false, false]);
    expect(jsonObjects([{ a: 1 }, 'b', [2], null])).toEqual([{ a: 1 }]);
    expect(jsonObjects({ a: 1 })).toEqual([]);
  });
});

describe('what Keystone starts from (docs/adr/0018)', () => {
  it('is no records and no company details: nothing is built in', () => {
    expect(emptyState()).toEqual({ dir: [], cv: [], bs: [], ids: [], log: [] });
    expect(companyOf(emptyState())).toEqual({
      name: '', address: '', contact: '', shortAddress: '', phone: '', billingEmail: '', preparedBy: '', checkedBy: '', approvedBy: '',
      paymentInstructions: '', billingNote: '', signatory: '', billingTerms: '', dueInDays: 0, idValidYears: 0,
    });
  });

  it('reads company details back from a file field by field, so a hand-edited one never breaks', () => {
    const s = parseState(JSON.stringify({ ...emptyState(), company: { name: 'APG', phone: 2540, dueInDays: '15', idValidYears: -2, extra: 'x' } }));

    expect(s.company).toMatchObject({ name: 'APG', phone: '', dueInDays: 0, idValidYears: 0, address: '' });
    expect(s.company).not.toHaveProperty('extra');
    expect(parseState(JSON.stringify({ ...emptyState(), company: 'APG' }))).not.toHaveProperty('company');
  });

  it('keeps the tests\' sample records apart, as a saved state', () => {
    expect(sampleState().dir).toHaveLength(11);
    expect(sampleState().cv).toHaveLength(3);
    expect(companyOf(sampleState()).name).toBe('ALPHA PREMIER GROUP OF COMPANIES OPC');
    expect(sampleState()).not.toBe(sampleState());
  });
});

describe('state and numbering', () => {
  it('numbers from the highest in use', () => {
    expect(nextNumber(['CV-2026-0139', 'CV-2026-0141'], 'CV-2026-')).toBe('CV-2026-0142');
    expect(nextNumber([], 'CV-2027-')).toBe('CV-2027-0001');
    expect(nextCode(state(), 'Vendor')).toBe('V-005');
  });

  it('drops blank lines as the prototype did', () => {
    const items = lineItemsOf([lineDraft({ desc: 'Rent', amount: '12,500' }), lineDraft()], 'amount');
    expect(items).toEqual([{ desc: 'Rent', amt: 12500 }]);
  });

  it('prices statement lines by quantity, and reads a typed quantity', () => {
    const items = lineItemsOf([lineDraft({ desc: 'Virtual office', qty: '3', amount: '2,299' }), lineDraft({ desc: 'Mail', qty: '', amount: '0.333' })], 'unit');
    expect(items).toEqual([{ desc: 'Virtual office', qty: 3, price: 2299, amt: 6897 }, { desc: 'Mail', qty: 1, price: 0.33, amt: 0.33 }]);
    expect([parseQuantity('1,000'), parseQuantity(' '), parseQuantity('two'), parseQuantity('-1')]).toEqual([1000, 1, 0, 0]);
    expect(lineDraftOf({ desc: 'Old', amt: 450 })).toMatchObject({ qty: '1', amount: '450' });
  });

  it('reads backups, keeps unknown module data, refuses other files', () => {
    const withExt = { ...state(), ext: { payroll: { cutoffs: 2 } } };
    expect(parseState(JSON.stringify(withExt)).ext).toEqual({ payroll: { cutoffs: 2 } });
    expect(() => parseState('{"hello":1}')).toThrow('That file is not a Keystone backup.');
    expect(() => parseState('null')).toThrow('That file is not a Keystone backup.');
    expect(() => parseState('{"dir": [],\n}')).toThrow('That file is not a Keystone backup.');
  });

  it('restores a backup only when every record can be shown, and names the one that cannot', () => {
    const fromPrototype = state();
    fromPrototype.cv[0] = { ...fromPrototype.cv[0], bank: 'BDO – Current 0012-3456-78', lines: [{ desc: '', acct: '5210 Utilities', amt: 0 }] };
    expect(parseBackup(JSON.stringify(state()))).toEqual(state());
    expect(parseBackup(JSON.stringify(fromPrototype)).cv[0].bank).toBe('BDO – Current 0012-3456-78');

    const withoutLines = JSON.stringify({ ...state(), cv: [...state().cv, { ...state().cv[0], no: 'CV-2026-0138', lines: undefined }] });
    expect(() => parseBackup(withoutLines)).toThrow('That backup has a voucher Keystone cannot read (CV-2026-0138), so nothing was restored.');

    const numberAsText = JSON.stringify({ ...state(), log: [{ when: '2026-10-30 09:00', mod: 'CV', text: 138 }, ...state().log] });
    expect(() => parseBackup(numberAsText)).toThrow('That backup has a log entry Keystone cannot read (2026-10-30 09:00), so nothing was restored.');

    const unnamed = JSON.stringify({ ...state(), bs: [...state().bs, { ...state().bs[0], no: 7, vat: 'yes' }] });
    expect(() => parseBackup(unnamed)).toThrow('That backup has a statement Keystone cannot read (number 4 in the file), so nothing was restored.');
    expect(() => parseBackup('{"dir": [],\n}')).toThrow('That file is not a Keystone backup.');

    // The saved state still opens with such a record: only a restore is refused.
    expect(parseState(withoutLines).cv).toHaveLength(4);
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
});

describe('connector contract', () => {
  const base = { id: 'attendance', name: 'Attendance', logo: 'attendance.png', open: async () => {} };
  it('validates definitions', () => {
    expect(validateConnector(base, [])).toBeNull();
    expect(validateConnector(base, ['attendance'])).toMatch(/Two connectors/);
    expect(validateConnector({ ...base, id: 'Bad Id' }, [])).toMatch(/lowercase/);
    expect(validateConnector({ ...base, logo: '' }, [])).toMatch(/no logo/);
  });
  it('turns a hang into an error', async () => {
    await expect(withDeadline(new Promise(() => {}), 20, 'The kiosk')).rejects.toThrow('The kiosk did not answer within 0 seconds.');
  });

  const studio = { name: 'Alpha Branding Studio', locator: { macBundleId: 'com.alphapremier.brandingstudio' }, downloads: 'https://example.test/releases/latest' };

  function computer(platform: PlatformName, installed: InstalledApp | null) {
    const did: string[] = [];

    const system: SystemBridge = {
      platform,
      locateApp: async () => installed,
      launchApp: async (app) => { did.push(`launch ${app.path}`); },
      openUrl: async (url) => { did.push(`open ${url}`); },
    };

    return { system, did };
  }

  it('starts a desktop app that is installed, and says nothing more', async () => {
    const { system, did } = computer('macos', { path: '/Applications/Alpha Branding Studio.app' });

    expect(await openDesktopApp(system, studio)).toBeUndefined();
    expect(did).toEqual(['launch /Applications/Alpha Branding Studio.app']);
  });

  it('opens the download page of an app that is not installed, and says so', async () => {
    const { system, did } = computer('windows', null);

    expect(await openDesktopApp(system, studio)).toBe('Alpha Branding Studio is not on this computer, so its download page is open.');
    expect(did).toEqual(['open https://example.test/releases/latest']);
  });

  it('asks for the desktop app in the browser preview', async () => {
    const { system, did } = computer('web', null);

    await expect(openDesktopApp(system, studio)).rejects.toThrow('Open Keystone’s desktop app to open Alpha Branding Studio.');
    expect(did).toEqual([]);
  });
});
