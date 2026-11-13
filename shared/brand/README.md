# Keystone's logo and icons

Keystone's own mark: the APG phoenix, in gold line art, inside a keystone. It sits on APG's black (`bg`, `#0b0a08`)
with a `goldSoft` hairline, so Keystone reads as one of APG's internal systems. It heads the app's sidebar. The APG
phoenix itself (`shared/logo.png`) stays the company's logo on Home and the ID card; the printed documents carry the
full APG logo, the phoenix with its wordmark, made for paper (`logo-paper.png`).

| File | What it is | Used for |
|---|---|---|
| `apg-logo-horizontal.png` | The APG logo, the phoenix beside "ALPHA PREMIER GROUP", for black backgrounds (3520 px, from the website's `public/assets/images/logo-horizontal-transparent.png`) | The source of `logo-paper.png` |
| `logo-paper.png` | The same logo for white paper, 360 px tall: the wordmark black instead of white, and the phoenix one solid gold so its highlights don't vanish; `python3 scripts/brand/derive-paper-logo.py` writes it | The letterhead of every printed document (`npm run sync` copies it to `@keystone/ui/logo-paper.png`) |
| `keystone-logo.png` | The original artwork (1264 px, generated in Canva) | The source of everything below |
| `keystone-mark.png` | The gold mark alone, on transparency | Documents, slides, light or dark backgrounds |
| `keystone-mark-ui.png` | The same, 160 px tall | The app's sidebar (`npm run sync` copies it to `@keystone/ui/keystone-mark.png`) |
| `icon-app.png` | The mark on a rounded black tile with the hairline (1024 px) | Windows, Linux, the browser preview |
| `icon-macos.png` | The same tile on Apple's grid: an 824 px squircle with a 100 px margin | macOS (`icon.icns`) |
| `icon-ios.png` | The mark on a full-bleed black square, no transparency | iOS, which rounds its own corners |
| `icon-android-fg.png` | The mark alone, inside the adaptive-icon safe zone | Android, on a `#0b0a08` background |
| `icons.json` | The `tauri icon` manifest | `npm run icons` |

## Changing the logo

1. Replace `keystone-logo.png` with the new artwork: gold on black, square, at least 1024 px.
2. `python3 scripts/brand/derive-icons.py` (needs Pillow) writes the sources above.
3. `npm run sync` copies the sidebar mark into `@keystone/ui`; `npm run icons` builds every platform's icons:
   - `apps/keystone/src-tauri/icons/`: `icon.icns` (macOS), `icon.ico` and the Store tiles (Windows), the PNG sizes
     (Linux), and `ios/` and `android/`, ready for a mobile build.
   - `apps/keystone/public/`: the browser preview's favicon, Apple touch icon and web-app icons.
4. Look at the 16 and 32 px icons before committing; small sizes are where a logo stops reading.
