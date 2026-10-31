import { Button, Checkbox, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SectionLabel, SelectInput, StatusPill, TextArea, TextInput, useConfirm, type Column } from '@keystone/ui';
import { useCallback, useRef, useState } from 'react';
import { count, peso, recordOf, recordsOf, shortDate, STATEMENT_STATUSES, toneOf, type Statement, SERVICES } from '@keystone/core';
import { billingFigure, billingFinding, billingWaiting, markOverdue, newStatement, outstanding, outstandingTotal, overdue, saveStatement, setStatementStatus, statementDraftOf, statementOf, statementsNewestFirst, statementTotals, withClient, statementPayments } from './rules';
import { useDraft, useKeystone, type ModuleDef, printElement, savePdf, FormCard, LineEditor, Workspace } from '@keystone/kit';
import { StatementPaper } from './StatementPaper';

const DRAFT = 'billing.draft';

function Billing() {
  const { state, ctx, run, platform, notify, store } = useKeystone();
  const confirm = useConfirm();
  const [draft, setDraft] = useDraft(DRAFT, () => newStatement(state, ctx));
  const [error, setError] = useState<string | null>(null);
  const paper = useRef<HTMLDivElement>(null);
  const editing = draft.editing ? state.bs.find((b) => b.no === draft.editing) : undefined;
  const live = statementOf(draft);
  const t = statementTotals(live);
  const open = outstanding(state);

  const save = useCallback((asNew = false) => {
    const r = run((s, c) => saveStatement(s, draft, c, asNew));
    setError(r.ok ? null : r.error);

    if (r.ok) setDraft(newStatement(store.getState(), ctx));
  }, [run, draft, ctx, setDraft, store]);

  const columns: Column<Statement>[] = [
    { key: 'no', header: 'Invoice No.', width: 128, cell: (b) => <span className="font-semibold text-gold-bright tabular-nums">{b.no}</span> },
    { key: 'client', header: 'Client', cell: (b) => recordOf(state, b.client)?.name ?? b.client },
    { key: 'invoiced', header: 'Invoice date', width: 120, cell: (b) => <span className="text-ink-2 tabular-nums">{shortDate(b.invoiceDate ?? b.date)}</span> },
    { key: 'due', header: 'Due', width: 104, cell: (b) => <span className="text-ink-2 tabular-nums">{shortDate(b.due)}</span> },
    { key: 'amount', header: 'Amount due', width: 132, align: 'right', cell: (b) => <span className="font-semibold">{peso(statementTotals(b).due)}</span> },
    { key: 'status', header: 'Status', width: 150, align: 'right', cell: (b) => <StatusPill status={b.status} tone={toneOf(b.status)} /> },
  ];

  return (
    <>
      <ScreenHeader
        eyebrow="Receivables"
        title="Billing Statements"
        line={open.length
          ? `${peso(outstandingTotal(state))} outstanding on ${count(open.length, 'statement')}, ${overdue(state).length} overdue.`
          : 'Every statement is paid. VAT and withholding follow each client’s setup in the directory.'}
        actions={<Button onClick={() => { setDraft(newStatement(state, ctx)); setError(null); }}>New statement</Button>}
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
          onOpen={(b) => { setDraft(statementDraftOf(b, ctx)); setError(null); notify(`${b.no} loaded into the form.`); }}
          actions={(b) => [
            ...STATEMENT_STATUSES.filter((s) => s !== 'Void').map((s) => ({ label: `Mark ${s.toLowerCase()}`, disabled: b.status === s || b.status === 'Void', onSelect: () => run((st, c) => setStatementStatus(st, b.no, s, c)) })),
            { label: 'Void statement…', danger: true, disabled: b.status === 'Void', onSelect: () => confirm({ title: `Void ${b.no}?`, body: `${peso(statementTotals(b).due)} billed to ${recordOf(state, b.client)?.name ?? b.client}. A void statement stays in the register and cannot be reopened.`, confirm: 'Void statement', danger: true, onConfirm: () => run((st, c) => setStatementStatus(st, b.no, 'Void', c)) }) },
          ]}
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
              <Button onClick={() => paper.current && savePdf(paper.current, `${draft.editing ?? draft.no}.pdf`, platform).then((n) => n && notify(`Saved ${n}.`), (e) => notify(String(e), 'error'))}>Export PDF</Button>
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
            <Field label="Bill to" hint="VAT, withholding and Attention follow the client’s setup in the directory.">
              <SelectInput value={draft.client} onChange={(client) => setDraft(withClient(state, draft, client))} options={recordsOf(state, 'Client').map((d) => ({ value: d.code, label: `${d.name} (${d.code})` }))} />
            </Field>
            <Field label="Attention"><TextInput placeholder="Contact person" value={draft.attention} onChange={(attention) => setDraft({ ...draft, attention })} /></Field>
            <LineEditor title="Charges" pricing="unit" lines={draft.lines} onChange={(lines) => setDraft({ ...draft, lines })} />
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Checkbox checked={draft.vat} onChange={(vat) => setDraft({ ...draft, vat })}>Add 12% VAT</Checkbox>
              <Checkbox checked={draft.ewt} onChange={(ewt) => setDraft({ ...draft, ewt })}>Less 5% expanded withholding tax</Checkbox>
            </div>
            <div className="text-right" aria-live="polite">
              <p className="m-0 text-xs text-ink-2 tabular-nums">
                Subtotal {peso(t.subtotal)}{draft.vat ? ` · VAT ${peso(t.vat)}` : ''}{draft.ewt ? ` · EWT (${peso(t.ewt)})` : ''}
              </p>
              <p className="m-0 font-display text-lg font-semibold text-gold-bright tabular-nums">{peso(t.due)}</p>
            </div>
            <Field label="Payment instructions"><TextArea rows={7} value={draft.notes} onChange={(notes) => setDraft({ ...draft, notes })} /></Field>
            <Field label="Notes"><TextArea rows={4} value={draft.note} onChange={(note) => setDraft({ ...draft, note })} /></Field>
          </FormCard>
        }
        preview={<StatementPaper ref={paper} statement={{ ...live, no: draft.editing ?? draft.no }} client={recordOf(state, draft.client)} company={ctx.seed.company} terms={ctx.seed.reference.defaults.billingTerms} />}
      />
    </>
  );
}

export const billingModule: ModuleDef = {
  id: 'billing',
  title: 'Billing Statements',
  section: 'Receivables',
  blurb: 'Issue statements of account with VAT and withholding computed from each client’s setup.',
  order: 3,
  onHome: true,
  stat: (s) => ['Outstanding', peso(outstandingTotal(s))],
  figure: billingFigure,
  finding: billingFinding,
  waiting: billingWaiting,
  openWaiting: (no, app) => {
    const b = app.state.bs.find((x) => x.no === no);

    if (b) app.setDraft(DRAFT, statementDraftOf(b, app.ctx));
    app.go('billing');
  },
  create: { label: 'New statement', run: (app) => { app.setDraft(DRAFT, newStatement(app.state, app.ctx)); app.go('billing'); } },
  logTags: { BS: 'Billing' },
  onOpen: markOverdue,
  provides: { [SERVICES.statementPayments]: statementPayments },
  Screen: Billing,
};
