import type { ConnectorPlugin } from '@keystone/kit';
import { attendancePlugin } from '@keystone/connector-attendance';
import { brandingStudioPlugin } from '@keystone/connector-branding-studio';
import { websitePlugin } from '@keystone/connector-website';

/**
 * The connected systems. Each is its own package (packages/connectors/<id>); to remove
 * one, delete its line here and its entry in this app's package.json. Order is display
 * order.
 */
export const plugins: ConnectorPlugin[] = [attendancePlugin, brandingStudioPlugin, websitePlugin];
