import { describe, expect, it } from 'vitest';
import { refusalOf } from '@keystone/kit/testing';
import { COMPANY, companyOf, emptyState, parseState, SERVICES, signatureOf, signatureSizeOf, type Ctx, type Member } from '@keystone/core';
import { canChange, COMPANY_LINE, companyDraftOf, resizeSignature, saveCompany, setSignature, signatureSizes, type CompanyDraft } from '../src/rules';
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
      name: 'ALPHA PREMIER GROUP OF COMPANIES OPC', address: 'Suites 3104, Philippine Stock Exchange Centre, Tektite East Tower, Exchange Road, Ortigas Center, Pasig City 1605',
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
    expect(refusalOf(() => saveCompany(emptyState(), { ...blank(), dueInDays: '7.5' }, at(owner)))).toEqual({ error: 'Enter the days to pay as a whole number from 0 to 365, or leave it blank.', fields: ['dueInDays'] });
    expect(refusalOf(() => saveCompany(emptyState(), { ...blank(), dueInDays: '400' }, at(owner)))).toEqual({ error: 'Enter the days to pay as a whole number from 0 to 365, or leave it blank.', fields: ['dueInDays'] });
    expect(refusalOf(() => saveCompany(emptyState(), { ...blank(), idValidYears: '-1' }, at(owner)))).toEqual({ error: 'Enter the years an ID is valid as a whole number from 0 to 10, or leave it blank.', fields: ['idValidYears'] });
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

  it('keep a signature for each signatory, found by name whatever its capitals, kept by a save, and read back', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const added = setSignature(sampleState(), ' Mark  Anthony Santos', png, at(owner));

    expect(added.message).toBe('Signature for Mark Anthony Santos added.');
    expect(signatureOf(companyOf(added.state), 'MARK ANTHONY SANTOS')).toBe(png);
    expect(signatureOf(companyOf(added.state), 'Brian Sy')).toBeUndefined();
    expect(setSignature(added.state, 'mark anthony santos', png, at(owner)).message).toBe('Signature for mark anthony santos replaced.');
    // Saving the form keeps them; a saved file brings them back, and only images.
    const saved = saveCompany(added.state, companyDraftOf(added.state), at(owner)).state;

    expect(signatureOf(companyOf(saved), 'Mark Anthony Santos')).toBe(png);
    const read = parseState(JSON.stringify({ ...saved, company: { ...saved.company, signatures: { 'mark  anthony santos': png, 'BRIAN SY': 'javascript:alert(1)' } } }));

    expect(companyOf(read).signatures).toEqual({ 'MARK ANTHONY SANTOS': png });

    const removed = setSignature(saved, 'Mark Anthony Santos', null, at(owner));

    expect(companyOf(removed.state).signatures).toBeUndefined();
    expect(removed.state.log.map((l) => l.text)).toContain('Signature for Mark Anthony Santos removed.');
  });

  it('draw a signature at the size the CEO picks, on every paper, from half to twice the standard height', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const signed = setSignature(sampleState(), 'Mark Anthony Santos', png, at(owner)).state;
    const bigger = resizeSignature(signed, 'mark anthony santos', 1.234, at(owner));

    expect(signatureSizeOf(companyOf(signed), 'Mark Anthony Santos')).toBe(1);
    expect(bigger.message).toBe('Signature for mark anthony santos drawn at 123%.');
    expect(companyOf(bigger.state).signatureSizes).toEqual({ 'MARK ANTHONY SANTOS': 1.23 });
    expect(bigger.state.log[0]).toMatchObject({ mod: 'CO', text: 'Signature for mark anthony santos drawn at 123%.' });
    // Kept within half to twice, and the standard size keeps nothing.
    expect(signatureSizeOf(companyOf(resizeSignature(signed, 'Mark Anthony Santos', 9, at(owner)).state), 'Mark Anthony Santos')).toBe(2);
    expect(signatureSizeOf(companyOf(resizeSignature(signed, 'Mark Anthony Santos', 0.1, at(owner)).state), 'Mark Anthony Santos')).toBe(0.5);
    expect(companyOf(resizeSignature(bigger.state, 'Mark Anthony Santos', 1, at(owner)).state).signatureSizes).toBeUndefined();
    expect(resizeSignature(bigger.state, 'Mark Anthony Santos', 1.23, at(owner)).state).toBe(bigger.state);
  });

  it('keep a signature’s size through a save and a saved file, and drop it with the signature', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const signed = setSignature(sampleState(), 'Mark Anthony Santos', png, at(owner)).state;
    const sized = resizeSignature(signed, 'Mark Anthony Santos', 1.5, at(owner)).state;
    const saved = saveCompany(sized, companyDraftOf(sized), at(owner)).state;

    expect(companyOf(saved).signatureSizes).toEqual({ 'MARK ANTHONY SANTOS': 1.5 });
    const read = parseState(JSON.stringify({ ...saved, company: { ...saved.company, signatureSizes: { 'mark anthony  santos': 1.5, 'BRIAN SY': 7, 'ANA': 'big' } } }));

    expect(companyOf(read).signatureSizes).toEqual({ 'MARK ANTHONY SANTOS': 1.5 });
    expect(companyOf(setSignature(saved, 'Mark Anthony Santos', null, at(owner)).state).signatureSizes).toBeUndefined();
  });

  it('let only the CEO resize, and only a signature that is kept, through the service papers use', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const signed = setSignature(sampleState(), 'Mark Anthony Santos', png, at(owner)).state;

    expect(companyModule.provides?.[SERVICES.signatureSizes]).toBe(signatureSizes);
    expect([signatureSizes.canResize(at(owner)), signatureSizes.canResize(at(staff)), signatureSizes.canResize(at())]).toEqual([true, false, true]);
    expect(() => resizeSignature(signed, 'Mark Anthony Santos', 1.2, at(staff))).toThrow('Only the CEO resizes signatures.');
    expect(() => resizeSignature(signed, 'Brian Sy', 1.2, at(owner))).toThrow('No signature is kept for Brian Sy.');
    expect(() => resizeSignature(signed, 'Mark Anthony Santos', Number.NaN, at(owner))).toThrow('That is not a size.');
  });

  it('refuse a signature from staff, with no name, that is not an image, or too large', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';

    expect(() => setSignature(sampleState(), 'Brian Sy', png, at(staff))).toThrow('Only the CEO changes signatures.');
    expect(() => setSignature(sampleState(), '  ', png, at(owner))).toThrow('Choose whose signature this is.');
    expect(() => setSignature(sampleState(), 'Brian Sy', 'data:text/html;base64,PGI+', at(owner))).toThrow('That file is not an image.');
    expect(() => setSignature(sampleState(), 'Brian Sy', `${png}${'A'.repeat(200_000)}`, at(owner))).toThrow('That signature is too large. Use a smaller image.');
    expect(() => setSignature(sampleState(), 'Brian Sy', null, at(owner))).toThrow('No signature is kept for Brian Sy.');
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
});
