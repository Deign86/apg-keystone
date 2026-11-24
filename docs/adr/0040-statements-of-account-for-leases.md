# 0040. Statements of account for leases are a module of their own, upright on one A4 page

Status: Accepted · Date: 2026-11-24

## Context

- **The company has a Statement of Account form for a lease,** drawn on its side, marked up by hand (Nov 24, 2026):
  Client, Property Address, Lease Terms, Payee and "Prepared as of", then (1) a breakdown of the monthly rent, "SQM |
  RATE | TOTAL BASE RENT (with formulation)": base rent, 12% VAT, less 5% EWT; (2) the deposit and advance,
  "Description | Amount | Qty | Total amount", with Coverage and Check no., the reservation "1 month deductible"; (3) the
  lease term and escalation; (4) the postdated checks, one a month (No., Check date, Bank, Check number, Amount,
  Payment for), each dated the 28th of the month before the rent it pays. Then the contract commencement and notes.
  (Changed 2026-11-24, from the leasing manager: a check is dated in the month it pays, so its date and its
  "Payment for" name the same month.)
- **The owner wants it upright,** and the computation shown, not only the totals.
- **Its numbers reconcile as one formula:** ₱212,640 base rent (354.4 sqm × ₱600) is ₱227,524.80 after 12% VAT and 5%
  EWT on the base, and two months of that is the form's ₱455,049.60 advance; the deposit is months of base rent. The
  form's sample checks (₱653,828.30) are from another lease and do not reconcile with its deposit.
- **A Billing Statement bills charges; this states a lease.** Its inputs (area, rate, term, escalation, checks) and
  its paper share nothing with a statement's lines, numbering, statuses or payments.

## Decision

- **A new module, `soa` (Statements of Account),** its own package, kept under `state.ext.soa` as `{ statements }`
  (one `ext` document in the cloud, as Bank Accounts' are), numbered `SOA-2026-001` within the year, log tag `SOA`.
- **The computation lives in its rules:** base rent = area × rate; VAT 12% and EWT 5% on the base rent, each a tick;
  monthly rent = base + VAT − EWT. On signing: the deposit in months of base rent plus the advance in months of rent,
  less the reservation paid. Each lease year's base rent is the year before's plus the escalation, from the second
  year. The checks run one a month from the month after the advance (or the month set), for as many months as the
  advance does not pay (or the number set), each for its month's rent in its lease year, numbered on from the first.
- **The paper is upright, one A4 page** (the kit's `Sheet`), under the letterhead every paper carries (docs/adr/0038),
  each part a ruled table with a Computation column where the form asks for the working, its lines banded white and
  gold as every paper's are (docs/adr/0039).
- **It opens in every build:** its id is in `RELEASED` (docs/adr/0017). It shipped in beta builds first, the same day.

## Consequences

- Nothing else changes: it asks for no service and provides none. Removing it takes its rail entry, Home tile, Overview
  button and log filter; saved statements stay in `state.json`.
- Checks are generated, not typed one by one: a skipped check number or a different amount in one month cannot be set.
  That waits for someone to need it.
- Home has ten tiles.
