import { describe, expect, it } from 'vitest';
import { arrivalNotices, changedElsewhere, emptyState, logged, newEntries, type Ctx, type LogEntry, type Member } from '../src';

// Live updates (docs/adr/0047): which Activity Log lines arrived from someone else's save, and what the person is told.

const ana: Member = { uid: 'hr-1', name: 'Ana Cruz', role: 'staff' };
const mark: Member = { uid: 'ceo-1', name: 'Mark Reyes', role: 'owner' };
const at = (who?: Member): Ctx => ({ now: () => new Date(2026, 10, 2, 10, 0), ...(who && { who }) });

const line = (text: string, by?: string, when = '2026-11-02 10:00'): LogEntry => ({ when, mod: 'CV', text, ...(by && { by }) });

describe('the Activity Log names who saved each line', () => {
  it('names the member signed in, and nobody on a computer\'s own records', () => {
    expect(logged(emptyState(), 'CV', '888-012 saved.', at(ana)).log[0]).toEqual({ when: '2026-11-02 10:00', mod: 'CV', text: '888-012 saved.', by: 'Ana Cruz' });
    expect(logged(emptyState(), 'CV', '888-012 saved.', at()).log[0]).toEqual({ when: '2026-11-02 10:00', mod: 'CV', text: '888-012 saved.' });
  });
});

describe('what arrived', () => {
  const older = [line('CV-2026-0141 saved.', 'Mark Reyes', '2026-11-01 09:00')];

  it('is each line the other side has and this one does not, oldest first', () => {
    // The log is newest first.
    const after = [line('888-013 saved.', 'Ana Cruz', '2026-11-02 10:05'), line('888-012 saved.', 'Ana Cruz'), ...older];

    expect(newEntries(older, after).map((e) => e.text)).toEqual(['888-012 saved.', '888-013 saved.']);
  });

  it('is nothing when both have the same lines, and never a line this side has, however often it is repeated', () => {
    const twice = [line('888-012 checked.'), line('888-012 checked.'), ...older];

    expect(newEntries(older, older)).toEqual([]);
    expect(newEntries(twice, twice)).toEqual([]);
    // One of two lines alike is new.
    expect(newEntries([line('888-012 checked.'), ...older], twice)).toEqual([line('888-012 checked.')]);
    // A line this side has that the other does not (saved here, not there yet) is not news from there.
    expect(newEntries(twice, older)).toEqual([]);
  });

  it('tells a line that names a different saver apart', () => {
    expect(newEntries([line('888-012 saved.', 'Ana Cruz')], [line('888-012 saved.', 'Mark Reyes')])).toEqual([line('888-012 saved.', 'Mark Reyes')]);
  });
});

describe('what the person is told', () => {
  it('is each line, with who saved it', () => {
    expect(arrivalNotices([line('888-012 for MERALCO routed for approval (₱980.00).', 'Ana Cruz')], mark))
      .toEqual(['From Ana Cruz: 888-012 for MERALCO routed for approval (₱980.00).']);
  });

  it('says another computer for a line that names nobody, and you for one of your own made elsewhere', () => {
    expect(arrivalNotices([line('888-012 saved.')], mark)).toEqual(['From another computer: 888-012 saved.']);
    expect(arrivalNotices([line('888-012 saved.', 'Mark Reyes')], mark)).toEqual(['From you, on another computer: 888-012 saved.']);
  });

  it('is one sentence for more than three at once, saying how many and from whom', () => {
    const four = ['1', '2', '3', '4'].map((n) => line(`888-01${n} saved.`, 'Ana Cruz'));

    expect(arrivalNotices(four.slice(0, 3), mark)).toHaveLength(3);
    expect(arrivalNotices(four, mark)).toEqual(['4 changes arrived from Ana Cruz. The Activity Log lists them.']);
    expect(arrivalNotices([...four, line('BS saved.', 'Paolo Santos')], mark)).toEqual(['5 changes arrived from 2 people. The Activity Log lists them.']);
  });

  it('is nothing when nothing arrived', () => {
    expect(arrivalNotices([], mark)).toEqual([]);
  });

  it('says on a form that someone else changed what it holds, and what saving does', () => {
    expect(changedElsewhere('888-012')).toMatch(/^Someone else saved a change to 888-012 while it was open here\. .*saving it replaces theirs/);
  });
});
