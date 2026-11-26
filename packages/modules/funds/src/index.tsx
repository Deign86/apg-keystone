import { Button, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SectionLabel, SelectInput, StatusPill, Tabs, TextArea, TextInput, useConfirm, type Column, type Refusal, type RowAction } from '@keystone/ui';
import { useCallback, useMemo, useRef, useState } from 'react';
import { changeEach, companyOf, count, nameOf, payees, peso, SERVICES, shortDate, toCentavos, type TerminalState } from '@keystone/core';
import { Fills, FormCard, LineEditor, printElement, SaveDraftButton, SavedDrafts, savePdf, useDraft, useKeystone, useModuleApp, useSavedDrafts, Workspace, type ModuleDef } from '@keystone/kit';
import {
  accountLabel, ASAP, decideRefusal, decideRequest, decides, decisionLine, expensesOf, fileRequest, fundsFigure, fundsFinding,
  fundsLine, fundsWaiting, newRequest, requestDocuments, requestDraftBlank, requestDraftFrom, requestDraftOf, requestDraftTitle, requestLock, requestOf, requestPreview, requestsNewestFirst,
  requestTone, requestTotal, settleText, transferReady, waitingRequests, withdrawRequest, type FundsRequest, type TransferAccount,
  type Verdict, ID, TAG, refersTo,
} from './rules';
import { Receipts } from './Receipts';
import { TransferPaper } from './TransferPaper';

/** The form's draft key; Overview's actions set it through ModuleApp.setDraft. */
const DRAFT = `${ID}.draft`;

/** The screen's two tabs: the requests, and the form with what it prints. */
type View = 'register' | 'entry';

/** Which tab is shown, kept with the drafts so it is the same on coming back; Overview's and Home's actions open the form's. */
const VIEW = `${ID}.view`;

const WHEN = [{ value: ASAP, label: 'As soon as possible' }, { value: 'date', label: 'By a date' }];

const PAID_BY = [{ value: 'transfer', label: 'Bank transfer' }, { value: 'check', label: 'Check' }];

/** The name a fund transfer request's PDF is saved under. */
const pdfName = (r: FundsRequest) => `${r.no} fund transfer request.pdf`;

/**
 * One request waiting for the CEO: how much, what for, each expense, where the money goes, who asked and by when,
 * and the two answers. Fits a phone. `onApproved` opens a transfer once it is approved, to print or save its paper.
 */
