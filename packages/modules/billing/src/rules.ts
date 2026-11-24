import {
  addDays, changeEach, companyOf, count, KeystoneError, lineDraft, lineDraftOf, lineItemsOf, linesBlank, linesFromDraft, logged, nameOf, newestFirst,
  percent, peso, recordsOf, shortDate, sumCentavos, toCentavos, today,
  type BankAccount, type Centavos, type Change, type Ctx, type Editing, type Figure, type Finding, type LineDraft,
  type ISODate, type Payment, type Statement, type StatementPayments,
  type Reference, type TerminalState, type Tone, type WaitingItem
} from '@keystone/core';

// Billing statements: receivables from clients, printed as the company's Billing
// Statement, with VAT and expanded withholding. Reads the directory for clients, their
// tax setup and who to address.

export interface StatementTotals { subtotal: Centavos; vat: Centavos; ewt: Centavos; due: Centavos }

/** This module's id, written once: its route, its ModuleDef.id and its draft key. */
export const ID = 'billing';

/** The tag its activity-log lines carry. */
export const TAG = 'BS';

export const STATEMENT_STATUSES = ['Sent', 'Paid', 'Overdue', 'Void'] as const;

export type StatementStatus = (typeof STATEMENT_STATUSES)[number];

const TONES: Record<StatementStatus, Tone> = { Sent: 'neutral', Paid: 'good', Overdue: 'bad', Void: 'neutral' };

/** How a statement's status reads at a glance. One saved with a status this build does not know reads as neutral. */
export function statementTone(status: string): Tone {
  const known = STATEMENT_STATUSES.find((s) => s === status);

  return known ? TONES[known] : 'neutral';
}

export const VAT_RATE = 12;

/**
 * A statement saved before Bill to was typed names its client by directory code; that record is kept. A typed name is
 * no code, so it keeps nothing.
 */
export const refersTo: Reference = { tag: TAG, codes: (s) => s.bs.map((b) => b.client) };

/** The expanded withholding tax rates a statement can withhold, in percent: 2 on services, 5 on rentals and fees. */
export const EWT_RATES = [2, 5] as const;

/** The rate a new statement withholds, until another is picked. */
export const EWT_RATE = 2;

/** What a statement saved before it kept its own rate withheld. */
const OLDER_EWT_RATE = 5;

/** The percent of EWT a statement withholds when `ewt` is on: its own, or 5 on one saved before it kept one. */
export const ewtRateOf = (b: Pick<Statement, 'ewtRate'>) => b.ewtRate ?? OLDER_EWT_RATE;

/** VAT is added and EWT withheld, both on the subtotal. */
export function statementTotals(b: Pick<Statement, 'lines' | 'vat' | 'ewt' | 'ewtRate'>): StatementTotals {
  const subtotal = sumCentavos(b.lines, (l) => toCentavos(l.amt));
  const vat = b.vat ? percent(subtotal, VAT_RATE) : 0;
  const ewt = b.ewt ? percent(subtotal, ewtRateOf(b)) : 0;

  return { subtotal, vat, ewt, due: subtotal + vat - ewt };
}

/** Invoice numbers start with 888-, then the statement's date as month, day and year: 888-112426. */
const SERIES = '888-';

/** A statement date as the invoice number writes it: "2026-11-24" → "112426". */
const mmddyy = (date: ISODate) => `${date.slice(5, 7)}${date.slice(8, 10)}${date.slice(2, 4)}`;

/**
 * The invoice number for a statement dated `date`: 888- and the date as month, day and year (888-112426). A second
 * statement that day is 888-112426-2, a third -3, and on. Older numbers (010100-2026) keep theirs.
 */
export function nextStatementNo(s: TerminalState, date: ISODate): string {
  const first = `${SERIES}${mmddyy(date)}`;
  const used = new Set(s.bs.map((b) => b.no));

  if (!used.has(first)) return first;
  let n = 2;

  while (used.has(`${first}-${n}`)) n++;

  return `${first}-${n}`;
}

