import { Button, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SectionLabel, SelectInput, StatusPill, TextArea, TextInput, useConfirm, type Column } from '@keystone/ui';
import { useCallback, useMemo, useState } from 'react';
import { count, nameOf, payees, peso, SERVICES, shortDate } from '@keystone/core';
import { FormCard, useDraft, useKeystone, useModuleApp, type ModuleDef } from '@keystone/kit';
import {
  ASAP, decideRefusal, decideRequest, decides, decisionLine, fileRequest, fundsFigure, fundsFinding, fundsLine, fundsWaiting,
  newRequest, requestDocuments, requestDraftOf, requestLock, requestOf, requestsNewestFirst, requestTone, requestTotal,
  settleText, waitingRequests, withdrawRequest, type FundsRequest, type Verdict,
} from './rules';

/** The form's draft key; Overview's actions set it through ModuleApp.setDraft. */
const DRAFT = 'funds.draft';

const WHEN = [{ value: ASAP, label: 'As soon as possible' }, { value: 'date', label: 'By a date' }];

/** One request waiting for the owner: what, how much, to whom, by when, and the two answers. Fits a phone. */
function Waiting({ request: r }: { request: FundsRequest }) {
  const { state, run } = useKeystone();
  const app = useModuleApp();
  const confirm = useConfirm();
  const [note, setNote] = useState('');
  const vouchers = app.service(SERVICES.voucherDrafts);
  const payee = nameOf(state, r.payee);
  const amount = peso(requestTotal(r));
  const decide = (verdict: Verdict) => run((s, c) => decideRequest(s, r.no, verdict, note, c, vouchers));

  return (
    <li>
      <article aria-label={r.no} className="flex h-full flex-col gap-3 rounded-card border border-line-bright bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold text-gold-bright tabular-nums">{r.no}</span>
          <StatusPill status={r.settle === ASAP ? 'ASAP' : `By ${shortDate(r.settle)}`} tone={r.settle === ASAP ? 'warn' : 'neutral'} />
        </div>
        <p className="m-0 font-display text-2xl text-ink tabular-nums">{amount}</p>
        <p className="m-0 text-[13px] text-pretty text-ink">{r.purpose}</p>
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          <dt className="text-ink-2">Payee</dt>
          <dd className="m-0 truncate">{payee}</dd>
          <dt className="text-ink-2">Asked by</dt>
          <dd className="m-0 truncate">{r.requester} on {shortDate(r.date)}</dd>
        </dl>
        <Field label="Note to the requester" hint="Optional. They see it with your answer.">
          <TextInput value={note} onChange={setNote} />
        </Field>
        <div className="mt-auto flex flex-wrap justify-end gap-2">
          <Button
            kind="danger"
            onClick={() => confirm({ title: `Decline ${r.no}?`, body: `${amount} to ${payee}. ${r.requester} sees your answer${note.trim() ? ' and your note' : ''}. A declined request cannot be reopened.`, confirm: 'Decline', danger: true, onConfirm: () => decide('Declined') })}
          >
            Decline
          </Button>
          <Button
            kind="primary"
            onClick={() => confirm({ title: `Approve ${r.no}?`, body: `${amount} to ${payee}. ${vouchers ? 'A check voucher for this amount goes to accounting, For Approval.' : 'Check Vouchers is not installed, so no voucher is drafted.'}`, confirm: 'Approve', onConfirm: () => decide('Approved') })}
          >
            Approve
          </Button>
        </div>
      </article>
    </li>
  );
}

