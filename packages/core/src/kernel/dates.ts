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
