import type { ModuleDef } from '../app/registry';
import { activityModule } from './activity';
import { billingModule } from './billing';
import { connectionsModule } from './connections';
import { directoryModule } from './directory';
import { homeModule } from './home';
import { idMakerModule } from './idmaker';
import { overviewModule } from './overview';
import { vouchersModule } from './vouchers';

/**
 * Keystone's own screens. A new module is a file exporting a ModuleDef, listed here;
 * `order` places it in the rail, and the rail numbers it for ⌘/Ctrl+number.
 */
export const builtInModules: ModuleDef[] = [
  homeModule, overviewModule, vouchersModule, billingModule, idMakerModule, directoryModule, activityModule, connectionsModule,
];
