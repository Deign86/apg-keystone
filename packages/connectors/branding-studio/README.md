# Alpha Branding Studio

The listing-photo branding app (`Deign86/Alpha_Branding`), native on both platforms: SwiftUI on macOS, WPF on Windows.

## Owns
- `src/index.ts`: the connector. Its shortcut opens the studio.
- `src/logo.png`: the studio's own icon (from its `.github/assets/icon.png`).
- `test/branding-studio.test.ts`: which app it looks for, that it starts it, and the download page when it is missing.

## How it opens the studio (nothing in the studio changes)
- **Finding it:**
  - macOS: bundle id `com.alphapremier.brandingstudio`, found with `mdfind`, or in `/Applications`.
  - Windows: the Uninstall registry key `Alpha Premier Realty Branding Studio` (`DisplayIcon`, `InstallLocation`).
  - Both are done by `locate_app` in `src-tauri/src/lib.rs`.
- **Installed:** Keystone starts it (`open -a` on macOS, its `.exe` on Windows).
- **Not installed:** Keystone opens its latest release page on GitHub to download it.
- **In the browser preview:** it says the desktop app is needed.

## Contributes
Its shortcut on Home: the studio's logo, named Alpha Branding Studio.

## Needs
Nothing.

## Removing it
Delete its line in `apps/keystone/src/connectors.ts`, its entry in `apps/keystone/package.json` and
`e2e/connectors/branding-studio.e2e.ts`. The shortcut goes; nothing else changes.
