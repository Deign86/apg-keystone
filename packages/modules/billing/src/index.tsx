import { Button, Checkbox, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SectionLabel, SelectInput, StatusPill, TextArea, TextInput, useConfirm, type Column, type RowAction } from '@keystone/ui';
import { useCallback, useRef, useState } from 'react';
import { companyOf, count, nameOf, peso, shortDate, type Statement, SERVICES } from '@keystone/core';
import { billingFigure, billingFinding, billingWaiting, EWT_RATES, markOverdue, newStatement, outstanding, outstandingTotal, overdue, paidInto, payInto, saveStatement, setStatementStatus, setStatementsStatus, STATEMENT_STATUSES, statementDraftOf, statementTone, statementOf, statementsNewestFirst, statementTotals, withClient, statementPayments, type StatementDraft, type StatementStatus, ID, TAG, refersTo } from './rules';
import { BankAccountPicker, useDraft, useKeystone, useModuleApp, type ModuleApp, type ModuleDef, printElement, savePdf, FormCard, LineEditor, Workspace } from '@keystone/kit';
import { StatementPaper } from './StatementPaper';

const DRAFT = `${ID}.draft`;

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
  const app = useModuleApp();
  const accounts = keptAccounts(app);
  const confirm = useConfirm();
  const [draft, setDraft] = useDraft(DRAFT, () => newStatement(state, ctx, accounts));
  const [error, setError] = useState<string | null>(null);
  const paper = useRef<HTMLDivElement>(null);
  const editing = draft.editing ? state.bs.find((b) => b.no === draft.editing) : undefined;
  const live = statementOf(draft);
  const t = statementTotals(live);
  const open = outstanding(state);

  const save = useCallback((asNew = false) => {
    const r = run((s, c) => saveStatement(s, draft, c, asNew));
    setError(r.ok ? null : r.error);

    if (r.ok) setDraft(newStatement(r.state, ctx, keptAccounts(app, r.state)));
  }, [run, draft, ctx, setDraft, app]);

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
        actions={<Button onClick={() => { setDraft(newStatement(state, ctx, accounts)); setError(null); }}>New statement</Button>}
      />
      <Panel className="mb-4">
        <div className="mb-2 flex items-baseline justify-between">
          <SectionLabel>Statements issued</SectionLabel>
          <span className="text-xs text-ink-2">{count(state.bs.length, 'statement')}</span>
        </div>
        <Register
          label="Statements issued"
          columns={columns}
          rows={statementsNewestFirst(state)}
          rowKey={(b) => b.no}
          onOpen={(b) => { setDraft(statementDraftOf(b, state)); setError(null); notify(`${b.no} loaded into the form.`); }}
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
          empty={<EmptyState text="No statements yet." action={<Button size="sm" kind="primary" onClick={() => document.getElementById('bs-form')?.scrollIntoView({ block: 'start' })}>Bill the first client</Button>} />}
        />
      </Panel>

      <Workspace
        previewTitle="Document preview"
        form={
          <FormCard
            id="bs-form"
            eyebrow="Statement entry"
            title={editing ? `Editing ${editing.no}` : 'New statement'}
            onSubmit={() => save()}
            error={error}
            actions={<>
              <Button onClick={() => paper.current && printElement(paper.current)}>Print</Button>
              <Button onClick={() => paper.current && savePdf(paper.current, `${draft.editing ?? draft.no}.pdf`, files).then((n) => n && notify(`Saved ${n}.`), (e) => notify(String(e), 'error'))}>Export PDF</Button>
              {editing && <Button onClick={() => save(true)}>Save as new</Button>}
              <Button kind="primary" type="submit">{editing ? 'Save changes' : 'Save and mark as sent'}</Button>
            </>}
          >
            <FieldRow>
              <Field label="Invoice No." hint={editing ? undefined : 'The next number; change it if you need to.'}>
                <TextInput figures readOnly={!!editing} value={draft.editing ?? draft.no} onChange={(no) => setDraft({ ...draft, no })} />
              </Field>
              <Field label="Date"><TextInput type="date" value={draft.date} onChange={(date) => setDraft({ ...draft, date })} /></Field>
            </FieldRow>
            <FieldRow>
              <Field label="Invoice date"><TextInput type="date" value={draft.invoiceDate} onChange={(invoiceDate) => setDraft({ ...draft, invoiceDate })} /></Field>
              <Field label="Due date"><TextInput type="date" value={draft.due} onChange={(due) => setDraft({ ...draft, due })} /></Field>
            </FieldRow>
            <Field label="Bill to" hint="As it prints. A client’s name from the directory brings its VAT, withholding and Attention.">
              <TextInput placeholder="Client name" value={draft.client} onChange={(client) => setDraft(withClient(state, draft, client))} />
            </Field>
            <Field label="Attention"><TextInput placeholder="Contact person" value={draft.attention} onChange={(attention) => setDraft({ ...draft, attention })} /></Field>
            <LineEditor title="Charges" pricing="unit" lines={draft.lines} onChange={(lines) => setDraft({ ...draft, lines })} />
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Checkbox checked={draft.vat} onChange={(vat) => setDraft({ ...draft, vat })}>Add 12% VAT</Checkbox>
              <Checkbox checked={draft.ewt} onChange={(ewt) => setDraft({ ...draft, ewt })}>Less {draft.ewtRate}% expanded withholding tax</Checkbox>
            </div>
            {draft.ewt && (
              <Field label="EWT rate" hint="2% on services; 5% on rentals and professional fees.">
                <SelectInput
                  value={String(draft.ewtRate)}
                  onChange={(rate) => setDraft({ ...draft, ewtRate: Number(rate) })}
                  options={EWT_RATES.map((r) => ({ value: String(r), label: `${r}%` }))}
                />
              </Field>
            )}
            <div className="text-right" aria-live="polite">
              <p className="m-0 text-[13px] text-ink-2 tabular-nums">
                Subtotal {peso(t.subtotal)}{draft.vat ? ` · VAT ${peso(t.vat)}` : ''}{draft.ewt ? ` · EWT (${peso(t.ewt)})` : ''}
              </p>
              <p className="m-0 font-display text-lg font-semibold text-gold-bright tabular-nums">{peso(t.due)}</p>
            </div>
            <PayInto draft={draft} setDraft={setDraft} />
            <Field label="Payment instructions"><TextArea rows={7} value={draft.notes} onChange={(notes) => setDraft({ ...draft, notes })} /></Field>
            <Field label="Notes"><TextArea rows={4} value={draft.note} onChange={(note) => setDraft({ ...draft, note })} /></Field>
            <FieldRow min={140}>
              <Field label="Prepared by"><TextInput value={draft.prepared} onChange={(prepared) => setDraft({ ...draft, prepared })} /></Field>
              <Field label="Checked by"><TextInput value={draft.checked} onChange={(checked) => setDraft({ ...draft, checked })} /></Field>
              <Field label="Approved by"><TextInput value={draft.approved} onChange={(approved) => setDraft({ ...draft, approved })} /></Field>
            </FieldRow>
          </FormCard>
        }
        preview={<StatementPaper ref={paper} statement={{ ...live, no: draft.editing ?? draft.no }} billTo={draft.client} company={companyOf(state)} terms={companyOf(state).billingTerms} />}
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

    if (b) app.setDraft(DRAFT, statementDraftOf(b, app.state));
    app.go(ID);
  },
  create: { label: 'New statement', run: (app) => { app.setDraft(DRAFT, newStatement(app.state, app.ctx, keptAccounts(app))); app.go(ID); } },
  refersTo,
  selects: { Client: 'Billing Statements' },
  logTags: { [TAG]: 'Billing' },
  onOpen: markOverdue,
  provides: { [SERVICES.statementPayments]: statementPayments },
  Screen: Billing,
};
