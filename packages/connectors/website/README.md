# APG Website

alphapremiergroup.com and its admin portal (`Deign86/apg-website`: React plus PHP/MySQL on Hostinger).

## Owns
- `src/index.ts`: the connector. Its shortcut opens the admin portal, `https://alphapremiergroup.com/admin`, in the
  browser, where inquiries, payments reported online and job applicants are handled.
- `src/logo.png`: the APG mark the website uses (from its `promo-video/assets/img/logo-mark.png`).
- `test/website.test.ts`: it opens the admin portal on the desktop and in the browser preview alike.

## Contributes
Its shortcut on Home: the APG logo, named APG Website. Directory records linked to it earlier keep the tag `WEB`.

## Needs
Nothing. Signing in happens on the website itself; Keystone keeps no website password.

## Removing it
Delete its line in `apps/keystone/src/connectors.ts`, its entry in `apps/keystone/package.json` and
`e2e/connectors/website.e2e.ts`. The shortcut goes; nothing else changes.