function Waiting({ request: r, onApproved }: { request: FundsRequest; onApproved: (no: string, after: TerminalState) => void }) {
  const { state, run } = useKeystone();
  const app = useModuleApp();
  const confirm = useConfirm();
  const [note, setNote] = useState('');
  const vouchers = app.service(SERVICES.voucherDrafts);
  const payee = nameOf(state, r.payee);
  const amount = peso(requestTotal(r));
  const to = r.pay === 'transfer' ? (r.account ? accountLabel(r.account) : 'an account not given') : payee;

  const approving = r.pay === 'transfer'
    ? 'Approving makes its fund transfer request, ready to print or save as a PDF.'
    : vouchers ? 'A check voucher for this amount goes to accounting, For Approval.' : 'Check Vouchers is not installed, so no voucher is drafted.';

  const decide = (verdict: Verdict) => {
    const out = run((s, c) => decideRequest(s, r.no, verdict, note, c, vouchers));

    if (out.ok && verdict === 'Approved' && r.pay === 'transfer') onApproved(r.no, out.state);
  };

  return (
    <li>
      <article aria-label={r.no} className="flex h-full flex-col gap-3 rounded-card border border-line-bright bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold text-gold-bright tabular-nums">{r.no}</span>
          <StatusPill status={r.settle === ASAP ? 'ASAP' : `By ${shortDate(r.settle)}`} tone={r.settle === ASAP ? 'warn' : 'neutral'} />
        </div>
        <p className="m-0 font-display text-2xl text-ink tabular-nums">{amount}</p>
        <p className="m-0 text-[13px] text-pretty text-ink">{r.purpose}</p>
        <ul aria-label={`Expenses on ${r.no}`} className="m-0 flex list-none flex-col gap-1 border-y border-line p-0 py-2 text-xs">
          {expensesOf(r).map((l, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-pretty">{l.desc}</span>
              <span className="shrink-0 tabular-nums">{peso(toCentavos(l.amt))}</span>
            </li>
          ))}
        </ul>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {r.pay === 'transfer'
            ? <><dt className="text-ink-2">Transfer to</dt><dd className="m-0 break-words">{to}</dd></>
            : <><dt className="text-ink-2">Payee</dt><dd className="m-0 truncate">{payee} (by check)</dd></>}
          <dt className="text-ink-2">Requested by</dt>
          <dd className="m-0 truncate">{r.requester} on {shortDate(r.date)}</dd>
        </dl>
        <Field label="Note to the requester" hint="Optional. They see it with your answer.">
          <TextInput value={note} onChange={setNote} />
        </Field>
        <div className="mt-auto flex flex-wrap justify-end gap-2">
          <Button
            kind="danger"
            onClick={() => confirm({ title: `Decline ${r.no}?`, body: `${amount} to ${to}. ${r.requester} sees your answer${note.trim() ? ' and your note' : ''}. A declined request cannot be reopened.`, confirm: 'Decline', danger: true, onConfirm: () => decide('Declined') })}
          >
            Decline
          </Button>
          <Button
            kind="primary"
            onClick={() => confirm({ title: `Approve ${r.no}?`, body: `${amount} ${r.pay === 'transfer' ? 'by bank transfer ' : ''}to ${to}. ${approving}`, confirm: 'Approve', onConfirm: () => decide('Approved') })}
          >
            Approve
          </Button>
        </div>
      </article>
    </li>
  );
}

