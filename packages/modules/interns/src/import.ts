import { count, KeystoneError, logged, nextNumber, shortDate, type Change, type Ctx, type TerminalState } from '@keystone/core';
import {
  internsOf, NOT_NEEDED, rosterOf, sameIntern, TAG, WEEKDAYS, withInterns, type Intern, type RequirementKey, type RosterDay, type SourceCell, type Status,
} from './rules';
import { dateOfSerial, type Cell, type Workbook, type Worksheet } from './xlsx';

// Bringing HR's spreadsheet into Keystone (docs/adr/0056), so nothing in it is left behind. Each "BATCH n" tab is a
// batch: a header row naming the columns, then one row per intern. The columns grew over time (Schedule and a serial
// number from batch 4, the four requirements from batch 5, "ID Number" for "Serial Number" from batch 9), so each is
// found by its header, not its place. A row's status is its Notes/Remarks, or else its colour, read against the
// legend under the rows (COMPLETED, INCOMPLETE, TERMINATED). A tab with the days of the week across it is the
// cleaning schedule. Every cell of every row is kept on the record as it was written, with the row's colour.

/** The fields a column can fill, by its header with everything but letters left out and in small letters. */
type Field = 'name' | 'school' | 'start' | 'end' | 'schedule' | 'hours' | 'proof' | 'idNo' | 'remarks' | RequirementKey;

function fieldOf(header: string): Field | null {
  const h = header.toLowerCase().replace(/[^a-z]/g, '');

  if (h === 'name' || h === 'fullname' || h === 'nameofintern') return 'name';

  if (h.startsWith('school') || h === 'university') return 'school';

  if (h.startsWith('start') || h === 'datestarted') return 'start';

  if (h.startsWith('enddate') || h === 'end' || h === 'dateended') return 'end';

  if (h.startsWith('schedule')) return 'schedule';

  if (h.includes('hours')) return 'hours';

  // "Endoresement Letter", as the sheet spells it, and "Endorsement Letter".
  if (h.startsWith('endo')) return 'endorsement';

  if (h.startsWith('med')) return 'medical';

  if (h.includes('police')) return 'police';

  if (h === 'moa' || h.startsWith('memorandum')) return 'moa';

  if (h.includes('proofofcompletion') || h.startsWith('documentsissued')) return 'proof';

  if (h.startsWith('serial') || h === 'idnumber' || h === 'idno') return 'idNo';

  if (h.includes('remarks') || h.startsWith('notes')) return 'remarks';

  return null;
}

const DATE_FIELDS: readonly Field[] = ['start', 'end', 'endorsement', 'medical', 'police', 'moa'];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The ISO date of a day, or null when there is no such day (Feb 30, month 13). */
function iso(y: number, m: number, d: number): string | null {
  const day = new Date(Date.UTC(y, m - 1, d));

  return day.getUTCFullYear() === y && day.getUTCMonth() === m - 1 && day.getUTCDate() === d ? day.toISOString().slice(0, 10) : null;
}

/**
 * A date typed as text, as the sheet has them: "10/15/2025" (month first), "002/19/2026" (a zero too many),
 * "Sept. 9 2026", "Sept.10 2026", "September 9, 2026", "2026-09-09". Null when it is not one of these.
 */
export function dateOfText(text: string): string | null {
  const t = text.trim();
  const slashed = /^0*(\d{1,2})\/0*(\d{1,2})\/(\d{4})$/.exec(t);

  if (slashed) return iso(Number(slashed[3]), Number(slashed[1]), Number(slashed[2]));
  const named = /^([a-z]+)\.?\s*(\d{1,2}),?\s+(\d{4})$/i.exec(t);
  const month = named ? MONTHS.indexOf(named[1].slice(0, 3).toLowerCase()) : -1;

  if (named && month >= 0) return iso(Number(named[3]), month + 1, Number(named[2]));
  const dashed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);

  return dashed ? iso(Number(dashed[1]), Number(dashed[2]), Number(dashed[3])) : null;
}

