# Keystone design

Keystone is an APG admin tool, so it uses the house style the other APG systems already share. Read this before
changing how any screen looks. The values live in `shared/design/tokens.json`. `npm run sync` turns them into the
Tailwind theme (`packages/ui/src/theme.css`), and CI fails if the two drift apart.

## Where the look comes from

| Source | What Keystone takes from it |
|---|---|
| **Attendance tracker** (`alpha-premier-attendance`, `client/src/styles.css`) | **The palette, exactly:** ground `#0b0a08`, surface `#151613`, raised `#1d1c17`, input `#0f100e`, ink `#f6f2e9`, line `#3a3426`, gold `#c6a254` / `#e1c477` / `#8d753e`, good `#98d2a8`, bad `#efaa92`.<br>**Fonts:** Orbitron for the greeting, the clock and figures; Poppins for everything else.<br>**Components:** the numbered key badges (filled gold when active), the outlined status capsules in Orbitron capitals, the count chips used as filters.<br>**Home screen:** the kiosk layout, with a status capsule and clock on top and the Orbitron greeting in the middle. |
| **Website admin** (`apg-website`, `src/routes/admin`) | The 236px labelled sidebar, the page header (small gold capitals over a big bold title), and the gold capitals over table columns. |
| **Alpha Branding Studio** (`Alpha_Branding`) | The `com.alphapremier.*` identifier family and dark-only windows. |
| **Taste Skill** (`.claude/skills/taste-skill`, app-screen rules; style `data-terminal` dealt with `--keep palette,type`) | The rules the brand doesn't settle:<br>• Surfaces are flat, with no shadows or gradients at rest.<br>• Colour goes only on data and the one primary action.<br>• The selected rail item is marked by a single 1px gold line on the rail's edge.<br>• KPIs are type in one strip split by lines, with no icon tiles.<br>• Figures are right-aligned with tabular digits; a missing value is a grey dash.<br>• Every title has one finding sentence under it, saying what needs attention, computed by `@keystone/core`. |
| **ui-skills** (`baseline-ui`, `fixing-accessibility`, `fixing-motion-performance`) | **Primitives:** Base UI for everything with keyboard or focus behaviour (selects, menus, dialogs, checkboxes, toasts), plus Tailwind with `cn()`.<br>**Interaction:** an alert dialog before anything destructive; errors shown next to the action that failed.<br>**Text:** `text-balance` on headings, `text-pretty` on paragraphs, tabular figures for data, nothing under 11px.<br>**Motion:** transform and opacity only, at most 200ms, and none under Reduce Motion.<br>**Layering and states:** a fixed z-index scale; every empty state offers one next action. |

## Brand exceptions, on purpose

These go against a skill rule because every APG system does them. Each one is marked in the code with
`taste-skill-ignore` and allowed by name in the inspector:

- **Gold tracked capitals:** screen eyebrows, table headers, status capsules. The inspector runs with
  `--allow micro-label`.
- **The cream ink `#f6f2e9`:** the attendance tracker's text colour. The inspector warns about it; it stays.
- **The 58px Orbitron greeting on Home:** the kiosk's own front door. Every other screen title is 34px.
- **Small type on the ID card:** the card is drawn at true CR80 size (54mm wide), so its 8px text is about 2mm, normal
  for a printed card. The ID Maker screen is inspected with `--allow tiny-text`; every other screen has nothing under
  11px.

The ID card's foil stripe is flat gold. There are no gradients anywhere.

## Rules

- **Colour:** gold goes on the one primary button of a screen, on document numbers, on the selected rail item and
  in status. Everything else is ink, grey or line.
- **Surfaces:** the ground, then a card one tone up with a 1px `line` border and radius 8. Only real overlays (menus,
  dialogs, toasts) have a shadow.
- **Type:** titles are Poppins 34 bold, body text 14, captions 12–12.5. Orbitron is used for the greeting, the clock,
  headline figures (24, with the lead at 30), and card titles (14–15).
- **Screen header:** the eyebrow (the section), then the title (a noun), then the finding (the one fact that matters
  on that screen). The finding never describes the interface.
- **Registers:**
  - Real `<table>` elements, with 45px rows and 1px lines.
  - The identity column takes the spare width, and figures are right-aligned.
  - One status capsule per row and one `⋯` menu at the far right.
  - Click a row, or press Enter on it, to load the record into the form.
- **Buttons:** primary is flat gold with dark ink; secondary is outlined; quiet has no outline. They are 36px tall (28px
  small) with radius 6, and scale to 0.97 when pressed.
- **Documents** (the voucher, the statement, the ID card) are drawn once. The same element is the live preview, the
  print and the PDF.

## Checks, and their latest results

```bash
npm run lint:taste
CHROME_PATH=<chromium> node .claude/skills/taste-skill/scripts/inspect.mjs "http://127.0.0.1:5174/#vouchers" --app --widths 1440,1100 --allow micro-label
```

On 2026-10-30:
- **Lint (app mode):** 0 fails.
- **Inspector:** 0 fails on all nine screens at 1440 and 1100px. That is the app's minimum window width, so a phone
  width isn't inspected.
- **Accessibility:** every control has a name, form errors are tied to their fields, dialogs trap focus, and toasts
  are announced. Registers can be used from the keyboard.
