# Keystone design

Keystone is an APG admin tool, so it uses the house style the other APG systems already share. Read this before
changing how any screen looks. The values live in `shared/design/tokens.json`. `npm run sync` turns them into the
Tailwind theme (`packages/ui/src/theme.css`), and CI fails if the two drift apart.

## Where the look comes from

| Source | What Keystone takes from it |
|---|---|
| **Attendance tracker** (`alpha-premier-attendance`, `client/src/styles.css`) | **The palette, exactly:** ground `#0b0a08`, surface `#151613`, raised `#1d1c17`, input `#0f100e`, ink `#f6f2e9`, line `#3a3426`, gold `#c6a254` / `#e1c477` / `#8d753e`, good `#98d2a8`, bad `#efaa92`.<br>**Fonts:** Orbitron for the greeting, the clock and figures; Poppins for everything else.<br>**Components:** the numbered key badges (filled gold when active), the outlined status capsules in Orbitron capitals, the count chips used as filters.<br>**Home screen:** the kiosk layout, with the clock on top and the Orbitron greeting in the middle. |
| **Website admin** (`apg-website`, `src/routes/admin`) | The 236px labelled sidebar, the page header (small gold capitals over a big bold title), and the gold capitals over table columns. |
| **Alpha Branding Studio** (`Alpha_Branding`) | The `com.alphapremier.*` identifier family and dark-only windows. |
| **Taste Skill** (`.agents/skills/design-taste-frontend`, app-screen rules; style `data-terminal` dealt with `--keep palette,type`) | The rules the brand doesn't settle:<br>• Surfaces are flat, with no shadows or gradients at rest.<br>• Colour goes only on data and the one primary action.<br>• The selected rail item is marked by a single 1px gold line on the rail's edge.<br>• KPIs are type in one strip split by lines, with no icon tiles.<br>• Figures are right-aligned with tabular digits; a missing value is a grey dash (`DASH` in `@keystone/core`).<br>• Every title has one finding sentence under it, saying what needs attention, computed by `@keystone/core`. |
| **ui-skills** (`baseline-ui`, `fixing-accessibility`, `fixing-motion-performance`) | **Primitives:** Base UI for everything with keyboard or focus behaviour (selects, menus, dialogs, checkboxes, toasts), plus Tailwind with `cn()`.<br>**Interaction:** an alert dialog before anything destructive; errors shown next to the action that failed.<br>**Text:** `text-balance` on headings, `text-pretty` on paragraphs, tabular figures for data, nothing under 11px.<br>**Motion:** transform and opacity only, at most 200ms, and none under Reduce Motion.<br>**Layering and states:** a fixed z-index scale; every empty state offers one next action. |

## Brand exceptions, on purpose

These go against a skill rule because every APG system does them. Each one is marked in the code with
`taste-skill-ignore` and allowed by name in the inspector:

- **Gold tracked capitals:** screen eyebrows, table headers, status capsules. The inspector runs with
  `--allow micro-label`.
- **The cream ink `#f6f2e9`:** the attendance tracker's text colour. The inspector runs with `--allow palette-cream`.
- **The 58px Orbitron greeting on Home:** the kiosk's own front door. Every other screen title is 34px. Home is
  inspected with `--allow app-title-size`.
- **Small type on the ID card:** the card is drawn at true CR80 size (54mm wide), so its 8px text is about 2mm, normal
  for a printed card. The ID Maker screen is inspected with `--allow tiny-text`; every other screen, its papers
  included, has nothing under 11px.

The ID card's foil stripe is flat gold. There are no gradients anywhere.

One more comes from the papers, which are drawn to be printed:

- **The check voucher's black rules:** it is printed and filled in by hand, so it is ruled in black as the company's
  cash voucher is. The inspector reads those boxes as heavy panel borders, so Check Vouchers is inspected with
  `--allow heavy-borders`.

And one more from screens that have little to show in a new Keystone:

- **A short screen's blank first screen:** Overview, Directory, Activity Log, Bank Accounts and Data start empty
  (docs/adr/0018), and Profile and User Accounts have nothing to show where nobody signs in. The inspector's
  `hero-void` judges a landing page's first screen; the skill's app mode already skips its sibling rules (`no-hero`,
  `empty-screens`). Its `unused-canvas` counts only text, so a one-sentence screen trips it too. Those screens are
  inspected with `--allow hero-void`, and Data, Profile and User Accounts with `unused-canvas` as well. A screen with
  records fills its first screen.

## Rules

- **Colour:** gold goes on the one primary button of a screen, on document numbers, on the selected rail item and
  in status. Everything else is ink, grey or line.