/**
 * A date column's cell as Keystone keeps it: an ISO date when it reads as one; N/A; or, when it does not read as a
 * date (or reads as one before 2000, which only a slip of the keyboard gives an intern), what the sheet showed.
 */
export function dateCell(c: Cell, from1904: boolean): string {
  const text = c.text.trim();

  if (/^n\/?a$/i.test(text)) return NOT_NEEDED;
  const read = c.num !== null ? dateOfSerial(c.num, from1904) : dateOfText(text);

  if (read && read >= '2000-01-01') return read;

  return read ? shortDate(read) : text;
}

/** What a cell showed, for the record of the row as written: dates as dates, numbers as numbers, text as typed. */
const shown = (c: Cell, field: Field | null, from1904: boolean) => (field && DATE_FIELDS.includes(field) && c.num !== null ? dateCell(c, from1904) : c.text.trim());

const LEGEND: { test: RegExp; status: Status }[] = [
  { test: /^completed?$/i, status: 'Completed' },
  { test: /^incomplete( requirements)?$/i, status: 'Incomplete requirements' },
  { test: /^terminated$/i, status: 'Terminated' },
];

/** The reds and the yellow the sheets use without a legend of their own (batch 5 marks a terminated row red). */
const COLOURS = new Map<string, Status>([
  ['FFFF0000', 'Terminated'], ['FFE06666', 'Terminated'], ['FFEA9999', 'Terminated'], ['FFCC0000', 'Terminated'], ['FFFFFF00', 'Incomplete requirements'],
]);

/** How a row's Notes/Remarks words its status: "completed", " Completed", "Complete/Volunteer", "terminated", "inc". */
function statusOfRemarks(remarks: string): { status: Status; volunteer: boolean } | null {
  const r = remarks.trim().toLowerCase();

  if (!r) return null;

  if (r.startsWith('complete')) return { status: 'Completed', volunteer: r.includes('volunteer') };

  if (r.startsWith('terminat')) return { status: 'Terminated', volunteer: false };

  if (r === 'inc' || r.startsWith('inc ') || r.startsWith('incomplete')) return { status: 'Incomplete requirements', volunteer: false };

  return null;
}

const blank = (row: Cell[] | undefined) => !row || row.every((c) => !c.text.trim());

/** The batch a tab's name gives: "BATCH  6 " → 6; 0 when it names none. */
const batchOf = (sheet: string) => Number(/batch\s*(\d+)/i.exec(sheet)?.[1] ?? 0);

/** An intern read from the sheet, before Keystone gives it its key. */
export type ReadIntern = Omit<Intern, 'no'>;

/** One row read: the intern, and what was written there that did not fit a field (kept in the record's source). */
function internOfRow(row: Cell[], headers: { text: string; field: Field | null }[], sheet: Worksheet, r: number, file: string, from1904: boolean, legend: Map<string, Status>): ReadIntern {
  const at = (field: Field) => {
    const c = headers.findIndex((h) => h.field === field);

    return c >= 0 ? row[c] ?? { text: '', num: null, fill: null } : { text: '', num: null, fill: null };
  };

  const text = (field: Field) => at(field).text.trim().replace(/\s+/g, ' ');
  const date = (field: Field) => dateCell(at(field), from1904);
  const cells: SourceCell[] = row.flatMap((c, i) => (c.text.trim() ? [{ column: headers[i]?.text || `Column ${i + 1}`, text: shown(c, headers[i]?.field ?? null, from1904) }] : []));
  const fill = row[0]?.fill ?? '';
  const remarks = text('remarks');
  const fromColour = legend.get(fill) ?? COLOURS.get(fill);
  const said = statusOfRemarks(remarks) ?? (fromColour ? { status: fromColour, volunteer: false } : { status: 'Ongoing' as const, volunteer: false });
  const hoursCell = at('hours');
  const hours = hoursCell.num ?? Number(hoursCell.text.replace(/[^\d.]/g, ''));
  const proof = text('proof');

  return {
    name: text('name'), school: text('school'), batch: batchOf(sheet.name), start: date('start'), end: date('end'), schedule: text('schedule'),
    hours: Number.isFinite(hours) ? hours : 0, idNo: text('idNo'), endorsement: date('endorsement'), medical: date('medical'), police: date('police'),
    moa: date('moa'), proof: proof && proof[0].toUpperCase() + proof.slice(1).toLowerCase(), status: said.status, volunteer: said.volunteer, remarks,
    source: { file, sheet: sheet.name.trim(), row: r + 1, fill, cells },
  };
}

