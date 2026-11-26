import { describe, expect, it } from 'vitest';
import { refusalOf } from '@keystone/kit/testing';
import { emptyState, withModuleData, type Ctx, type TerminalState } from '@keystone/core';
import {
  addToRoster, certificateDue, datesToCheck, internDraftOf, internsFigure, internsFinding, internsLine, internsOf, isActive, newIntern, nextIdNo, owed, owing,
  receiveRequirement, removeFromRoster, removeIntern, requirementText, rosterOf, rosterSuggestions, saveIntern, withInterns, type Intern, type InternDraft,
} from '../src/rules';

/** Nov 2, 2026, 10:00 in Manila. */
const ctx: Ctx = { now: () => new Date(2026, 10, 2, 10, 0) };

const intern = (patch: Partial<Intern> = {}): Intern => ({
  no: 'IN-0001', name: 'Juan Dela Cruz', school: 'Sample University', batch: 10, start: '2026-10-26', end: '', schedule: 'Mon-Fri', hours: 486,
  idNo: 'APG-2026-120', endorsement: '2026-10-26', medical: '2026-10-27', police: '2026-10-28', moa: '2026-10-29', proof: '', status: 'Ongoing', volunteer: false,
  remarks: '', ...patch,
});

const holding = (...interns: Intern[]): TerminalState => withInterns(emptyState(), interns);

const draft = (patch: Partial<InternDraft> = {}): InternDraft => ({ ...newIntern(emptyState(), ctx), name: 'Maria Santos', school: 'Sample College', hours: '486', ...patch });

