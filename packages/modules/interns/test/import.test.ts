import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { refusalOf } from '@keystone/kit/testing';
import { emptyState, type Ctx } from '@keystone/core';
import { batchesText, dateCell, dateOfText, importInterns, importPlan, importSummary } from '../src/import';
import { datesToCheck, internsOf, newIntern, rosterOf, saveIntern, withInterns } from '../src/rules';
import { readWorkbook, type Workbook } from '../src/xlsx';

// Bringing HR's spreadsheet in, from test/fixtures/sample-interns.xlsx: made-up interns laid out as the real
// spreadsheet is, quirks and all.
// - BATCH 1: the first columns only. Ana completed (yellow); Ben terminated (pink), with nothing else filled in.
// - "BATCH  2 ": schedule, the four requirements and a serial number. Carla is "Complete/Volunteer", her start typed
//   "10/15/2025" and her medical "002/19/2026", her police clearance N/A. Dan is "inc", yellow. Ella is red with no
//   remark, as batch 5 marks a terminated intern.
// - BATCH 3: "ID Number", and the legend under the rows. Fe is green (COMPLETED) with no remark or certificate; Gio's
//   medical is "70-03-2026" and his police clearance not in; HANA GO's dates are all typed "Sept. 10 2026" and so on.
// - CLeaners: the weekly cleaning schedule, days across row 4. Notes: a tab that is neither.

/** Nov 2, 2026, 10:00 in Manila. */
const ctx: Ctx = { now: () => new Date(2026, 10, 2, 10, 0) };

const FILE = 'INTERNS SAMPLE.xlsx';

const sample = (): Workbook => readWorkbook(new Uint8Array(readFileSync(createRequire(import.meta.url).resolve('./fixtures/sample-interns.xlsx'))));

const imported = () => importInterns(emptyState(), importPlan(emptyState(), sample(), FILE), ctx);

const named = (name: string) => internsOf(imported().state).find((i) => i.name === name);

describe('reading the spreadsheet', () => {
  it('finds every intern in every batch tab, the cleaning schedule, and the tab that is neither', () => {
    const p = importPlan(emptyState(), sample(), FILE);

    expect(p.read.map((i) => `${i.batch} ${i.name}`)).toEqual(['1 Ana Reyes', '1 Ben Cruz', '2 Carla Diaz', '2 Dan Uy', '2 Ella Tan', '3 Fe Lim', '3 Gio Sy', '3 HANA GO']);
    expect(p.batches).toEqual([1, 2, 3]);
    expect(p.skippedSheets).toEqual(['Notes']);
    expect(p.rosterTaken).toBe(true);
    expect(importSummary(p)).toBe(
      'INTERNS SAMPLE.xlsx has 8 interns in batches 1 to 3 and the cleaning schedule. 8 interns are new and will be added, every cell of their row kept as written.'
      + ' The cleaning schedule will be brought in. Not brought in: Notes, which is neither a batch nor the cleaning schedule.',
    );
  });

  it('reads each status from the remarks, or else from the row’s colour against the legend', () => {
    const statuses = internsOf(imported().state).map((i) => [i.name, i.status, i.volunteer]);

    expect(statuses).toEqual([
      ['Ana Reyes', 'Completed', false], ['Ben Cruz', 'Terminated', false], ['Carla Diaz', 'Completed', true], ['Dan Uy', 'Incomplete requirements', false],
      ['Ella Tan', 'Terminated', false], ['Fe Lim', 'Completed', false], ['Gio Sy', 'Ongoing', false], ['HANA GO', 'Ongoing', false],
    ]);
  });

  it('reads dates however they were typed, and keeps one that is not a date as it was written', () => {
    expect(named('Ana Reyes')).toMatchObject({ start: '2025-06-02', end: '2025-07-18', hours: 240, proof: 'Certificate', remarks: 'Completed' });
    expect(named('Carla Diaz')).toMatchObject({
      start: '2025-10-15', end: '2026-02-18', schedule: 'Mon-Fri', hours: 500, endorsement: '2026-01-27', medical: '2026-02-19', police: 'N/A', moa: '2026-01-27',
      proof: 'Certificate', idNo: 'APG-2026-010', remarks: 'Complete/Volunteer',
    });
    expect(named('Gio Sy')).toMatchObject({ start: '2026-10-26', endorsement: '2026-10-27', medical: '70-03-2026', police: '', moa: '2026-10-27', idNo: 'APG-2026-015' });
    expect(named('HANA GO')).toMatchObject({ school: 'Psychology/HR', start: '2026-09-10', endorsement: '2026-09-10', medical: '2026-09-16', police: '2026-09-11', moa: '2026-09-14' });
    expect(datesToCheck(named('Gio Sy')!, ctx)).toEqual(['Medical certificate']);
  });

  it('keeps every cell of an imported row as it was written, with where it came from and its colour', () => {
    expect(named('Carla Diaz')?.source).toEqual({
      file: FILE, sheet: 'BATCH  2', row: 2, fill: 'FFF9CB9C',
      cells: [
        { column: 'NAME', text: 'Carla Diaz' }, { column: 'SCHOOL', text: 'Sample Tech' }, { column: 'Start date', text: '10/15/2025' },
        { column: 'End date', text: '2026-02-18' }, { column: 'Schedule', text: 'Mon-Fri' }, { column: 'Total Hours Rendered', text: '500' },
        { column: 'Endoresement Letter', text: '2026-01-27' }, { column: 'Med Cert', text: '002/19/2026' }, { column: 'Police Clearance', text: 'N/A' },
        { column: 'Moa', text: '2026-01-27' }, { column: 'Documents Issued (Proof of Completion)', text: 'certificate' },
        { column: 'Serial Number', text: 'APG-2026-010' }, { column: 'Notes/Remarks', text: 'Complete/Volunteer' },
      ],
    });
  });

  it('brings the cleaning schedule in, each name under its day', () => {
    expect(rosterOf(imported().state)).toEqual([
      { day: 'Monday', names: ['Gio Sy', 'Hana Go'] }, { day: 'Tuesday', names: ['Fe Lim'] }, { day: 'Wednesday', names: [] }, { day: 'Thursday', names: [] },
      { day: 'Friday', names: ['Dan Uy'] }, { day: 'Saturday', names: [] }, { day: 'Sunday', names: [] },
    ]);
  });
});

