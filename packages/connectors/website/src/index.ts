import type { Connector } from '@keystone/core';
import type { ConnectorPlugin } from '@keystone/kit';
import logo from './logo.png';

// The APG website (Deign86/apg-website). Its shortcut on Home opens the admin portal, where inquiries, payments
// reported online and job applicants are handled, in the default browser.

export const ADMIN_PORTAL = 'https://alphapremiergroup.com/admin';

export const websiteConnector: Connector = {
  id: 'website',
  name: 'APG Website',
  tag: 'WEB',
  logo,
  open: ({ system }) => system.openUrl(ADMIN_PORTAL),
};

export const websitePlugin: ConnectorPlugin = { connector: websiteConnector };
