# 0054. Acknowledgement Receipts, on the company's form

Status: Accepted · Date: 2026-11-26

## Context

- **The ask:** a module for acknowledgement receipts, like the company's template ("Alpha Premier Acknowledgement
  Receipt Template", revised).
- **The template** acknowledges a payment received. It has:
  - the receipt's number, date, transaction number and reference;
  - the client or payor, their company, contact number and email;
  - the particulars with their amounts, the total received, and the amount in words;
  - the mode of payment (cash, bank transfer or check), with the payment reference, bank or channel, and check number
    and date;
  - transaction remarks, a fixed acknowledgement, and who received it (name, position, signature, date);
  - a note that it is proof of payment, not an Official Receipt or Invoice for tax purposes.
- **Nothing else in Keystone does this.** A billing statement asks for payment; a check voucher pays out.

## Decision

- **A new part, `@keystone/module-receipts`** (route `#receipts`, log tag `AR`), like Statements of Account. It is a
  register, a form beside the paper it prints, saved drafts, Print and Export PDF.
- **Where the receipts are kept:** under `state.ext.receipts` (`{ receipts }`), one `ext` document in the cloud, which
  every member reads and writes, as Statements of Account are. No new collection, so `firestore.rules` and the cloud
  layout do not change.
- **Numbers:** `AR-2026-0001` and on, within the year. A new receipt can be given another number that is not taken.
- **The paper** follows the template's order and words, built from the kit's letterhead, meta rows, lines and
  signatures. The company's name and address come from core's `COMPANY` (0023).
- **Signatures:** the receiver signs by hand. Received by is whoever takes the payment, typed in, not a signatory
  picked from Company Details, so no saved signature prints and there is no e-signature option.
- **Repeated details (0053):**
  - a payor who paid before fills the company, contact and email;
  - the payor, company, bank or channel, receiver, position and remarks offer what was typed before;
  - particulars are remembered with their amounts;
  - a new receipt starts received by whoever is signed in, in the last receipt's position.
- **Released (0017):** it is in `RELEASED`, so every build opens it, not only a beta, because it was asked for for use.

## Consequences

- **Good:**
  - The company's receipt is issued, kept, printed and found again in Keystone, with the amount in words worked out
    for it.
  - Removing the module removes only the screen. The receipts stay saved.
- **Cost and limits:**
  - Every member reads and writes every receipt, as with Statements of Account. There is no approval step.
  - It is not an official receipt. The paper says so, and Keystone keeps no BIR series.
