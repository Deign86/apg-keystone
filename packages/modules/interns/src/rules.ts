import {
  count, DASH, isISODate, isJsonObject, jsonNumber, jsonObjects, jsonText, KeystoneError, logged, moduleData, nextNumber, shortDate, thisYear, today,
  withModuleData, type Change, type Ctx, type Editing, type Figure, type Finding, type JsonObject, type TerminalState, type Tone,
} from '@keystone/core';

// Interns (docs/adr/0056, 0057): HR's register of OJT interns, batch by batch, as Ma'am Jean kept it in the spreadsheet
// "INTERNS ALPHA PREMIER GROUP": who they are and their school, when they start and end, their schedule and hours, the
// four requirements they hand in, the ID number they are given, the proof of completion issued, and how their OJT
// ended. And the weekly cleaning schedule the spreadsheet kept beside them. Kept under state.ext.interns. The batches
// in the spreadsheet were brought over once, each record keeping the row it came from (`source`); HR keeps them here
// from now on.

/** This module's id, written once: its route, its ModuleDef.id, its key under state.ext and its draft key. */
export const ID = 'interns';

/** The tag its activity-log lines carry. */
export const TAG = 'INT';

/** Where an intern's OJT stands. The spreadsheet's legend: completed, incomplete requirements, terminated. */
export const STATUSES = ['Ongoing', 'Completed', 'Incomplete requirements', 'Terminated'] as const;

export type Status = (typeof STATUSES)[number];

export const STATUS_TONE: Record<Status, Tone> = { Ongoing: 'neutral', Completed: 'good', 'Incomplete requirements': 'warn', Terminated: 'bad' };

/** The papers an intern hands in, in the spreadsheet's order. */
export const REQUIREMENTS = [
  { key: 'endorsement', label: 'Endorsement letter', short: 'endorsement letter' },
  { key: 'medical', label: 'Medical certificate', short: 'medical certificate' },
  { key: 'police', label: 'Police clearance', short: 'police clearance' },
  { key: 'moa', label: 'MOA', short: 'MOA' },
] as const;

export type RequirementKey = (typeof REQUIREMENTS)[number]['key'];

/** A requirement that does not apply to this intern. */
export const NOT_NEEDED = 'N/A';

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** One cell of the spreadsheet row an intern was brought in from, as it was written. */
export interface SourceCell {
  column: string;
  text: string;
}

/** Where a record brought over from the spreadsheet came from: the file, the tab, the row, its colour and every cell as written. */
export interface Source {
  file: string;
  sheet: string;
  /** The row's number as the spreadsheet shows it (from 1). */
  row: number;
  /** The row's fill, as ARGB ("FFF9CB9C"), or "" when it had none. */
  fill: string;
  cells: SourceCell[];
}

export interface Intern {
  /** Keystone's own key for the record: "IN-0001". The intern's ID number is `idNo`. */
  no: string;
  name: string;
  school: string;
  /** The batch they started with: 2 for the spreadsheet's "BATCH 2". */
  batch: number;
  /** ISO dates; '' when not set; or a date as the spreadsheet wrote it, when it could not be read as one. */
  start: string;
  end: string;
  /** Their days: "Mon-Fri". */
  schedule: string;
  /** The OJT hours their school requires, and on completion the hours rendered. */
  hours: number;
  /** The ID number they were given: "APG-2026-050". */
  idNo: string;
  /** Each requirement: the ISO date it was handed in, N/A when it does not apply, '' while it is not in, or as written. */
  endorsement: string;
  medical: string;
  police: string;
  moa: string;
  /** The proof of completion issued ("Certificate"); '' while none is. */
  proof: string;
  status: Status;
  /** Served as a volunteer rather than for school credit. */
  volunteer: boolean;
  remarks: string;
  /** Brought over from HR's spreadsheet: where from, and what the row said. Absent for one added in Keystone. */
  source?: Source;
}

/** The weekly cleaning schedule: who cleans on each day. */
export interface RosterDay {
  day: Weekday;
  names: string[];
}

interface InternsData { interns: Intern[]; roster: RosterDay[] }