describe('importing', () => {
  it('numbers the interns IN-0001 and on, in the order of the tabs and rows, and logs the import', () => {
    const r = imported();

    expect(internsOf(r.state).map((i) => i.no)).toEqual(['IN-0001', 'IN-0002', 'IN-0003', 'IN-0004', 'IN-0005', 'IN-0006', 'IN-0007', 'IN-0008']);
    expect(r.message).toBe('Imported 8 interns in batches 1 to 3 and the cleaning schedule.');
    expect(r.state.log[0]).toMatchObject({ mod: 'INT', text: 'Imported 8 interns in batches 1 to 3 and the cleaning schedule from INTERNS SAMPLE.xlsx.' });
  });

  it('adds only what is new on a second import, and leaves what is in Keystone as it is', () => {
    const once = imported().state;
    // Ana's record was changed in Keystone after the first import: the second leaves the change alone.
    const ana = internsOf(once)[0];
    const edited = withInterns(once, internsOf(once).map((i) => (i.no === ana.no ? { ...i, remarks: 'Certificate released Jul 20' } : i)));
    const p = importPlan(edited, sample(), FILE);

    expect(p.added).toEqual([]);
    expect(p.kept).toHaveLength(8);
    expect(p.rosterTaken).toBe(false);
    expect(refusalOf(() => importInterns(edited, p, ctx))?.error).toBe('Everything in INTERNS SAMPLE.xlsx is already in Keystone.');
    expect(importSummary(p)).toContain('Every intern in it is already in Keystone. 8 interns already here stay as they are. The cleaning schedule in Keystone stays as it is.');

    // One added by hand first is kept, and the rest come in after it.
    const hand = saveIntern(emptyState(), { ...newIntern(emptyState(), ctx), name: 'Fe Lim', batch: '3' }, ctx).state;
    const after = importInterns(hand, importPlan(hand, sample(), FILE), ctx).state;

    expect(internsOf(after).map((i) => i.name)).toEqual(['Fe Lim', 'Ana Reyes', 'Ben Cruz', 'Carla Diaz', 'Dan Uy', 'Ella Tan', 'Gio Sy', 'HANA GO']);
    expect(internsOf(after)[0].source).toBeUndefined();
  });

  it('refuses a workbook with no batch in it', () => {
    const empty: Workbook = { from1904: false, sheets: [{ name: 'Sheet1', rows: [[{ text: 'Budget', num: null, fill: null }]] }] };

    expect(refusalOf(() => importPlan(emptyState(), empty, 'Budget.xlsx'))?.error).toBe('Budget.xlsx has no batch of interns in it: no tab has a NAME column.');
  });
});

describe('dates as the sheet types them', () => {
  it('reads month-first slashes, a zero too many, month names with or without a stop, and ISO', () => {
    expect(dateOfText('10/15/2025')).toBe('2025-10-15');
    expect(dateOfText(' 10/22/2025')).toBe('2025-10-22');
    expect(dateOfText('002/19/2026')).toBe('2026-02-19');
    expect(dateOfText('Sept. 9 2026 ')).toBe('2026-09-09');
    expect(dateOfText('Sept.10 2026')).toBe('2026-09-10');
    expect(dateOfText('September 29, 2026')).toBe('2026-09-29');
    expect(dateOfText('2026-11-17')).toBe('2026-11-17');
  });

  it('reads nothing that is not a real day', () => {
    for (const t of ['70-03-2026', '13/01/2026', '2/30/2026', 'Smarch 3 2026', 'N/A', '', 'soon']) expect(dateOfText(t)).toBeNull();
  });

  it('keeps N/A, and shows a date before 2000 as it reads rather than as a date', () => {
    expect(dateCell({ text: 'n/a', num: null, fill: null }, false)).toBe('N/A');
    // 310 days is Nov 5, 1900: an end date typed without its year.
    expect(dateCell({ text: '310', num: 310, fill: null }, false)).toBe('Nov 5, 1900');
    expect(dateCell({ text: '70-03-2026', num: null, fill: null }, false)).toBe('70-03-2026');
  });

  it('names the batches as a run, or one by one', () => {
    expect(batchesText([2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe('batches 2 to 10');
    expect(batchesText([4])).toBe('batch 4');
    expect(batchesText([9, 2, 5])).toBe('batches 2, 5 and 9');
    expect(batchesText([])).toBe('no batch');
  });
});
