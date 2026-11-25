import { Button, Checkbox, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SelectInput, StatusPill, Tabs, TextArea, TextInput, useConfirm, type Column, type Refusal, type RowAction } from '@keystone/ui';
import { useCallback, useRef, useState } from 'react';
import { companyOf, count, nameOf, peso, shortDate, type Statement, SERVICES } from '@keystone/core';
import { billingFigure, billingFinding, billingWaiting, EWT_RATES, markOverdue, newStatement, outstanding, outstandingTotal, overdue, statementDraftBlank, statementDraftFrom, statementDraftTitle, paidInto, payInto, saveStatement, setStatementStatus, setStatementsStatus, STATEMENT_STATUSES, statementDraftOf, statementTone, statementOf, statementsNewestFirst, statementTotals, withClient, withStatementDate, statementPayments, type StatementDraft, type StatementStatus, ID, TAG, refersTo } from './rules';
import { BankAccountPicker, Fills, SaveDraftButton, SavedDrafts, SignatoryPicker, useDraft, useSavedDrafts, useKeystone, useModuleApp, type ModuleApp, type ModuleDef, printElement, savePdf, FormCard, LineEditor, Workspace } from '@keystone/kit';
import { StatementPaper } from './StatementPaper';

const DRAFT = `${ID}.draft`;

/** The screen's two tabs: the statements issued, and the form with the statement it prints. */
type View = 'register' | 'entry';

/** Which tab is shown, kept with the drafts so it is the same on coming back; Overview's and Home's actions open the form's. */
const VIEW = `${ID}.view`;

/** The accounts Bank Accounts keeps, for a new statement to pay into; none without that service. */
const keptAccounts = (app: ModuleApp, state = app.state) => app.service(SERVICES.bankAccounts)?.accounts(state) ?? [];

/**
 * "Pay into", when Bank Accounts is installed: the account a client pays into, picked, added under Others or removed as
 * a voucher's bank is. Picking one writes it into the payment instructions; the one shown is the account they name.
 */
function PayInto({ draft, setDraft }: { draft: StatementDraft; setDraft: (d: StatementDraft) => void }) {
  const { state } = useKeystone();
  const banks = useModuleApp().service(SERVICES.bankAccounts);

  if (!banks) return null;
  const named = paidInto(draft.notes, banks.accounts(state));

  return (
    <BankAccountPicker
      label="Pay into"
      value={named ? banks.label(named) : ''}
      onChange={(_, account) => { if (account) setDraft({ ...draft, notes: payInto(draft.notes, account) }); }}
      hint="Writes the account into the payment instructions. Others adds one not listed."
      noneHint="No bank accounts are kept yet: add the one clients pay into under Others, or type the instructions below."
      after="every statement after this one"
      kept="Statements already issued keep the payment instructions written on them."
    />
  );
}

