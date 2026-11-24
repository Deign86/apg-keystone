import {
  addDays, count, isJsonObject, jsonNumber, jsonObjects, jsonText, KeystoneError, logged, longDate, moduleData, nextNumber, percent, peso,
  sumCentavos, thisYear, toCentavos, today, withModuleData,
  type Centavos, type Change, type Ctx, type Editing, type ISODate, type JsonObject, type JsonValue, type TerminalState,
} from '@keystone/core';

// Statements of account for a lease: what a lessee pays, worked out from the floor area and the rate per square metre.
// The company's form, read in order: the monthly rent's breakdown (base rent = area × rate, plus 12% VAT, less 5% EWT),
// the deposit and advance due on signing (the reservation already paid taken off), the rent for each lease year after
// its escalation, and the postdated checks that pay the months after the advance. Kept under state.ext.soa.

/** This module's id, written once: its route, its ModuleDef.id, its key under state.ext and its draft key. */
export const ID = 'soa';

/** The tag its activity-log lines carry. */
export const TAG = 'SOA';

/** VAT added to the base rent, and the expanded withholding tax a lessee takes off rent, in percent. */
export const VAT_RATE = 12;
export const EWT_RATE = 5;

/** One statement of account as saved. Amounts are pesos, as every amount in state.json is. */
export type Soa = {
  no: string;
  /** Prepared as of. */
  date: ISODate;
  client: string;
  property: string;
  /** The lease terms as they print; empty prints the term and escalation worked out below. */
  leaseTerms: string;
  /** Who the checks are made out to. */
  payee: string;
  /** The payee's title as it prints ("Lessor"); empty prints "Payee". */
  payeeLabel: string;
  /** The floor area prints among the details at the top, as well as in the breakdown. */
  showSqm: boolean;
  /** More details printed at the top, under the lease's own, each a label and its value. */
  details: SoaDetail[];
  sqm: number;
  /** Pesos per square metre a month. */
  rate: number;
  vat: boolean;
  ewt: boolean;
  /** The reservation already paid, taken off what is due on signing. */
  reservation: number;
  reservationCoverage: string;
  reservationCheck: string;
  depositMonths: number;
  depositCoverage: string;
  depositCheck: string;
  advanceMonths: number;
  advanceCoverage: string;
  advanceCheck: string;
  commencement: ISODate;
  termMonths: number;
  /** Percent the base rent rises each lease year after the first, on the year before's. */
  escalation: number;
  /** The first month the checks pay, "2027-02"; empty is the month after the advance. */
  pdcFirst: string;
  /** How many checks; 0 is one for every month the advance does not cover. */
  pdcCount: number;
  /** The day of its rent month each check is dated, cut to the month's last day. */
  pdcDay: number;
  bank: string;
  /** The first check's number; the rest follow it. */
  firstCheck: string;
  /**
   * A check's own number where the checks are not in order, typed on the paper, by its No. ("5"). The checks after it
   * count on from it. A statement saved before it kept these has none.
   */
  checkNos: Record<string, string>;
  notes: string;
};

/** One more detail at the top of the statement: "Floor" · "3rd floor, Room 7". */
export type SoaDetail = { label: string; value: string };

export type SoaData = { statements: Soa[] };

/** The payee's title as it prints. */
export const payeeLabelOf = (a: Pick<Soa, 'payeeLabel'>) => a.payeeLabel.trim() || 'Payee';

/** A number of square metres, with its decimals only when it has them: "354.4". */
export const sqmFigure = (n: number) => n.toLocaleString('en-PH', { maximumFractionDigits: 2 });

/**
 * One of the details at the top: its label, its value, whether the value is a figure (set in even digits), and the
 * part of the form that fills it, which the paper marks while one of its fields has focus.
 */
export interface TopDetail { label: string; value: string; part: string; figure?: boolean }

/**
 * The details printed at the top, in order: the client, the property, the floor area when chosen, the lease terms,
 * the payee under its title, the commencement date, then any added, leaving out an added one with no label and no value.
 */
