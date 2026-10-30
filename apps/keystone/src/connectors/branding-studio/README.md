# Alpha Branding Studio

The listing-photo branding app (`Deign86/Alpha_Branding`), native on both platforms: SwiftUI on macOS, WPF on Windows.

## Owns
`index.ts`: the connector. It covers health (installed version and whether an update exists) and three actions:
"Brand listing photos…", "Open studio" and "Download latest".

## How it reaches the studio (nothing in the studio changes)
- **Finding it:**
  - macOS: bundle id `com.alphapremier.brandingstudio`, found with `mdfind`, or in `/Applications`.
  - Windows: the Uninstall registry key `Alpha Premier Realty Branding Studio` (`DisplayIcon`, `DisplayVersion`).
  - Both are done by `locate_app` in `src-tauri/src/lib.rs`.
- **Handing it photos:**
  - macOS: `open -a <app> files…` sends an open-documents event.
  - Windows: the files are passed as arguments.
  - The studio stages them, ready for Apply Branding.
  - It has no way to set the filename prefix from outside.
- **Updates:** `GET api.github.com/repos/Deign86/Alpha_Branding/releases/latest`. It picks the `.pkg` or `Setup.exe`
  for this platform.

## Contributes
Its Home card and actions. No figures, no people.

## Needs
Nothing to set up. It reports `unsupported` in the browser preview and on Linux.

## Removing it
Delete its line in `../index.ts`.
