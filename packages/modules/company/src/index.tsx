import { Button, Field, FieldRow, ScreenHeader, TextArea, TextInput } from '@keystone/ui';
import { useCallback, useState } from 'react';
import { FormCard, useKeystone, type ModuleDef } from '@keystone/kit';
import { canChange, COMPANY_LINE, companyDraftOf, saveCompany, TAG, type CompanyDraft } from './rules';

/** The company's details, in one form. Staff see them; only an owner changes them. */
function CompanyDetailsScreen() {
  const { state, ctx, run, store } = useKeystone();
  const [d, setD] = useState<CompanyDraft>(() => companyDraftOf(state));
  const [error, setError] = useState<string | null>(null);
  const editable = canChange(ctx);
  const set = (patch: Partial<CompanyDraft>) => setD({ ...d, ...patch });

  const save = useCallback(() => {
    if (!editable) return;
    const r = run((s, c) => saveCompany(s, d, c));
    setError(r.ok ? null : r.error);

    // The form shows what was saved: single spaces, and days and years as numbers.
    if (r.ok) setD(companyDraftOf(store.getState()));
  }, [editable, run, d, store]);

  const text = (field: keyof CompanyDraft, label: string, hint?: string) => (
    <Field label={label} hint={hint}><TextInput readOnly={!editable} value={d[field]} onChange={(v) => set({ [field]: v })} /></Field>
  );

  const paragraph = (field: keyof CompanyDraft, label: string, hint?: string) => (
    <Field label={label} hint={hint}><TextArea readOnly={!editable} rows={4} value={d[field]} onChange={(v) => set({ [field]: v })} /></Field>
  );

  return (
    <>
      <ScreenHeader eyebrow="Settings" title="Company Details" line={COMPANY_LINE} />
      <FormCard
        eyebrow="Kept with APG's records"
        title="Company details"
        onSubmit={save}
        error={error}
        actions={editable
          ? <Button kind="primary" type="submit">Save company details</Button>
          : <p className="m-0 text-xs text-ink-2">Only the CEO changes these.</p>}
      >
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="mb-2 text-[12.5px] font-semibold text-ink-2">Check vouchers</legend>
          <FieldRow min={140}>
            {text('preparedBy', 'Prepared by', 'When nobody is signed in. Signed in, it is the person preparing it.')}
            {text('checkedBy', 'Audited by')}
            {text('approvedBy', 'Approved by')}
          </FieldRow>
        </fieldset>
        <fieldset className="m-0 flex flex-col gap-3 border-0 border-t border-line p-0 pt-3">
          <legend className="mb-2 text-[12.5px] font-semibold text-ink-2">Billing statements</legend>
          {paragraph('paymentInstructions', 'Payment instructions', 'Where clients pay and send proof of payment.')}
          {paragraph('billingNote', 'Closing note')}
          <FieldRow>
            {text('billingTerms', 'Terms', 'Under the dates: the late-payment penalty.')}
            {text('dueInDays', 'Days to pay', 'Blank: each new statement needs its due date typed.')}
          </FieldRow>
        </fieldset>
        <fieldset className="m-0 flex flex-col gap-3 border-0 border-t border-line p-0 pt-3">
          <legend className="mb-2 text-[12.5px] font-semibold text-ink-2">Employee IDs</legend>
          <FieldRow>
            {text('signatory', 'Signatory', 'Signs statements and IDs.')}
            {text('idValidYears', 'Years an ID is valid', 'Blank: each new ID needs its end date typed.')}
          </FieldRow>
        </fieldset>
      </FormCard>
    </>
  );
}

export const companyModule: ModuleDef = {
  id: 'company',
  title: 'Company Details',
  section: 'Settings',
  blurb: 'What each new voucher, statement and ID starts from: signatories, payment instructions and terms.',
  // Last under Settings, after Bank Accounts.
  order: 92,
  logTags: { [TAG]: 'Company Details' },
  Screen: CompanyDetailsScreen,
};
