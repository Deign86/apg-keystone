import type { Centavos } from './money';
import type { ISODate } from './dates';

// Fixed English (Philippines) formats, written out by hand so every machine prints the
// same strings whatever its locale.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parts(iso: ISODate | null | undefined) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

/** "October 20, 2026"; "—" when empty. */
export function longDate(iso: ISODate | null | undefined): string {
  const p = parts(iso);
  return p ? `${MONTHS[p.m - 1]} ${p.d}, ${p.y}` : '—';
}

/** "Oct 20, 2026"; "—" when empty. */
export function shortDate(iso: ISODate | null | undefined): string {
  const p = parts(iso);
  return p ? `${MONTHS[p.m - 1].slice(0, 3)} ${p.d}, ${p.y}` : '—';
}

/** "Friday, October 30, 2026" */
export function weekdayLong(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** "4:48:52 PM" */
export function clockTime(d: Date): string {
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The activity-log stamp: "2026-10-30 16:48". */
export function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function greeting(d: Date): string {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** "1 statement" / "3 statements" */
export function count(n: number, singular: string, plural = singular + 's'): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

function chunk(n: number): string {
  let x = n;
  let s = '';
  if (x >= 100) {
    s += ONES[Math.floor(x / 100)] + ' Hundred';
    x %= 100;
    if (x) s += ' ';
  }
  if (x >= 20) {
    s += TENS[Math.floor(x / 10)];
    if (x % 10) s += '-' + ONES[x % 10];
  } else if (x) {
    s += ONES[x];
  }
  return s;
}

/** "Forty-Eight Thousand Two Hundred Thirty Pesos and 55/100 Only", as printed on a check voucher. */
export function amountInWords(c: Centavos): string {
  const abs = Math.abs(Math.round(c));
  let whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const out: string[] = [];
  if (whole === 0) out.push('Zero');
  for (let i = 0; whole > 0; i++) {
    const part = whole % 1000;
    if (part) out.unshift(chunk(part) + (SCALES[i] ? ' ' + SCALES[i] : ''));
    whole = Math.floor(whole / 1000);
  }
  return out.join(' ') + ' Pesos' + (cents ? ` and ${String(cents).padStart(2, '0')}/100` : '') + ' Only';
}