export function topDetails(a: Soa): TopDetail[] {
  return [
    { label: 'Client', value: a.client, part: 'client' },
    { label: 'Property address', value: a.property, part: 'property' },
    ...(a.showSqm ? [{ label: 'Floor area', value: a.sqm ? `${sqmFigure(a.sqm)} sqm` : '', part: 'breakdown', figure: true }] : []),
    { label: 'Lease terms', value: leaseTermsOf(a), part: 'leaseTerms' },
    { label: payeeLabelOf(a), value: a.payee, part: 'payee' },
    { label: 'Contract commencement', value: a.commencement ? longDate(a.commencement) : '', part: 'commencement', figure: true },
    ...a.details.filter((d) => d.label.trim() || d.value.trim()).map((d) => ({ label: d.label.trim(), value: d.value.trim(), part: 'details' })),
  ];
}

// ---------- the computation ----------

/** One month's rent: the base rent, the VAT on it, the EWT withheld from it, and what is paid. */
export interface MonthlyRent { base: Centavos; vat: Centavos; ewt: Centavos; net: Centavos }

/** The rent on this base: VAT added and EWT withheld, both on the base rent. */
export function rentOn(a: Pick<Soa, 'vat' | 'ewt'>, base: Centavos): MonthlyRent {
  const vat = a.vat ? percent(base, VAT_RATE) : 0;
  const ewt = a.ewt ? percent(base, EWT_RATE) : 0;

  return { base, vat, ewt, net: base + vat - ewt };
}

/** The first year's base rent: the area times the rate, to the centavo. */
export const baseRent = (a: Pick<Soa, 'sqm' | 'rate'>): Centavos => toCentavos(a.sqm * a.rate);

/** The month's rent in the first lease year. */
export const monthlyRent = (a: Soa): MonthlyRent => rentOn(a, baseRent(a));

/** How many lease years the term runs into: a part year counts. */
export const leaseYears = (a: Pick<Soa, 'termMonths'>) => Math.max(1, Math.ceil(a.termMonths / 12));

/** The base rent in lease year `year` (1 is the first): each year's is the year before's plus the escalation. */
export function baseRentInYear(a: Soa, year: number): Centavos {
  let base = baseRent(a);

  for (let y = 2; y <= year; y += 1) base += percent(base, a.escalation);

  return base;
}

// Months are "YYYY-MM", counted as a year and month so they never cross a time zone.
const monthIndex = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1;
const monthOf = (i: number) => `${String(Math.floor(i / 12)).padStart(4, '0')}-${String((i % 12) + 1).padStart(2, '0')}`;
const daysIn = (i: number) => new Date(Date.UTC(Math.floor(i / 12), (i % 12) + 1, 0)).getUTCDate();

/** "2027-02" plus n months. */
export const addMonths = (m: string, n: number) => monthOf(monthIndex(m) + n);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2027-02" → "February 2027". */
export const monthName = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** The last day of the lease's `n`th month after commencement, n from 1. */
function leaseDay(a: Soa, months: number): ISODate {
  const start = monthIndex(a.commencement);
  const day = Number(a.commencement.slice(8, 10));
  const end = start + months;
  const on = Math.min(day, daysIn(end));
  // The day before the same day `months` later: Jan 1 for a year runs to Dec 31.
  const until = new Date(Date.UTC(Math.floor(end / 12), end % 12, on - 1));

  return until.toISOString().slice(0, 10);
}

/** One lease year in the escalation table. */
export interface LeaseYear extends MonthlyRent { year: number; from: ISODate; to: ISODate; escalation: number }

/** Every lease year of the term, its dates and its monthly rent. None before the commencement date is set. */
export function leaseSchedule(a: Soa): LeaseYear[] {
  if (!a.commencement) return [];

  return Array.from({ length: leaseYears(a) }, (_, i) => ({
    year: i + 1,
    from: i ? addDays(leaseDay(a, i * 12), 1) : a.commencement,
    to: leaseDay(a, Math.min(a.termMonths, (i + 1) * 12)),
    escalation: i ? a.escalation : 0,
    ...rentOn(a, baseRentInYear(a, i + 1)),
  }));
}

