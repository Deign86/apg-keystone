# Alpha Premier ID Maker

The native program HR issues employee ID cards with (`Deign86/apg-id-creator`: WPF on Windows, AppKit on a Mac). This
is the shortcut to that program. It is not the ID Maker screen inside Keystone (`packages/modules/id-maker`).

## Owns
- `src/index.ts`: the connector. Its shortcut opens the ID Maker, installs it, and offers its updates.
- `src/logo.png`: the ID Maker's own icon (from its `assets/id-maker-logo.png`).
- `test/id-maker-app.test.ts`: which app it looks for, which file of a release it fetches on each computer, and when
  it offers an update. The release file names in the test are the real ones of v2.0.4.

## How it opens the ID Maker (nothing in the ID Maker changes)
- **Finding it on this computer:**
  - macOS: bundle id `com.alphapremiergroup.idmaker` (`Alpha Premier ID Maker.app`).
  - Windows: the Uninstall registry key its Inno Setup installer writes, `{6F0E2B6C-4D53-4C0B-9A8E-2C7B1D5A9E41}_is1`
    (its `AppId`, which never changes), with `AlphaPremierIdMaker.exe`.
- **Installed:** Keystone starts it.
- **Not installed:** Keystone downloads the installer from the latest release (`…-Setup-….exe`, or the `.dmg` for this
  Mac's processor), checks it against the digest GitHub publishes, and opens it. The person finishes the installer.
  If that cannot be done, the release page opens instead.
- **A newer version is out:** "Update to 2.0.5" shows under the shortcut and does the same download (docs/adr/0035),
  the only way the ID Maker is updated, since it has no updater of its own. A portable copy is not found and so is
  never offered an update.
- **In the web app and the browser preview:** it opens the app's download page and says it runs on a computer
  (docs/adr/0046).

## Contributes
Its shortcut on Home: the ID Maker's logo, named Alpha Premier ID Maker.

## Needs
Nothing.

## Removing it
Delete its line in `apps/keystone/src/connectors.ts`, its entry in `apps/keystone/package.json` and
`e2e/connectors/id-maker-app.e2e.ts`. The shortcut goes; nothing else changes.
