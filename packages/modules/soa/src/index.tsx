import { Button, Checkbox, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SectionLabel, TextArea, TextInput, useConfirm, type Column } from '@keystone/ui';
import { useCallback, useRef, useState } from 'react';
import { companyOf, count, peso, shortDate } from '@keystone/core';
import { FormCard, printElement, savePdf, useDraft, useKeystone, Workspace, type ModuleDef } from '@keystone/kit';
import {
  dueOnSigning, EWT_RATE, ID, monthlyRent, monthName, newSoa, pdcStart, pdcTotal, removeSoa, saveSoa, soaDraftOf, soaLine, soaOf,
  statementsNewestFirst, statementsOf, TAG, VAT_RATE, type Soa, type SoaDraft,
} from './rules';
import { SoaPaper } from './SoaPaper';

const DRAFT = `${ID}.draft`;

function Statements() {
  const { state, ctx, run, files, notify } = useKeystone();
  const confirm = useConfirm();
  const [draft, setDraft] = useDraft<SoaDraft>(DRAFT, () => newSoa(state, ctx));
  const [error, setError] = useState<string | null>(null);
  const paper = useRef<HTMLElement>(null);
  const live = soaOf(draft);
  const rent = monthlyRent(live);
  const set = (patch: Partial<SoaDraft>) => setDraft({ ...draft, ...patch });
  const start = pdcStart({ ...live, pdcFirst: '' });

  const save = useCallback((asNew = false) => {
    const r = run((s, c) => saveSoa(s, draft, c, asNew));
    setError(r.ok ? null : r.error);

    if (r.ok) setDraft(newSoa(r.state, ctx));
  }, [run, draft, ctx, setDraft]);

  const columns: Column<Soa>[] = [
    { key: 'no', header: 'No.', width: 128, cell: (a) => <span className="font-semibold text-gold-bright tabular-nums">{a.no}</span> },
    { key: 'client', header: 'Client', cell: (a) => <span title={a.client}>{a.client}</span> },
    { key: 'property', header: 'Property', cell: (a) => <span className="text-ink-2" title={a.property}>{a.property}</span> },
    { key: 'date', header: 'Prepared', width: 112, cell: (a) => <span className="text-ink-2 tabular-nums">{shortDate(a.date)}</span> },
    { key: 'rent', header: 'Monthly rent', width: 132, align: 'right', cell: (a) => peso(monthlyRent(a).net) },
    { key: 'signing', header: 'On signing', width: 132, align: 'right', cell: (a) => <span className="font-semibold">{peso(dueOnSigning(a))}</span> },
  ];

  return (
    <>
      <ScreenHeader
        eyebrow="Leasing"
        title="Statements of Account"
        line={soaLine(state)}
        actions={<Button onClick={() => { setDraft(newSoa(state, ctx)); setError(null); }}>New statement</Button>}
      />
      <Panel className="mb-4">
        <div className="mb-2 flex items-baseline justify-between">
          <SectionLabel>Statements saved</SectionLabel>
          <span className="text-xs text-ink-2">{count(statementsOf(state).length, 'statement')}</span>
        </div>
        <Register
          label="Statements saved"
          columns={columns}
          rows={statementsNewestFirst(state)}
          rowKey={(a) => a.no}
          onOpen={(a) => { setDraft(soaDraftOf(a)); setError(null); notify(`${a.no} loaded into the form.`); }}
          actions={(a) => [{
            label: 'Remove…', danger: true,
            onSelect: () => confirm({
              title: `Remove ${a.no}?`, body: `The statement of account for ${a.client}, ${a.property}, is removed. A printed copy is not affected.`,
              confirm: 'Remove statement', danger: true, onConfirm: () => run((s, c) => removeSoa(s, a.no, c)),
            }),
          }]}
          empty={<EmptyState text="No statements of account yet." action={<Button size="sm" kind="primary" onClick={() => document.getElementById('soa-form')?.scrollIntoView({ block: 'start' })}>Prepare the first one</Button>} />}
        />
      </Panel>

      <Workspace
        previewTitle="Document preview"
        form={
          <FormCard
            id="soa-form"
            eyebrow="Statement entry"
            title={draft.editing ? `Editing ${draft.editing}` : 'New statement of account'}
            onSubmit={() => save()}
            error={error}
            actions={<>
              <Button onClick={() => paper.current && printElement(paper.current)}>Print</Button>
              <Button onClick={() => paper.current && savePdf(paper.current, `${draft.editing ?? draft.no}.pdf`, files).then((n) => n && notify(`Saved ${n}.`), (e) => notify(String(e), 'error'))}>Export PDF</Button>
              {draft.editing && <Button onClick={() => save(true)}>Save as new</Button>}
              <Button kind="primary" type="submit">{draft.editing ? 'Save changes' : 'Save statement'}</Button>
            </>}
          >
            <FieldRow>
              <Field label="SOA No." hint={draft.editing ? undefined : 'The next number; change it if you need to.'}>
                <TextInput figures readOnly={!!draft.editing} value={draft.editing ?? draft.no} onChange={(no) => set({ no })} />
              </Field>
              <Field label="Prepared as of"><TextInput type="date" value={draft.date} onChange={(date) => set({ date })} /></Field>
            </FieldRow>
            <Field label="Client"><TextInput placeholder="The lessee, as it prints" value={draft.client} onChange={(client) => set({ client })} /></Field>
            <Field label="Property address"><TextInput value={draft.property} onChange={(property) => set({ property })} /></Field>
            <Field label="Payee" hint="Who the checks are made out to."><TextInput value={draft.payee} onChange={(payee) => set({ payee })} /></Field>

            <SectionLabel>1. Breakdown</SectionLabel>
            <FieldRow>
              <Field label="Floor area (sqm)"><TextInput figures align="right" value={draft.sqm} onChange={(sqm) => set({ sqm })} /></Field>
              <Field label="Rate per sqm"><TextInput figures align="right" placeholder="₱ a month" value={draft.rate} onChange={(rate) => set({ rate })} /></Field>
            </FieldRow>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Checkbox checked={draft.vat} onChange={(vat) => set({ vat })}>Add {VAT_RATE}% VAT</Checkbox>
              <Checkbox checked={draft.ewt} onChange={(ewt) => set({ ewt })}>Less {EWT_RATE}% expanded withholding tax</Checkbox>
            </div>
            <div className="text-right" aria-live="polite">
              <p className="m-0 text-[13px] text-ink-2 tabular-nums">
                Base rent {peso(rent.base)}{draft.vat ? ` · VAT ${peso(rent.vat)}` : ''}{draft.ewt ? ` · EWT (${peso(rent.ewt)})` : ''}
              </p>
              <p className="m-0 font-display text-lg font-semibold text-gold-bright tabular-nums">{peso(rent.net)} a month</p>
            </div>

            <SectionLabel>2. Deposit and advance</SectionLabel>
            <FieldRow>
              <Field label="Reservation paid" hint="Taken off what is due on signing."><TextInput figures align="right" placeholder="None" value={draft.reservation} onChange={(reservation) => set({ reservation })} /></Field>
              <Field label="Reservation coverage"><TextInput placeholder="1 month deductible to advance rental" value={draft.reservationCoverage} onChange={(reservationCoverage) => set({ reservationCoverage })} /></Field>
              <Field label="Reservation check no."><TextInput placeholder="Cash deposit" value={draft.reservationCheck} onChange={(reservationCheck) => set({ reservationCheck })} /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="Security deposit (months)" hint="Of base rent."><TextInput figures align="right" value={draft.depositMonths} onChange={(depositMonths) => set({ depositMonths })} /></Field>
              <Field label="Deposit coverage"><TextInput value={draft.depositCoverage} onChange={(depositCoverage) => set({ depositCoverage })} /></Field>
              <Field label="Deposit check no."><TextInput value={draft.depositCheck} onChange={(depositCheck) => set({ depositCheck })} /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="Advance rental (months)" hint="Of the monthly rent."><TextInput figures align="right" value={draft.advanceMonths} onChange={(advanceMonths) => set({ advanceMonths })} /></Field>
              <Field label="Advance coverage"><TextInput placeholder="Jan – Feb 2027" value={draft.advanceCoverage} onChange={(advanceCoverage) => set({ advanceCoverage })} /></Field>
              <Field label="Advance check no."><TextInput value={draft.advanceCheck} onChange={(advanceCheck) => set({ advanceCheck })} /></Field>
            </FieldRow>
            <p className="m-0 text-right text-[13px] text-ink-2 tabular-nums" aria-live="polite">Due on signing {peso(dueOnSigning(live))}</p>

            <SectionLabel>3. Lease term and escalation</SectionLabel>
            <FieldRow>
              <Field label="Contract commencement"><TextInput type="date" value={draft.commencement} onChange={(commencement) => set({ commencement })} /></Field>
              <Field label="Term (months)"><TextInput figures align="right" value={draft.termMonths} onChange={(termMonths) => set({ termMonths })} /></Field>
              <Field label="Escalation a year (%)" hint="From the second year, on the year before’s rent."><TextInput figures align="right" value={draft.escalation} onChange={(escalation) => set({ escalation })} /></Field>
            </FieldRow>
            <Field label="Lease terms" hint="As it prints. Left empty, it prints the term and escalation."><TextInput value={draft.leaseTerms} onChange={(leaseTerms) => set({ leaseTerms })} /></Field>

            <SectionLabel>4. Postdated checks</SectionLabel>
            <FieldRow>
              <Field label="First month paid by check" hint={start ? `Empty: ${monthName(start)}, the month after the advance.` : 'Empty: the month after the advance.'}>
                <TextInput figures placeholder={start || 'YYYY-MM'} value={draft.pdcFirst} onChange={(pdcFirst) => set({ pdcFirst })} />
              </Field>
              <Field label="Number of checks" hint={`Empty: ${pdcTotal({ ...live, pdcCount: 0 })}, the months the advance does not pay.`}>
                <TextInput figures align="right" value={draft.pdcCount} onChange={(pdcCount) => set({ pdcCount })} />
              </Field>
              <Field label="Checks dated on" hint="Day of the month before the rent month."><TextInput figures align="right" value={draft.pdcDay} onChange={(pdcDay) => set({ pdcDay })} /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="Bank"><TextInput value={draft.bank} onChange={(bank) => set({ bank })} /></Field>
              <Field label="First check number" hint="The rest follow it."><TextInput figures value={draft.firstCheck} onChange={(firstCheck) => set({ firstCheck })} /></Field>
            </FieldRow>
            <Field label="Notes"><TextArea rows={4} value={draft.notes} onChange={(notes) => set({ notes })} /></Field>
          </FormCard>
        }
        preview={<SoaPaper ref={paper} soa={{ ...live, no: draft.editing ?? live.no }} company={companyOf(state)} />}
      />
    </>
  );
}

export const soaModule: ModuleDef = {
  id: ID,
  title: 'Statements of Account',
  blurb: 'Work out a lease’s rent from the floor area and rate, the deposit, escalation and postdated checks.',
  order: 3.5,
  onHome: true,
  stat: (s) => ['Saved', String(statementsOf(s).length)],
  create: { label: 'New statement of account', run: (app) => { app.setDraft(DRAFT, newSoa(app.state, app.ctx)); app.go(ID); } },
  logTags: { [TAG]: 'Statements of Account' },
  Screen: Statements,
};