function Funds() {
  const { state, ctx, run, notify, store } = useKeystone();
  const app = useModuleApp();
  const confirm = useConfirm();
  const [draft, setDraft] = useDraft(DRAFT, () => newRequest(state, ctx));
  const [error, setError] = useState<string | null>(null);
  const editing = draft.editing ? requestOf(state, draft.editing) : undefined;
  const locked = editing ? requestLock(editing, ctx) : null;
  // A request that can no longer be changed shows as it was saved.
  const shown = useMemo(() => (locked && editing ? requestDraftOf(editing) : draft), [locked, editing, draft]);
  const waiting = decides(ctx) ? waitingRequests(state) : [];
  const refusal = decideRefusal(ctx);
  const staff = !!ctx.who && !decides(ctx);

  const save = useCallback(() => {
    const r = run((s, c) => fileRequest(s, draft, c));
    setError(r.ok ? null : r.error);

    // Number the next blank request from the state after the save.
    if (r.ok) setDraft(newRequest(store.getState(), ctx));
  }, [run, draft, ctx, setDraft, store]);

  const withdraw = (r: FundsRequest) => confirm({
    title: `Withdraw ${r.no}?`, body: `${peso(requestTotal(r))} to ${nameOf(state, r.payee)}. It stays on record as withdrawn; to ask again, file a new request.`, confirm: 'Withdraw', danger: true,
    onConfirm: () => {
      if (run((s, c) => withdrawRequest(s, r.no, c)).ok) setDraft(newRequest(store.getState(), ctx));
    },
  });

  const columns: Column<FundsRequest>[] = [
    { key: 'no', header: 'RF No.', width: 120, cell: (r) => <span className="font-semibold text-gold-bright tabular-nums">{r.no}</span> },
    { key: 'date', header: 'Filed', width: 104, cell: (r) => <span className="text-ink-2 tabular-nums">{shortDate(r.date)}</span> },
    { key: 'purpose', header: 'For', cell: (r) => r.purpose },
    { key: 'by', header: 'Asked by', width: 140, cell: (r) => r.requester },
    { key: 'amount', header: 'Amount', width: 128, align: 'right', cell: (r) => <span className="font-semibold">{peso(requestTotal(r))}</span> },
    { key: 'settle', header: 'Settle', width: 104, cell: (r) => <span className="tabular-nums">{settleText(r)}</span> },
    { key: 'status', header: 'Status', width: 140, align: 'right', cell: (r) => <StatusPill status={r.status} tone={requestTone(r.status)} /> },
  ];

  return (
    <>
      <ScreenHeader
        eyebrow="Disbursements"
        title="Requests for Funds"
        line={fundsLine(state, ctx)}
        actions={<Button onClick={() => { setDraft(newRequest(state, ctx)); setError(null); }}>New request</Button>}
      />

      {waiting.length > 0 && (
        <section aria-labelledby="rf-waiting" className="mb-4">
          <div className="mb-2 flex items-baseline justify-between">
            <SectionLabel id="rf-waiting">Waiting for your decision</SectionLabel>
            <span className="text-xs text-ink-2">{count(waiting.length, 'request')}</span>
          </div>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            {waiting.map((r) => <Waiting key={r.no} request={r} />)}
          </ul>
        </section>
      )}

      <Panel className="mb-4">
        <div className="mb-2 flex items-baseline justify-between">
          <SectionLabel>{staff ? 'Your requests' : 'Requests'}</SectionLabel>
          <span className="text-xs text-ink-2">{count(requestsNewestFirst(state).length, 'request')}</span>
        </div>
        {refusal && <p className="mt-0 mb-2 text-[13px] text-pretty text-ink-2">{refusal}</p>}
        <Register
          label="Requests for funds"
          columns={columns}
          rows={requestsNewestFirst(state)}
          rowKey={(r) => r.no}
          onOpen={(r) => { setDraft(requestDraftOf(r)); setError(null); notify(`${r.no} loaded into the form.`); }}
          actions={(r) => [
            { label: 'Edit', disabled: !!requestLock(r, ctx), onSelect: () => { setDraft(requestDraftOf(r)); setError(null); } },
            { label: 'Withdraw…', danger: true, disabled: !!requestLock(r, ctx), onSelect: () => withdraw(r) },
          ]}
          empty={<EmptyState text="No requests yet." action={<Button size="sm" kind="primary" onClick={() => document.getElementById('rf-form')?.scrollIntoView({ block: 'start' })}>Ask for funds</Button>} />}
        />
      </Panel>

      <div className="max-w-[720px]">
        <FormCard
          id="rf-form"
          eyebrow="Request for funds"
          title={editing ? `${locked ? 'Viewing' : 'Editing'} ${editing.no}` : 'New request'}
          onSubmit={save}
          error={error}
          actions={<>
            {editing?.voucher && app.has('vouchers') && <Button onClick={() => app.go('vouchers')}>Open Check Vouchers</Button>}
            {editing && !locked && <Button kind="danger" onClick={() => withdraw(editing)}>Withdraw…</Button>}
            {locked
              ? <Button onClick={() => { setDraft(newRequest(state, ctx)); setError(null); }}>New request</Button>
              : <Button kind="primary" type="submit">{editing ? 'Save changes' : 'Send for approval'}</Button>}
          </>}
        >
          {locked && <p className="m-0 text-[13px] text-pretty text-ink-2">{locked}</p>}
          {editing?.decision && (
            <p className="m-0 text-[13px] text-pretty text-ink">
              {decisionLine(editing)}{editing.voucher && ` ${editing.voucher} is drafted for accounting.`}
            </p>
          )}
          {/* A disabled fieldset turns every control inside it off at once. */}
          <fieldset disabled={!!locked} className="m-0 flex min-w-0 flex-col gap-3.5 border-0 p-0">
            <Field label="What it is for" hint="The event or purchase, and what the money pays for.">
              <TextArea value={shown.purpose} onChange={(purpose) => setDraft({ ...draft, purpose })} />
            </Field>
            <FieldRow>
              <Field label="Amount"><TextInput figures placeholder="0.00" value={shown.amount} onChange={(amount) => setDraft({ ...draft, amount })} /></Field>
              <Field label="Payee">
                <SelectInput value={shown.payee} onChange={(payee) => setDraft({ ...draft, payee })} options={payees(state).map((d) => ({ value: d.code, label: `${d.name} (${d.code})` }))} />
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Settle"><SelectInput value={shown.when} onChange={(when) => setDraft({ ...draft, when: when === 'date' ? 'date' : ASAP })} options={WHEN} /></Field>
              {shown.when === 'date' && <Field label="Settle by"><TextInput type="date" value={shown.by} onChange={(by) => setDraft({ ...draft, by })} /></Field>}
            </FieldRow>
            <Field label="Requested by" hint={ctx.who ? 'The name on your Keystone account.' : 'Nobody signs in on this computer, so type your name.'}>
              <TextInput readOnly={!!ctx.who} value={ctx.who && !editing ? ctx.who.name : shown.requester} onChange={(requester) => setDraft({ ...draft, requester })} />
            </Field>
          </fieldset>
        </FormCard>
      </div>
    </>
  );
}

export const fundsModule: ModuleDef = {
  id: 'funds',
  title: 'Requests for Funds',
  section: 'Disbursements',
  blurb: 'Ask for money for a purpose. The owner approves or declines, and an approval drafts the check voucher.',
  // Right after Check Vouchers, which its approvals feed.
  order: 2.5,
  onHome: true,
  stat: (s) => ['Waiting for a decision', String(waitingRequests(s).length)],
  figure: fundsFigure,
  finding: fundsFinding,
  waiting: fundsWaiting,
  openWaiting: (no, app) => {
    const r = requestOf(app.state, no);

    if (r) app.setDraft(DRAFT, requestDraftOf(r));
    app.go('funds');
  },
  create: { label: 'New request for funds', run: (app) => { app.setDraft(DRAFT, newRequest(app.state, app.ctx)); app.go('funds'); } },
  logTags: { RF: 'Requests for funds' },
  documents: requestDocuments,
  Screen: Funds,
};