const statusOf = (v: string): Status => STATUSES.find((x) => x === v) ?? 'Ongoing';

const sourceOf = (v: JsonObject | undefined): Source | undefined => (v ? {
  file: jsonText(v.file), sheet: jsonText(v.sheet), row: jsonNumber(v.row), fill: jsonText(v.fill),
  cells: jsonObjects(v.cells).map((c) => ({ column: jsonText(c.column), text: jsonText(c.text) })),
} : undefined);

function internOf(r: JsonObject): Intern {
  const source = sourceOf(isJsonObject(r.source) ? r.source : undefined);

  return {
    no: jsonText(r.no), name: jsonText(r.name), school: jsonText(r.school), batch: jsonNumber(r.batch), start: jsonText(r.start), end: jsonText(r.end),
    schedule: jsonText(r.schedule), hours: jsonNumber(r.hours), idNo: jsonText(r.idNo), endorsement: jsonText(r.endorsement), medical: jsonText(r.medical),
    police: jsonText(r.police), moa: jsonText(r.moa), proof: jsonText(r.proof), status: statusOf(jsonText(r.status)), volunteer: r.volunteer === true,
    remarks: jsonText(r.remarks), ...(source && { source }),
  };
}

function dataOf(s: TerminalState): InternsData {
  const raw = moduleData(s, ID);

  if (!isJsonObject(raw)) return { interns: [], roster: [] };

  const roster = jsonObjects(raw.roster).flatMap((d) => {
    const day = WEEKDAYS.find((w) => w === jsonText(d.day));

    return day ? [{ day, names: Array.isArray(d.names) ? d.names.map(jsonText).filter(Boolean) : [] }] : [];
  });

  return { interns: jsonObjects(raw.interns).map(internOf).filter((i) => i.no), roster };
}

/** Every intern, in the order they were saved. None saved: none (docs/adr/0018). */
export const internsOf = (s: TerminalState): Intern[] => dataOf(s).interns;

/** The cleaning schedule, every day of the week in order, each with its names (none for a day nobody cleans). */
export function rosterOf(s: TerminalState): RosterDay[] {
  const kept = dataOf(s).roster;

  return WEEKDAYS.map((day) => ({ day, names: [...(kept.find((d) => d.day === day)?.names ?? [])] }));
}

/** A record as it is kept: a copy, so nothing saved shares an object with what a screen still holds. */
function copyOf(i: Intern) {
  const { source, ...rest } = i;

  return source ? { ...rest, source: { ...source, cells: source.cells.map((c) => ({ ...c })) } } : { ...rest };
}

/** The state with these interns and this roster kept under state.ext.interns. */
export function withInterns(s: TerminalState, interns: Intern[], roster: RosterDay[] = rosterOf(s)): TerminalState {
  const days = roster.flatMap((d) => (d.names.length ? [{ day: d.day, names: [...d.names] }] : []));

  return withModuleData(s, ID, { interns: interns.map(copyOf), roster: days } satisfies InternsData);
}

/** Keystone's next key for a record: "IN-0001" and on. */
export const nextInternNo = (s: TerminalState) => nextNumber(internsOf(s).map((i) => i.no), 'IN-');

/**
 * The next ID number to give an intern: this year's prefix and the number after the highest given so far, whatever
 * the year or the way it was written ("APG - 0888 012", "APG 2025 040", "APG-2026-090" → "APG-2026-091").
 */
export const nextIdNo = (s: TerminalState, ctx: Ctx) => nextNumber(internsOf(s).map((i) => i.idNo.trim()), `APG-${thisYear(ctx)}-`, 3);

// ---------- reading a record ----------

/** On their OJT now. */
export const isActive = (i: Pick<Intern, 'status'>) => i.status === 'Ongoing';

/** The requirements not handed in yet. */
export const owed = (i: Intern) => REQUIREMENTS.filter((r) => !i[r.key].trim());

/** Still to hand in requirements: on OJT with some not in, or marked as done but with incomplete requirements. */
export const owing = (i: Intern) => (isActive(i) && owed(i).length > 0) || i.status === 'Incomplete requirements';