/** Reads one batch tab: its interns, or null when the tab has no row of headers with a NAME column. */
function batchSheet(sheet: Worksheet, file: string, from1904: boolean): ReadIntern[] | null {
  const top = sheet.rows.findIndex((row) => row?.some((c) => fieldOf(c.text) === 'name'));

  if (top < 0) return null;
  const headers = sheet.rows[top].map((c) => ({ text: c.text.trim().replace(/\s+/g, ' '), field: fieldOf(c.text) }));
  const nameAt = headers.findIndex((h) => h.field === 'name');
  const rows = sheet.rows.map((row, r) => ({ row, r })).slice(top + 1).filter(({ row }) => !blank(row));
  // The legend: a row with only a status word in it, filled with that status's colour.
  const isLegend = (row: Cell[]) => row.filter((c) => c.text.trim()).length === 1 && LEGEND.some((l) => l.test.test(row[nameAt]?.text.trim() ?? ''));

  const legend = new Map(rows.flatMap(({ row }) => {
    const c = row[nameAt];
    const status = isLegend(row) && c?.fill ? LEGEND.find((l) => l.test.test(c.text.trim()))?.status : undefined;

    return c?.fill && status ? [[c.fill, status] as const] : [];
  }));

  return rows.filter(({ row }) => !isLegend(row) && row[nameAt]?.text.trim()).map(({ row, r }) => internOfRow(row, headers, sheet, r, file, from1904, legend));
}

/** Reads the cleaning schedule: a tab with the days of the week across a row, and the names under each day. */
function rosterSheet(sheet: Worksheet): RosterDay[] | null {
  const dayOf = (c: Cell | undefined) => WEEKDAYS.find((d) => d.toLowerCase() === c?.text.trim().toLowerCase());
  const top = sheet.rows.findIndex((row) => (row ?? []).filter((c) => dayOf(c)).length >= 3);

  if (top < 0) return null;

  const days = sheet.rows[top].flatMap((c, col) => {
    const day = dayOf(c);

    return day ? [{ day, col }] : [];
  });

  return WEEKDAYS.map((day) => {
    const col = days.find((d) => d.day === day)?.col;

    const names = col === undefined ? [] : sheet.rows.slice(top + 1).flatMap((row) => {
      const name = row?.[col]?.text.trim().replace(/\s+/g, ' ');

      return name ? [name] : [];
    });

    return { day, names };
  });
}

/** What a workbook holds for Keystone, before anything is saved. */
export interface ImportPlan {
  file: string;
  /** Every intern row read, in the order of the tabs and rows. */
  read: ReadIntern[];
  /** Those not in Keystone yet, which an import adds. */
  added: ReadIntern[];
  /** Those already in Keystone (the same name in the same batch), which stay as they are. */
  kept: ReadIntern[];
  /** The cleaning schedule read, if the workbook has one. */
  roster: RosterDay[] | null;
  /** Whether that schedule replaces the one in Keystone: only when Keystone has none yet. */
  rosterTaken: boolean;
  /** The batch tabs read, in order. */
  batches: number[];
  /** Tabs with something in them that are neither a batch nor the cleaning schedule, which are not brought in. */
  skippedSheets: string[];
}

