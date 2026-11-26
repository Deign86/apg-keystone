import type { MemberAccount, NewAccount } from './accounts';
import type { ISODate } from './dates';
import type { Centavos } from './money';
import type { BankAccount, CompanyDetails, SignatureOffset, Statement, TerminalState, Voucher } from './schema';
import type { Change, Ctx, PayoutAccount } from './state';

// Published service contracts. When one part needs something another part does, the
// provider offers it under a name (ModuleDef.provides) and the consumer asks for it by
// that name (ModuleApp.service). Neither imports the other: both see only the contract
// here, the way an OSGi API bundle sits between provider and consumer. If the provider
// is not installed, the consumer gets `undefined` and says so. One service is offered by
// the platform instead of a module (`Platform.provides`): the accounts, which only a
// build that signs in has.

export const SERVICES = {
  /** Offered by the billing module, for settling statements from outside it. */
  statementPayments: 'billing.statement-payments',
  /** Offered by the timekeeping module: an employee's days over a period, for pricing a payroll cut-off. */
  employeeAttendance: 'timekeeping.employee-attendance',
  /** Offered by the banks module: the company's bank accounts, for a document that says where to pay. */
  bankAccounts: 'banks.bank-accounts',
  /** Offered by the vouchers module: a check voucher drafted for spending approved elsewhere (a request for funds). */
  voucherDrafts: 'vouchers.drafts',
  /** Offered by the platform of a build that signs in: who may open the records in the cloud (docs/adr/0014, 0033). */
  accounts: 'platform.accounts',
  /** Offered by the company module: resizing and moving a signatory's signature where a paper shows it. */
  signatureSizes: 'company.signature-sizes',
} as const;

/**
 * Each published name with its contract, so a provider is checked against the contract and
 * a lookup returns it typed. A new service adds its name to SERVICES and a line here.
 */
export interface ServiceContracts {
  [SERVICES.statementPayments]: StatementPayments;
  [SERVICES.employeeAttendance]: EmployeeAttendance;
  [SERVICES.bankAccounts]: BankAccounts;
  [SERVICES.voucherDrafts]: VoucherDrafts;
  [SERVICES.accounts]: Accounts;
  [SERVICES.signatureSizes]: SignatureSizes;
}

export type ServiceName = keyof ServiceContracts;

/** What a module offers: some of the published services, each implementing its contract. */
export type ServiceProviders = { [N in ServiceName]?: ServiceContracts[N] };

export interface Payment {
  /** Pesos received. */
  amount: number;
  method?: string;
  reference?: string;
  /** Where the payment was reported: "the bank deposit slip of Oct 30". */
  source: string;
}

/** A statement that can still be paid, as a consumer of the service sees it. */
export interface OpenStatement {
  no: string;
  /** The client's name. */
  client: string;
  due: ISODate;
  amount: Centavos;
}

export interface StatementPayments {
  /** Statements still to be paid, earliest due first. */
  open(state: TerminalState): OpenStatement[];
  /** Settles a statement with a reported payment; refuses a short one. */
  record(state: TerminalState, no: string, payment: Payment, ctx: Ctx): Change<Statement>;
}

/**
 * An employee's days over a period, counted by the attendance rules and not yet priced. Payroll turns these into
 * pesos with the employee's own rates; the attendance rules (schedule, grace, half days) stay with timekeeping. A type,
 * not an interface, so a payroll can keep a copy in its saved data.
 */
export type AttendanceTally = {
  /** Scheduled working days in the period, holidays included: the payroll sheet's "Standard Working Days". */
  scheduled: number;
  /** Scheduled days so far with a time-in, half days included. */
  worked: number;
  /** Of the days worked, those that count as half a day. */
  halfDays: number;
  /** Scheduled days so far with no time-in, holidays not counted. */
  absent: number;
  /** Regular holidays on a scheduled day that were not worked: paid all the same. */
  regularHolidaysOff: number;
  /** Days worked that were special non-working holidays. */
  specialHolidaysWorked: number;
  /** Days worked that were regular holidays. */
  regularHolidaysWorked: number;
  /** Minutes late (after the weekly grace) and minutes left early, on days that are not half days. */
  shortMinutes: number;
  /** Approved overtime, in hours. */
  overtimeHours: number;
  /** Paid minutes in a full working day, to price a minute or an hour. */
  dayMinutes: number;
};