/**
 * The statement with its date changed. A new statement still showing the number its old date gave takes the new
 * date's; a number typed by hand is kept.
 */
export function withStatementDate(s: TerminalState, d: StatementDraft, date: string): StatementDraft {
  const auto = !d.editing && (!d.no.trim() || d.no === nextStatementNo(s, d.date));

  return { ...d, date, no: auto && date ? nextStatementNo(s, date) : d.no };
}

export const statementsNewestFirst = (s: TerminalState) => newestFirst(s.bs);
export const outstanding = (s: TerminalState) => s.bs.filter((b) => b.status === 'Sent' || b.status === 'Overdue');
export const overdue = (s: TerminalState) => s.bs.filter((b) => b.status === 'Overdue');
export const outstandingTotal = (s: TerminalState) => sumCentavos(outstanding(s), (b) => statementTotals(b).due);

export interface StatementDraft extends Editing {
  no: string; date: string; invoiceDate: string; due: string; client: string; address: string; attention: string;
  lines: LineDraft[]; vat: boolean; ewt: boolean; ewtRate: number; notes: string; note: string; penalty: string;
  prepared: string; checked: string; approved: string;
  preparedPos: string; checkedPos: string; approvedPos: string;
}

/**
 * A blank statement, from Company Details: its payment instructions, note and days to pay (no due date until set). It
 * is prepared by whoever is signed in; the other signatories start as the last statement's (Company Details' names
 * before the first), and every signatory's position as the last statement's. With `accounts` (those Bank Accounts keeps), it pays into the account the last statement named,
 * as a new voucher is drawn on the last voucher's bank, or else the one Company Details' instructions name, or else
 * the first kept.
 */
export function newStatement(s: TerminalState, ctx: Ctx, accounts: BankAccount[] = []): StatementDraft {
  const d = companyOf(s);
  const last = s.bs.at(-1);
  const t = today(ctx);
  const account = paidInto(last?.notes ?? '', accounts) ?? paidInto(d.paymentInstructions, accounts) ?? accounts[0];

  return {
    no: nextStatementNo(s, t), date: t, invoiceDate: t, due: d.dueInDays ? addDays(t, d.dueInDays) : '', client: '',
    address: '', attention: '', lines: [lineDraft()], vat: false, ewt: false, ewtRate: EWT_RATE,
    notes: account ? payInto(d.paymentInstructions, account) : d.paymentInstructions, note: d.billingNote, penalty: d.billingTerms,
    prepared: ctx.who?.name ?? last?.prepared ?? d.preparedBy, checked: last?.checked ?? d.checkedBy, approved: last?.approved ?? d.approvedBy,
    preparedPos: last?.preparedPos ?? '', checkedPos: last?.checkedPos ?? '', approvedPos: last?.approvedPos ?? '',
  };
}

/**
 * A saved statement back in the form. One saved before it kept its own notes takes Company Details'; one saved before
 * Bill to was typed names its client by directory code, and comes back with that client's name.
 */
/**
 * Nothing typed worth keeping as a draft (docs/adr/0041): a new statement with no one billed, no address or Attention,
 * and no charge. One editing a saved statement is never blank.
 */
export const statementDraftBlank = (d: StatementDraft) =>
  !d.editing && !d.client.trim() && !d.address.trim() && !d.attention.trim() && linesBlank(d.lines);

/** What the Drafts list calls a saved statement draft: who it bills, and what it comes to so far. */
export const statementDraftTitle = (d: StatementDraft) => `${d.client.trim() || 'No client yet'} · ${peso(statementTotals(statementOf(d)).due)}`;

/**
 * A saved draft back in the form (docs/adr/0041): what was saved over a new statement, so a field it lacks starts as a
 * new one's does, its charges as typed, and the next invoice number, since a draft has none, unless it edits a saved
 * statement.
 */