/** A date field as a person reads it: "Oct 16, 2026", a date as the sheet wrote it, or a dash. */
export const dateText = (v: string) => (isISODate(v) ? shortDate(v) : v.trim() || DASH);

/**
 * A requirement as a person reads it: the date handed in, N/A, what the sheet wrote, or, when there is nothing, "Not
 * yet" while it is still owed and a dash once the OJT is over (the first batches' sheets never asked for them).
 */
export function requirementText(v: string, status: Status): string {
  if (v === NOT_NEEDED) return NOT_NEEDED;

  if (v.trim()) return dateText(v);

  return status === 'Ongoing' || status === 'Incomplete requirements' ? 'Not yet' : DASH;
}

/** Whether a date field holds something that is not a date: what the spreadsheet wrote when it could not be read. */
export const unreadDate = (v: string) => !!v.trim() && v !== NOT_NEEDED && !isISODate(v);

/** The dates on a record to check: written in a way that is not a date, or later than today when they record the past. */
export function datesToCheck(i: Intern, ctx: Ctx): string[] {
  const on = today(ctx);

  const fields = [
    { label: 'Start date', v: i.start, past: false }, { label: 'End date', v: i.end, past: false },
    ...REQUIREMENTS.map((r) => ({ label: r.label, v: i[r.key], past: true })),
  ];

  return fields.flatMap((f) => (unreadDate(f.v) || (f.past && isISODate(f.v) && f.v > on) ? [f.label] : []));
}

/** "Mon-Fri · 486 hours". */
export const hoursText = (i: Pick<Intern, 'hours'>) => (i.hours ? `${i.hours.toLocaleString('en-PH')} hours` : DASH);

/** The batches there are, latest first. */
export const batchesOf = (s: TerminalState) => [...new Set(internsOf(s).map((i) => i.batch))].sort((a, b) => b - a);

export const batchLabel = (n: number) => (n > 0 ? `Batch ${n}` : 'No batch');

// ---------- the form ----------

export type InternDraft = Editing & Omit<Intern, 'no' | 'batch' | 'hours' | 'source'> & { batch: string; hours: string };

/** A new intern: in the latest batch, starting today, on the last one's schedule, with the next ID number. */
export function newIntern(s: TerminalState, ctx: Ctx): InternDraft {
  const all = internsOf(s);
  const last = all[all.length - 1];

  return {
    name: '', school: '', batch: String(batchesOf(s)[0] ?? 1), start: today(ctx), end: '', schedule: last?.schedule.trim() || 'Mon-Fri', hours: '',
    idNo: nextIdNo(s, ctx), endorsement: '', medical: '', police: '', moa: '', proof: '', status: 'Ongoing', volunteer: false, remarks: '',
  };
}

export function internDraftOf(i: Intern): InternDraft {
  const { no, source: _source, ...rest } = i;

  return { ...rest, editing: no, batch: String(i.batch || ''), hours: i.hours ? String(i.hours) : '' };
}

const nameKey = (name: string) => name.trim().replace(/\s+/g, ' ').replace(/[.,]+$/, '').toLowerCase();

/**
 * Saves an intern, or the changes to one. It needs a name and a batch; the hours must be a number, the dates dates (or
 * what the spreadsheet wrote, left as it was), the end no earlier than the start, and the ID number not someone else's.
 */
