import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { ATTENDANCE, fakeDesktop, ID_MAKER, installedAt, LATEST, STUDIO } from '../support/fake-desktop';

// APG Website (packages/connectors/website): a shortcut on Home, the website's logo, that opens its admin portal in
// the browser. That works the same in the browser preview, where the new tab is caught here instead of opened.

test('is the website’s logo on Home', async ({ app, screen, browser }) => {
  await app.open('/');

  await expect(screen.getByRole('button', 'Open APG Website')).toBeVisible();

  const width = await browser.evaluate(async () => {
    const img = document.querySelector('button[aria-label="Open APG Website"] img');

    return img instanceof HTMLImageElement ? img.decode().then(() => img.naturalWidth, () => 0) : 0;
  });

  expect(width).toBeGreaterThan(0);
});

test('opens the admin portal', async ({ app, screen, browser }) => {
  await app.open('/');
  // Write what would open in a new tab onto the page, where the locator below waits for it.
  await browser.evaluate(() => {
    window.open = (url) => {
      document.body.append(Object.assign(document.createElement('output'), { textContent: `Opened ${String(url)}` }));

      return null;
    };
  });

  await screen.getByRole('button', 'Open APG Website').tap();

  await expect(screen.getByText('Opened https://alphapremiergroup.com/admin')).toBeVisible();
});

test('on the desktop, offers no update: the website is served, so its admin portal is always the latest', async ({ app, screen, browser }) => {
  await fakeDesktop(browser, { installed: [installedAt(ATTENDANCE, '0.2.20'), installedAt(ID_MAKER, '2.0.3'), installedAt(STUDIO, '2.7.0.0')], releases: LATEST });
  await app.open('/');

  // Every installed app behind its latest release is offered it, and the website asks nothing.
  await expect(screen.getByRole('button', /^Update to/)).toHaveCount(3);
  await expect(screen.getByRole('group', 'APG Website').getByRole('button', /^Update to/)).toHaveCount(0);
});
