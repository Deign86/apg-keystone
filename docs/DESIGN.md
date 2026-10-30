# Keystone design

Keystone is an APG admin tool, so it wears the house style the other APG systems already share. Read this before
changing how any screen looks on either platform. The values live in `shared/design/tokens.json`.

## Where the look comes from

| Source | What Keystone takes from it |
|---|---|
| **Attendance tracker** (`alpha-premier-attendance`, `client/src/styles.css`) | The palette, exactly: ground `#0b0a08`, surface `#151613`, raised `#1d1c17`, input `#0f100e`, ink `#f6f2e9`, line `#3a3426`, gold `#c6a254` / `#e1c477` / `#8d753e`, good `#98d2a8`, bad `#efaa92`. Orbitron for the greeting and the clock, Poppins for the rest. The **numbered key badges** (filled gold when active). Outlined status capsules in Orbitron capitals. Count chips for filters. The kiosk home: status capsule and clock on top, the Orbitron greeting in the middle. |
| **Website admin portal** (`apg-website`, `src/routes/admin`) | The 236pt labelled sidebar. The page header: small gold capitals over a big bold title. Gold capitals for table headers. |
| **Alpha Branding Studio** (`Alpha_Branding`, `macos/`) | The two-platform pattern: a native SwiftUI Mac app and a XAML Windows app sharing one palette. The `build.sh` packaging approach and the bundle ID family (`com.alphapremier.*`). |
| **Taste Skill** (`.claude/skills/taste-skill`, app-screen rules, style `data-terminal` dealt with `--keep palette,type`) | What the brand does not decide: flat surfaces with no shadows or gradients, colour only on data and the one primary action, one 1px gold line to mark the selected rail item, KPIs as type in one strip split by lines (no icon tiles), right-aligned tabular figures, a grey dash for a missing value, and one finding sentence under every title. |

Where the brand and the skill disagree, the brand wins. Keystone keeps the eyebrow labels and the uppercase gold table
headers because every APG admin screen has them. The skill's rules apply everywhere else.

## Rules

- **Colour.** Gold is used on the one primary button of a screen, on document numbers, on the selected rail item and in
  status. Everything else is ink, grey or line. No gradients. The one exception is the printed ID card's foil stripe,
  which is part of the card design.
- **Surfaces.** Ground, then a card one tone up with a 1px `line` border, radius 8. Nothing at rest has a shadow. Only
  the toast, which floats, has one.
- **Type.** Poppins at 34 bold for titles, 14 for body text, 12–12.5 for captions. Orbitron for the greeting (56), the
  clock (20), headline figures (24), tile and card titles (14–15), and status capsules (9.5, capitals).
- **Every screen header** has three parts. The eyebrow is the section name in gold capitals. The title is a noun. The
  line under it is the finding: the one fact on that screen that most needs attention, computed by `KeystoneCore`
  (for example "₱91,000.00 from Dela Cruz, Maria Teresa has been overdue since Oct 10, 2026."). It never describes
  the interface.
- **Registers.** Rows are 45pt with 1px lines and no zebra stripes. The identity column gets the spare width.
  Numbers are right-aligned with tabular figures. Each row has one status capsule and one `⋯` menu at the far right.
  Clicking a row loads the record into the form.
- **Buttons.** Primary is a flat gold fill with dark ink. Secondary is an outline in `lineBright` with gold text.
  Quiet has no chrome. Height is 34 (28 for small) and radius 6. On press the button scales to 0.97. On hover it
  brightens.
- **Motion.** Kept short (0.12–0.22 s) and turned off under Reduce Motion: screens fade in, tiles lift 2pt on
  hover, the toast slides up.
- **Documents** (voucher, statement, ID card) are drawn on white paper tokens. The same view is used for the
  preview and for the PDF.

## Shared across platforms

| Thing | Source of truth | Mac | Windows |
|---|---|---|---|
| Colours, sizes, radii | `shared/design/tokens.json` | `Theme/Tokens.swift` (generated) | `Theme/Tokens.xaml` (generated) |
| Fonts, logo | `shared/fonts`, `shared/logo.png` | `Resources/` (copied) | `Assets/` (copied) |
| Sample data | `shared/data/seed.json` | `Generated/SeedData.swift` | `Assets/seed.json` |
| Wording of findings, toasts and log lines | `KeystoneCore` | as is | ported 1:1 |

Run `node scripts/sync-shared.mjs` after editing anything in `shared/`. CI fails if a generated file is stale.
