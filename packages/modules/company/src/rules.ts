import {
  companyOf, KeystoneError, logged, type Change, type CompanyDetails, type Ctx, type Finding, type TerminalState,
} from '@keystone/core';

// The company's details and what its documents start from (docs/adr/0018). Core keeps them with the records
// (`state.company`, in the cloud an owner-only document) and every part reads them with `companyOf`; this module is
// the one place they are changed. Nothing is built in: until someone fills them in, documents leave them blank.

export const TAG = 'CO';

/** The form: every field as typed, days and years too. */
export type CompanyDraft = { [K in keyof CompanyDetails]: string };

export const companyDraftOf = (s: TerminalState): CompanyDraft => {
  const d = companyOf(s);

  return { ...d, dueInDays: d.dueInDays ? String(d.dueInDays) : '', idValidYears: d.idValidYears ? String(d.idValidYears) : '' };
};

/** Signed in, only an owner changes them, as firestore.rules hold. On a computer where nobody signs in, whoever uses it. */
export const canChange = (ctx: Ctx) => !ctx.who || ctx.who.role === 'owner';

/** One line with single spaces. */
const line = (x: string) => x.trim().replace(/\s+/g, ' ');

/** Lines kept as typed, without spaces or blank lines at either end. */
const lines = (x: string) => x.trim();

/** A whole number from 0 up to `most`, or the sentence that refuses it. Blank is 0: not set. */
function whole(text: string, most: number, what: string): number {
  const t = text.trim();

  if (!t) return 0;

  if (!/^\d+$/.test(t) || Number(t) > most) throw new KeystoneError(`Enter ${what} as a whole number from 0 to ${most}, or leave it blank.`);

  return Number(t);
}

export function saveCompany(s: TerminalState, d: CompanyDraft, ctx: Ctx): Change<CompanyDetails> {
  if (!canChange(ctx)) throw new KeystoneError('Only the owner changes the company\'s details.');
  const name = line(d.name);

  if (!name) throw new KeystoneError('Enter the company\'s name, as its documents print it.');

  const details: CompanyDetails = {
    name, address: line(d.address), contact: line(d.contact), shortAddress: line(d.shortAddress), phone: line(d.phone),
    billingEmail: line(d.billingEmail), preparedBy: line(d.preparedBy), checkedBy: line(d.checkedBy), approvedBy: line(d.approvedBy),
    paymentInstructions: lines(d.paymentInstructions), billingNote: lines(d.billingNote), signatory: line(d.signatory),
    billingTerms: line(d.billingTerms), dueInDays: whole(d.dueInDays, 365, 'the days to pay'), idValidYears: whole(d.idValidYears, 10, 'the years an ID is valid'),
  };

  return { state: logged({ ...s, company: details }, TAG, `Company details for ${name} saved.`, ctx), record: details, message: 'Company details saved.' };
}

/** The line under the title. */
export const companyLine = (s: TerminalState) => (companyOf(s).name
  ? 'What vouchers, statements, IDs and payslips print, and what each new one starts from.'
  : 'Not filled in yet: vouchers, statements, IDs and payslips print without the company\'s name and address.');

/** Before anyone fills them in, Home and Overview say so, below anything more pressing. */
export const companyFinding = (s: TerminalState): Finding | null => (companyOf(s).name
  ? null
  : { priority: 1, text: 'Fill in Company Details: documents print without the company\'s name and address until then.' });
