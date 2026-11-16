# 0024. A voucher's payee is typed

Status: Accepted · Date: 2026-11-16

## Context

- **A voucher's payee was picked from the directory:** a dropdown of its vendors, clients and employees. The voucher
  kept the record's code and printed the record's name and address.
- **The owner wants the payee typed, as on the paper form:** a check often goes to someone who is not in the
  directory, and adding them there first, only to pay them once, is in the way.

## Decision

- **Check Vouchers types the payee and their address** (Payee and Address on the form), and a new voucher starts with
  neither. The voucher keeps what was typed: `payee` is the name and `address` the address.
- **Vouchers saved before keep their directory code,** and print and load that record's name and address (`payeeOf`
  in the vouchers module). Loading one into the form turns it into typed text; saving it keeps the text.
- **`vouchers.drafts` still takes a directory code:** a request for funds paid by check names its payee from the
  directory (docs/adr/0011), and the drafted voucher takes that record's name and address as text.
- **A vendor added to the directory is now said to be selectable in Requests for Funds,** the screen that still picks
  payees from it.

## Consequences

- **Good:** anyone can be paid without a directory record first, and a voucher keeps its payee as printed even if
  the record is later edited or removed.
- **Bad:** a typed name can be misspelt, and the directory's address is no longer filled in for you. A voucher's
  payee no longer protects a directory record from removal, except on vouchers saved before this.
