# 0050. An approved request is paid once its requester uploads the receipts

Status: Accepted · Date: 2026-11-26

## Context

- **The next ask for Requests for Funds (0011, 0021):** after the CEO approves a request, and before it counts as
  paid, the person who asked for the funds uploads a proof or receipt of the purchase or expense.
- **What there was:** a request ended at Approved. Nothing showed what the money was spent on.
- **Where files can go:** Keystone keeps everything in its saved state, and in the cloud each request is one Firestore
  document, its body under 900,000 characters (`CLOUD_LAYOUT.maxBody`). There is no file store. Signatures (0045)
  already live in the records as data URLs.

## Decision

- **A new status, Paid,** after Approved: For Approval → Approved → Paid. Declined and Withdrawn are unchanged.
- **The requester uploads the receipts, and that marks the request paid** (`payRequest`). Nobody else does it, the CEO
  included. They pick one or more files, each a photo or a PDF, see the list, remove any, and press **Mark paid…**.
  It is asked first, and a paid request cannot change.
- **The receipts are kept in the request** (`receipts: [{ name, data }]`, with `data` a data URL), with the time they
  were uploaded (`paid`). A photo is drawn again as a JPEG at most 1,600 px on its long side, smaller until it is
  about 190 KB, which is still readable. A PDF is kept as it is. The rule refuses any other kind of file, and receipts
  that come to more than `RECEIPTS_MOST` (700,000 characters, about 510 KB), so that a request stays under the body limit.
- **Who sees them:** the requester and the CEO, who are the only ones who read the request (0011). A paid request shows
  each receipt with **Save…**. The fund transfer request keeps the approval and also says when it was paid.
- **What Home tells the requester:** the approval says to upload the receipts once the money is spent. After the
  week of news, an approved request that still has no receipts says so (priority 20) until it is paid.
- **firestore.rules:** `Paid` is one of the statuses of `rf` (and of `cloud-layout.json`). A member other than the owner
  may update their own request from Approved to Paid (`ownPaid`) if nothing beside the body changes except the
  status. Their uid and the CEO's decision stay exactly as they were.
- **The log** says `RF-2026-0001 paid; receipts uploaded by Ana Cruz.` It never gives the amount or the files.

## Consequences

- **Good:** every approved request is closed with its proof, which the CEO can look at, and nobody has to chase paper
  receipts.
- **Cost and limits:**
  - Receipts sit in the request's document, so the CEO's Keystone, which reads every request, downloads them too.
    One request holds at most about 510 KB of receipts. Many paid requests make that download larger. If it becomes
    slow, receipts can move to a file store (Firebase Storage), and the request would keep only their names.
  - When the requester marks a request paid, they write its body once more. That write is how the receipts get in. A
    member who goes past Keystone could change other text in the body during that write, as they could while it
    waited. The status, the requester and the decision are beside the body and are checked, so the approval itself
    cannot be forged.
  - A computer with no sign-in never approves a request (0011), so it shows receipts only on a request approved in
    the cloud and restored there. On that computer, whoever is there may upload them, as they may file a request.
  - Uploading receipts is all or nothing. Picked files are kept on the screen until they are sent. They are not saved
    as a draft, because receipts would be too large for one.
