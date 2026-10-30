# APG Website

alphapremiergroup.com and its admin portal (`Deign86/apg-website`: React plus PHP/MySQL on Hostinger).

## Owns
- `index.ts`: the connector. It covers health (signed in as whom), figures (unread inquiries, payments reported,
  applicants), the new-hires import, and "Open admin portal".
- `api.ts`: the admin API client. It signs in, keeps the session, retries once on 401, and exposes typed calls.
- `WebsiteInbox.tsx`: the Website screen. Payments clients report on the Pay page can be matched to statements, and
  inquiries can become directory clients.

## How it reaches the site (nothing on the site changes)
- **Signing in:** an ordinary admin account through `/api/admin/auth.php`. The site has no API tokens.
- **Session:** the `PHPSESSID` cookie lives in the native HTTP client's cookie jar.
- **Two server rules this works around:**
  - Non-GET calls carry `Origin: <site>`.
  - The desktop client always sends a `Keystone/…` user agent, because `.htaccess` blocks empty or curl-like ones.
- **Endpoints used:**
  - `inquiries.php` (summary, `kind=payment`, list, PUT status).
  - `applicants.php` (`status=hired`, `action=photo`, summary).

## Contributes
- Its Home card and figures.
- **New hires import:** people come in as directory employees, with their 2x2 photo when the opening asked for one.
  Records are linked as `links.website = applicant-<id>` and tagged `WEB`.
- **The `website` screen**, with `requires: ['billing']`: without billing it is left out, with that reason.

## Needs
Settings: website address, admin email, password (keychain). It needs the desktop app; browsers block the calls.

## Removing it
Delete its line in `../index.ts`. The Website screen goes with it.