describe('the register', () => {
  it('starts empty, and reads what was saved leniently', () => {
    expect(internsOf(emptyState())).toEqual([]);
    expect(internsLine(emptyState())).toBe('No interns yet. Import HR’s spreadsheet to bring every batch in, or add an intern.');
    const odd = withModuleData(emptyState(), 'interns', { interns: [{ no: 'IN-0001', name: 'Ana', status: 'Retired', batch: '3' }, { name: 'No key' }, 7], roster: [{ day: 'Funday', names: ['X'] }] });

    expect(internsOf(odd)).toEqual([intern({ no: 'IN-0001', name: 'Ana', school: '', batch: 0, start: '', schedule: '', hours: 0, idNo: '', endorsement: '', medical: '', police: '', moa: '' })]);
    expect(rosterOf(odd).every((d) => d.names.length === 0)).toBe(true);
  });

  it('starts a new intern in the latest batch, today, on the last one’s schedule, with the next ID number in any form', () => {
    expect(newIntern(emptyState(), ctx)).toMatchObject({ batch: '1', start: '2026-11-02', schedule: 'Mon-Fri', idNo: 'APG-2026-001', status: 'Ongoing' });
    const s = holding(intern({ batch: 9, idNo: 'APG - 0888 012' }), intern({ no: 'IN-0002', batch: 10, idNo: 'APG-2026-126', schedule: 'Tues-Sat' }));

    expect(newIntern(s, ctx)).toMatchObject({ batch: '10', schedule: 'Tues-Sat', idNo: 'APG-2026-127' });
    expect(nextIdNo(holding(intern({ idNo: 'APG 2025 040' })), ctx)).toBe('APG-2026-041');
  });

  it('adds an intern, and logs it', () => {
    const r = saveIntern(emptyState(), draft(), ctx);

    expect(r.record).toMatchObject({ no: 'IN-0001', name: 'Maria Santos', batch: 1, hours: 486, idNo: 'APG-2026-001', status: 'Ongoing' });
    expect(r.message).toBe('Maria Santos added to Batch 1.');
    expect(r.state.log[0]).toMatchObject({ mod: 'INT', text: 'Intern Maria Santos (Batch 1) added.' });
  });

  it('refuses what is missing or wrong, naming the field', () => {
    const s = holding(intern());

    expect(refusalOf(() => saveIntern(s, draft({ name: '  ' }), ctx))).toEqual({ error: 'Enter the intern’s name.', fields: ['name'] });
    expect(refusalOf(() => saveIntern(s, draft({ batch: 'ten' }), ctx))).toEqual({ error: 'Enter the batch as a number, like 10.', fields: ['batch'] });
    expect(refusalOf(() => saveIntern(s, draft({ hours: 'many' }), ctx))).toEqual({ error: 'Enter the OJT hours as a number, like 486.', fields: ['hours'] });
    expect(refusalOf(() => saveIntern(s, draft({ start: '2026-12-01', end: '2026-11-01' }), ctx))).toEqual({ error: 'The end date is before the start date.', fields: ['end'] });
    expect(refusalOf(() => saveIntern(s, draft({ police: 'next week' }), ctx))).toEqual({ error: 'Enter the police clearance’s date as a date.', fields: ['police'] });
    expect(refusalOf(() => saveIntern(s, draft({ idNo: 'apg-2026-120' }), ctx))).toEqual({ error: 'apg-2026-120 is Juan Dela Cruz’s ID number. The next free one is APG-2026-121.', fields: ['idNo'] });
    expect(saveIntern(s, draft({ hours: '1,000', police: 'N/A' }), ctx).record).toMatchObject({ hours: 1000, police: 'N/A' });
  });

  it('keeps a date the spreadsheet wrote until a date is typed over it, and keeps where the record came from', () => {
    const source = { file: 'INTERNS.xlsx', sheet: 'BATCH 8', row: 18, fill: '', cells: [{ column: 'Moa', text: '70-03-2026' }] };
    const s = holding(intern({ moa: '70-03-2026', source }));
    const edit = { ...internDraftOf(internsOf(s)[0]), status: 'Completed' as const, proof: 'Certificate' };
    const r = saveIntern(s, edit, ctx);

    expect(r.record).toMatchObject({ moa: '70-03-2026', status: 'Completed', source });
    expect(r.state.log[0].text).toBe('Intern Juan Dela Cruz (Batch 10) updated, now completed.');
    expect(saveIntern(s, { ...edit, moa: '2026-07-03' }, ctx).record.moa).toBe('2026-07-03');
    expect(refusalOf(() => saveIntern(s, { ...edit, moa: '71-03-2026' }, ctx))?.fields).toEqual(['moa']);
  });

  it('marks a requirement handed in today, and removes an intern', () => {
    const s = holding(intern({ police: '' }));
    const r = receiveRequirement(s, 'IN-0001', 'police', ctx);

    expect(r.record.police).toBe('2026-11-02');
    expect(r.state.log[0].text).toBe('Juan Dela Cruz handed in the police clearance.');
    const gone = removeIntern(r.state, 'IN-0001', ctx);

    expect(internsOf(gone.state)).toEqual([]);
    expect(gone.state.log[0].text).toBe('Intern Juan Dela Cruz (Batch 10) removed.');
    expect(refusalOf(() => removeIntern(gone.state, 'IN-0001', ctx))?.error).toBe('IN-0001 is not saved.');
  });
});

describe('reading a record', () => {
  it('says what is owed, and what to check', () => {
    const i = intern({ medical: '', moa: '', police: 'Sept. 14 2027' });

    expect(owed(i).map((r) => r.key)).toEqual(['medical', 'moa']);
    expect(owing(i)).toBe(true);
    expect(owing(intern({ status: 'Incomplete requirements' }))).toBe(true);
    expect(owing(intern({ status: 'Completed', medical: '' }))).toBe(false);
    expect(datesToCheck(i, ctx)).toEqual(['Police clearance']);
    // A requirement dated after today was not handed in yet: the date is a slip.
    expect(datesToCheck(intern({ police: '2027-09-14' }), ctx)).toEqual(['Police clearance']);
    expect(datesToCheck(intern({ end: '2027-01-15' }), ctx)).toEqual([]);
  });

  it('words a requirement: its date, N/A, not yet while it is owed, and a dash for a finished OJT that never tracked it', () => {
    expect(requirementText('2026-10-27', 'Ongoing')).toBe('Oct 27, 2026');
    expect(requirementText('N/A', 'Ongoing')).toBe('N/A');
    expect(requirementText('', 'Ongoing')).toBe('Not yet');
    expect(requirementText('', 'Incomplete requirements')).toBe('Not yet');
    expect(requirementText('', 'Completed')).toBe('—');
    expect(requirementText('70-03-2026', 'Ongoing')).toBe('70-03-2026');
  });
});

