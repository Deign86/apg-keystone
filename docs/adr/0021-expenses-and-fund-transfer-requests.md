# 0021. A request lists its expenses, and an approved transfer makes a fund transfer request

Status: Accepted · Date: 2026-11-15

## Context

- **Sir Mark's next ask for Requests for Funds (0011):** the HR supervisor, who keeps the fund the office spends
  from, writes up the company's expenses for Sir Mark's approval. Sir Mark reviews it, and on approval a PDF is made
  asking for the total to be transferred to the account that fund is kept in. That transfer is the fund's new money.
- **What 0011 built does not fit it:**
  - A request is one purpose for one amount. An expense report is many lines.
  - An approval drafts a check voucher to a payee in the directory. A transfer goes to a bank account, and nothing is
    printed for it.
- **0011's check flow is still wanted** for a payment to a supplier, such as the venue deposit for the Christmas party.
- **Nothing is built in (0018).** The account the fund is kept in is the requester's to give, never a value in the code.

## Decision

- **Every request lists its expenses:** each a description and an amount, entered as voucher lines are (the kit's
  `LineEditor`). The amount is their total. Blank lines are dropped. A line with only a description, or only an
  amount, is refused, naming the line. "What it is for" stays, as the request's one line.
- **A request is paid by bank transfer or by check** (`pay`):
  - **Bank transfer:** the account to transfer to (bank, optional branch, account name, account number), typed on the
    request. Approving drafts nothing. It makes the **fund transfer request**: a paper with the letterhead, the
    request's number, the account, the amount in figures and words, the expenses, who asked, and who approved and when.
    Print and Export PDF show once it is approved, for the owner and for the requester.
  - **Check:** a payee from the directory, and an approval drafts the check voucher through `vouchers.drafts`, as in
    0011.
  - A first request is a transfer. After that, a request starts as that person's last one was paid, and a transfer
    starts with the account their last transfer went to. The fund is topped up into the same account each time, and
    the requester types it once.
- **The owner sees what is being approved:** the approval card lists each expense and the account the money goes to
  (or the payee, for a check). The confirmation names the account. Approving a transfer opens the request with its
  paper, ready to print or save.
- **Where it is kept:** the same request records, under `ext.funds` and in `keystone/apg/rf/{no}`, with three optional
  fields: `lines`, `pay` and `account`. A request saved before this reads as a check for its purpose, with no lines.
  `firestore.rules` do not change. The fields are in the body, which only the requester and the owner read, and which
  only the requester changes, and only while the request waits. Once decided, the account on the paper is the one
  the owner approved.
- **The activity log is unchanged:** it names a request and who filed or decided it, never the expenses, the amount or
  the account.

## Consequences

- **Good:**
  - The HR supervisor's expense report, Sir Mark's approval and the transfer request are one record and one paper.
  - Nobody retypes the expenses into a document after the approval.
  - Checks work as before. Check Vouchers is still optional: without it, a transfer loses nothing.
- **Cost and limits:**
  - Keystone does not send the money. The PDF goes to whoever makes the transfer.
  - The account is kept on each request as typed, not in Bank Accounts. Bank Accounts holds the company's own
    accounts, which Billing offers clients to pay into, so a person's account does not belong there.
  - A paper printed before the answer says it is not approved yet. Only an approved one shows Print and Export PDF.
  - Requests for Funds is still not in `RELEASED` (0017): a stable build shows it behind "Coming soon".