export function saveIntern(s: TerminalState, d: InternDraft, ctx: Ctx): Change<Intern> {
  const all = internsOf(s);
  const original = d.editing ? all.find((i) => i.no === d.editing) : undefined;

  if (d.editing && !original) throw new KeystoneError(`${d.editing} is no longer saved.`);
  const name = d.name.trim().replace(/\s+/g, ' ');

  if (!name) throw new KeystoneError('Enter the intern’s name.', 'name');
  const batch = Number(d.batch.trim());

  if (!Number.isInteger(batch) || batch < 1) throw new KeystoneError('Enter the batch as a number, like 10.', 'batch');
  const hours = d.hours.trim() ? Number(d.hours.replace(/,/g, '').trim()) : 0;

  if (!Number.isFinite(hours) || hours < 0) throw new KeystoneError('Enter the OJT hours as a number, like 486.', 'hours');

  // A date is a date, or what the spreadsheet wrote, kept until someone types a date over it.
  const kept = (key: 'start' | 'end' | RequirementKey) => !!original && d[key] === original[key];
  const label = { start: 'start date', end: 'end date', endorsement: 'endorsement letter’s date', medical: 'medical certificate’s date', police: 'police clearance’s date', moa: 'MOA’s date' };

  for (const key of ['start', 'end', ...REQUIREMENTS.map((r) => r.key)] as const) {
    const v = d[key].trim();

    if (v && v !== NOT_NEEDED && !isISODate(v) && !kept(key)) throw new KeystoneError(`Enter the ${label[key]} as a date.`, key);
  }

  if (isISODate(d.start) && isISODate(d.end) && d.end < d.start) throw new KeystoneError('The end date is before the start date.', 'end');
  const idNo = d.idNo.trim();
  const holder = idNo ? all.find((i) => i.no !== d.editing && i.idNo.trim().toUpperCase() === idNo.toUpperCase()) : undefined;

  if (holder) throw new KeystoneError(`${idNo} is ${holder.name}’s ID number. The next free one is ${nextIdNo(s, ctx)}.`, 'idNo');

  const record: Intern = {
    no: original?.no ?? nextInternNo(s), name, school: d.school.trim(), batch, start: d.start.trim(), end: d.end.trim(), schedule: d.schedule.trim(), hours, idNo,
    endorsement: d.endorsement.trim(), medical: d.medical.trim(), police: d.police.trim(), moa: d.moa.trim(), proof: d.proof.trim(), status: d.status,
    volunteer: d.volunteer, remarks: d.remarks.trim(), ...(original?.source && { source: original.source }),
  };

  const who = `${record.name} (${batchLabel(batch)})`;

  if (original) {
    const changed = original.status !== record.status ? `, now ${record.status.toLowerCase()}` : '';

    return {
      state: logged(withInterns(s, all.map((i) => (i.no === original.no ? record : i))), TAG, `Intern ${who} updated${changed}.`, ctx),
      record, message: `${record.name} updated.`,
    };
  }

  return {
    state: logged(withInterns(s, [...all, record]), TAG, `Intern ${who} added.`, ctx),
    record, message: `${record.name} added to ${batchLabel(batch)}.`,
  };
}

/** Removes an intern from the register. */
export function removeIntern(s: TerminalState, no: string, ctx: Ctx): Change<Intern> {
  const all = internsOf(s);
  const i = all.find((x) => x.no === no);

  if (!i) throw new KeystoneError(`${no} is not saved.`);

  return {
    state: logged(withInterns(s, all.filter((x) => x.no !== no)), TAG, `Intern ${i.name} (${batchLabel(i.batch)}) removed.`, ctx),
    record: i, message: `${i.name} removed.`,
  };
}

/** Marks an intern's requirement handed in today. */
export function receiveRequirement(s: TerminalState, no: string, key: RequirementKey, ctx: Ctx): Change<Intern> {
  const all = internsOf(s);
  const i = all.find((x) => x.no === no);
  const req = REQUIREMENTS.find((r) => r.key === key);

  if (!i || !req) throw new KeystoneError(`${no} is not saved.`);
  const record = { ...i, [key]: today(ctx) };

  return {
    state: logged(withInterns(s, all.map((x) => (x.no === no ? record : x))), TAG, `${i.name} handed in the ${req.short}.`, ctx),
    record, message: `${i.name}’s ${req.short} marked handed in today.`,
  };
}

// ---------- the cleaning schedule ----------

