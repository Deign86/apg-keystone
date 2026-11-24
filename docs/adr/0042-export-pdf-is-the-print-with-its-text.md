# 0042. Export PDF is the print, with its text, on as many A4 pages as it takes

Status: Accepted · Date: 2026-11-24

## Context

- **Exported PDFs were tens of megabytes.** Export PDF drew the paper as one picture with html-to-image at 4× and put
  it in a jsPDF page as a PNG with no compression, so jsPDF stored every pixel raw: a two-up voucher was 42.8 MB, a
  statement of account 39.6 MB, and a user's 22-check statement of account 47.1 MB.
- **A long paper was squeezed onto one page.** That statement of account is about twice as tall as an A4 page is, and
  the picture was shrunk until it fitted on one, where Print runs it onto a second page.
- **The owner wants the PDFs editable,** not a picture in a PDF: names, ₱ amounts and dates as text that can be
  selected, searched and changed, lines as lines.
- **Keystone already lays every paper out for print** (docs/adr/0038, kit's `paper.ts`): the print stylesheet, each
  layout's @page rule and its fit. Print is what the papers were made for, and the browser paginates it.
- **Three ways to make a PDF with text:**
  - the webview's own print to PDF;
  - jsPDF's `html()`, which goes through html2canvas, cannot read the design system's colours and draws fonts its own
    way;
  - drawing each paper again with a PDF library, which would be a second layout of every paper to keep in step with
    the screen.

## Decision

- **Export PDF prints the paper to a PDF where the platform can** (`Platform.printPdf`, the `files.printPdf`
  capability). The page is set up exactly as Print sets it up (kit's `preparePrint`, shared with `printElement`), and
  the platform prints it. The PDF is the print: real text with its fonts embedded, lines as lines, the logo and
  signatures as the only pictures, on the pages Print makes.
- **On Windows the desktop app's native `print_pdf` command does it** (`src-tauri/src/lib.rs`). WebView2 is Chromium,
  and DevTools' `Page.printToPDF` takes the page's own @page size and margins (`preferCSSPageSize`). Backgrounds stay
  off, as Print leaves them: the paper prints its own tinted bands (`print-color-adjust`), and the window's dark
  background stays off the page.
- **Elsewhere the paper is drawn, the way it prints** (kit's `drawnPdf`): on a Mac, whose WebKit cannot print a page
  to a file without a print dialog, and in a browser, a phone's included.
  - Each page is drawn at 300 dpi for the size it takes on the page (`PDF_DPI`) and kept lossless, Flate-compressed.
  - An upright paper (`UPRIGHT`, `pdf.flow`) runs onto as many A4 pages as it needs, at the page's width inside the
    12 mm margins. It is cut where no table row, line of text, picture or block that asks to stay whole is cut
    (`pageCuts`).
  - One page-sized picture is drawn at a time, from one SVG of the paper, so no canvas is larger than a page.
- **A two-up voucher and a landscape sheet still fit one page,** as they print: their layouts do not flow.
- **The signature block stays on one page** when a paper runs onto another (`break-inside: avoid`), in Print and in
  both PDFs.
- **This amends docs/adr/0040:** a statement of account is upright on A4, on a second page when its checks run past
  the first.

## Consequences

- From the Windows app a PDF is about 200–280 KB for any paper, made in a fraction of a second; a 24-check statement of
  account is two pages. Drawn, it is about 160–560 KB a page and takes a few seconds.
- The two routes differ only in what the print can do that a picture cannot: on Windows the text is text and a table
  that runs onto a second page repeats its heading row, as Print does.
- A Mac's PDF is a picture until someone gives the macOS app a native print to file (an `NSPrintOperation` that saves
  without its panel). `printPdf` is where it would go, and nothing else would change.
- The end-to-end tests run in a browser, so they test the drawn route. The native route is tested against a stand-in
  for the native side (`desktop.test.ts`), and DevTools' answer is read in `cargo test`.
