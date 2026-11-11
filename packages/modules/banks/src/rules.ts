import {
  count, isJsonObject, jsonObjects, jsonText, KeystoneError, logged, moduleData, nextNumber, withModuleData,
  type BankAccount, type BankAccounts, type Change, type Ctx, type Editing, type TerminalState,
} from '@keystone/core';

// The company's bank accounts: where its checks are drawn and where clients are asked to pay. Kept under
// state.ext.banks; another part reads them only through the bank-accounts service (SERVICES.bankAccounts).

export const MODULE = 'banks';
export const TAG = 'BANK';

export type BanksData = { accounts: BankAccount[] };

/** How an account is named in a list: "BPI · 4011 0258 68". */
export const accountLabel = (a: BankAccount) => [a.bank, a.number].filter(Boolean).join(' · ');

// ---------- reading and writing the saved data ----------

/** The saved accounts, checked field by field; undefined when none has ever been saved. */
function savedAccounts(s: TerminalState): BankAccount[] | undefined {
  const raw = moduleData(s, MODULE);

  if (!isJsonObject(raw)) return undefined;

  return jsonObjects(raw.accounts)
    .map((a) => ({ id: jsonText(a.id), bank: jsonText(a.bank), branch: jsonText(a.branch), name: jsonText(a.name), number: jsonText(a.number) }))
    .filter((a) => a.id);
}

/** The accounts in the order they were added: the saved list, or the reference data's until one is saved. */
export const accountsOf = (s: TerminalState, ctx: Ctx): BankAccount[] => savedAccounts(s) ?? ctx.seed.reference.bankAccounts;

const saved = (s: TerminalState, accounts: BankAccount[]) => withModuleData(s, MODULE, { accounts } satisfies BanksData);

// ---------- adding, editing and removing ----------

export interface AccountDraft extends Editing {
  bank: string; branch: string; name: string; number: string;
}

export const newAccountDraft = (): AccountDraft => ({ bank: '', branch: '', name: '', number: '' });

export const accountDraftOf = (a: BankAccount): AccountDraft => ({ editing: a.id, bank: a.bank, branch: a.branch, name: a.name, number: a.number });

export const nextAccountId = (s: TerminalState, ctx: Ctx) => nextNumber(accountsOf(s, ctx).map((a) => a.id), 'B-', 3);

/** One line with single spaces; otherwise kept as typed. */
const clean = (x: string) => x.trim().replace(/\s+/g, ' ');

/** An account number by its letters and digits, so "4011-0258-68" and "4011 0258 68" are the same account. */
const numberKey = (n: string) => n.replace(/[^0-9a-z]/gi, '').toLowerCase();

export function saveAccount(s: TerminalState, d: AccountDraft, ctx: Ctx): Change<BankAccount> {
  const accounts = accountsOf(s, ctx);
  const original = d.editing ? accounts.find((a) => a.id === d.editing) : undefined;

  if (d.editing && !original) throw new KeystoneError(`${d.editing} is no longer in Bank Accounts.`);
  const bank = clean(d.bank);
  const name = clean(d.name);
  const number = clean(d.number);

  if (!bank) throw new KeystoneError('Enter the bank.');

  if (!name) throw new KeystoneError('Enter the account name.');

  if (!numberKey(number)) throw new KeystoneError('Enter the account number.');
  const clash = accounts.find((a) => a.id !== original?.id && numberKey(a.number) === numberKey(number));

  if (clash) throw new KeystoneError(`Account number ${number} is already saved as ${clash.id} (${clash.bank}, ${clash.name}).`);

  const account: BankAccount = {
    id: original?.id ?? nextNumber(accounts.map((a) => a.id), 'B-', 3), bank, branch: clean(d.branch), name, number,
  };

  if (original) {
    return {
      state: logged(saved(s, accounts.map((a) => (a.id === original.id ? account : a))), TAG, `${account.id} ${accountLabel(account)} updated.`, ctx),
      record: account, message: `${account.id} updated.`,
    };
  }

  return {
    state: logged(saved(s, [...accounts, account]), TAG, `${account.id} ${accountLabel(account)} added, in the name of ${account.name}.`, ctx),
    record: account, message: `${account.id} added.`,
  };
}

/** Removes an account. Statements already issued keep the payment instructions written on them. */
export function removeAccount(s: TerminalState, id: string, ctx: Ctx): Change<BankAccount> {
  const accounts = accountsOf(s, ctx);
  const account = accounts.find((a) => a.id === id);

  if (!account) throw new KeystoneError(`${id} is not in Bank Accounts.`);

  return {
    state: logged(saved(s, accounts.filter((a) => a.id !== id)), TAG, `${id} ${accountLabel(account)} removed.`, ctx),
    record: account, message: `${id} removed.`,
  };
}

// ---------- what the screen says ----------

/** The line under the title: how many accounts, at which banks. */
export function banksLine(accounts: BankAccount[]): string {
  if (!accounts.length) return 'No bank accounts are kept yet.';
  const banks = [...new Set(accounts.map((a) => a.bank))];
  const last = banks[banks.length - 1];
  const at = banks.length > 1 ? `${banks.slice(0, -1).join(', ')} and ${last}` : last;

  return `${count(accounts.length, 'account')} at ${at}.`;
}

// ---------- the service this module offers other parts ----------

/** Published as SERVICES.bankAccounts, for a document that says where to pay (a statement's payment instructions). */
export const bankAccounts: BankAccounts = { accounts: accountsOf, label: accountLabel };