/** Puts someone on a day of the cleaning schedule. */
export function addToRoster(s: TerminalState, day: Weekday, name: string, ctx: Ctx): Change<RosterDay> {
  const who = name.trim().replace(/\s+/g, ' ');

  if (!who) throw new KeystoneError(`Enter who cleans on ${day}.`, `roster.${day}`);
  const roster = rosterOf(s);
  const on = roster.find((d) => d.day === day) ?? { day, names: [] };

  if (on.names.some((n) => nameKey(n) === nameKey(who))) throw new KeystoneError(`${who} already cleans on ${day}.`, `roster.${day}`);
  const record = { day, names: [...on.names, who] };

  return {
    state: logged(withInterns(s, internsOf(s), roster.map((d) => (d.day === day ? record : d))), TAG, `${who} put on the cleaning schedule for ${day}.`, ctx),
    record, message: `${who} cleans on ${day}.`,
  };
}

/** Takes someone off a day of the cleaning schedule. */
export function removeFromRoster(s: TerminalState, day: Weekday, name: string, ctx: Ctx): Change<RosterDay> {
  const roster = rosterOf(s);
  const on = roster.find((d) => d.day === day);

  if (!on?.names.includes(name)) throw new KeystoneError(`${name} is not on ${day}.`);
  const record = { day, names: on.names.filter((n) => n !== name) };

  return {
    state: logged(withInterns(s, internsOf(s), roster.map((d) => (d.day === day ? record : d))), TAG, `${name} taken off the cleaning schedule for ${day}.`, ctx),
    record, message: `${name} no longer cleans on ${day}.`,
  };
}

/** The names the cleaning schedule offers: the interns on OJT, as their names are written. */
export const rosterSuggestions = (s: TerminalState) => [...new Set(internsOf(s).filter(isActive).map((i) => i.name))];

// ---------- what it tells Home and Overview ----------

const ended = (i: Intern, ctx: Ctx) => isActive(i) && isISODate(i.end) && i.end < today(ctx);

/** Completed, with no proof of completion issued yet. */
export const certificateDue = (i: Intern) => i.status === 'Completed' && !i.proof.trim();

/** The sentence under the screen's title. */
export function internsLine(s: TerminalState): string {
  const all = internsOf(s);

  if (!all.length) return 'No interns yet. Add each one as their OJT starts: their school, dates, requirements and ID number.';
  const active = all.filter(isActive).length;
  const papers = all.filter(owing).length;
  const batches = batchesOf(s).filter((b) => b > 0);

  return `${count(all.length, 'intern')} in ${count(batches.length, 'batch', 'batches')}; ${active} on OJT now${papers ? `, ${papers} still owing requirements` : ''}.`;
}

/** "the police clearance and MOA". */
const papersText = (i: Intern) => {
  const names = owed(i).map((r) => r.short);

  return names.length > 1 ? `the ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : `the ${names[0]}`;
};

/** The one thing most worth saying about the interns, if anything. */
export function internsFinding(s: TerminalState, ctx: Ctx): Finding | null {
  const all = internsOf(s);
  const past = all.filter((i) => ended(i, ctx));

  if (past.length === 1) return { priority: 6, text: `${past[0].name}’s OJT was to end on ${shortDate(past[0].end)}; mark how it ended.` };

  if (past.length) return { priority: 6, text: `${count(past.length, 'intern')} are past their end date and still on OJT; mark how each ended.` };
  const behind = all.filter(owing);
  const one = behind[0];

  if (behind.length === 1) return { priority: 5, text: owed(one).length ? `${one.name} still owes ${papersText(one)}.` : `${one.name}’s requirements are marked incomplete.` };

  if (behind.length) return { priority: 5, text: `${count(behind.length, 'intern')} still owe requirements.` };
  const due = all.filter(certificateDue);

  if (due.length === 1) return { priority: 4, text: `${due[0].name} completed their OJT; their certificate is still to be issued.` };

  if (due.length) return { priority: 4, text: `${count(due.length, 'intern')} completed their OJT with no certificate issued yet.` };

  return null;
}

/** Overview's cell: the interns on OJT. */
export function internsFigure(s: TerminalState): Figure {
  const all = internsOf(s);

  return {
    label: 'Interns on OJT', value: String(all.filter(isActive).length),
    caption: `${all.filter(owing).length} owing requirements · ${count(all.filter(certificateDue).length, 'certificate')} to issue`,
  };
}