export interface EmployeeAttendance {
  /** The tally for one employee (a directory code) from one date to another, both included. */
  tally(state: TerminalState, emp: string, from: ISODate, to: ISODate, ctx: Ctx): AttendanceTally;
}

/** Resizing a signature from a paper, by the rules Company Details keeps signatures by. */
export interface SignatureSizes {
  /** Whether whoever is signed in may resize signatures: the CEO, or anyone on a computer nobody signs in on. */
  canResize(ctx: Ctx): boolean;
  /** Draws whoever is named's signature at `size` of the standard height, on every paper; 1 is the standard. */
  resize(state: TerminalState, name: string, size: number, ctx: Ctx): Change<CompanyDetails>;
  /** Moves whoever is named's signature by `offset` from its place on its line, on every paper; zero puts it back. */
  move(state: TerminalState, name: string, offset: SignatureOffset, ctx: Ctx): Change<CompanyDetails>;
}

export interface BankAccounts {
  /** The company's bank accounts as saved, in the order they were added. None until someone adds one. */
  accounts(state: TerminalState): BankAccount[];
  /** How an account is named in a list: "BPI · 4011 0258 68". */
  label(account: BankAccount): string;
  /**
   * Keeps an account not in the list yet, last, under the next number, as the Bank Accounts screen adds one. Refuses
   * one without its bank, account name or account number, or with a number already kept.
   */
  add(state: TerminalState, account: Omit<BankAccount, 'id'>, ctx: Ctx): Change<BankAccount>;
  /** Removes a kept account. Whatever was saved naming it (a voucher's bank, a statement's instructions) keeps the text. */
  remove(state: TerminalState, id: string, ctx: Ctx): Change<BankAccount>;
}

/** Spending approved elsewhere, to be paid by check: one amount to one payee. */
export interface VoucherRequest {
  /** Directory code of the payee. */
  payee: string;
  /** Pesos. */
  amount: number;
  /** The voucher's one particular: what the money is for, and the record it was approved on. */
  particulars: string;
}

export interface VoucherDrafts {
  /**
   * Saves a voucher For Approval under the next number, with the signatories and bank a new voucher starts with and no
   * check yet, for accounting to complete. Refuses a payee missing from the directory, or no amount.
   */
  draft(state: TerminalState, request: VoucherRequest, ctx: Ctx): Change<Voucher>;
}

/**
 * Who may open the records in the cloud, and the sign-in of whoever is using Keystone now. Every method throws the
 * sentence to show when it is refused or cannot be done.
 */
export interface Accounts {
  /** Everyone who may open the records. */
  list(): Promise<MemberAccount[]>;
  /**
   * Makes a sign-in with this email and password and makes it a staff member, leaving the CEO signed in. Only an
   * owner may; when refused, no sign-in is left behind.
   */
  create(account: NewAccount): Promise<MemberAccount>;
  /**
   * Takes a member's access away: their member document goes, so they open nothing from then on (docs/adr/0015). Their
   * sign-in itself stays, since only a server can delete someone else's. Only an owner may, and never their own.
   */
  remove(uid: string): Promise<void>;
  /**
   * Changes the password of the member signed in, after checking their current one (docs/adr/0016). They stay signed
   * in here.
   */
  changePassword(current: string, next: string): Promise<void>;
  /**
   * Changes the name of the member signed in, as Keystone shows them to everyone (docs/adr/0020). Their role and email
   * stay. The rail and the rules see the new name from the next change on, so log one after.
   */
  rename(name: string): Promise<void>;
  /**
   * Keeps the bank account of the member signed in, or with null forgets it (docs/adr/0052). Only they, or an owner,
   * change it; their requests for funds by transfer start with it. Absent where it cannot be kept.
   */
  setBank?(bank: PayoutAccount | null): Promise<void>;
  /**
   * Gives a staff member something a connected system lets the CEO give (`MemberGrant.field`), or takes it back
   * (docs/adr/0030). Only an owner may, and only a field a connector contributed. Absent where it cannot be kept.
   */
  setGrant?(uid: string, field: string, on: boolean): Promise<void>;
}
