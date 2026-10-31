import type { ISODate } from './dates';
import type { Centavos } from './money';
import type { Statement, TerminalState } from './schema';
import type { Change, Ctx } from './state';

// Published service contracts. When one part needs something another part does, the
// provider offers it under a name (ModuleDef.provides) and the consumer asks for it by
// that name (ModuleApp.service). Neither imports the other: both see only the contract
// here, the way an OSGi API bundle sits between provider and consumer. If the provider
// is not installed, the consumer gets `undefined` and says so, or declares `requires`.

export const SERVICES = {
  /** Offered by the billing module; used by the website's payment matching. */
  statementPayments: 'billing.statement-payments',
} as const;

/**
 * Each published name with its contract, so a provider is checked against the contract and
 * a lookup returns it typed. A new service adds its name to SERVICES and a line here.
 */
export interface ServiceContracts {
  [SERVICES.statementPayments]: StatementPayments;
}

export type ServiceName = keyof ServiceContracts;

/** What a module offers: some of the published services, each implementing its contract. */
export type ServiceProviders = { [N in ServiceName]?: ServiceContracts[N] };

export interface Payment {
  /** Pesos received. */
  amount: number;
  method?: string;
  reference?: string;
  /** Where the payment was reported: "the website (ticket APG-1A2B3C4D)". */
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
