import type { ModuleDef } from '../app/registry';
import { activityModule } from './activity';
import { billingModule } from './billing';
import { connectionsModule } from './connections';
import { directoryModule } from './directory';
import { homeModule } from './home';
import { idMakerModule } from './id-maker';
import { overviewModule } from './overview';
import { vouchersModule } from './vouchers';

/**
 * Keystone's own screens: one folder each, listed here and nowhere else. Delete a line
 * (and its folder, if you like) and the module is gone: its rail entry, Home tile,
 * Overview figure, finding, waiting items and log filter go with it. See README.md.
 */
export const builtInModules: ModuleDef[] = [
  homeModule, overviewModule, vouchersModule, billingModule, idMakerModule, directoryModule, activityModule, connectionsModule,
];