describe('the cleaning schedule', () => {
  it('puts people on a day and takes them off, refusing a name twice or none', () => {
    const on = addToRoster(holding(intern()), 'Monday', ' juan  dela cruz ', ctx);

    expect(rosterOf(on.state)[0]).toEqual({ day: 'Monday', names: ['juan dela cruz'] });
    expect(on.state.log[0].text).toBe('juan dela cruz put on the cleaning schedule for Monday.');
    expect(refusalOf(() => addToRoster(on.state, 'Monday', 'Juan Dela Cruz', ctx))).toEqual({ error: 'Juan Dela Cruz already cleans on Monday.', fields: ['roster.Monday'] });
    expect(refusalOf(() => addToRoster(on.state, 'Friday', ' ', ctx))).toEqual({ error: 'Enter who cleans on Friday.', fields: ['roster.Friday'] });
    // The interns stay as they were.
    expect(internsOf(on.state)).toEqual([intern()]);
    const off = removeFromRoster(on.state, 'Monday', 'juan dela cruz', ctx);

    expect(rosterOf(off.state)[0].names).toEqual([]);
    expect(off.message).toBe('juan dela cruz no longer cleans on Monday.');
  });

  it('offers the names of the interns on OJT', () => {
    expect(rosterSuggestions(holding(intern(), intern({ no: 'IN-0002', name: 'Done Already', status: 'Completed' })))).toEqual(['Juan Dela Cruz']);
  });
});

describe('what it tells Home and Overview', () => {
  it('says first who is past their end date, then who owes requirements, then whose certificate is due', () => {
    const past = intern({ end: '2026-10-30' });
    const owes = intern({ no: 'IN-0002', name: 'Ana Reyes', police: '', moa: '' });
    const done = intern({ no: 'IN-0003', name: 'Fe Lim', status: 'Completed' });

    expect(internsFinding(holding(past, owes, done), ctx)).toEqual({ priority: 6, text: 'Juan Dela Cruz’s OJT was to end on Oct 30, 2026; mark how it ended.' });
    expect(internsFinding(holding(owes, done), ctx)).toEqual({ priority: 5, text: 'Ana Reyes still owes the police clearance and MOA.' });
    expect(internsFinding(holding(intern({ status: 'Incomplete requirements' })), ctx)?.text).toBe('Juan Dela Cruz’s requirements are marked incomplete.');
    expect(internsFinding(holding(owes, { ...owes, no: 'IN-0004' }), ctx)?.text).toBe('2 interns still owe requirements.');
    expect(internsFinding(holding(done), ctx)).toEqual({ priority: 4, text: 'Fe Lim completed their OJT; their certificate is still to be issued.' });
    expect(internsFinding(holding(intern()), ctx)).toBeNull();
    expect(certificateDue(done)).toBe(true);
    expect(isActive(done)).toBe(false);
  });

  it('counts the interns on OJT, those owing requirements and the certificates to issue', () => {
    const s = holding(intern(), intern({ no: 'IN-0002', police: '', batch: 9 }), intern({ no: 'IN-0003', status: 'Completed' }));

    expect(internsFigure(s)).toEqual({ label: 'Interns on OJT', value: '2', caption: '1 owing requirements · 1 certificate to issue' });
    expect(internsLine(s)).toBe('3 interns in 2 batches; 2 on OJT now, 1 still owing requirements.');
  });
});
