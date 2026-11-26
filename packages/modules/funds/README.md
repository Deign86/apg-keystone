# Requests for Funds

## Owns
- `src/index.tsx`: the screen. The CEO sees each request waiting for a decision as a card (amount, purpose, each
  expense, the account it is transferred to or the payee of its check, who asked, settle by) with an optional note,
  Decline and Approve, each asked first; the cards stack on a phone. The screen has two tabs: **Requests** (**Your
  requests** for staff signed in), with the cards above the register of requests, and **Request entry**, the form,
  named for the request open in it, or New. Opening a request, approving one, New request, and Overview's and Home's
  actions show the entry tab; which tab is shown is kept with the drafts (`funds.view`). The form to ask for funds: what it is for, the expenses (a description and an amount each, totalled), paid by bank
  transfer (bank, branch, account name, account number) or by check (the payee from the directory), and settle ASAP
  or by a date. Signed in, the requester is the member; with nobody signed in, they type their name. A request still
  waiting opens for its requester to edit or withdraw; any other opens read-only, with the CEO's answer and the
  voucher it drafted. A transfer shows its fund transfer request beside the form as it will print; once approved, the
  form has Print and Export PDF, for the CEO (it opens on approval) and for the requester.
- `src/Receipts.tsx`: under an approved request, its receipts (docs/adr/0050). Its requester adds the receipts or other
  proof of what the money paid for, a photo or a PDF each, and **Mark paid…** sends them, which marks it Paid. A paid
  request lists them, each with **Save…**, for the requester and the CEO.
- `src/receipt-file.ts`: a picked file as a receipt: a photo drawn again as a JPEG small enough to keep in the request,
  a PDF as it is.
- `src/TransferPaper.tsx`: the fund transfer request (docs/adr/0021), one A4 page from the kit's document blocks: the
  letterhead, who asked and when, the account to transfer to, the amount in figures and words, the expenses, and who
  asked and who approved, with when.
- `src/rules.ts`: its rules, tested in `test/rules.test.ts`:
  - numbering `RF-2026-0001` and on, from the last number given out (kept where every member reads it, because staff
    read only their own requests in the cloud);
  - filing, editing and withdrawing, by the requester only, while the request waits: the expenses (blank lines
    dropped, a half-filled line refused, naming it), and the account for a transfer or the payee for a check;
  - a blank request, paid as the person's last one was (a transfer when they have filed none), and a transfer starting
    with the account their last transfer went to;
  - deciding, by the CEO signed in to the cloud only (`ctx.who.role === 'owner'`); a decision is final. Approving a
    transfer makes its fund transfer request; approving a check drafts its voucher;
  - paying, by the requester only, once it is approved: at least one receipt, each a photo or a PDF, up to
    `RECEIPTS_MOST` in all; the request becomes Paid and keeps them (docs/adr/0050);
  - the log lines, which name a request's number and who filed, decided or paid it, never its purpose, amount,
    account or receipts;
  - a refused request names the fields it is about (`purpose`, `lines.1.desc`, `account.number`, `by`…), which the
    form marks and focuses (docs/adr/0044).
- The order: For Approval, then Approved, Declined or Withdrawn; an approved request becomes Paid once its requester
  uploads the receipts.

## Contributes
- **Overview:** the "Requests for funds" figure, each request waiting in the waiting list (ASAP ones first), and the
  "New request for funds" button.
- **Finding:** for the CEO, the requests waiting for a decision (priority 35 when one is ASAP, else 25); for a
  requester, the answer to their request for seven days (40: an approved transfer says to open it for its fund
  transfer request, and an approval says to upload the receipts), then their approved requests still waiting for
  receipts (20), then their requests still waiting (5); with nobody signed in, the requests waiting for the CEO
  (15).
- **Home:** a tile.
- **Activity:** log tag `RF`.
- **Cloud documents:** `documents` keeps each request in `keystone/apg/rf/{no}`, with `status`, `uid` and `decision`
  beside its body for `firestore.rules`, which let only the CEO decide and staff read only their own
  (docs/adr/0011), and let a requester move only their own approved request to Paid (docs/adr/0050). Its receipts
  are in the body. The expenses, the way it is paid and the account are in the body (docs/adr/0021). The rest of its
  data (the last number) stays in `ext/funds`.
- **Draft key:** `funds.draft`.
- **Save draft:** a request's work kept to whoever wrote it (`private`) as it is typed, and when the form or Keystone is
  left, listed under Drafts above their requests, opened again or deleted; sending it for approval finishes it
  (docs/adr/0041). Only its author, and the CEO's Keystone, hold it.
- **Directory:** the payee of a request paid by check is kept (`refersTo`), marked `RF`; a new vendor is said to be
  selectable in Requests for Funds (`selects`). A staff member's Keystone knows only their own requests in the cloud.

## Needs
- Directory records to pay (data, not the Directory module).
- `vouchers.drafts` from Check Vouchers, to draft the check voucher when the CEO approves a request paid by check:
  one particular, the request's purpose and number, for its total, For Approval. Without Check Vouchers the approval
  stands and the screen says that no voucher was drafted. A transfer needs nothing from Check Vouchers.
- A sign-in to decide anything: the cloud build's member, with role `owner`. A build that keeps its records on the
  computer files requests but never decides them.

## Removing it
Its figure, finding, waiting items, tile, button and log filter disappear. Saved requests stay in `state.json` under
`ext.funds`; in the cloud they stay in `rf`, unread, until a build with this module opens them again. Check Vouchers
keeps every voucher an approval drafted.
