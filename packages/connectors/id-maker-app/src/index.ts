import { desktopAppShortcut, type AppLocator, type Connector, type DesktopApp } from '@keystone/core';
import logo from './logo.png';

// Alpha Premier ID Maker (Deign86/apg-id-creator): the native program HR issues employee ID cards with (WPF on
// Windows, AppKit on a Mac). Its shortcut on Home opens the app. Keystone finds it by its bundle id
// com.alphapremiergroup.idmaker on macOS, and on Windows by the Uninstall registry key its Inno Setup installer writes
// (its AppId and "_is1"), with AlphaPremierIdMaker.exe. Not installed: Keystone fetches its installer from its latest
// release and opens it. Installed and older than that release: "Update to …" shows under its shortcut, the only way
// the ID Maker is updated, since it has no updater of its own (docs/adr/0029, 0035).

export const ID_MAKER_APP: AppLocator = {
  macBundleId: 'com.alphapremiergroup.idmaker',
  macAppName: 'Alpha Premier ID Maker',
  windowsUninstallKey: '{6F0E2B6C-4D53-4C0B-9A8E-2C7B1D5A9E41}_is1',
  windowsExe: 'AlphaPremierIdMaker.exe',
};

const ID_MAKER: DesktopApp = {
  name: 'Alpha Premier ID Maker',
  locator: ID_MAKER_APP,
  repo: 'Deign86/apg-id-creator',
  // The setup program, never the portable .exe: only an installed copy can be found again and updated.
  installers: { windows: /-Setup-.*\.exe$/, macArm: /-Mac-AppleSilicon-.*\.dmg$/, macIntel: /-Mac-Intel-.*\.dmg$/ },
};

export const idMakerAppConnector: Connector = {
  id: 'id-maker-app',
  name: 'Alpha Premier ID Maker',
  logo,
  ...desktopAppShortcut(ID_MAKER),
};
