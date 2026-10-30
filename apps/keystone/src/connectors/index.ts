import type { ConnectorPlugin } from '../app/registry';
import { attendancePlugin } from './attendance';
import { brandingStudioPlugin } from './branding-studio';
import { websitePlugin } from './website';

/**
 * Every connected system. To add one: create a folder next to these exporting a
 * ConnectorPlugin (see docs/CONNECTORS.md) and list it here. Order is display order.
 */
export const plugins: ConnectorPlugin[] = [attendancePlugin, brandingStudioPlugin, websitePlugin];
