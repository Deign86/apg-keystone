import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { layoutProblems, SCREENS } from '../support/mobile';
import { SIZES } from '../support/touch';

// Every screen the rail lists, and every tab on it, at every phone and tablet size, upright and on its side: nothing
// scrolls sideways or is cut off, and every control takes a finger (44 × 44 px). Walked once, on the phone target; the
// sizes are set here, so the tablet target would only walk them again.

test('every screen fits and takes a finger at every phone and tablet size, upright and on its side', { timeout: 600_000 }, async ({ app, screen, browser }) => {
  await app.open('/');
  test.skip(!(await browser.evaluate(() => /iPhone/.test(navigator.userAgent))), 'the phone target walks every size');
  const problems: string[] = [];

  for (const [width, height] of SIZES) {
    await browser.setViewport({ width, height });

    for (const id of SCREENS) {
      await browser.evaluate((route: string) => { location.hash = route; }, `#${id}`);
      await expect(screen.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
      await expect(screen.getByText('This screen hit a problem')).toBeHidden();
      problems.push(...(await layoutProblems(browser)).map((p) => `${width}×${height} ${p}`));
    }
  }

  expect(problems).toEqual([]);
});

test('the open screen fits and takes a finger, on this device', async ({ app, browser }) => {
  for (const id of SCREENS) {
    await app.open(`/#${id}`);

    expect(await layoutProblems(browser)).toEqual([]);
  }
});
