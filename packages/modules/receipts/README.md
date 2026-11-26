# Acknowledgement Receipts

## Owns
- `src/index.tsx`: the screen.
  - **Receipts issued** is the register, newest first. A row opens the receipt into the form; **Remove…** asks first.
  - The form sits beside the receipt as it prints, with Print, Export PDF, Save draft, and **Save as new** while editing.
  - The form follows the company's template, top to bottom:
    - Receipt No. (the next number, which can be changed), Date, Transaction No. and Reference;
    - Client / Payor name, Company name, Contact number and Email;
    - the particulars, each with its amount, and their total;
    - the mode of payment (cash, bank transfer or check), with the payment reference, the bank or channel, and, for a
      check, its number and date;
    - transaction remarks;
    - who received it, their position and the date received.
  - **E-signature:** a checkbox prints the receiver's saved signature (Company Details); unticked, the line is left blank
    to sign by hand (`receipts.esign`).
- `src/ReceiptPaper.tsx`: the acknowledgement receipt on one A4 page, from the kit's document blocks:
  - the letterhead;
  - the numbers;
  - Client information;
  - Payment details, with the total in figures and in words;
  - Mode of payment, with the mode ticked;
  - Transaction remarks;
  - the acknowledgement;
  - Received by: the company, then the receiver's name, position, signature and date;
  - the note that it is not an Official Receipt or Invoice for tax purposes.
- `src/rules.ts`: its rules, tested in `test/rules.test.ts`:
  - numbering `AR-2026-0001` and on, within the year;
  - saving, which needs who paid, at least one particular with its amount (a half-filled line is refused, naming it),
    and a check number for a check. A refusal names its field;
  - a new receipt is received by whoever is signed in (else the last receipt's receiver), in the last receipt's
    position;
  - repeated details (docs/adr/0053): a payor who paid before brings their company, contact and email from their last
    receipt into what is blank. The fields offer what was typed before, and a particular typed again brings its amount;
  - the log lines, which name the receipt, who paid, the total and how.

## Contributes
- **Home:** a tile, with the number issued.
- **Overview:** the "New acknowledgement receipt" button.
- **Activity:** log tag `AR`.
- **Draft key:** `receipts.draft`. **Save draft** keeps a receipt being written for everyone (docs/adr/0041).

## Needs
Nothing but the kernel. The company's name, address and the receiver's signature come from Company Details.

## Removing it
The screen, its tile, its button and its log filter disappear. Saved receipts stay in `state.json` under
`ext.receipts`, and in the cloud in `ext/receipts`, until a build with this module opens them again.
