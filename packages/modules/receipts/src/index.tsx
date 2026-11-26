import { Button, Checkbox, EarlierPicks, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SectionLabel, SelectInput, TextArea, TextInput, useConfirm, type Column, type Refusal } from '@keystone/ui';
import { useCallback, useMemo, useRef, useState } from 'react';
import { companyOf, count, peso, shortDate } from '@keystone/core';
import { Fills, FormCard, LineEditor, printElement, SaveDraftButton, SavedDrafts, savePdf, useDraft, useKeystone, useSavedDrafts, Workspace, type ModuleDef } from '@keystone/kit';
import {
  earlierReceiptEntries, ID, newReceipt, PAY_MODES, receiptDraftBlank, receiptDraftFrom, receiptDraftOf, receiptDraftTitle, receiptOf, receiptsLine,
  receiptsNewestFirst, receiptsOf, receiptTotal, rememberedReceiptLines, removeReceipt, saveReceipt, TAG, withPayor, type Receipt, type ReceiptDraft,
} from './rules';
import { ReceiptPaper } from './ReceiptPaper';

const DRAFT = `${ID}.draft`;

/** Whether the receiver's e-signature prints: kept with the drafts; money is signed for by hand unless it is ticked. */
const ESIGN = `${ID}.esign`;

const MODES = PAY_MODES.map((m) => ({ value: m, label: m }));

