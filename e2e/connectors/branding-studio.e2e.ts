import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Alpha Branding Studio (packages/connectors/branding-studio). Keystone finds and launches it on the desktop; the
// browser preview can only say so. Finding the app and reading its version are tested in the package's own tests.

test('shows on Home and in Connections as a desktop-only system with nothing to set up', async ({ app, screen }) => {
  await app.open('/');
  const home = screen.getByRole('region', 'Alpha Branding Studio');

  await expect(home.getByText('Desktop only')).toBeVisible();
  await expect(home.getByText('Open Keystone’s desktop app on Windows or macOS to use Branding Studio from here.')).toBeVisible();

  await app.open('/#connections');
  const settings = screen.getByRole('region', 'Alpha Branding Studio');

  await expect(settings.getByText('Nothing to set up: Keystone finds it on this computer by itself.')).toBeVisible();
});
