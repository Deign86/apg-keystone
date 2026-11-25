import type { ISODate } from './dates';

// The JSON keys are the prototype's localStorage schema, kept as-is so a saved state
// moves between the prototype and every Keystone build unchanged. Fields added since
// are all optional.

export type RecordType = 'Vendor' | 'Client' | 'Employee';

/** A value that survives a JSON round trip: what the saved state can hold. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const RECORD_TYPES: RecordType[] = ['Vendor', 'Client', 'Employee'];
export const CODE_PREFIX: Record<RecordType, string> = { Vendor: 'V-', Client: 'C-', Employee: 'E-' };

export interface DirectoryRecord {
  code: string;
  type: RecordType;
  name: string;
  tin: string;
  /** Address for vendors and clients, position for employees. */
  detail: string;
  dept?: string;
  /** Clients: whether statements add 12% VAT and withhold expanded withholding tax by default. */
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

/** How a status reads at a glance. Which status has which tone is its module's to say. */
export type Tone = 'good' | 'warn' | 'bad' | 'neutral';

export interface Voucher {
  no: string;
  date: ISODate;
  /**
   * The payee's name as printed, typed on the voucher. A voucher saved before payees were typed holds a directory code
   * instead, and prints that record's name.
   */
  payee: string;
  /** The payee's address as printed, typed on the voucher. */
  address?: string;
  /** The payee's TIN as printed, when one is typed in; never taken from the directory. */
  tin?: string;
  /** The account the check is drawn on, as printed: "BPI · 4011 0258 68". */
  bank?: string;
  /** Who issues the check, printed beside the bank. */
  issuer?: string;
  check: string;
  /** The date written on the check. */
  checkDate?: ISODate;
  lines: LineItem[];
  /** As saved. The statuses a voucher goes through, and their tones, belong to the module that keeps vouchers. */
  status: string;
  /** The day it was released, on a released voucher. Older released vouchers have none. */
  released?: ISODate;
  /** The day it was voided, on a void voucher. Older void vouchers have none. */
  voided?: ISODate;
  prepared: string;
  /** Printed as "Audited by" (the key is the prototype's). */
  checked: string;
  approved: string;
  /** Each signatory's position, printed above their name: "CEO". */
  preparedPos?: string;
  checkedPos?: string;
  approvedPos?: string;
}

export interface Statement {
  /** The invoice number: 888 and the statement's date as month, day and year, "888112426" (older ones: "888-112426", "010100-2026"). */
  no: string;
  /** The statement's date ("Date:" at the top). */
  date: ISODate;
  /** The invoice date; older statements have only `date`. */
  invoiceDate?: ISODate;
  due: ISODate;
  /**
   * Who the statement is billed to, as printed, typed on it. A statement saved before Bill to was typed holds a
   * directory code instead, and prints that client's name.
   */
  client: string;
  /** Bill to's address, printed under its name, typed on the statement. A statement with none typed keeps none. */
  address?: string;
  /** Bill to's TIN, printed under its address, typed on the statement or brought from its directory record. A statement with none keeps none. */
  tin?: string;
  /** Who the statement is addressed to at the client. */
  attention?: string;
  /** How Bill to pays (check, bank transfer, cash), printed in the invoice box under the due date. A statement with none typed keeps none. */
  paymentMode?: string;
  /** Older statements: the billing period. No longer entered. */
  period?: string;
  /** Older statements: the contract or unit reference. No longer entered. */
  ref?: string;
  lines: LineItem[];
  vat: boolean;
  ewt: boolean;
  /** The percent of expanded withholding tax the statement withholds when `ewt` is on. Older statements have none and withheld 5. */
  ewtRate?: number;
  /** Payment instructions. */
  notes?: string;
  /** Notes, optional, printed under the penalty only when typed. A statement with none typed keeps none. */
  note?: string;
  /** The late-payment penalty, printed under the payment instructions. Older statements have none and print Company Details' terms. */
  penalty?: string;
  /** Who signs the statement, printed at its foot. Older statements have none. */
  prepared?: string;
  checked?: string;
  approved?: string;
  /** Each signatory's position, printed under their name: "Chief Executive Officer". Kept only when typed in. */
  preparedPos?: string;
  checkedPos?: string;
  approvedPos?: string;
  /** As saved. The statuses a statement goes through belong to the module that keeps statements. */
  status: string;
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
  /** As saved. The statuses an ID goes through belong to the module that keeps IDs. */
  status: string;
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
  /** Who saved it, when someone was signed in: their name (docs/adr/0049). Older entries, and a computer's own records, name nobody. */
  by?: string;
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
  /** A new voucher's or statement's "Prepared by" when nobody is signed in. Signed in, it is the member's own name. */
  preparedBy: string;
  /** The voucher's "Audited by", a statement's "Checked by". */
  checkedBy: string;
  approvedBy: string;
  /** A statement's payment instructions: bank, account name and number, where to send proof. */
  paymentInstructions: string;
  /** A statement's closing note. */
  billingNote: string;
  signatory: string;
  /** A new statement's penalty line, printed under its payment instructions: the late-payment penalty. */
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
export interface CompanyDetails extends Company, Defaults {
  /**
   * Each signatory's signature, an image (a data: URL), by their name in capitals with single spaces (`signatureKey`).
   * A document prints it above the name of whoever signs it (docs/adr/0038).
   */
  signatures?: Record<string, string>;
  /**
   * How large each signature is drawn, as a share of the standard height (1), by the same key as `signatures`: 0.5 to
   * 2. A signature with none is drawn at the standard height.
   */
  signatureSizes?: Record<string, number>;
  /**
   * Where each signature is moved to from its place on its line, in rem across (x, right is positive) and down (y), by
   * the same key as `signatures`: a manual correction where trimming left it off. None: on the middle of its line.
   */
  signatureOffsets?: Record<string, SignatureOffset>;
}

/** How far a signature is moved from its place on its line, in rem: right and down are positive. */
export type SignatureOffset = { x: number; y: number };

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