/** The lease year a rent month falls in: 1 for the commencement month and the eleven after it. */
export const leaseYearOf = (a: Soa, month: string) => Math.max(1, Math.floor((monthIndex(month) - monthIndex(a.commencement)) / 12) + 1);

/** One line of the deposit and advance due on signing. A credit is the reservation already paid, taken off. */
export interface DepositLine { desc: string; amount: Centavos; qty: number; total: Centavos; coverage: string; check: string; credit?: boolean }

/**
 * What is paid on signing: the security deposit in months of base rent, the advance in months of rent after VAT and
 * EWT, less the reservation already paid.
 */
export function depositLines(a: Soa): DepositLine[] {
  const rent = monthlyRent(a);
  const reservation = toCentavos(a.reservation);
  const lines: DepositLine[] = [];

  if (reservation) lines.push({ desc: 'Reservation', amount: reservation, qty: 1, total: reservation, coverage: a.reservationCoverage, check: a.reservationCheck, credit: true });

  if (a.depositMonths) {
    lines.push({ desc: `Security deposit (${count(a.depositMonths, 'month')} base rent)`, amount: rent.base, qty: a.depositMonths, total: rent.base * a.depositMonths, coverage: a.depositCoverage, check: a.depositCheck });
  }

  if (a.advanceMonths) {
    lines.push({ desc: `Advance rental (${count(a.advanceMonths, 'month')})`, amount: rent.net, qty: a.advanceMonths, total: rent.net * a.advanceMonths, coverage: a.advanceCoverage, check: a.advanceCheck });
  }

  return lines;
}

/** The deposit and advance less the reservation. */
export const dueOnSigning = (a: Soa): Centavos => sumCentavos(depositLines(a), (l) => (l.credit ? -l.total : l.total));

/** The first month the checks pay: as set, or the month after the advance. Empty before the commencement date is set. */
export const pdcStart = (a: Soa) => a.pdcFirst || (a.commencement ? addMonths(a.commencement.slice(0, 7), a.advanceMonths) : '');

/** How many checks: as set, or one for each month of the term the advance does not pay. */
export const pdcTotal = (a: Soa) => a.pdcCount || Math.max(0, a.termMonths - a.advanceMonths);

/** The number after this check's: a number counts on with its leading zeros; anything else leaves the next blank. */
function nextCheck(check: string): string {
  return /^\d+$/.test(check) ? (BigInt(check) + 1n).toString().padStart(check.length, '0') : '';
}

/**
 * Each check's number: the one typed for it on the paper, or else one past the check before (the first is the first
 * check number), so a check typed out of order carries the checks after it with it.
 */
function checkNumbers(a: Pick<Soa, 'firstCheck' | 'checkNos'>, count: number): string[] {
  const numbers: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const typed = a.checkNos[String(i + 1)]?.trim();

    numbers.push(typed || (i ? nextCheck(numbers[i - 1]) : a.firstCheck.trim()));
  }

  return numbers;
}

export interface Pdc { no: number; date: ISODate; bank: string; check: string; amount: Centavos; month: string }

/**
 * The postdated checks, one a month from the first rent month they pay, each dated `pdcDay` of the month it pays, so
 * the check date and "Payment for" name the same month, and for that month's rent after VAT and EWT in its lease year,
 * so an escalation shows in the checks of the year it starts.
 */
export function pdcSchedule(a: Soa): Pdc[] {
  const start = pdcStart(a);

  if (!start || !a.commencement) return [];
  const day = Math.min(31, Math.max(1, a.pdcDay || 1));
  const count = Math.min(pdcTotal(a), 120);
  const numbers = checkNumbers(a, count);

  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(start, i);
    const dated = monthIndex(month);

    return {
      no: i + 1,
      date: `${month}-${String(Math.min(day, daysIn(dated))).padStart(2, '0')}`,
      bank: a.bank,
      check: numbers[i],
      amount: rentOn(a, baseRentInYear(a, leaseYearOf(a, month))).net,
      month,
    };
  });
}

