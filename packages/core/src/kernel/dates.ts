// Calendar dates are plain "yyyy-MM-dd" strings, as in the saved state. Arithmetic is
// done in UTC so the day never shifts with the machine's zone.

export type ISODate = string;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function isISODate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}

/** The local calendar date of an instant. */
export function localDate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function utc(iso: ISODate): Date {
  return new Date(iso.slice(0, 10) + 'T00:00:00Z');
}

function fromUtc(d: Date): ISODate {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);

  return fromUtc(d);
}

/** Same day n years on; 29 Feb falls back to 28 Feb. */
export function addYears(iso: ISODate, n: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate();

  return `${pad(y + n, 4)}-${pad(m)}-${pad(Math.min(d, last))}`;
}

export const monthKey = (iso: ISODate) => iso.slice(0, 7);

/** 0 for Sunday to 6 for Saturday. */
export const weekdayOf = (iso: ISODate) => utc(iso).getUTCDay();

/** Monday to Friday. */
export const isWeekday = (iso: ISODate) => weekdayOf(iso) >= 1 && weekdayOf(iso) <= 5;

/** The Monday of the week a date falls in (weeks run Monday to Sunday). */
export const mondayOf = (iso: ISODate) => addDays(iso, -((weekdayOf(iso) + 6) % 7));

/** Every date from one to another, both included; empty when `to` comes first. */
export function datesBetween(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];

  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);

  return out;
}

/** A pay period: from one date to another, both included. */
export interface Period {
  from: ISODate;
  to: ISODate;
}

/** The semi-monthly cut-off a date falls in: the 1st to the 15th, or the 16th to the month's last day. */
export function halfMonthOf(iso: ISODate): Period {
  const month = monthKey(iso);

  if (Number(iso.slice(8, 10)) <= 15) return { from: `${month}-01`, to: `${month}-15` };

  return { from: `${month}-16`, to: addDays(addDays(`${month}-01`, 31).slice(0, 7) + '-01', -1) };
}

/** The cut-offs up to the one a date falls in, newest first. */
export function halfMonthsTo(iso: ISODate, n: number): Period[] {
  const out = [halfMonthOf(iso)];

  while (out.length < n) out.push(halfMonthOf(addDays(out[out.length - 1].from, -1)));

  return out;
}
