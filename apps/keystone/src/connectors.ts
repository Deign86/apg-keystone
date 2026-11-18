import type { Connector } from '@keystone/core';
import { attendanceConnector } from '@keystone/connector-attendance';
import { brandingStudioConnector } from '@keystone/connector-branding-studio';
import { idMakerAppConnector } from '@keystone/connector-id-maker-app';
import { websiteConnector } from '@keystone/connector-website';

/**
 * The connected systems. Each is its own package (packages/connectors/<id>); to remove
 * one, delete its line here and its entry in this app's package.json. Order is display
 * order.
 */
export const connectors: Connector[] = [attendanceConnector, idMakerAppConnector, brandingStudioConnector, websiteConnector];
