import type { ISODate } from './dates';
import type { Centavos } from './money';
import type { BankAccount, Statement, TerminalState } from './schema';
import type { Change, Ctx } from './state';

// Published service contracts. When one part needs something another part does, the
// provider offers it under a name (ModuleDef.provides) and the consumer asks for it by
// that name (ModuleApp.service). Neither imports the other: both see only the contract
// here, the way an OSGi API bundle sits between provider and consumer. If the provider
// is not installed, the consumer gets `undefined` and says so, or declares `requires`.

export const SERVICES = {
  /** Offered by the billing module, for settling statements from outside it. */
  statementPayments: 'billing.statement-payments',
  /** Offered by the timekeeping module: an employee's days over a period, for pricing a payroll cut-off. */
  employeeAttendance: 'timekeeping.employee-attendance',
  /** Offered by the banks module: the company's bank accounts, for a document that says where to pay. */
  bankAccounts: 'banks.bank-accounts',
} as const;

/**
 * Each published name with its contract, so a provider is checked against the contract and
 * a lookup returns it typed. A new service adds its name to SERVICES and a line here.
 */
export interface ServiceContracts {
  [SERVICES.statementPayments]: StatementPayments;
  [SERVICES.employeeAttendance]: EmployeeAttendance;
  [SERVICES.bankAccounts]: BankAccounts;
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

export interface BankAccounts {
  /**
   * The company's bank accounts, in the order they were added. Until any is saved, the reference data's
   * (`ctx.seed.reference.bankAccounts`), which is why it takes the context.
   */
  accounts(state: TerminalState, ctx: Ctx): BankAccount[];
  /** How an account is named in a list: "BPI · 4011 0258 68". */
  label(account: BankAccount): string;
}