export function statementDraftFrom(s: TerminalState, ctx: Ctx, accounts: BankAccount[], saved: Partial<StatementDraft>): StatementDraft {
  const fresh = newStatement(s, ctx, accounts);

  return { ...fresh, ...saved, lines: linesFromDraft(saved.lines), no: saved.editing ?? fresh.no };
}

export const statementDraftOf = (b: Statement, s: TerminalState): StatementDraft => ({
  editing: b.no, no: b.no, date: b.date, invoiceDate: b.invoiceDate ?? b.date, due: b.due, client: nameOf(s, b.client),
  address: b.address ?? '', attention: b.attention ?? '', lines: b.lines.map(lineDraftOf), vat: b.vat, ewt: b.ewt, ewtRate: ewtRateOf(b),
  notes: b.notes ?? companyOf(s).paymentInstructions, note: b.note ?? companyOf(s).billingNote, penalty: b.penalty ?? companyOf(s).billingTerms,
  prepared: b.prepared ?? '', checked: b.checked ?? '', approved: b.approved ?? '',
  preparedPos: b.preparedPos ?? '', checkedPos: b.checkedPos ?? '', approvedPos: b.approvedPos ?? '',
});

/** The signatories' positions, which a statement keeps only when they are typed in. */
const POSITIONS = ['preparedPos', 'checkedPos', 'approvedPos'] as const;

export function statementOf(d: StatementDraft, status: StatementStatus = 'Sent'): Statement {
  const b: Statement = {
    no: d.no.trim(), date: d.date, invoiceDate: d.invoiceDate, due: d.due, client: d.client.trim(), attention: d.attention.trim(),
    lines: lineItemsOf(d.lines, 'unit'), vat: d.vat, ewt: d.ewt, ewtRate: d.ewtRate, notes: d.notes, note: d.note, penalty: d.penalty.trim(),
    prepared: d.prepared.trim(), checked: d.checked.trim(), approved: d.approved.trim(), status,
  };

  for (const key of POSITIONS) {
    const value = d[key].trim();

    if (value) b[key] = value;
  }

  const address = d.address.trim();

  if (address) b.address = address;

  return b;
}

// ---------- the account a client pays into (when Bank Accounts is installed) ----------

/** The account lines of the payment instructions, in the order they are written. */
const ACCOUNT_LINES: [label: string, value: (a: BankAccount) => string][] = [
  ['Bank', (a) => (a.branch ? `${a.bank}, ${a.branch}` : a.bank)],
  ['Account Name', (a) => a.name],
  ['Account Number', (a) => a.number],
];

/** "Account Number: 4011 0258 68" → "Account Number"; any other line → undefined. */
const accountLineOf = (line: string) => ACCOUNT_LINES.find(([label]) => new RegExp(`^\\s*${label}\\s*:`, 'i').test(line))?.[0];

/** An account number by its letters and digits, so "4011-0258-68" and "4011 0258 68" are the same account. */
const numberKey = (n: string) => n.replace(/[^0-9a-z]/gi, '').toLowerCase();

/**
 * The payment instructions with their account lines (Bank, Account Name, Account Number) naming this account, where
 * the first of them was; the rest of the text is kept. Text with no account lines gets them at the top.
 */
export function payInto(notes: string, a: BankAccount): string {
  const lines = notes.split('\n');
  const block = ACCOUNT_LINES.map(([label, value]) => `${label}: ${value(a)}`);
  const at = lines.findIndex((l) => accountLineOf(l));

  if (at < 0) return notes.trim() ? [...block, '', ...lines].join('\n') : block.join('\n');
  const rest = lines.filter((l) => !accountLineOf(l));
  rest.splice(at, 0, ...block);

  return rest.join('\n');
}

