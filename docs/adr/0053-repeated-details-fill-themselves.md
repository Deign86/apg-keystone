# 0053. Repeated details fill themselves, and fields offer what was typed before

Status: Accepted · Date: 2026-11-26

## Context

- **The ask:** details repeated across vouchers and other documents should fill themselves. That means the payee's
  details, notes, and items that come back often. It should hold on every form that needs it: Check Vouchers,
  Billing, Statements of Account, Requests for Funds.
- **What there was:**
  - A voucher already started with the last voucher's signatories, bank and issuer.
  - Billing filled a Directory client's VAT, EWT, TIN and Attention.
  - Everything else was typed again each time: a payee's address and TIN, a client not in the Directory, a lessee's
    property and bank, the same charges and notes month after month.
- **Nothing is built in (0018).** What a form offers must come from what was saved, never from a list in the code.

## Decision

- **Three shared pieces:**
  - **Core:** `earlier()` gives each earlier entry once, whatever its capitals and spaces, the newest first.
    `rememberedLines()` gives each line description once, with the quantity and amount last saved. `withLineDesc()`
    brings those onto a line typed again, but only while the line has no amount.
  - **UI:** `TextInput` takes `suggestions`, offered through the browser's own list as the field is typed. A field given
    it is a combobox to assistive technology, with or without entries yet, so it is always found the same way.
    `EarlierPicks` shows a few earlier entries of a longer text, under the field and only while it is blank, to put one
    back in with a tap.
  - **Kit:** `LineEditor` takes `remembered` lines. Its descriptions offer them, and picking one fills the line.
- **What each form fills.** Something already typed always stays; a fill only goes into a blank field.

  | Form | Typing this… | …fills what is still blank | Offers earlier |
  |---|---|---|---|
  | Check Vouchers | a payee paid before | their address and TIN, from their last voucher (or the Directory record an older voucher names) | payees, particulars |
  | Billing | a client billed before, in the Directory or not | address, TIN, Attention and mode of payment from their last statement; VAT and EWT too when not in the Directory | clients, Attention, mode of payment, charges, Notes |
  | Statements of Account | a client with a statement before | property, payee and title, lease terms, bank, floor area and rate from their last one | clients, properties, payees, titles, banks, Notes |
  | Requests for Funds | — | — | the person's own earlier purposes and expenses |

- **Requests for Funds offers only the person's own.** What one person spends on is not another's to reuse, even though
  every member reads every request (0051).

## Consequences

- **Good:**
  - A regular bill, the monthly statement to the same client or a lease renewal starts from the last one.
  - Nothing is invented. Everything offered was saved before, and every fill can be typed over.
- **Cost and limits:**
  - The browser draws the list of suggestions, so it looks slightly different in each browser.
  - A field that offers suggestions is a combobox, not a textbox, to assistive technology and to the tests.
  - Suggestions come from the records this computer holds. In the cloud that is every record a member reads.
