import { openDesktopApp, type AppLocator, type Connector, type DesktopApp } from '@keystone/core';
import type { ConnectorPlugin } from '@keystone/kit';
import logo from './logo.png';

// Alpha Branding Studio (Deign86/Alpha_Branding): frames listing photos in the official gold template. Native on both
// platforms (SwiftUI and WPF). Its shortcut on Home opens the app. Keystone finds it by its bundle id
// com.alphapremier.brandingstudio on macOS, and on Windows by the Uninstall registry key "Alpha Premier Realty Branding
// Studio" (DisplayIcon, InstallLocation). Not installed: its latest release page opens instead.

export const STUDIO_APP: AppLocator = {
  macBundleId: 'com.alphapremier.brandingstudio',
  macAppName: 'Alpha Branding Studio',
  windowsUninstallKey: 'Alpha Premier Realty Branding Studio',
  windowsExe: 'Alpha.Branding.exe',
};

export const STUDIO: DesktopApp = {
  name: 'Alpha Branding Studio',
  locator: STUDIO_APP,
  downloads: 'https://github.com/Deign86/Alpha_Branding/releases/latest',
};

export const brandingStudioConnector: Connector = {
  id: 'branding-studio',
  name: 'Alpha Branding Studio',
  logo,
  open: ({ system }) => openDesktopApp(system, STUDIO),
};

export const brandingStudioPlugin: ConnectorPlugin = { connector: brandingStudioConnector };
