# 0036. A billing statement follows the company's form, its client is typed, and it withholds 2% or 5%

Status: Accepted · Date: 2026-11-19

## Context

- **The company's own Billing Statement** (Billing 2026-09258) has the title on a band across the top, the logo and
  address with the date, Bill To and Attention, an invoice box (number, invoice date, due date, the penalty terms),
  the charges, a totals box (Subtotal, VAT (12%), Total Amount Due), payment instructions, notes, and Prepared by,
  Checked by and Approved by. Keystone's statement had a letterhead, a facts box and the totals under the charges, and
  no signatures.
- **The owner wants the statement headed as the check voucher is,** so the two papers read alike.
- **The owner wants the totals box to show the expanded withholding tax line, and there are two rates:** 2% on
  services and 5% on rentals and professional fees. Keystone withheld 5% on every statement.
- **The client is wanted typed, for now,** as a voucher's payee is (docs/adr/0024): a statement often goes to someone
  not in the directory.
- **A statement's Pay into listed the accounts, while a voucher's Bank could also add one under Others… and remove
  one.** The owner wants both to work the same way.

## Decision

- **The printed statement follows the form,** in the house paper style (gold on white, not the form's orange), headed
  with the check voucher's masthead (the Group of Companies logo, the address beside it, the title, number and date)
  rather than the form's title band: Bill to and Attention, the invoice box, Qty · Description · Unit price · Amount
  (before tax), then a totals box with every line shown: Subtotal, VAT (12%), Less: EWT (2% or 5%) and the total amount
  due, a dash where a tax does not apply. Then payment instructions, notes and the three signatures. It still prints
  twice on one A4 sheet, as the voucher does.
- **A statement keeps who signs it** (`prepared`, `checked`, `approved`, optional). A new one is prepared by whoever is
  signed in; checked and approved as the last statement was, Company Details' names before the first.
- **A statement keeps its EWT rate** (`ewtRate`, optional), 2 or 5 (`EWT_RATES`), picked on the form once withholding
  is ticked; a new one starts at 2. One saved before has none, withheld 5%, and still does (`ewtRateOf`), so no amount
  due, payment or overdue figure already issued changes.
- **Bill to is typed,** and `client` keeps the name as printed. Typing a directory client's name brings its VAT, EWT
  and Attention; any other name leaves them to be set by hand. A statement saved before keeps its directory code and
  prints and loads that client's name. A client added to the directory is still said to be selectable in Billing
  Statements, where typing its name brings its setup.
- **One bank account list in the kit:** `BankAccountPicker` in `@keystone/kit`, used by a voucher's Bank and a
  statement's Pay into. It lists the accounts from the bank-accounts service, adds one typed under Others… and removes
  the one picked. A new statement pays into the account the last statement named, as a new voucher is drawn on the last
  voucher's bank, else the one Company Details' instructions name, else the first kept.

## Consequences

- **Good:** the statement reads as the company's own form and looks like the voucher; accounts are added where they
  are needed on either paper; statements already issued keep their totals.
- **Bad:** a typed client can be misspelt, and a statement's client no longer protects a directory record from removal,
  except on statements saved before this. The rate is picked by hand: a client's directory setup says whether it
  withholds, not at which rate.