function Billing() {
  const { state, ctx, run, files, notify } = useKeystone();
  // Everyone who has signed a statement, to pick again.
  const signed = state.bs.flatMap((b) => [b.prepared ?? '', b.checked ?? '', b.approved ?? '']);
  const app = useModuleApp();
  const accounts = keptAccounts(app);
  const confirm = useConfirm();
  const [draft, setDraft] = useDraft(DRAFT, () => newStatement(state, ctx, accounts));
  const [view, setView] = useDraft<View>(VIEW, () => 'register');
  const drafts = useSavedDrafts(draft, setDraft, { module: ID, title: statementDraftTitle, blank: statementDraftBlank, restore: (d) => statementDraftFrom(state, ctx, accounts, d) });
  const [error, setError] = useState<Refusal | null>(null);
  const paper = useRef<HTMLDivElement>(null);
  const editing = draft.editing ? state.bs.find((b) => b.no === draft.editing) : undefined;
  const live = statementOf(draft);
  const t = statementTotals(live);
  const open = outstanding(state);

  const save = useCallback((asNew = false) => {
    const r = run((s, c) => saveStatement(s, draft, c, asNew));
    setError(r.ok ? null : r);

    if (!r.ok) return;
    drafts.finish(draft);
    setDraft(newStatement(r.state, ctx, keptAccounts(app, r.state)));
  }, [run, draft, ctx, setDraft, app, drafts]);

  const columns: Column<Statement>[] = [
    { key: 'no', header: 'Invoice No.', width: 128, cell: (b) => <span className="font-semibold text-gold-bright tabular-nums">{b.no}</span> },
    { key: 'client', header: 'Client', cell: (b) => nameOf(state, b.client) },
    { key: 'invoiced', header: 'Invoice date', width: 120, cell: (b) => <span className="text-ink-2 tabular-nums">{shortDate(b.invoiceDate ?? b.date)}</span> },
    { key: 'due', header: 'Due', width: 104, cell: (b) => <span className="text-ink-2 tabular-nums">{shortDate(b.due)}</span> },
    { key: 'amount', header: 'Amount due', width: 132, align: 'right', cell: (b) => <span className="font-semibold">{peso(statementTotals(b).due)}</span> },
    { key: 'status', header: 'Status', width: 150, align: 'right', cell: (b) => <StatusPill status={b.status} tone={statementTone(b.status)} /> },
  ];

  return (
    <>
      <ScreenHeader
        eyebrow="Receivables"
        title="Billing Statements"
        line={open.length
          ? `${peso(outstandingTotal(state))} outstanding on ${count(open.length, 'statement')}, ${overdue(state).length} overdue.`
          : 'Every statement is paid. VAT and withholding follow each client’s setup in the directory.'}
        actions={<Button onClick={() => { setDraft(newStatement(state, ctx, accounts)); setError(null); setView('entry'); }}>New statement</Button>}
      />
      <Tabs<View>
        label="Billing statements"
        value={view}
        onChange={setView}
        tabs={[
          {
            value: 'register',
            label: 'Statements issued',
            note: state.bs.length,
            panel: (
              <>
              <SavedDrafts drafts={drafts} noun="statement" onOpen={() => { setError(null); setView('entry'); }} />
              <Panel>
                <Register
                  label="Statements issued"
                  columns={columns}
                  rows={statementsNewestFirst(state)}
                  rowKey={(b) => b.no}
                  onOpen={(b) => { setDraft(statementDraftOf(b, state)); setError(null); notify(`${b.no} loaded into the form.`); setView('entry'); }}
                  actions={(b) => [
                    ...STATEMENT_STATUSES.filter((s) => s !== 'Void').map((s) => ({ label: `Mark ${s.toLowerCase()}`, disabled: b.status === s || b.status === 'Void', onSelect: () => run((st, c) => setStatementStatus(st, b.no, s, c)) })),
                    { label: 'Void statement…', danger: true, disabled: b.status === 'Void', onSelect: () => confirm({ title: `Void ${b.no}?`, body: `${peso(statementTotals(b).due)} billed to ${nameOf(state, b.client)}. A void statement stays in the register and cannot be reopened.`, confirm: 'Void statement', danger: true, onConfirm: () => run((st, c) => setStatementStatus(st, b.no, 'Void', c)) }) },
                  ]}
                  bulk={(picked, clear): RowAction[] => {
                    const open = picked.filter((b) => b.status !== 'Void');
                    const to = (status: StatementStatus) => open.filter((b) => b.status !== status);
                    const move = (status: StatementStatus, nos: string[]) => { if (run((st, c) => setStatementsStatus(st, nos, status, c)).ok) clear(); };

                    return [
                      ...STATEMENT_STATUSES.filter((s) => s !== 'Void').map((s) => ({ label: `Mark ${s.toLowerCase()} (${to(s).length})`, disabled: !to(s).length, onSelect: () => move(s, to(s).map((b) => b.no)) })),
                      { label: `Void (${open.length})…`, danger: true, disabled: !open.length, onSelect: () => confirm({ title: `Void ${count(open.length, 'statement')}?`, body: `${open.map((b) => b.no).join(', ')}. A void statement stays in the register and cannot be reopened.`, confirm: 'Void statements', danger: true, onConfirm: () => move('Void', open.map((b) => b.no)) }) },
                    ];
                  }}
                  empty={<EmptyState text="No statements yet." action={<Button size="sm" kind="primary" onClick={() => setView('entry')}>Bill the first client</Button>} />}
                />
              </Panel>
              </>
            ),
          },
          {
            value: 'entry',
            label: 'Statement entry',
            note: editing ? editing.no : 'New',
            panel: (
              <Workspace
                previewTitle="Document preview"
                form={
                  <FormCard
                    id="bs-form"
                    holds={editing && { label: editing.no, find: (s) => s.bs.find((b) => b.no === editing.no) }}
                    eyebrow="Statement entry"
                    title={editing ? `Editing ${editing.no}` : 'New statement'}
                    onSubmit={() => save()}
                    error={error}
                    actions={<>
                      <Button onClick={() => paper.current && printElement(paper.current)}>Print</Button>
                      <Button onClick={() => paper.current && savePdf(paper.current, `${draft.editing ?? draft.no}.pdf`, files).then((n) => n && notify(`Saved ${n}.`), (e) => notify(String(e), 'error'))}>Export PDF</Button>
                      {editing && <Button onClick={() => save(true)}>Save as new</Button>}
                      <SaveDraftButton drafts={drafts} />
                      <Button kind="primary" type="submit">{editing ? 'Save changes' : 'Save and mark as sent'}</Button>
                    </>}
                  >
                    <FieldRow>
                      <Fills part="no">
                        <Field label="Invoice No." hint={editing ? undefined : 'The next number; change it if you need to.'}>
                          <TextInput figures readOnly={!!editing} value={draft.editing ?? draft.no} onChange={(no) => setDraft({ ...draft, no })} />
                        </Field>
                      </Fills>
                      <Fills part="date"><Field label="Date"><TextInput type="date" value={draft.date} onChange={(date) => setDraft(withStatementDate(state, draft, date))} /></Field></Fills>
                    </FieldRow>
                    <FieldRow>
                      <Fills part="invoiceDate"><Field label="Invoice date"><TextInput type="date" value={draft.invoiceDate} onChange={(invoiceDate) => setDraft({ ...draft, invoiceDate })} /></Field></Fills>
                      <Fills part="due"><Field name="due" label="Due date"><TextInput type="date" value={draft.due} onChange={(due) => setDraft({ ...draft, due })} /></Field></Fills>
                    </FieldRow>
                    <Fills part="paymentMode"><Field label="Mode of payment" hint="How Bill to pays, as it prints in the invoice box under the due date."><TextInput placeholder="Check, bank transfer, cash" value={draft.paymentMode} onChange={(paymentMode) => setDraft({ ...draft, paymentMode })} /></Field></Fills>
                    <Fills part="billTo">
                      <Field name="client" label="Bill to" hint="As it prints. A client’s name from the directory brings its TIN, VAT, withholding and Attention.">
                        <TextInput capitalize placeholder="Client name" value={draft.client} onChange={(client) => setDraft(withClient(state, draft, client))} />
                      </Field>
                    </Fills>
                    <Fills part="address"><Field label="Address" hint="Bill to’s address, as it prints under the name."><TextInput placeholder="Street, city" value={draft.address} onChange={(address) => setDraft({ ...draft, address })} /></Field></Fills>
                    <Fills part="tin"><Field label="TIN" hint="Bill to’s TIN, as it prints under the address. A client’s from the directory comes with its name."><TextInput placeholder="000-000-000-000" value={draft.tin} onChange={(tin) => setDraft({ ...draft, tin })} /></Field></Fills>
                    <Fills part="attention"><Field label="Attention"><TextInput capitalize placeholder="Contact person" value={draft.attention} onChange={(attention) => setDraft({ ...draft, attention })} /></Field></Fills>
                    <Fills part="lines"><LineEditor title="Charges" pricing="unit" lines={draft.lines} onChange={(lines) => setDraft({ ...draft, lines })} /></Fills>
                    <Fills part="totals">
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        <Checkbox checked={draft.vat} onChange={(vat) => setDraft({ ...draft, vat })}>Add 12% VAT</Checkbox>
                        <Checkbox checked={draft.ewt} onChange={(ewt) => setDraft({ ...draft, ewt })}>Less {draft.ewtRate}% expanded withholding tax</Checkbox>
                      </div>
                      {draft.ewt && (
                      <Field name="ewtRate" label="EWT rate" hint="2% on services; 5% on rentals and professional fees.">
                          <SelectInput
                            value={String(draft.ewtRate)}
                            onChange={(rate) => setDraft({ ...draft, ewtRate: Number(rate) })}
                            options={EWT_RATES.map((r) => ({ value: String(r), label: `${r}%` }))}
                          />
                        </Field>
                      )}
                    </Fills>
                    <div className="text-right" aria-live="polite">
                      <p className="m-0 text-[13px] text-ink-2 tabular-nums">
                        Subtotal {peso(t.subtotal)}{draft.vat ? ` · VAT ${peso(t.vat)}` : ''}{draft.ewt ? ` · EWT (${peso(t.ewt)})` : ''}
                      </p>
                      <p className="m-0 font-display text-lg font-semibold text-gold-bright tabular-nums">{peso(t.due)}</p>
                    </div>
                    <Fills part="notes">
                      <PayInto draft={draft} setDraft={setDraft} />
                      <Field label="Payment instructions"><TextArea rows={7} value={draft.notes} onChange={(notes) => setDraft({ ...draft, notes })} /></Field>
                    </Fills>
                    <Fills part="penalty"><Field label="Penalty" hint="The late-payment penalty, printed under the payment instructions."><TextArea rows={2} value={draft.penalty} onChange={(penalty) => setDraft({ ...draft, penalty })} /></Field></Fills>
                    <Fills part="note"><Field label="Notes" hint="Optional. The statement prints Notes only when something is typed here."><TextArea rows={4} value={draft.note} onChange={(note) => setDraft({ ...draft, note })} /></Field></Fills>
                    {/* Each signatory's name over their position, as the statement prints them. */}
                    <FieldRow min={120}>
                      <Fills part="prepared">
                        <div className="flex min-w-0 flex-col gap-2.5">
                          <SignatoryPicker label="Prepared by" names={signed} value={draft.prepared} onChange={(prepared) => setDraft({ ...draft, prepared })} />
                          <Field label="Preparer's position"><TextInput value={draft.preparedPos} onChange={(preparedPos) => setDraft({ ...draft, preparedPos })} /></Field>
                        </div>
                      </Fills>
                      <Fills part="checked">
                        <div className="flex min-w-0 flex-col gap-2.5">
                          <SignatoryPicker label="Checked by" names={signed} value={draft.checked} onChange={(checked) => setDraft({ ...draft, checked })} />
                          <Field label="Checker's position"><TextInput value={draft.checkedPos} onChange={(checkedPos) => setDraft({ ...draft, checkedPos })} /></Field>
                        </div>
                      </Fills>
                      <Fills part="approved">
                        <div className="flex min-w-0 flex-col gap-2.5">
                          <SignatoryPicker label="Approved by" names={signed} value={draft.approved} onChange={(approved) => setDraft({ ...draft, approved })} />
                          <Field label="Approver's position"><TextInput value={draft.approvedPos} onChange={(approvedPos) => setDraft({ ...draft, approvedPos })} /></Field>
                        </div>
                      </Fills>
                    </FieldRow>
                  </FormCard>
                }
                preview={<StatementPaper ref={paper} statement={{ ...live, no: draft.editing ?? draft.no }} billTo={draft.client} company={companyOf(state)} terms={companyOf(state).billingTerms} />}
              />
            ),
          },
        ]}
      />
    </>
  );
}

export const billingModule: ModuleDef = {
  id: ID,
  title: 'Billing Statements',
  blurb: 'Issue statements of account, with VAT and withholding from each client’s setup.',
  order: 3,
  onHome: true,
  stat: (s) => ['Outstanding', peso(outstandingTotal(s))],
  figure: billingFigure,
  finding: billingFinding,
  waiting: billingWaiting,
  openWaiting: (no, app) => {
    const b = app.state.bs.find((x) => x.no === no);

    if (b) {
      app.setDraft(DRAFT, statementDraftOf(b, app.state));
      app.setDraft<View>(VIEW, 'entry');
    }

    app.go(ID);
  },
  create: { label: 'New statement', run: (app) => { app.setDraft(DRAFT, newStatement(app.state, app.ctx, keptAccounts(app))); app.setDraft<View>(VIEW, 'entry'); app.go(ID); } },
  refersTo,
  selects: { Client: 'Billing Statements' },
  logTags: { [TAG]: 'Billing' },
  onOpen: markOverdue,
  provides: { [SERVICES.statementPayments]: statementPayments },
  Screen: Billing,
};
