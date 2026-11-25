import { chromium } from 'playwright-core';
import type { Page } from 'playwright-core';
import type { Browser } from '@e2e-dev/web';
import type { Account } from './emulators';

// A second computer for the cloud suite: another person's Keystone, open beside the test's own, in a browser of its own
// (its own sign-in, its own copy of the records), at the suite's clock and time zone. The test's browser is one person;
// this one is the other, so a test can show what one saves reaching the other's screen while both are open. It drives
// Playwright itself, the same Chromium the suite's engine runs (@e2e-dev/web pins playwright-core to the version this
// package pins), since the engine drives one browser per test.

export interface AnotherComputer {
  /** Keystone on the other computer, signed in, on Home. */
  page: Page;
  close(): Promise<void>;
}

/**
 * Opens Keystone on another computer, at the address the test's browser has it open on, and signs in as `account`
 * there. Close it when the test is done.
 */
export async function anotherComputer(browser: Browser, account: Account): Promise<AnotherComputer> {
  const origin = String(await browser.evaluate(() => location.origin));
  const launched = await chromium.launch();

  try {
    const context = await launched.newContext({ timezoneId: 'Asia/Manila', viewport: { width: 1280, height: 720 } });

    await context.addInitScript({ path: 'e2e/support/fixed-clock.js' });
    const page = await context.newPage();

    await page.goto(`${origin}/`);
    const form = page.getByRole('form', { name: 'Sign in' });

    await form.getByRole('textbox', { name: 'Email' }).fill(account.email);
    await form.getByLabel('Password').fill(account.password);
    await form.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('heading', { name: 'Good morning', level: 1 }).waitFor({ timeout: 15_000 });

    return { page, close: () => launched.close() };
  } catch (e) {
    await launched.close();
    throw e;
  }
}
