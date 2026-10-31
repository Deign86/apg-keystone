# APG Website

alphapremiergroup.com and its admin portal (`Deign86/apg-website`: React plus PHP/MySQL on Hostinger).

## Owns
- `src/index.ts`: the connector. It covers health (signed in as whom), figures (unread inquiries, payments reported,
  applicants), the new-hires import, and "Open admin portal".
- `src/api.ts`: the admin API client. It signs in, keeps the session, retries once on 401, and exposes typed calls.
- `src/WebsiteInbox.tsx`: the Website screen. Payments clients report on the Pay page can be matched to statements, and
  inquiries can become directory clients.
- `test/website.test.ts`: the client against a fake of the admin API (sign-in, Origin on writes, re-sign on a
  lapsed session, hires with photos).

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
- **The `website` screen.** It settles statements through the billing module's `billing.statement-payments`
  service. Without billing it still lists payments and inquiries and says that matching needs Billing.

## Needs
The `billing.statement-payments` service for matching (optional).
Settings: website address, admin email, password (keychain). It needs the desktop app; browsers block the calls.

## Removing it
Delete its line in `apps/keystone/src/connectors.ts` and its entry in `apps/keystone/package.json`. The Website screen goes with it.
