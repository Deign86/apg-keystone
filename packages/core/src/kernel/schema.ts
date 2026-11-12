import type { ISODate } from './dates';

// The JSON keys are the prototype's localStorage schema, kept as-is so a saved state
// moves between the prototype and every Keystone build unchanged. Fields added since
// are all optional.

export type RecordType = 'Vendor' | 'Client' | 'Employee';

/** A value that survives a JSON round trip: what the saved state can hold. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const RECORD_TYPES: RecordType[] = ['Vendor', 'Client', 'Employee'];
export const CODE_PREFIX: Record<RecordType, string> = { Vendor: 'V-', Client: 'C-', Employee: 'E-' };
export const USED_IN: Record<RecordType, string> = { Vendor: 'Check Vouchers', Client: 'Billing Statements', Employee: 'the ID Maker' };

export interface DirectoryRecord {
  code: string;
  type: RecordType;
  name: string;
  tin: string;
  /** Address for vendors and clients, position for employees. */
  detail: string;
  dept?: string;
  /** Clients: whether statements add 12% VAT and withhold 5% EWT by default. */
  vat?: boolean;
  ewt?: boolean;
  email?: string;
  phone?: string;
  /** The same person or company in a connected system, by connector id: { attendance: "DEMO-001" }. */
  links?: Record<string, string>;
  /** Employees: a photo file name in the app's photo folder, for the ID Maker. */
  photo?: string;
  /** Clients: the person billing statements are addressed to ("Attention: …"). */
  attention?: string;
}

export interface LineItem {
  desc: string;
  /** Statement lines: how many, at `price` each. */
  qty?: number;
  /** Statement lines: the unit price in pesos, before tax. */
  price?: number;
  /** Older vouchers: the expense account. No longer entered. */
  acct?: string;
  /** Older statements: a per-line reference. No longer entered. */
  ref?: string;
  /** Pesos: the line's amount before tax (qty × price on statement lines). */
  amt: number;
}

export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export const VOUCHER_STATUSES = ['For Approval', 'Approved', 'Released', 'Void'] as const;

export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

export const STATEMENT_STATUSES = ['Sent', 'Paid', 'Overdue', 'Void'] as const;

export type StatementStatus = (typeof STATEMENT_STATUSES)[number];

export const ID_STATUSES = ['For printing', 'Active', 'Expired', 'Revoked'] as const;

export type IDStatus = (typeof ID_STATUSES)[number];

export type Status = VoucherStatus | StatementStatus | IDStatus;

const TONES: Record<Status, Tone> = {
  'For Approval': 'warn', Approved: 'good', Released: 'neutral', Void: 'neutral',
  Sent: 'neutral', Paid: 'good', Overdue: 'bad',
  'For printing': 'warn', Active: 'good', Expired: 'bad', Revoked: 'bad',
};

export const toneOf = (s: Status): Tone => TONES[s] ?? 'neutral';

export interface Voucher {
  no: string;
  date: ISODate;
  /** Directory code of the payee. */
  payee: string;
  /** Older vouchers: the bank account drawn on. No longer entered. */
  bank?: string;
  check: string;
  /** The date written on the check. */
  checkDate?: ISODate;
  lines: LineItem[];
  status: VoucherStatus;
  prepared: string;
  /** Printed as "Audited by" (the key is the prototype's). */
  checked: string;
  approved: string;
}

export interface Statement {
  /** The invoice number: a six-digit running number and the year, "010100-2026". */
  no: string;
  /** The statement's date ("Date:" at the top). */
  date: ISODate;
  /** The invoice date; older statements have only `date`. */
  invoiceDate?: ISODate;
  due: ISODate;
  /** Directory code of the client. */
  client: string;
  /** Who the statement is addressed to at the client. */
  attention?: string;
  /** Older statements: the billing period. No longer entered. */
  period?: string;
  /** Older statements: the contract or unit reference. No longer entered. */
  ref?: string;
  lines: LineItem[];
  vat: boolean;
  ewt: boolean;
  /** Payment instructions. */
  notes?: string;
  /** The closing note under the payment instructions. */
  note?: string;
  status: StatementStatus;
}

export interface IDRecord {
  no: string;
  /** Directory code of the employee, or "" when typed in by hand. */
  emp: string;
  name: string;
  pos: string;
  dept: string;
  issued: ISODate;
  valid: ISODate;
  blood: string;
  iceName: string;
  iceNo: string;
  signatory: string;
  status: IDStatus;
  /** The card photo: a file name in the app's photo folder. */
  photo?: string;
}

/** Built-in log tags; connectors and added modules log under their own tag. */
export type ModuleTag = 'CV' | 'BS' | 'ID' | 'DIR' | 'SYS' | (string & {});

export interface LogEntry {
  /** Local time, "yyyy-MM-dd HH:mm". */
  when: string;
  mod: ModuleTag;
  text: string;
}

/** Everything Keystone saves: one JSON document. */
export interface TerminalState {
  dir: DirectoryRecord[];
  cv: Voucher[];
  bs: Statement[];
  ids: IDRecord[];
  log: LogEntry[];
  /** Data that added modules keep, under their module id. Unknown keys are kept untouched. */
  ext?: Record<string, JsonValue>;
  /** The company's details, once someone fills them in on Company Details (docs/adr/0018). Read with `companyOf`. */
  company?: CompanyDetails;
}

/** The company as its documents print it: the letterhead and the contacts. */
export interface Company {
  name: string;
  address: string;
  contact: string;
  shortAddress: string;
  phone: string;
  billingEmail: string;
}

/** What a new voucher, statement or ID starts from. */
export interface Defaults {
  /** A new voucher's "Prepared by" when nobody is signed in. Signed in, it is the member's own name. */
  preparedBy: string;
  /** The voucher's "Audited by". */
  checkedBy: string;
  approvedBy: string;
  /** A statement's payment instructions: bank, account name and number, where to send proof. */
  paymentInstructions: string;
  /** A statement's closing note. */
  billingNote: string;
  signatory: string;
  /** Printed under a statement's dates: the late-payment penalty. */
  billingTerms: string;
  /** Days from a statement's date to its due date. 0 when not set: a new statement then starts with no due date. */
  dueInDays: number;
  /** Years an ID is valid. 0 when not set: a new ID then starts with no "valid until". */
  idValidYears: number;
}

/**
 * The company's details and what its documents start from, kept with the records and nowhere else (docs/adr/0018): in
 * the cloud an owner-only document, edited on Company Details. Nothing of it is built into Keystone.
 */
export interface CompanyDetails extends Company, Defaults {}

/**
 * A bank account the company pays checks from or asks clients to pay into. The Bank Accounts module keeps the list
 * (`state.ext.banks`) and publishes it as `SERVICES.bankAccounts`. A type, not an interface, so it fits in saved data.
 */
export type BankAccount = {
  /** "B-001". */
  id: string;
  /** The bank: "BPI". */
  bank: string;
  /** The branch, or "" when none is given. */
  branch: string;
  /** The account name, as the bank holds it. */
  name: string;
  /** The account number as it is printed: "4011 0258 68". */
  number: string;
};
