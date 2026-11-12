import { describe, expect, it } from 'vitest';
import { companyOf, emptyState, parseState, type Ctx, type Member } from '@keystone/core';
import { canChange, companyDraftOf, companyFinding, companyLine, saveCompany, type CompanyDraft } from '../src/rules';
import { companyModule } from '../src';
import { sampleState } from '@keystone/core/sample';

/** 12 Nov 2026, 09:05 in Manila. */
const at = (who?: Member): Ctx => ({ now: () => new Date(2026, 10, 12, 9, 5), ...(who && { who }) });
const owner: Member = { uid: 'ceo-1', name: 'Mark Reyes', role: 'owner' };
const staff: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };
const blank = (): CompanyDraft => companyDraftOf(emptyState());

describe('company details', () => {
  it('are blank until someone fills them in: nothing is built in', () => {
    const d = companyOf(emptyState());

    expect(Object.values(d).every((v) => v === '' || v === 0)).toBe(true);
    expect(blank()).toMatchObject({ name: '', dueInDays: '', idValidYears: '' });
    expect(companyFinding(emptyState())).toEqual({ priority: 1, text: 'Fill in Company Details: documents print without the company\'s name and address until then.' });
    expect(companyLine(emptyState())).toContain('Not filled in yet');
  });

  it('are saved with the records, tidied, and logged', () => {
    const d = {
      ...blank(), name: '  Alpha  Premier Group ', address: ' Tektite East Tower ', checkedBy: ' Accounting ', dueInDays: ' 15 ', idValidYears: '1',
      paymentInstructions: '\n\nPlease pay to:\nBank: BPI\n\n', billingNote: '  Thank you.  ',
    };

    const r = saveCompany(emptyState(), d, at(owner));

    expect(r.record).toMatchObject({
      name: 'Alpha Premier Group', address: 'Tektite East Tower', checkedBy: 'Accounting', dueInDays: 15, idValidYears: 1,
      paymentInstructions: 'Please pay to:\nBank: BPI', billingNote: 'Thank you.',
    });
    expect(r.state.company).toEqual(r.record);
    expect(companyOf(r.state)).toEqual(r.record);
    expect(r.message).toBe('Company details saved.');
    expect(r.state.log[0]).toEqual({ when: '2026-11-12 09:05', mod: 'CO', text: 'Company details for Alpha Premier Group saved.' });
    expect(companyFinding(r.state)).toBeNull();
    // They survive a save and a reopen, the way state.json and a backup are read.
    expect(parseState(JSON.stringify(r.state)).company).toEqual(r.record);
  });

  it('need the company\'s name, and whole numbers of days and years in range', () => {
    expect(() => saveCompany(emptyState(), blank(), at(owner))).toThrow('Enter the company\'s name, as its documents print it.');
    const d = { ...blank(), name: 'APG' };

    expect(() => saveCompany(emptyState(), { ...d, dueInDays: '7.5' }, at(owner))).toThrow('Enter the days to pay as a whole number from 0 to 365, or leave it blank.');
    expect(() => saveCompany(emptyState(), { ...d, dueInDays: '400' }, at(owner))).toThrow('from 0 to 365');
    expect(() => saveCompany(emptyState(), { ...d, idValidYears: '-1' }, at(owner))).toThrow('Enter the years an ID is valid as a whole number from 0 to 10, or leave it blank.');
    expect(saveCompany(emptyState(), { ...d, dueInDays: '', idValidYears: '' }, at(owner)).record).toMatchObject({ dueInDays: 0, idValidYears: 0 });
  });

  it('are changed only by an owner when signed in, and by whoever uses a computer nobody signs in to', () => {
    const d = { ...companyDraftOf(sampleState()), phone: '02 8650 2541' };

    expect(canChange(at(owner))).toBe(true);
    expect(canChange(at())).toBe(true);
    expect(canChange(at(staff))).toBe(false);
    expect(() => saveCompany(sampleState(), d, at(staff))).toThrow('Only the owner changes the company\'s details.');
    expect(saveCompany(sampleState(), d, at()).record.phone).toBe('02 8650 2541');
  });

  it('come back into the form as saved, days and years as text', () => {
    expect(companyDraftOf(sampleState())).toMatchObject({ name: 'ALPHA PREMIER GROUP OF COMPANIES OPC', dueInDays: '15', idValidYears: '1' });
  });

  it('never change the state they are given', () => {
    const s = sampleState();
    const before = JSON.stringify(s);
    saveCompany(s, { ...companyDraftOf(s), name: 'Another' }, at(owner));
    expect(JSON.stringify(s)).toBe(before);
  });

  it('sit last under Settings, log under their own tag, and say so on Home until filled in', () => {
    expect(companyModule).toMatchObject({ id: 'company', title: 'Company Details', section: 'Settings', order: 92, logTags: { CO: 'Company Details' } });
    expect(companyModule.finding).toBe(companyFinding);
  });
});