/** The lease terms as printed: as typed, or the term and its escalation. */
export function leaseTermsOf(a: Soa): string {
  if (a.leaseTerms.trim()) return a.leaseTerms.trim();

  if (!a.termMonths) return '';
  const term = a.termMonths % 12 ? count(a.termMonths, 'month') : count(a.termMonths / 12, 'year');

  return a.escalation && leaseYears(a) > 1 ? `${term}, ${a.escalation}% escalation a year from the second year` : term;
}

// ---------- reading and writing the saved data ----------

/** A saved statement, field by field: a missing or damaged field becomes empty, zero or off. */
const soaFrom = (o: JsonObject): Soa => ({
  no: jsonText(o.no), date: jsonText(o.date), client: jsonText(o.client), property: jsonText(o.property), leaseTerms: jsonText(o.leaseTerms),
  payee: jsonText(o.payee), payeeLabel: jsonText(o.payeeLabel), showSqm: o.showSqm === true,
  details: jsonObjects(o.details).map((d) => ({ label: jsonText(d.label), value: jsonText(d.value) })),
  sqm: jsonNumber(o.sqm), rate: jsonNumber(o.rate), vat: o.vat === true, ewt: o.ewt === true,
  reservation: jsonNumber(o.reservation), reservationCoverage: jsonText(o.reservationCoverage), reservationCheck: jsonText(o.reservationCheck),
  depositMonths: jsonNumber(o.depositMonths), depositCoverage: jsonText(o.depositCoverage), depositCheck: jsonText(o.depositCheck),
  advanceMonths: jsonNumber(o.advanceMonths), advanceCoverage: jsonText(o.advanceCoverage), advanceCheck: jsonText(o.advanceCheck),
  commencement: jsonText(o.commencement), termMonths: jsonNumber(o.termMonths), escalation: jsonNumber(o.escalation),
  pdcFirst: jsonText(o.pdcFirst), pdcCount: jsonNumber(o.pdcCount), pdcDay: jsonNumber(o.pdcDay), bank: jsonText(o.bank),
  firstCheck: jsonText(o.firstCheck), notes: jsonText(o.notes), checkNos: checkNosFrom(o.checkNos),
});

/** The check numbers typed on the paper, as saved: only numbered checks with some text. */
function checkNosFrom(raw: JsonValue | undefined): Record<string, string> {
  if (!isJsonObject(raw)) return {};

  return Object.fromEntries(Object.entries(raw).flatMap(([no, check]) => {
    const text = jsonText(check).trim();

    return /^\d+$/.test(no) && text ? [[no, text]] : [];
  }));
}

/** The statements in the order they were saved. None saved: none (docs/adr/0018). */
export function statementsOf(s: TerminalState): Soa[] {
  const raw = moduleData(s, ID);

  return isJsonObject(raw) ? jsonObjects(raw.statements).map(soaFrom).filter((a) => a.no) : [];
}

const saved = (s: TerminalState, statements: Soa[]) => withModuleData(s, ID, { statements } satisfies SoaData);

export const statementsNewestFirst = (s: TerminalState) => [...statementsOf(s)].reverse();

/** Numbers run on within the year: "SOA-2026-001". */
export const nextSoaNo = (s: TerminalState, ctx: Ctx) => nextNumber(statementsOf(s).map((a) => a.no).filter((no) => no.startsWith(`SOA-${thisYear(ctx)}-`)), `SOA-${thisYear(ctx)}-`, 3);

// ---------- the form ----------

/** The amounts and counts a person types, kept in the form as typed so a half-typed "354." stays on screen. */
type Typed = 'sqm' | 'rate' | 'reservation' | 'depositMonths' | 'advanceMonths' | 'termMonths' | 'escalation' | 'pdcCount' | 'pdcDay';

export type SoaDraft = Editing & Omit<Soa, Typed> & Record<Typed, string>;

