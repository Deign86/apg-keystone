import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

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
