import { describe, expect, it } from 'vitest';
import { COMPANY, companyOf, emptyState, parseState, type Ctx, type Member } from '@keystone/core';
import { canChange, COMPANY_LINE, companyDraftOf, saveCompany, type CompanyDraft } from '../src/rules';
import { companyModule } from '../src';
import { sampleState } from '@keystone/core/sample';

/** 12 Nov 2026, 09:05 in Manila. */
const at = (who?: Member): Ctx => ({ now: () => new Date(2026, 10, 12, 9, 5), ...(who && { who }) });
const owner: Member = { uid: 'ceo-1', name: 'Mark Reyes', role: 'owner' };
const staff: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };
const blank = (): CompanyDraft => companyDraftOf(emptyState());

describe('company details', () => {
  it('carry the built-in company, and leave what documents start from blank until someone fills it in', () => {
    const d = companyOf(emptyState());

    // docs/adr/0023: the company itself is built in, the same on every computer and in every set of records.
    expect(d).toMatchObject({
      name: 'ALPHA PREMIER GROUP OF COMPANIES OPC', address: 'Unit 3104C, Tektite East Tower Ortigas Center, Pasig, 1116 Metro Manila',
      shortAddress: 'Tektite East Tower, Ortigas Center, Pasig', phone: '02 8650 2540', billingEmail: 'billing@alphapremiergroup.com',
    });
    expect(blank()).toEqual({
      preparedBy: '', checkedBy: '', approvedBy: '', paymentInstructions: '', billingNote: '', signatory: '', billingTerms: '',
      dueInDays: '', idValidYears: '',
    });
    expect(COMPANY_LINE).toContain('built in');
  });

  it('keep the built-in company over any saved before', () => {
    const s = { ...sampleState(), company: { ...companyOf(sampleState()), name: 'Old Name', address: 'Old address' } };

    expect(companyOf(s)).toMatchObject({ name: COMPANY.name, address: COMPANY.address });
  });

  it('are saved with the records, tidied, and logged', () => {
    const d = { ...blank(), checkedBy: ' Accounting ', dueInDays: ' 15 ', idValidYears: '1', paymentInstructions: '\n\nPlease pay to:\nBank: BPI\n\n', billingNote: '  Thank you.  ' };

    const r = saveCompany(emptyState(), d, at(owner));

    expect(r.record).toMatchObject({
      ...COMPANY, checkedBy: 'Accounting', dueInDays: 15, idValidYears: 1, paymentInstructions: 'Please pay to:\nBank: BPI', billingNote: 'Thank you.',
    });
    expect(r.state.company).toEqual(r.record);
    expect(companyOf(r.state)).toEqual(r.record);
    expect(r.message).toBe('Company details saved.');
    expect(r.state.log[0]).toEqual({ when: '2026-11-12 09:05', mod: 'CO', text: 'Company details for ALPHA PREMIER GROUP OF COMPANIES OPC saved.' });
    // They survive a save and a reopen, the way state.json and a backup are read.
    expect(parseState(JSON.stringify(r.state)).company).toEqual(r.record);
  });

  it('need whole numbers of days and years in range', () => {
    expect(() => saveCompany(emptyState(), { ...blank(), dueInDays: '7.5' }, at(owner))).toThrow('Enter the days to pay as a whole number from 0 to 365, or leave it blank.');
    expect(() => saveCompany(emptyState(), { ...blank(), dueInDays: '400' }, at(owner))).toThrow('from 0 to 365');
    expect(() => saveCompany(emptyState(), { ...blank(), idValidYears: '-1' }, at(owner))).toThrow('Enter the years an ID is valid as a whole number from 0 to 10, or leave it blank.');
    expect(saveCompany(emptyState(), blank(), at(owner)).record).toMatchObject({ dueInDays: 0, idValidYears: 0 });
  });

  it('are changed only by an owner when signed in, and by whoever uses a computer nobody signs in to', () => {
    const d = { ...companyDraftOf(sampleState()), billingTerms: 'Pay within the month.' };

    expect(canChange(at(owner))).toBe(true);
    expect(canChange(at())).toBe(true);
    expect(canChange(at(staff))).toBe(false);
    expect(() => saveCompany(sampleState(), d, at(staff))).toThrow('Only the CEO changes the company\'s details.');
    expect(saveCompany(sampleState(), d, at()).record.billingTerms).toBe('Pay within the month.');
  });

  it('come back into the form as saved, days and years as text', () => {
    expect(companyDraftOf(sampleState())).toMatchObject({ checkedBy: 'Accounting', dueInDays: '15', idValidYears: '1' });
  });

  it('never change the state they are given', () => {
    const s = sampleState();
    const before = JSON.stringify(s);
    saveCompany(s, { ...companyDraftOf(s), signatory: 'Another' }, at(owner));
    expect(JSON.stringify(s)).toBe(before);
  });

  it('sit last under Settings, log under their own tag, and raise no finding: the company is never missing', () => {
    expect(companyModule).toMatchObject({ id: 'company', title: 'Company Details', section: 'Settings', order: 92, logTags: { CO: 'Company Details' } });
    expect(companyModule.finding).toBeUndefined();
  });
});
