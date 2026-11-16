# 0023. The check voucher prints a built-in address

Status: Accepted · Date: 2026-11-16 · Supersedes 0018 for the check voucher's address only

## Context

- **The check voucher's letterhead is the Group of Companies logo with the company's address beside it** (#51). The
  address came from Company Details, so a voucher printed no address until someone typed one there (docs/adr/0018).
- **The owner wants the address on every voucher without typing it:** it is the address of the office that issues the
  checks, and it does not change from one voucher, computer or set of records to the next.

## Decision

- **Every check voucher prints `Unit 3104C, Tektite East Tower Ortigas Center, Pasig, 1116 Metro Manila`** beside the
  logo, from `VOUCHER_ADDRESS` in `packages/modules/vouchers/src/VoucherPaper.tsx`, whatever Company Details holds.
- **Everything else in 0018 stands.** Company Details still fills the billing statement, the payroll sheet and the
  payslip, and no other company detail, record, signatory or account is built in.

## Consequences

- **Good:** a voucher always carries the office's address, on a new computer and in new records alike.
- **Cost and limits:** changing the address on vouchers is a code change and a release, not an edit in Company
  Details; and the voucher's address can differ from the one Company Details shows on other papers.
