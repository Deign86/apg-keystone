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
}

export interface LineItem {
  desc: string;
  acct?: string;
  ref?: string;
  /** Pesos. */
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
  bank: string;
  check: string;
  lines: LineItem[];
  status: VoucherStatus;
  prepared: string;
  checked: string;
  approved: string;
}

export interface Statement {
  no: string;
  date: ISODate;
  due: ISODate;
  /** Directory code of the client. */
  client: string;
  period: string;
  ref: string;
  lines: LineItem[];
  vat: boolean;
  ewt: boolean;
  notes?: string;
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
}

export interface Company {
  name: string;
  address: string;
  contact: string;
  shortAddress: string;
  phone: string;
  billingEmail: string;
}

export interface Defaults {
  preparedBy: string;
  checkedBy: string;
  approvedBy: string;
  billingPeriod: string;
  paymentInstructions: string;
  signatory: string;
  billingTerms: string;
  dueInDays: number;
  idValidYears: number;
}

export interface ReferenceData {
  accounts: string[];
  banks: string[];
  bloodTypes: string[];
  defaults: Defaults;
}

/** shared/data/seed.json */
export interface Seed {
  company: Company;
  reference: ReferenceData;
  state: TerminalState;
}