- **Surfaces:** the ground, then a card one tone up with a 1px `line` border and radius 8. Only real overlays (menus,
  dialogs, toasts) have a shadow.
- **Type:** titles are Poppins 34 bold, body text 14. Anything read as a sentence or a label is 13: field labels,
  hints and errors, captions, notes, and small buttons. Only short sublines (a count, "Updates as you type") are 12,
  and the gold tracked capitals 11. That keeps under 45% of each screen's text below 13px, the inspector's line.
  Orbitron is used for the greeting, the clock, headline figures (24, with the lead at 30), and card titles (14–15).
- **Screen header:** the eyebrow (the section), then the title (a noun), then the finding (the one fact that matters
  on that screen). The finding never describes the interface.
- **Registers:**
  - Real `<table>` elements, with 45px rows and 1px lines.
  - The identity column takes the spare width, and figures are right-aligned.
  - A figure is never cut short. Where a window is too narrow for every column, the register leaves out a breakdown
    shown elsewhere (`detail` columns, such as the parts of gross pay on Payroll's cut-off) and keeps the totals.
  - One status capsule per row and one `⋯` menu at the far right.
  - Click a row, or press Enter on it, to load the record into the form.
- **Buttons:** primary is flat gold with dark ink; secondary is outlined; quiet has no outline. They are 36px tall (28px
  small) with radius 6, and scale to 0.97 when pressed.
- **Documents** (the voucher, the statement, the ID card) are drawn once. The same element is the live preview, the
  print and the PDF. The voucher and the statement are laid out at the paper's width (186 mm, A4 less the print
  margins) and scaled down on screen to fit the preview column, so a narrow window never rewraps or crops them. The
  payroll sheet is a landscape A4 (273 mm), and its 22-column table, wider than that, shrinks to fit across the paper.
  On paper, gold text is the darker `paperGold` (`#7d6936`), which reads at least 4.5:1 on white and on the pale gold
  band (`paperTint`) behind headings and totals.

## Checks, and their latest results

The inspector measures a production build, as people get it: the dev server's CSS isn't what ships, and the
inspector warns about it. A beta build opens every screen, and blank Firebase variables keep the records on the computer.

```bash
npm run lint:taste
VITE_KEYSTONE_CHANNEL=beta VITE_FIREBASE_API_KEY= VITE_FIREBASE_PROJECT_ID= VITE_FIREBASE_APP_ID= VITE_FIREBASE_AUTH_DOMAIN= npm run build:web
(cd apps/keystone && npx vite preview --port 4173)
CHROME_PATH=<chromium> node .agents/skills/design-taste-frontend/scripts/inspect.mjs "http://127.0.0.1:4173/#billing" --app --widths 1440,1100 --allow micro-label,palette-cream
```

Every screen takes `--allow micro-label,palette-cream`, and the exceptions above add their own:

| Screen | Also allowed |
|---|---|
| Home | `app-title-size` |
| Check Vouchers | `heavy-borders` |
| ID Maker | `tiny-text` |
| Overview, Directory, Activity Log, Bank Accounts | `hero-void` |
| Data, Profile, User Accounts | `hero-void`, `unused-canvas` |

On 2026-10-30:
- **Lint (app mode):** 0 fails.
- **Inspector:** 0 fails on all nine screens at 1440 and 1100px. That is the app's minimum window width, so a phone
  width isn't inspected.
- **Accessibility:** every control has a name, form errors are tied to their fields, dialogs trap focus, and toasts
  are announced. Registers can be used from the keyboard.

On 2026-11-11, Check Vouchers at 1440 and 1100px: 0 fails. The three-copy voucher had grown taller than the inspector
allows for a `data-ui` fragment at 1100px; drawing it at the paper's width and scaling it to the column fixed that.

On 2026-11-15, on the production build, every screen at 1440 and 1100px: 0 fails. Check Vouchers, Billing, Payroll and
Timekeeping have no warnings either. A paper is now as tall as what it holds: its old 420px minimum left a blank band
under a statement with no charges yet. Sentences and labels went from 12 to 13px. Payroll shows its sheet and payslips
once someone has pay set up; before that, where they will be.

Later on 2026-11-15, every screen at 1440 and 1100px, with the allowances above: 0 fails and 0 warnings. Overview's two
cards end level, and Home's Overview tile shows how many things wait on you (docs/adr/0021).

On 2026-11-15, `npm run lint:taste`: 0 fails and 0 warnings. The missing-value dash is one constant, `DASH` in
`@keystone/core`, not a literal in each screen; overlays, the brand eyebrow and a clock time carry `taste-skill-ignore`
on the line the lint reads.