/** A blank statement: VAT and 5% EWT on, two months' deposit and two months' advance, a year's term, checks dated the 28th. */
export function newSoa(s: TerminalState, ctx: Ctx): SoaDraft {
  return {
    no: nextSoaNo(s, ctx), date: today(ctx), client: '', property: '', leaseTerms: '', payee: '', payeeLabel: '', showSqm: false, details: [],
    sqm: '', rate: '', vat: true, ewt: true,
    reservation: '', reservationCoverage: '', reservationCheck: '', depositMonths: '2', depositCoverage: '', depositCheck: '',
    advanceMonths: '2', advanceCoverage: '', advanceCheck: '', commencement: '', termMonths: '12', escalation: '0',
    pdcFirst: '', pdcCount: '', pdcDay: '28', bank: '', firstCheck: '', checkNos: {}, notes: '',
  };
}

/** What the Drafts list calls a saved statement of account draft: the client, and where. */
export const soaDraftTitle = (d: SoaDraft) => [d.client.trim() || 'No client yet', d.property.trim()].filter(Boolean).join(' · ');

/**
 * A saved draft back in the form (docs/adr/0041): what was saved over a new statement, so a field it lacks starts as a
 * new one's does, and the next number, since a draft has none, unless it edits a saved statement.
 */
export function soaDraftFrom(s: TerminalState, ctx: Ctx, saved: Partial<SoaDraft>): SoaDraft {
  const fresh = newSoa(s, ctx);

  return { ...fresh, ...saved, no: saved.editing ?? fresh.no };
}

const typed = (n: number) => (n ? String(n) : '');

export const soaDraftOf = (a: Soa): SoaDraft => ({
  ...a, editing: a.no, sqm: typed(a.sqm), rate: typed(a.rate), reservation: typed(a.reservation), depositMonths: String(a.depositMonths),
  advanceMonths: String(a.advanceMonths), termMonths: typed(a.termMonths), escalation: String(a.escalation), pdcCount: typed(a.pdcCount), pdcDay: typed(a.pdcDay),
});

/** A typed number: "1,250.50" is 1250.5; anything that is not a number is 0. */
const numberOf = (x: string) => {
  const n = Number(x.replace(/[,₱\s]/g, ''));

  return Number.isFinite(n) ? n : 0;
};

/** The statement the form holds, as it prints and saves: text trimmed (the notes kept as typed), numbers read. */
export function soaOf(d: SoaDraft): Soa {
  const { editing: _, savedDraft: __, ...a } = d;

  return {
    ...a, no: a.no.trim(), client: a.client.trim(), property: a.property.trim(), leaseTerms: a.leaseTerms.trim(), payee: a.payee.trim(),
    payeeLabel: a.payeeLabel.trim(), details: a.details.filter((d) => d.label.trim() || d.value.trim()).map((d) => ({ label: d.label.trim(), value: d.value.trim() })),
    reservationCoverage: a.reservationCoverage.trim(), reservationCheck: a.reservationCheck.trim(), depositCoverage: a.depositCoverage.trim(),
    depositCheck: a.depositCheck.trim(), advanceCoverage: a.advanceCoverage.trim(), advanceCheck: a.advanceCheck.trim(),
    pdcFirst: a.pdcFirst.trim(), bank: a.bank.trim(), firstCheck: a.firstCheck.trim(),
    sqm: numberOf(a.sqm), rate: numberOf(a.rate), reservation: numberOf(a.reservation), depositMonths: numberOf(a.depositMonths),
    advanceMonths: numberOf(a.advanceMonths), termMonths: numberOf(a.termMonths), escalation: numberOf(a.escalation),
    pdcCount: numberOf(a.pdcCount), pdcDay: numberOf(a.pdcDay),
  };
}

const whole = (n: number) => Number.isInteger(n) && n >= 0;

