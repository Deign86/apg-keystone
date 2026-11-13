import { comingSoon, type ModuleDef } from '@keystone/kit';
import { accountsModule } from '@keystone/module-accounts';
import { activityModule } from '@keystone/module-activity';
import { banksModule } from '@keystone/module-banks';
import { billingModule } from '@keystone/module-billing';
import { companyModule } from '@keystone/module-company';
import { dataModule } from '@keystone/module-data';
import { directoryModule } from '@keystone/module-directory';
import { fundsModule } from '@keystone/module-funds';
import { homeModule } from '@keystone/module-home';
import { idMakerModule } from '@keystone/module-id-maker';
import { overviewModule } from '@keystone/module-overview';
import { payrollModule } from '@keystone/module-payroll';
import { profileModule } from '@keystone/module-profile';
import { timekeepingModule } from '@keystone/module-timekeeping';
import { vouchersModule } from '@keystone/module-vouchers';

/**
 * The installed screens. Each is its own package (packages/modules/<id>); to remove one,
 * delete its line here and its entry in this app's package.json. Its rail entry, Home
 * tile, Overview figure, finding, waiting items, log filter and services go with it.
 */
export const builtInModules: ModuleDef[] = [
  homeModule, overviewModule, vouchersModule, fundsModule, billingModule, idMakerModule, directoryModule, activityModule, timekeepingModule,
  payrollModule, profileModule, accountsModule, dataModule, banksModule, companyModule,
];

/**
 * The screens open in every build: Home, which holds the shortcuts to the connected systems, Check Vouchers, Profile,
 * where whoever is signed in changes their name (docs/adr/0020), User Accounts, where the owner makes the staff's
 * sign-ins, and Bank Accounts and Company Details, which vouchers print from now that nothing is built in
 * (docs/adr/0018). The others show behind "Coming soon" except in a beta build (docs/adr/0017, 0019). To release one,
 * add its id here.
 */
export const RELEASED = ['home', 'vouchers', 'profile', 'accounts', 'banks', 'company'];

/** The installed screens as this build shows them: every one in a beta build, otherwise the unreleased coming soon. */
export function shippedModules(beta: boolean): ModuleDef[] {
  return beta ? builtInModules : builtInModules.map((m) => (RELEASED.includes(m.id) ? m : comingSoon(m)));
}