/** The account the payment instructions name on their Account Number line, if it is one of these. */
export function paidInto(notes: string, accounts: BankAccount[]): BankAccount | undefined {
  const line = notes.split('\n').find((l) => accountLineOf(l) === 'Account Number');
  const key = line ? numberKey(line.slice(line.indexOf(':') + 1)) : '';

  return key ? accounts.find((a) => numberKey(a.number) === key) : undefined;
}

/** The directory client a typed Bill to names, by its name however it is capitalised or spaced at the ends. */
export const clientNamed = (s: TerminalState, typed: string) => {
  const key = typed.trim().toLowerCase();

  return key ? recordsOf(s, 'Client').find((c) => c.name.trim().toLowerCase() === key) : undefined;
};

/**
 * Bill to as typed. Typing a directory client's name sets VAT, EWT and who to address from its record; any other name
 * leaves them as they are, to be set by hand.
 */
export function withClient(s: TerminalState, d: StatementDraft, client: string): StatementDraft {
  const c = clientNamed(s, client);

  return c ? { ...d, client, attention: c.attention ?? '', vat: c.vat ?? false, ewt: c.ewt ?? false } : { ...d, client };
}

export function saveStatement(s: TerminalState, d: StatementDraft, ctx: Ctx, asNew = false): Change<Statement> {
  const b = statementOf(d);
  const t = statementTotals(b);

  if (b.lines.some((l) => !l.qty)) throw new KeystoneError('Enter a quantity above zero on every charge.');

  if (!b.lines.length || t.subtotal <= 0) throw new KeystoneError('Add at least one charge with an amount.');

  if (!b.client) throw new KeystoneError('Enter who the statement is billed to.');

  if (b.ewt && !EWT_RATES.some((r) => r === b.ewtRate)) throw new KeystoneError(`Withhold ${EWT_RATES.join('% or ')}% EWT.`);

  // A new statement has no due date until Company Details says how many days clients have to pay.
  if (!b.due) throw new KeystoneError('Enter the due date.');

  if (b.due < (b.invoiceDate ?? b.date)) throw new KeystoneError('The due date is before the invoice date.');

  const original = d.editing ? s.bs.find((x) => x.no === d.editing) : undefined;

  if (original && !asNew) {
    if (original.status !== 'Sent') {
      throw new KeystoneError(`${original.no} is ${original.status.toLowerCase()} and can no longer be changed. Save it as a new statement instead.`);
    }

    const updated = { ...b, no: original.no, status: original.status };

    return {
      state: logged({ ...s, bs: s.bs.map((x) => (x.no === original.no ? updated : x)) }, TAG,
        `${updated.no} for ${nameOf(s, b.client)} edited (${peso(t.due)} due ${shortDate(b.due)}).`, ctx),
      record: updated, message: `${updated.no} updated.`,
    };
  }

  // A new statement keeps the number typed on it, unless that number is taken. A copy of a
  // saved one takes the next number.
  const no = original || !b.no ? nextStatementNo(s, b.date) : b.no;

  if (s.bs.some((x) => x.no === no)) throw new KeystoneError(`Invoice No. ${no} is already used. The next free one is ${nextStatementNo(s, b.date)}.`);
  const saved = { ...b, no };

  return {
    state: logged({ ...s, bs: [...s.bs, saved] }, TAG, `${saved.no} sent to ${nameOf(s, b.client)} (${peso(t.due)} due ${shortDate(b.due)}).`, ctx),
    record: saved, message: `${saved.no} saved and marked as sent.`,
  };
}

export function setStatementStatus(s: TerminalState, no: string, status: StatementStatus, ctx: Ctx): Change<Statement> {
  const b = s.bs.find((x) => x.no === no);

  if (!b) throw new KeystoneError(`${no} is not in the register.`);

  if (b.status === status) return { state: s, record: b, message: `${no} is already ${status.toLowerCase()}.` };

  if (b.status === 'Void') throw new KeystoneError(`${no} is void and stays void.`);
  const updated = { ...b, status };

  const text = status === 'Paid' ? `${no} from ${nameOf(s, b.client)} marked paid (${peso(statementTotals(b).due)}).`
    : `${no} marked ${status.toLowerCase()}.`;

  return {
    state: logged({ ...s, bs: s.bs.map((x) => (x.no === no ? updated : x)) }, TAG, text, ctx),
    record: updated, message: `${no} marked ${status.toLowerCase()}.`,
  };
}

