import { Button, CellInput, Checkbox, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SectionLabel, TextArea, TextInput, useConfirm, type Column, type Refusal } from '@keystone/ui';
import { useCallback, useRef, useState } from 'react';
import { companyOf, count, peso, shortDate } from '@keystone/core';
import { Fills, FormCard, printElement, SaveDraftButton, SavedDrafts, savePdf, useDraft, useKeystone, useSavedDrafts, Workspace, type ModuleDef } from '@keystone/kit';
import {
  dueOnSigning, EWT_RATE, ID, monthlyRent, monthName, newSoa, pdcStart, pdcTotal, removeSoa, saveSoa, soaDraftFrom, soaDraftOf, soaDraftTitle, soaLine, soaOf,
  statementsNewestFirst, statementsOf, TAG, VAT_RATE, withCheckNumber, type Soa, type SoaDetail, type SoaDraft,
} from './rules';
import { SoaPaper } from './SoaPaper';

const DRAFT = `${ID}.draft`;

function Statements() {
  const { state, ctx, run, files, notify } = useKeystone();
  const confirm = useConfirm();
  const [draft, setDraft] = useDraft<SoaDraft>(DRAFT, () => newSoa(state, ctx));
  const drafts = useSavedDrafts(draft, setDraft, { module: ID, title: soaDraftTitle, restore: (d) => soaDraftFrom(state, ctx, d) });
  const [error, setError] = useState<Refusal | null>(null);
  const paper = useRef<HTMLElement>(null);
  const live = soaOf(draft);
  const rent = monthlyRent(live);
  const set = (patch: Partial<SoaDraft>) => setDraft({ ...draft, ...patch });
  const start = pdcStart({ ...live, pdcFirst: '' });
  const detail = (i: number, patch: Partial<SoaDetail>) => set({ details: draft.details.map((d, j) => (j === i ? { ...d, ...patch } : d)) });

  const save = useCallback((asNew = false) => {
    const r = run((s, c) => saveSoa(s, draft, c, asNew));
    setError(r.ok ? null : r);

    if (!r.ok) return;
    drafts.finish(draft);
    setDraft(newSoa(r.state, ctx));
  }, [run, draft, ctx, setDraft, drafts]);

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
      <SavedDrafts drafts={drafts} noun="statement" onOpen={() => { setError(null); document.getElementById('soa-form')?.scrollIntoView({ block: 'start' }); }} />
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
              <SaveDraftButton drafts={drafts} />
              <Button kind="primary" type="submit">{draft.editing ? 'Save changes' : 'Save statement'}</Button>
            </>}
          >
            <FieldRow>
              <Fills part="no">
                <Field label="SOA No." hint={draft.editing ? undefined : 'The next number; change it if you need to.'}>
                  <TextInput figures readOnly={!!draft.editing} value={draft.editing ?? draft.no} onChange={(no) => set({ no })} />
                </Field>
              </Fills>
              <Fills part="date"><Field label="Prepared as of"><TextInput type="date" value={draft.date} onChange={(date) => set({ date })} /></Field></Fills>
            </FieldRow>
            <Fills part="client"><Field name="client" label="Client"><TextInput capitalize placeholder="The lessee, as it prints" value={draft.client} onChange={(client) => set({ client })} /></Field></Fills>
            <Fills part="property"><Field name="property" label="Property address"><TextInput value={draft.property} onChange={(property) => set({ property })} /></Field></Fills>
            <Fills part="payee">
              <FieldRow>
                <Field label="Payee" hint="Who the checks are made out to."><TextInput capitalize value={draft.payee} onChange={(payee) => set({ payee })} /></Field>
                <Field label="Payee’s title" hint="As it prints, e.g. Lessor."><TextInput placeholder="Payee" value={draft.payeeLabel} onChange={(payeeLabel) => set({ payeeLabel })} /></Field>
              </FieldRow>
            </Fills>
            <div className="flex flex-col gap-2">
              <Fills part="breakdown"><Checkbox checked={draft.showSqm} onChange={(showSqm) => set({ showSqm })}>Show the floor area at the top</Checkbox></Fills>
              <Fills part="details">
                {draft.details.map((d, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <div className="w-40 shrink-0"><CellInput label={`Detail ${i + 1} label`} placeholder="Label" value={d.label} onChange={(label) => detail(i, { label })} /></div>
                    <div className="min-w-0 flex-1"><CellInput label={`Detail ${i + 1} value`} placeholder="Value" value={d.value} onChange={(value) => detail(i, { value })} /></div>
                    <Button size="sm" onClick={() => set({ details: draft.details.filter((_, j) => j !== i) })}>Remove</Button>
                  </div>
                ))}
                <div><Button size="sm" onClick={() => set({ details: [...draft.details, { label: '', value: '' }] })}>Add a detail at the top</Button></div>
              </Fills>
            </div>

            <SectionLabel>1. Breakdown</SectionLabel>
            <Fills part="breakdown">
              <FieldRow>
                <Field name="sqm" label="Floor area (sqm)"><TextInput figures align="right" value={draft.sqm} onChange={(sqm) => set({ sqm })} /></Field>
                <Field name="rate" label="Rate per sqm"><TextInput figures align="right" placeholder="₱ a month" value={draft.rate} onChange={(rate) => set({ rate })} /></Field>
              </FieldRow>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                <Checkbox checked={draft.vat} onChange={(vat) => set({ vat })}>Add {VAT_RATE}% VAT</Checkbox>
                <Checkbox checked={draft.ewt} onChange={(ewt) => set({ ewt })}>Less {EWT_RATE}% expanded withholding tax</Checkbox>
              </div>
            </Fills>
            <div className="text-right" aria-live="polite">
              <p className="m-0 text-[13px] text-ink-2 tabular-nums">
                Base rent {peso(rent.base)}{draft.vat ? ` · VAT ${peso(rent.vat)}` : ''}{draft.ewt ? ` · EWT (${peso(rent.ewt)})` : ''}
              </p>
              <p className="m-0 font-display text-lg font-semibold text-gold-bright tabular-nums">{peso(rent.net)} a month</p>
            </div>

            <SectionLabel>2. Deposit and advance</SectionLabel>
            <Fills part="deposit">
              <FieldRow>
                <Field label="Reservation paid" hint="Taken off what is due on signing."><TextInput figures align="right" placeholder="None" value={draft.reservation} onChange={(reservation) => set({ reservation })} /></Field>
                <Field label="Reservation coverage"><TextInput placeholder="1 month deductible to advance rental" value={draft.reservationCoverage} onChange={(reservationCoverage) => set({ reservationCoverage })} /></Field>
                <Field label="Reservation check no."><TextInput placeholder="Cash deposit" value={draft.reservationCheck} onChange={(reservationCheck) => set({ reservationCheck })} /></Field>
              </FieldRow>
              <FieldRow>
              <Field name="depositMonths" label="Security deposit (months)" hint="Of base rent."><TextInput figures align="right" value={draft.depositMonths} onChange={(depositMonths) => set({ depositMonths })} /></Field>
                <Field label="Deposit coverage"><TextInput value={draft.depositCoverage} onChange={(depositCoverage) => set({ depositCoverage })} /></Field>
                <Field label="Deposit check no."><TextInput value={draft.depositCheck} onChange={(depositCheck) => set({ depositCheck })} /></Field>
              </FieldRow>
              <FieldRow>
              <Field name="advanceMonths" label="Advance rental (months)" hint="Of the monthly rent."><TextInput figures align="right" value={draft.advanceMonths} onChange={(advanceMonths) => set({ advanceMonths })} /></Field>
                <Field label="Advance coverage"><TextInput placeholder="Jan – Feb 2027" value={draft.advanceCoverage} onChange={(advanceCoverage) => set({ advanceCoverage })} /></Field>
                <Field label="Advance check no."><TextInput value={draft.advanceCheck} onChange={(advanceCheck) => set({ advanceCheck })} /></Field>
              </FieldRow>
            </Fills>
            <p className="m-0 text-right text-[13px] text-ink-2 tabular-nums" aria-live="polite">Due on signing {peso(dueOnSigning(live))}</p>

            <SectionLabel>3. Lease term and escalation</SectionLabel>
            <FieldRow>
              <Fills part="commencement"><Field name="commencement" label="Contract commencement"><TextInput type="date" value={draft.commencement} onChange={(commencement) => set({ commencement })} /></Field></Fills>
              <Fills part="lease">
                <Field name="termMonths" label="Term (months)"><TextInput figures align="right" value={draft.termMonths} onChange={(termMonths) => set({ termMonths })} /></Field>
                <Field name="escalation" label="Escalation a year (%)" hint="From the second year, on the year before’s rent."><TextInput figures align="right" value={draft.escalation} onChange={(escalation) => set({ escalation })} /></Field>
              </Fills>
            </FieldRow>
            <Fills part="leaseTerms"><Field label="Lease terms" hint="As it prints. Left empty, it prints the term and escalation."><TextInput value={draft.leaseTerms} onChange={(leaseTerms) => set({ leaseTerms })} /></Field></Fills>

            <SectionLabel>4. Postdated checks</SectionLabel>
            <Fills part="checks">
              <FieldRow>
                <Field name="pdcFirst" label="First month paid by check" hint={start ? `Empty: ${monthName(start)}, the month after the advance.` : 'Empty: the month after the advance.'}>
                  <TextInput figures placeholder={start || 'YYYY-MM'} value={draft.pdcFirst} onChange={(pdcFirst) => set({ pdcFirst })} />
                </Field>
                <Field name="pdcCount" label="Number of checks" hint={`Empty: ${pdcTotal({ ...live, pdcCount: 0 })}, the months the advance does not pay.`}>
                  <TextInput figures align="right" value={draft.pdcCount} onChange={(pdcCount) => set({ pdcCount })} />
                </Field>
                <Field name="pdcDay" label="Checks dated on" hint="Day of the rent month it pays."><TextInput figures align="right" value={draft.pdcDay} onChange={(pdcDay) => set({ pdcDay })} /></Field>
              </FieldRow>
              <FieldRow>
                <Field label="Bank"><TextInput value={draft.bank} onChange={(bank) => set({ bank })} /></Field>
                <Field label="First check number" hint="The rest follow it. Click a check number in the preview to change it."><TextInput figures value={draft.firstCheck} onChange={(firstCheck) => set({ firstCheck })} /></Field>
              </FieldRow>
            </Fills>
            <Fills part="notes"><Field label="Notes"><TextArea rows={4} value={draft.notes} onChange={(notes) => set({ notes })} /></Field></Fills>
          </FormCard>
        }
        preview={<SoaPaper ref={paper} soa={{ ...live, no: draft.editing ?? live.no }} company={companyOf(state)} onCheckNumber={(no, check) => setDraft(withCheckNumber(draft, no, check))} />}
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