/** Reads a workbook against what Keystone holds, saying what an import would add and what it would leave. */
export function importPlan(s: TerminalState, book: Workbook, file: string): ImportPlan {
  const have = internsOf(s);
  const read: ReadIntern[] = [];
  const batches: number[] = [];
  const skippedSheets: string[] = [];
  let roster: RosterDay[] | null = null;

  for (const sheet of book.sheets) {
    const interns = batchSheet(sheet, file, book.from1904);

    if (interns) {
      read.push(...interns);
      batches.push(batchOf(sheet.name));
      continue;
    }

    const days = rosterSheet(sheet);

    if (days && !roster) roster = days;
    else if (sheet.rows.some((row) => !blank(row))) skippedSheets.push(sheet.name.trim());
  }

  if (!read.length && !roster) throw new KeystoneError(`${file} has no batch of interns in it: no tab has a NAME column.`);
  // Twice in the same file is read once.
  const unique = read.filter((r, i) => read.findIndex((x) => sameIntern(x, r)) === i);
  const added = unique.filter((r) => !have.some((i) => sameIntern(i, r)));
  const kept = unique.filter((r) => have.some((i) => sameIntern(i, r)));
  const rosterTaken = !!roster && roster.some((d) => d.names.length) && rosterOf(s).every((d) => !d.names.length);

  return { file, read, added, kept, roster, rosterTaken, batches, skippedSheets };
}

/** "batches 2 to 10", "batch 4", "batches 2, 5 and 9". */
export function batchesText(batches: number[]): string {
  const b = [...new Set(batches.filter((n) => n > 0))].sort((x, y) => x - y);

  if (!b.length) return 'no batch';

  if (b.length === 1) return `batch ${b[0]}`;
  const run = b.every((n, i) => i === 0 || n === b[i - 1] + 1);

  return run ? `batches ${b[0]} to ${b[b.length - 1]}` : `batches ${b.slice(0, -1).join(', ')} and ${b[b.length - 1]}`;
}

/** What the import would do, in the words the confirmation shows. */
export function importSummary(p: ImportPlan): string {
  const found = `${p.file} has ${count(p.read.length, 'intern')} in ${batchesText(p.batches)}${p.roster ? ' and the cleaning schedule' : ''}.`;
  const adds = p.added.length ? `${count(p.added.length, 'intern')} ${p.added.length === 1 ? 'is' : 'are'} new and will be added, every cell of their row kept as written.` : 'Every intern in it is already in Keystone.';
  const keeps = p.kept.length ? ` ${count(p.kept.length, 'intern')} already here ${p.kept.length === 1 ? 'stays' : 'stay'} as ${p.kept.length === 1 ? 'it is' : 'they are'}.` : '';
  const roster = !p.roster ? '' : p.rosterTaken ? ' The cleaning schedule will be brought in.' : ' The cleaning schedule in Keystone stays as it is.';
  const skipped = p.skippedSheets.length ? ` Not brought in: ${p.skippedSheets.join(', ')}, which ${p.skippedSheets.length === 1 ? 'is' : 'are'} neither a batch nor the cleaning schedule.` : '';

  return `${found} ${adds}${keeps}${roster}${skipped}`;
}

/** Adds what the plan found that Keystone does not have yet, and the cleaning schedule if Keystone has none. */
export function importInterns(s: TerminalState, p: ImportPlan, ctx: Ctx): Change<Intern[]> {
  if (!p.added.length && !p.rosterTaken) throw new KeystoneError(`Everything in ${p.file} is already in Keystone.`);
  const have = internsOf(s);
  const nos = have.map((i) => i.no);

  const added = p.added.map((r) => {
    const no = nextNumber(nos, 'IN-');

    nos.push(no);

    return { ...r, no };
  });

  const roster = p.rosterTaken && p.roster ? p.roster : rosterOf(s);
  const what = [added.length ? `${count(added.length, 'intern')} in ${batchesText(added.map((i) => i.batch))}` : '', p.rosterTaken ? 'the cleaning schedule' : ''].filter(Boolean).join(' and ');

  return {
    state: logged(withInterns(s, [...have, ...added], roster), TAG, `Imported ${what} from ${p.file}.`, ctx),
    record: added, message: `Imported ${what}.`,
  };
}
