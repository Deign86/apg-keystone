# 0047. Every PDF is text, on every platform: Keystone draws the paper as text, shapes and its real pictures

Status: Accepted · Date: 2026-11-25

## Context

- **docs/adr/0043 made a PDF with text only on Windows,** where WebView2 prints the page to a file. A Mac, a browser
  and a phone drew the paper as a 300 dpi picture.
- **The owner wants every PDF to have text,** in their words: "all pdf exports should have selectable text and be
  editable on their own using a pdf editor instead of just being a png slapped onto a pdf". That means text that can
  be selected and searched, in fonts a PDF editor can change, lines and boxes as shapes, and only real pictures as
  images.
- **The other ways to get there each fall short of one platform:**
  - A Mac's WebKit cannot print a page to a file without its print panel, and a browser or phone cannot print to a
    file at all.
  - A PDF library that lays the papers out again would be a second copy of every paper to keep in step with the
    screen.
- **The browser has already laid each paper out:** where every character, box, border and picture is, and in which
  font. Drawing that into a PDF is what printing does.
- **Poppins has no peso sign.** A browser drew each ₱ from whatever font the computer had (Segoe UI on Windows,
  something else on a Mac or a phone), and a PDF could not embed one.

## Decision

- **Keystone draws the paper into a PDF itself wherever the platform cannot print one** (kit's `paper-pdf.ts`,
  `paperPdf`). It reads the paper as the browser laid it out, and draws each part with jsPDF:
  - **text as text:** each line where the browser set it, in the font the page uses for it, embedded as only the
    glyphs used, with its Unicode, so it can be selected, searched and edited. Each line is spaced so it is exactly
    as wide as on screen, and each character takes the first font of its stack that has it, as the browser picks.
  - **backgrounds and borders as shapes:** the backgrounds first, then the borders, the heaviest last, as a table's
    collapsed borders let the heavier win where two meet.
  - **only real pictures as images:** the logo and signatures, at 300 dpi for the size they take, fitted and placed
    as the page fits them (`object-fit`, `object-position`).
- **Pages and placement follow docs/adr/0043:** an upright paper runs onto as many A4 pages as it needs at full width,
  cut between rows and lines; the two-up voucher and the payroll sheet each fit one page, centred.
- **The Windows app keeps printing the page to a PDF,** which is Chromium's own print and repeats a table's heading
  row on its next page.
- **Keystone Peso** (`shared/fonts/KeystonePeso-*.ttf`, `scripts/build-peso-font.py`) is the peso sign for each
  weight of Poppins: its capital P with two bars across it. Poppins is under the SIL Open Font License and reserves no
  font name, so a modified version is allowed (`OFL-KeystonePeso.txt`). It comes right after Poppins (and Orbitron) in
  the font stacks, so it draws the ₱ alone, the same on screen, in Print and in every PDF.
- **html-to-image is no longer used,** and is removed from kit.

## Consequences

- A PDF from a Mac, a browser or a phone is about 100–125 KB, where a picture was 160–860 KB. A PDF reader finds the
  same text in it as in the Windows app's: `e2e/papers.e2e.ts` reads each one with pdf.js, which is in
  devDependencies for the tests alone.
- The ₱ on screen is now the Poppins-matched one everywhere, where it was each computer's own.
- Drawing covers what the papers use: text, backgrounds, solid, dashed and dotted borders, rounded corners and
  pictures. A paper that starts using shadows, gradients or text drawn by CSS (`::before`) shows them on screen and
  in Print but not in a PDF drawn this way. The e2e checks and a look at the PDF will show it.
- Orbitron is a variable font and embeds at its lightest weight; a heavier title is drawn with an outline as thick as
  the difference.