function Funds() {
  const { state, ctx, run, notify, files } = useKeystone();
  const app = useModuleApp();
  const confirm = useConfirm();
  const [draft, setDraft] = useDraft(DRAFT, () => newRequest(state, ctx));
  const [view, setView] = useDraft<View>(VIEW, () => 'register');

  // A request is read only by its requester and the CEO, so its drafts are kept to whoever wrote them (docs/adr/0041).
  const drafts = useSavedDrafts(draft, setDraft, {
    module: ID, private: true, title: (d) => requestDraftTitle(state, d, ctx), blank: requestDraftBlank, restore: (d) => requestDraftFrom(state, ctx, d),
  });

  const [error, setError] = useState<Refusal | null>(null);
  const paper = useRef<HTMLElement>(null);
  const editing = draft.editing ? requestOf(state, draft.editing) : undefined;
  const locked = editing ? requestLock(editing, ctx) : null;
  // A request that can no longer be changed shows as it was saved.
  const shown = useMemo(() => (locked && editing ? requestDraftOf(editing) : draft), [locked, editing, draft]);
  // The fund transfer request as it would print: as saved once the request can no longer change, else as typed.
  const live = locked && editing ? editing : requestPreview(state, draft, ctx);
  const ready = editing && transferReady(editing) ? editing : undefined;
  const waiting = decides(ctx) ? waitingRequests(state) : [];
  const refusal = decideRefusal(ctx);
  const staff = !!ctx.who && !decides(ctx);
  const setAccount = (patch: Partial<TransferAccount>) => setDraft({ ...draft, account: { ...draft.account, ...patch } });

  /** Opens a request in the form, as the state after its approval holds it, on the form's tab. */
  const open = useCallback((no: string, after: TerminalState) => {
    const r = requestOf(after, no);

    if (!r) return;
    setDraft(requestDraftOf(r));
    setError(null);
    setView('entry');
  }, [setDraft, setView]);

  const save = useCallback(() => {
    const r = run((s, c) => fileRequest(s, draft, c));
    setError(r.ok ? null : r);

    if (!r.ok) return;
    drafts.finish(draft);
    // Number the next blank request from the state after the save.
    setDraft(newRequest(r.state, ctx));
  }, [run, draft, ctx, setDraft, drafts]);

  const withdraw = (r: FundsRequest) => confirm({
    title: `Withdraw ${r.no}?`, body: `${peso(requestTotal(r))} to ${nameOf(state, r.payee)}. It stays on record as withdrawn; to ask again, file a new request.`, confirm: 'Withdraw', danger: true,
    onConfirm: () => {
      const out = run((s, c) => withdrawRequest(s, r.no, c));

      if (out.ok) setDraft(newRequest(out.state, ctx));
    },
  });

  const columns: Column<FundsRequest>[] = [
    { key: 'no', header: 'RF No.', width: 120, cell: (r) => <span className="font-semibold text-gold-bright tabular-nums">{r.no}</span> },
    { key: 'date', header: 'Filed', width: 104, cell: (r) => <span className="text-ink-2 tabular-nums">{shortDate(r.date)}</span> },
    { key: 'purpose', header: 'For', cell: (r) => <>{r.purpose} <span className="block text-xs text-ink-2">{r.pay === 'transfer' ? 'Bank transfer' : 'Check'}</span></> },
    { key: 'by', header: 'Requested by', width: 140, cell: (r) => r.requester },
    { key: 'amount', header: 'Amount', width: 128, align: 'right', cell: (r) => <span className="font-semibold">{peso(requestTotal(r))}</span> },
    { key: 'settle', header: 'Settle', width: 104, cell: (r) => <span className="tabular-nums">{settleText(r)}</span> },
    { key: 'status', header: 'Status', width: 140, align: 'right', cell: (r) => <StatusPill status={r.status} tone={requestTone(r.status)} /> },
  ];

  const form = (
    <FormCard
      id="rf-form"
      holds={editing && { label: editing.no, find: (s) => requestOf(s, editing.no) }}
      eyebrow="Request for funds"
      title={editing ? `${locked ? 'Viewing' : 'Editing'} ${editing.no}` : 'New request'}
      onSubmit={save}
      error={error}
      actions={<>
        {ready && <Button onClick={() => paper.current && printElement(paper.current)}>Print</Button>}
        {ready && <Button onClick={() => paper.current && savePdf(paper.current, pdfName(ready), files).then((n) => n && notify(`Saved ${n}.`), (e) => notify(String(e), 'error'))}>Export PDF</Button>}
        {editing?.voucher && app.has('vouchers') && <Button onClick={() => app.go('vouchers')}>Open Check Vouchers</Button>}
        {editing && !locked && <Button kind="danger" onClick={() => withdraw(editing)}>Withdraw…</Button>}
        {!locked && <SaveDraftButton drafts={drafts} />}
        {locked
          ? <Button onClick={() => { setDraft(newRequest(state, ctx)); setError(null); }}>New request</Button>
          : <Button kind="primary" type="submit">{editing ? 'Save changes' : 'Send for approval'}</Button>}
      </>}
    >
      {locked && <p className="m-0 text-[13px] text-pretty text-ink-2">{locked}</p>}
      {editing?.decision && (
        <p className="m-0 text-[13px] text-pretty text-ink">
          {decisionLine(editing)}{editing.voucher && ` ${editing.voucher} is drafted for accounting.`}{ready && ' Its fund transfer request is ready to print or save as a PDF.'}
        </p>
      )}
      {/* A disabled fieldset turns every control inside it off at once. */}
      <fieldset disabled={!!locked} className="m-0 flex min-w-0 flex-col gap-3.5 border-0 p-0">
        <Fills part="purpose">
          <Field name="purpose" label="What it is for" hint="In a line: the fund, event or purchase the expenses below are for.">
            <TextArea value={shown.purpose} onChange={(purpose) => setDraft({ ...draft, purpose })} />
          </Field>
        </Fills>
        <Fills part="lines"><LineEditor title="Expenses" lines={shown.lines} onChange={(lines) => setDraft({ ...draft, lines })} /></Fills>
        <p className="m-0 text-right font-display text-lg font-semibold text-gold-bright tabular-nums" aria-live="polite">
          <span className="sr-only">Total </span>{peso(requestTotal(live))}
        </p>
        <Fills part="pay">
          <Field label="Paid by" hint={shown.pay === 'transfer' ? 'Once approved, it becomes a fund transfer request to this account, to print or save as a PDF.' : 'Once approved, a check voucher for the total goes to accounting.'}>
            <SelectInput value={shown.pay} onChange={(pay) => setDraft({ ...draft, pay: pay === 'check' ? 'check' : 'transfer' })} options={PAID_BY} />
          </Field>
        </Fills>
        {shown.pay === 'transfer'
          ? <>
            <FieldRow>
              <Fills part="bank"><Field name="account.bank" label="Bank"><TextInput placeholder="BDO" value={shown.account.bank} onChange={(bank) => setAccount({ bank })} /></Field></Fills>
              <Fills part="branch"><Field label="Branch"><TextInput placeholder="Optional" value={shown.account.branch} onChange={(branch) => setAccount({ branch })} /></Field></Fills>
            </FieldRow>
            <FieldRow>
              <Fills part="accountName"><Field name="account.name" label="Account name" hint="As the bank holds it."><TextInput capitalize value={shown.account.name} onChange={(name) => setAccount({ name })} /></Field></Fills>
              <Fills part="accountNo"><Field name="account.number" label="Account number"><TextInput figures placeholder="0012 3456 7890" value={shown.account.number} onChange={(number) => setAccount({ number })} /></Field></Fills>
            </FieldRow>
          </>
          : <Field name="payee" label="Payee">
            <SelectInput value={shown.payee} onChange={(payee) => setDraft({ ...draft, payee })} options={payees(state).map((d) => ({ value: d.code, label: `${d.name} (${d.code})` }))} />
          </Field>}
        <FieldRow>
          <Fills part="settle">
            <Field label="Settle"><SelectInput value={shown.when} onChange={(when) => setDraft({ ...draft, when: when === 'date' ? 'date' : ASAP })} options={WHEN} /></Field>
            {shown.when === 'date' && <Field name="by" label="Settle by"><TextInput type="date" value={shown.by} onChange={(by) => setDraft({ ...draft, by })} /></Field>}
          </Fills>
        </FieldRow>
        <Fills part="requester">
          <Field name="requester" label="Requested by" hint={ctx.who ? 'The name on your Keystone account.' : 'Nobody signs in on this computer, so type your name.'}>
            <TextInput capitalize readOnly={!!ctx.who} value={ctx.who && !editing ? ctx.who.name : shown.requester} onChange={(requester) => setDraft({ ...draft, requester })} />
          </Field>
        </Fills>
      </fieldset>
    </FormCard>
  );

  // Under the form, an approved request's receipts: its requester's to upload, which marks it paid (docs/adr/0050).
  const entry = editing && (editing.status === 'Approved' || editing.status === 'Paid')
    ? <div className="flex min-w-0 flex-col gap-4">{form}<Receipts key={editing.no} request={editing} /></div>
    : form;

  return (
    <>
      <ScreenHeader
        eyebrow="Disbursements"
        title="Requests for Funds"
        line={fundsLine(state, ctx)}
        actions={<Button onClick={() => { setDraft(newRequest(state, ctx)); setError(null); setView('entry'); }}>New request</Button>}
      />

      {/* Above the tabs, so what waits for a decision and who may give it show on both. */}
      {waiting.length > 0 && (
        <section aria-labelledby="rf-waiting" className="mb-4">
          <div className="mb-2 flex items-baseline justify-between">
            <SectionLabel id="rf-waiting">Waiting for your decision</SectionLabel>
            <span className="text-xs text-ink-2">{count(waiting.length, 'request')}</span>
          </div>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            {waiting.map((r) => <Waiting key={r.no} request={r} onApproved={open} />)}
          </ul>
        </section>
      )}

      {refusal && <p className="mt-0 mb-3 text-[13px] text-pretty text-ink-2">{refusal}</p>}

      <Tabs<View>
        label="Requests for funds"
        value={view}
        onChange={setView}
        tabs={[
          {
            value: 'register',
            label: staff ? 'Your requests' : 'Requests',
            note: requestsNewestFirst(state).length,
            panel: (
              <>
              <SavedDrafts drafts={drafts} noun="request" onOpen={() => { setError(null); setView('entry'); }} />
              <Panel>
                <Register
                  label="Requests for funds"
                  columns={columns}
                  rows={requestsNewestFirst(state)}
                  rowKey={(r) => r.no}
                  onOpen={(r) => { setDraft(requestDraftOf(r)); setError(null); notify(`${r.no} loaded into the form.`); setView('entry'); }}
                  actions={(r) => [
                    { label: 'Edit', disabled: !!requestLock(r, ctx), onSelect: () => { setDraft(requestDraftOf(r)); setError(null); setView('entry'); } },
                    { label: 'Withdraw…', danger: true, disabled: !!requestLock(r, ctx), onSelect: () => withdraw(r) },
                  ]}
                  bulk={(picked, clear): RowAction[] => {
                    const open = picked.filter((r) => !requestLock(r, ctx));

                    return [{
                      label: `Withdraw (${open.length})…`, danger: true, disabled: !open.length,
                      onSelect: () => confirm({
                        title: `Withdraw ${count(open.length, 'request')}?`, body: `${open.map((r) => r.no).join(', ')}. They stay on record as withdrawn; to ask again, file a new request.`, confirm: 'Withdraw', danger: true,
                        onConfirm: () => {
                          const out = run((s, c) => changeEach(s, open.map((r) => r.no), (x, no) => withdrawRequest(x, no, c), (rs) => `${count(rs.length, 'request')} withdrawn.`));

                          if (!out.ok) return;
                          clear();

                          if (open.some((r) => r.no === draft.editing)) setDraft(newRequest(out.state, ctx));
                        },
                      }),
                    }];
                  }}
                  empty={<EmptyState text="No requests yet." action={<Button size="sm" kind="primary" onClick={() => setView('entry')}>Ask for funds</Button>} />}
                />
              </Panel>
              </>
            ),
          },
          {
            value: 'entry',
            label: 'Request entry',
            note: editing ? editing.no : 'New',
            // Paid by check, there is nothing to print here: the approval drafts a check voucher instead.
            panel: shown.pay === 'transfer'
              ? <Workspace form={entry} preview={<TransferPaper ref={paper} request={live} company={companyOf(state)} />} previewTitle="Fund transfer request" previewNote={ready ? 'As approved' : locked ? 'As saved' : 'Updates as you type'} />
              : <div className="max-w-[720px]">{entry}</div>,
          },
        ]}
      />
    </>
  );
}

export const fundsModule: ModuleDef = {
  id: ID,
  title: 'Requests for Funds',
  blurb: 'List the expenses you need money for. The CEO decides; an approval drafts the fund transfer or check voucher.',
  // Right after Check Vouchers, which its approvals feed.
  order: 2.5,
  onHome: true,
  stat: (s) => ['Waiting for a decision', String(waitingRequests(s).length)],
  figure: fundsFigure,
  finding: fundsFinding,
  waiting: fundsWaiting,
  openWaiting: (no, app) => {
    const r = requestOf(app.state, no);

    if (r) {
      app.setDraft(DRAFT, requestDraftOf(r));
      app.setDraft<View>(VIEW, 'entry');
    }

    app.go(ID);
  },
  create: { label: 'New request for funds', run: (app) => { app.setDraft(DRAFT, newRequest(app.state, app.ctx)); app.setDraft<View>(VIEW, 'entry'); app.go(ID); } },
  refersTo,
  selects: { Vendor: 'Requests for Funds' },
  logTags: { [TAG]: 'Requests for funds' },
  documents: requestDocuments,
  Screen: Funds,
};
