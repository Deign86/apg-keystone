import type { ModuleDef } from '@keystone/kit';
import { activityModule } from '@keystone/module-activity';
import { banksModule } from '@keystone/module-banks';
import { billingModule } from '@keystone/module-billing';
import { dataModule } from '@keystone/module-data';
import { directoryModule } from '@keystone/module-directory';
import { fundsModule } from '@keystone/module-funds';
import { homeModule } from '@keystone/module-home';
import { idMakerModule } from '@keystone/module-id-maker';
import { overviewModule } from '@keystone/module-overview';
import { payrollModule } from '@keystone/module-payroll';
import { timekeepingModule } from '@keystone/module-timekeeping';
import { vouchersModule } from '@keystone/module-vouchers';

/**
 * The installed screens. Each is its own package (packages/modules/<id>); to remove one,
 * delete its line here and its entry in this app's package.json. Its rail entry, Home
 * tile, Overview figure, finding, waiting items, log filter and services go with it.
 */
export const builtInModules: ModuleDef[] = [
  homeModule, overviewModule, vouchersModule, fundsModule, billingModule, idMakerModule, directoryModule, activityModule, timekeepingModule,
  payrollModule, dataModule, banksModule,
];