function Receipts() {
  const { state, ctx, run, files, notify } = useKeystone();
  const confirm = useConfirm();
  const [draft, setDraft] = useDraft<ReceiptDraft>(DRAFT, () => newReceipt(state, ctx));
  const [eSigned, setESigned] = useDraft(ESIGN, () => false);
  const drafts = useSavedDrafts(draft, setDraft, { module: ID, title: receiptDraftTitle, blank: receiptDraftBlank, restore: (d) => receiptDraftFrom(state, ctx, d) });
  const [error, setError] = useState<Refusal | null>(null);
  const paper = useRef<HTMLElement>(null);
  const live = receiptOf(draft);
  const set = (patch: Partial<ReceiptDraft>) => setDraft({ ...draft, ...patch });
  // Repeated details (docs/adr/0053): what the receipts saved before offer the form.
  const offered = useMemo(() => earlierReceiptEntries(state), [state]);
  const remembered = useMemo(() => rememberedReceiptLines(state), [state]);

  const save = useCallback((asNew = false) => {
    const r = run((s, c) => saveReceipt(s, draft, c, asNew));
    setError(r.ok ? null : r);

    if (!r.ok) return;
    drafts.finish(draft);
    setDraft(newReceipt(r.state, ctx));
  }, [run, draft, ctx, setDraft, drafts]);

  const toForm = () => document.getElementById('ar-form')?.scrollIntoView({ block: 'start' });

  const columns: Column<Receipt>[] = [
    { key: 'no', header: 'Receipt No.', width: 128, cell: (r) => <span className="font-semibold text-gold-bright tabular-nums">{r.no}</span> },
    { key: 'date', header: 'Date', width: 112, cell: (r) => <span className="text-ink-2 tabular-nums">{shortDate(r.date)}</span> },
    { key: 'payor', header: 'Received from', cell: (r) => <>{r.payor}{r.company && <span className="block text-xs text-ink-2">{r.company}</span>}</> },
    { key: 'mode', header: 'Mode', width: 120, cell: (r) => r.mode },
    { key: 'amount', header: 'Amount', width: 132, align: 'right', cell: (r) => <span className="font-semibold">{peso(receiptTotal(r))}</span> },
  ];

  return (
    <>
      <ScreenHeader
        eyebrow="Collections"
        title="Acknowledgement Receipts"
        line={receiptsLine(state)}
        actions={<Button onClick={() => { setDraft(newReceipt(state, ctx)); setError(null); toForm(); }}>New receipt</Button>}
      />
      <SavedDrafts drafts={drafts} noun="receipt" onOpen={() => { setError(null); toForm(); }} />
      <Panel className="mb-4">
        <div className="mb-2 flex items-baseline justify-between">
          <SectionLabel>Receipts issued</SectionLabel>
          <span className="text-xs text-ink-2">{count(receiptsOf(state).length, 'receipt')}</span>
        </div>
        <Register
          label="Receipts issued"
          columns={columns}
          rows={receiptsNewestFirst(state)}
          rowKey={(r) => r.no}
          onOpen={(r) => { setDraft(receiptDraftOf(r)); setError(null); notify(`${r.no} loaded into the form.`); toForm(); }}
          actions={(r) => [{
            label: 'Remove…', danger: true,
            onSelect: () => confirm({
              title: `Remove ${r.no}?`, body: `The receipt for ${peso(receiptTotal(r))} from ${r.payor} is removed. A printed copy is not affected.`,
              confirm: 'Remove receipt', danger: true,
              onConfirm: () => {
                const out = run((s, c) => removeReceipt(s, r.no, c));

                if (out.ok && draft.editing === r.no) setDraft(newReceipt(out.state, ctx));
              },
            }),
          }]}
          empty={<EmptyState text="No receipts yet." action={<Button size="sm" kind="primary" onClick={toForm}>Issue the first one</Button>} />}
        />
      </Panel>

      <Workspace
        previewTitle="Acknowledgement receipt"
        form={
          <FormCard
            id="ar-form"
            holds={draft.editing ? { label: draft.editing, find: (s) => receiptsOf(s).find((r) => r.no === draft.editing) } : undefined}
            eyebrow="Receipt entry"
            title={draft.editing ? `Editing ${draft.editing}` : 'New receipt'}
            onSubmit={() => save()}
            error={error}
            actions={<>
              <Button onClick={() => paper.current && printElement(paper.current)}>Print</Button>
              <Button onClick={() => paper.current && savePdf(paper.current, `${draft.editing ?? (live.no || 'Acknowledgement receipt')}.pdf`, files).then((n) => n && notify(`Saved ${n}.`), (e) => notify(String(e), 'error'))}>Export PDF</Button>
              {draft.editing && <Button onClick={() => save(true)}>Save as new</Button>}
              <SaveDraftButton drafts={drafts} />
              <Button kind="primary" type="submit">{draft.editing ? 'Save changes' : 'Save receipt'}</Button>
            </>}
          >
            <FieldRow>
              <Fills part="no">
                <Field name="no" label="Receipt No." hint={draft.editing ? undefined : 'The next number; change it if you need to.'}>
                  <TextInput figures readOnly={!!draft.editing} value={draft.editing ?? draft.no} onChange={(no) => set({ no })} />
                </Field>
              </Fills>
              <Fills part="date"><Field name="date" label="Date"><TextInput type="date" value={draft.date} onChange={(date) => set({ date })} /></Field></Fills>
            </FieldRow>
            <FieldRow>
              <Fills part="transaction"><Field label="Transaction No." hint="Optional."><TextInput value={draft.transaction} onChange={(transaction) => set({ transaction })} /></Field></Fills>
              <Fills part="reference"><Field label="Reference" hint="Optional."><TextInput value={draft.reference} onChange={(reference) => set({ reference })} /></Field></Fills>
            </FieldRow>

            <SectionLabel>Client information</SectionLabel>
            <Fills part="payor">
              <Field name="payor" label="Client / Payor name" hint="Someone who paid before brings their company, contact number and email.">
                <TextInput capitalize suggestions={offered.payors} value={draft.payor} onChange={(payor) => setDraft(withPayor(state, draft, payor))} />
              </Field>
            </Fills>
            <Fills part="company"><Field label="Company name" hint="Optional."><TextInput suggestions={offered.companies} value={draft.company} onChange={(company) => set({ company })} /></Field></Fills>
            <FieldRow>
              <Fills part="contact"><Field label="Contact number"><TextInput type="tel" value={draft.contact} onChange={(contact) => set({ contact })} /></Field></Fills>
              <Fills part="email"><Field name="email" label="Email"><TextInput type="email" value={draft.email} onChange={(email) => set({ email })} /></Field></Fills>
            </FieldRow>

            <SectionLabel>Payment details</SectionLabel>
            <Fills part="lines"><LineEditor title="Particulars" lines={draft.lines} remembered={remembered} onChange={(lines) => set({ lines })} /></Fills>
            <p className="m-0 text-right font-display text-lg font-semibold text-gold-bright tabular-nums" aria-live="polite">
              <span className="sr-only">Total amount received </span>{peso(receiptTotal(live))}
            </p>

            <SectionLabel>Mode of payment</SectionLabel>
            <Fills part="mode">
              <Field label="Paid by"><SelectInput value={draft.mode} onChange={(mode) => set({ mode: PAY_MODES.find((m) => m === mode) ?? 'Cash' })} options={MODES} /></Field>
            </Fills>
            {draft.mode !== 'Cash' && (
              <FieldRow>
                <Fills part="paymentRef"><Field label="Payment reference / Transaction ID" hint="Optional."><TextInput value={draft.paymentRef} onChange={(paymentRef) => set({ paymentRef })} /></Field></Fills>
                <Fills part="channel"><Field label="Bank / Payment channel"><TextInput suggestions={offered.channels} value={draft.channel} onChange={(channel) => set({ channel })} /></Field></Fills>
              </FieldRow>
            )}
            {draft.mode === 'Check' && (
              <FieldRow>
                <Fills part="check"><Field name="check" label="Check No."><TextInput figures value={draft.check} onChange={(check) => set({ check })} /></Field></Fills>
                <Fills part="checkDate"><Field name="checkDate" label="Check date"><TextInput type="date" value={draft.checkDate} onChange={(checkDate) => set({ checkDate })} /></Field></Fills>
              </FieldRow>
            )}

            <Fills part="remarks">
              <Field label="Transaction remarks" hint="Optional."><TextArea value={draft.remarks} onChange={(remarks) => set({ remarks })} /></Field>
              <EarlierPicks values={offered.remarks} value={draft.remarks} onPick={(remarks) => set({ remarks })} />
            </Fills>

            <SectionLabel>Received by</SectionLabel>
            <FieldRow>
              <Fills part="receivedBy"><Field label="Name"><TextInput capitalize suggestions={offered.receivers} value={draft.receivedBy} onChange={(receivedBy) => set({ receivedBy })} /></Field></Fills>
              <Fills part="receivedBy"><Field label="Position"><TextInput suggestions={offered.positions} value={draft.position} onChange={(position) => set({ position })} /></Field></Fills>
            </FieldRow>
            <Fills part="receivedOn"><Field label="Date received"><TextInput type="date" value={draft.receivedOn} onChange={(receivedOn) => set({ receivedOn })} /></Field></Fills>
            <Checkbox checked={eSigned} onChange={setESigned}>Show the e-signature on the receipt (leave unticked to sign by hand)</Checkbox>
          </FormCard>
        }
        preview={<ReceiptPaper ref={paper} receipt={{ ...live, no: draft.editing ?? live.no }} company={companyOf(state)} eSigned={eSigned} />}
      />
    </>
  );
}

export const receiptsModule: ModuleDef = {
  id: ID,
  title: 'Acknowledgement Receipts',
  blurb: 'Acknowledge a payment received, by cash, bank transfer or check, on the company’s receipt form.',
  // After Statements of Account, with the other documents.
  order: 3.7,
  onHome: true,
  stat: (s) => ['Issued', String(receiptsOf(s).length)],
  create: { label: 'New acknowledgement receipt', run: (app) => { app.setDraft(DRAFT, newReceipt(app.state, app.ctx)); app.go(ID); } },
  logTags: { [TAG]: 'Acknowledgement Receipts' },
  Screen: Receipts,
};