export function saveSoa(s: TerminalState, d: SoaDraft, ctx: Ctx, asNew = false): Change<Soa> {
  const a = soaOf(d);
  const all = statementsOf(s);

  if (!a.client) throw new KeystoneError('Enter the client.', 'client');

  if (!a.property) throw new KeystoneError('Enter the property address.', 'property');

  if (a.sqm <= 0) throw new KeystoneError('Enter the floor area in square metres.', 'sqm');

  if (a.rate <= 0) throw new KeystoneError('Enter the rate per square metre.', 'rate');

  if (!a.commencement) throw new KeystoneError('Enter the contract commencement date.', 'commencement');

  if (!whole(a.termMonths) || !a.termMonths) throw new KeystoneError('Enter the lease term in whole months.', 'termMonths');

  if (!whole(a.depositMonths) || !whole(a.advanceMonths)) {
    throw new KeystoneError('Enter the deposit and advance in whole months.', ...(whole(a.depositMonths) ? [] : ['depositMonths']), ...(whole(a.advanceMonths) ? [] : ['advanceMonths']));
  }

  if (a.escalation < 0) throw new KeystoneError('The escalation cannot be below zero.', 'escalation');

  if (a.pdcFirst && !/^\d{4}-\d{2}$/.test(a.pdcFirst)) throw new KeystoneError('Enter the first check month as YYYY-MM.', 'pdcFirst');

  if (!whole(a.pdcCount) || a.pdcCount > 120) throw new KeystoneError('Enter up to 120 checks.', 'pdcCount');

  if (!whole(a.pdcDay) || a.pdcDay < 1 || a.pdcDay > 31) throw new KeystoneError('Date the checks on a day from 1 to 31.', 'pdcDay');

  const original = d.editing && !asNew ? all.find((x) => x.no === d.editing) : undefined;

  if (d.editing && !asNew && !original) throw new KeystoneError(`${d.editing} is no longer saved.`);

  const what = `for ${a.client}, ${a.property} (${peso(monthlyRent(a).net)} a month, ${peso(dueOnSigning(a))} on signing)`;

  if (original) {
    const updated = { ...a, no: original.no };

    return {
      state: logged(saved(s, all.map((x) => (x.no === original.no ? updated : x))), TAG, `${updated.no} ${what} edited.`, ctx),
      record: updated, message: `${updated.no} updated.`,
    };
  }

  // A new statement keeps the number typed on it unless it is taken; a copy of a saved one takes the next.
  const no = d.editing || !a.no ? nextSoaNo(s, ctx) : a.no;

  if (all.some((x) => x.no === no)) throw new KeystoneError(`${no} is already used. The next free one is ${nextSoaNo(s, ctx)}.`);
  const record = { ...a, no };

  return {
    state: logged(saved(s, [...all, record]), TAG, `${no} ${what} prepared as of ${longDate(a.date)}.`, ctx),
    record, message: `${no} saved.`,
  };
}

export function removeSoa(s: TerminalState, no: string, ctx: Ctx): Change<Soa> {
  const all = statementsOf(s);
  const a = all.find((x) => x.no === no);

  if (!a) throw new KeystoneError(`${no} is not saved.`);

  return {
    state: logged(saved(s, all.filter((x) => x.no !== no)), TAG, `${no} for ${a.client} removed.`, ctx),
    record: a, message: `${no} removed.`,
  };
}

/**
 * The statement with check `no`'s number as typed on the paper. Typing it back to empty, or to the number it would
 * have anyway, lets it count on from the check before again.
 */
export function withCheckNumber(d: SoaDraft, no: number, check: string): SoaDraft {
  const { [String(no)]: _, ...rest } = d.checkNos;
  const counted = checkNumbers({ ...d, checkNos: rest }, no)[no - 1];
  const typed = check.trim();

  return { ...d, checkNos: typed && typed !== counted ? { ...rest, [no]: typed } : rest };
}

/** The line under the title. */
export function soaLine(s: TerminalState): string {
  const all = statementsOf(s);

  return all.length
    ? `${count(all.length, 'statement')} of account saved, for ${count(new Set(all.map((a) => a.client)).size, 'client')}.`
    : 'No statements of account yet. Each works out the rent from the floor area and rate, with VAT, EWT and escalation.';
}