/** Moves several statements to one status at once: every one, or none if any is refused. */
export const setStatementsStatus = (s: TerminalState, nos: readonly string[], status: StatementStatus, ctx: Ctx): Change<Statement[]> =>
  changeEach(s, nos, (st, no) => setStatementStatus(st, no, status, ctx), (bs) => `${count(bs.length, 'statement')} marked ${status.toLowerCase()}.`);

/** Settles a statement with a reported payment. A payment short of the amount due is refused. */
export function recordPayment(s: TerminalState, no: string, p: Payment, ctx: Ctx): Change<Statement> {
  const b = s.bs.find((x) => x.no === no);

  if (!b) throw new KeystoneError(`${no} is not in the register.`);

  if (b.status === 'Paid' || b.status === 'Void') throw new KeystoneError(`${no} is already ${b.status.toLowerCase()}.`);
  const due = statementTotals(b).due;
  const paid = toCentavos(p.amount);

  if (paid < due) throw new KeystoneError(`${peso(paid)} is less than the ${peso(due)} due on ${no}. Record it when the balance is paid.`);
  const updated = { ...b, status: 'Paid' as const };
  const how = [p.method, p.reference && `ref ${p.reference}`].filter(Boolean).join(' ');

  return {
    state: logged({ ...s, bs: s.bs.map((x) => (x.no === no ? updated : x)) }, TAG,
      `${no} from ${nameOf(s, b.client)} paid: ${peso(paid)}${how ? ` by ${how}` : ''}, reported on ${p.source}.`, ctx),
    record: updated, message: `${no} marked paid.`,
  };
}

/** Run on open: statements past their due date become Overdue. */
export function markOverdue(s: TerminalState, ctx: Ctx): TerminalState {
  const t = today(ctx);

  return s.bs.filter((b) => b.status === 'Sent' && b.due < t).reduce((acc, b) => setStatementStatus(acc, b.no, 'Overdue', ctx).state, s);
}

// ---------- what the billing domain tells Overview and Home ----------

export function billingFigure(s: TerminalState): Figure {
  const open = outstanding(s);

  return { label: 'Receivables outstanding', value: peso(outstandingTotal(s)), caption: `${count(open.length, 'statement')} open · ${overdue(s).length} overdue`, lead: true };
}

export function billingFinding(s: TerminalState): Finding | null {
  const late = overdue(s);

  if (!late.length) return null;
  const worst = late.reduce((a, b) => (statementTotals(b).due > statementTotals(a).due ? b : a));
  const more = late.length > 1 ? ` One of ${late.length} overdue statements.` : '';

  return { priority: 30, text: `${peso(statementTotals(worst).due)} from ${nameOf(s, worst.client)} has been overdue since ${shortDate(worst.due)}.${more}` };
}

export function billingWaiting(s: TerminalState): WaitingItem[] {
  return [...outstanding(s)].sort((a, b) => a.due.localeCompare(b.due)).map((b, i) => ({
    no: b.no, who: `${nameOf(s, b.client)} · due ${shortDate(b.due)}`, amount: statementTotals(b).due, status: b.status, tone: statementTone(b.status), rank: 10 + i,
  }));
}

// ---------- the service billing offers other parts ----------

/** Published as SERVICES.statementPayments, for any part that settles statements from outside billing. */
export const statementPayments: StatementPayments = {
  open: (s) => [...outstanding(s)].sort((a, b) => a.due.localeCompare(b.due))
    .map((b) => ({ no: b.no, client: nameOf(s, b.client), due: b.due, amount: statementTotals(b).due })),
  record: recordPayment,
};
