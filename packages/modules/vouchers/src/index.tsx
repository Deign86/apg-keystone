import { Button, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SectionLabel, SelectInput, StatusPill, TextInput, useConfirm, type Column } from '@keystone/ui';
import { useCallback, useMemo, useRef, useState } from 'react';
import { amountInWords, count, payees, peso, recordOf, shortDate, toneOf, VOUCHER_STATUSES, type Voucher } from '@keystone/core';
import { awaitingApproval, copyVoucher, newVoucher, saveVoucher, setVoucherStatus, voucherDraftOf, voucherFigure, voucherFinding, voucherLine, voucherLock, voucherOf, vouchersNewestFirst, voucherTotal, voucherWaiting } from './rules';
import { useDraft, useKeystone, type ModuleDef, printElement, savePdf, FormCard, LineEditor, Workspace } from '@keystone/kit';
import { VoucherPaper } from './VoucherPaper';

/** The form's draft key; Overview's actions set it through ModuleApp.setDraft. */
const DRAFT = 'vouchers.draft';

function Vouchers() {
  const { state, ctx, run, platform, notify, store } = useKeystone();
  const confirm = useConfirm();
  const [draft, setDraft] = useDraft(DRAFT, () => newVoucher(state, ctx));
  const [error, setError] = useState<string | null>(null);
  const paper = useRef<HTMLDivElement>(null);
  const editing = draft.editing ? state.cv.find((v) => v.no === draft.editing) : undefined;
  const locked = editing ? voucherLock(editing) : null;
  // A voucher past approval shows, prints and exports exactly as it was saved.
  const live = locked && editing ? editing : voucherOf(draft);
  const shown = useMemo(() => (locked && editing ? voucherDraftOf(editing) : draft), [locked, editing, draft]);
  const total = voucherTotal(live);

  const save = useCallback((asNew = false) => {
    const r = run((s, c) => saveVoucher(s, draft, c, asNew));
    setError(r.ok ? null : r.error);

    // Number the next blank voucher from the state after the save.
    if (r.ok) setDraft(newVoucher(store.getState(), ctx));
  }, [run, draft, ctx, setDraft, store]);

  const columns: Column<Voucher>[] = [
    { key: 'no', header: 'CV No.', width: 120, cell: (v) => <span className="font-semibold text-gold-bright tabular-nums">{v.no}</span> },
    { key: 'date', header: 'Date', width: 104, cell: (v) => <span className="text-ink-2 tabular-nums">{shortDate(v.date)}</span> },
    { key: 'payee', header: 'Payee', cell: (v) => recordOf(state, v.payee)?.name ?? v.payee },
    // The check number over its date, so the payee keeps the width at the narrowest window.
    { key: 'check', header: 'Check', width: 112, cell: (v) => <><span className="block truncate tabular-nums">{v.check || '—'}</span> {v.checkDate && <span className="block truncate text-xs text-ink-2 tabular-nums">{shortDate(v.checkDate)}</span>}</> },
    { key: 'amount', header: 'Amount', width: 128, align: 'right', cell: (v) => <span className="font-semibold">{peso(voucherTotal(v))}</span> },
    { key: 'status', header: 'Status', width: 150, align: 'right', cell: (v) => <StatusPill status={v.status} tone={toneOf(v.status)} /> },
  ];

  return (
    <>
      <ScreenHeader
        eyebrow="Disbursements"
        title="Check Vouchers"
        line={voucherLine(state)}
        actions={<Button onClick={() => { setDraft(newVoucher(state, ctx)); setError(null); }}>New voucher</Button>}
      />
      <Panel className="mb-4">
        <div className="mb-2 flex items-baseline justify-between">
          <SectionLabel>Voucher register</SectionLabel>
          <span className="text-xs text-ink-2">{count(state.cv.length, 'voucher')}</span>
        </div>
        <Register
          label="Voucher register"
          columns={columns}
          rows={vouchersNewestFirst(state)}
          rowKey={(v) => v.no}
          onOpen={(v) => { setDraft(voucherDraftOf(v)); setError(null); notify(`${v.no} loaded into the form.`); }}
          actions={(v) => [
            ...VOUCHER_STATUSES.filter((s) => s !== 'Void').map((s) => ({ label: `Mark ${s.toLowerCase()}`, disabled: v.status === s || v.status === 'Void', onSelect: () => run((st, c) => setVoucherStatus(st, v.no, s, c)) })),
            { label: 'Void voucher…', danger: true, disabled: v.status === 'Void', onSelect: () => confirm({ title: `Void ${v.no}?`, body: `${peso(voucherTotal(v))} to ${recordOf(state, v.payee)?.name ?? v.payee}. A void voucher stays in the register and cannot be reopened.`, confirm: 'Void voucher', danger: true, onConfirm: () => run((st, c) => setVoucherStatus(st, v.no, 'Void', c)) }) },
          ]}
          empty={<EmptyState text="No vouchers yet." action={<Button size="sm" kind="primary" onClick={() => document.getElementById('cv-form')?.scrollIntoView({ block: 'start' })}>Write the first one</Button>} />}
        />
      </Panel>

      <Workspace
        previewTitle="Document preview"
        form={
          <FormCard
            id="cv-form"
            eyebrow="Voucher entry"
            title={editing ? `${locked ? 'Viewing' : 'Editing'} ${editing.no}` : 'New voucher'}
            onSubmit={() => save()}
            error={error}
            actions={<>
              <Button onClick={() => paper.current && printElement(paper.current)}>Print</Button>
              <Button onClick={() => paper.current && savePdf(paper.current, `${live.no}.pdf`, platform).then((n) => n && notify(`Saved ${n}.`), (e) => notify(String(e), 'error'))}>Export PDF</Button>
              {editing && locked
                ? <Button onClick={() => { setDraft(copyVoucher(state, editing, ctx)); setError(null); notify(`${editing.no} copied to a new voucher.`); }}>Copy to new voucher</Button>
                : <>
                  {editing && <Button onClick={() => save(true)}>Save as new</Button>}
                  <Button kind="primary" type="submit">{editing ? 'Save changes' : 'Save and route for approval'}</Button>
                </>}
            </>}
          >
            {locked && <p className="m-0 text-[13px] text-pretty text-ink-2">{locked}</p>}
            {/* A disabled fieldset turns every control inside it off at once. */}
            <fieldset disabled={!!locked} className="m-0 flex min-w-0 flex-col gap-3.5 border-0 p-0">
              <FieldRow>
                <Field label="CV No."><TextInput readOnly value={draft.editing ?? draft.no} onChange={() => {}} /></Field>
                <Field label="Date"><TextInput type="date" value={shown.date} onChange={(date) => setDraft({ ...draft, date })} /></Field>
              </FieldRow>
              <Field label="Payee">
                <SelectInput value={shown.payee} onChange={(payee) => setDraft({ ...draft, payee })} options={payees(state).map((d) => ({ value: d.code, label: `${d.name} (${d.code})` }))} />
              </Field>
              <FieldRow>
                <Field label="Check No." hint="Needed before the voucher is released."><TextInput figures placeholder="0004512" value={shown.check} onChange={(check) => setDraft({ ...draft, check })} /></Field>
                <Field label="Date of check"><TextInput type="date" value={shown.checkDate} onChange={(checkDate) => setDraft({ ...draft, checkDate })} /></Field>
              </FieldRow>
              <LineEditor title="Particulars" lines={shown.lines} onChange={(lines) => setDraft({ ...draft, lines })} />
              <div className="text-right" aria-live="polite">
                <p className="m-0 font-display text-lg font-semibold text-gold-bright tabular-nums">{peso(total)}</p>
                <p className="m-0 text-xs text-ink-2">{amountInWords(total)}</p>
              </div>
              <FieldRow min={120}>
                <Field label="Prepared by"><TextInput value={shown.prepared} onChange={(prepared) => setDraft({ ...draft, prepared })} /></Field>
                <Field label="Audited by"><TextInput value={shown.checked} onChange={(checked) => setDraft({ ...draft, checked })} /></Field>
                <Field label="Approved by"><TextInput value={shown.approved} onChange={(approved) => setDraft({ ...draft, approved })} /></Field>
              </FieldRow>
            </fieldset>
          </FormCard>
        }
        preview={<VoucherPaper ref={paper} voucher={{ ...live, no: draft.editing ?? draft.no }} payee={recordOf(state, live.payee)} company={ctx.seed.company} />}
      />
    </>
  );
}

export const vouchersModule: ModuleDef = {
  id: 'vouchers',
  title: 'Check Vouchers',
  section: 'Disbursements',
  blurb: 'Prepare disbursement vouchers, print them three to a sheet, and route them for signatures.',
  order: 2,
  onHome: true,
  stat: (s) => ['Awaiting approval', String(awaitingApproval(s).length)],
  figure: voucherFigure,
  finding: voucherFinding,
  waiting: voucherWaiting,
  openWaiting: (no, app) => {
    const v = app.state.cv.find((x) => x.no === no);

    if (v) app.setDraft(DRAFT, voucherDraftOf(v));
    app.go('vouchers');
  },
  create: { label: 'New check voucher', run: (app) => { app.setDraft(DRAFT, newVoucher(app.state, app.ctx)); app.go('vouchers'); } },
  logTags: { CV: 'Vouchers' },
  Screen: Vouchers,
};
