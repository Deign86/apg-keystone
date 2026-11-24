import { Button, EmptyState, Field, FieldRow, PAGE_SIZE, Panel, Register, ScreenHeader, StatusPill, Tabs, TextInput, useConfirm, type Column, type Refusal, type RowAction, type RowGroup } from '@keystone/ui';
import { useCallback, useMemo, useRef, useState } from 'react';
import { DASH, amountInWords, companyOf, count, peso, SERVICES, shortDate, sumCentavos, type Voucher } from '@keystone/core';
import {
  approvesOnSave, awaitingApproval, payeeFoldLabel, payeeKey, canMoveTo, caps, clearsOn, clearVoided, copyVoucher, deleteVoucher, deleteVouchers, draftNo, freesNumber, newVoucher, payeeOf, returnsForApproval, saveVoucher, setVoucherStatus, setVouchersStatus, voucherDraftBlank, voucherDraftFrom, voucherDraftOf, voucherDrafts, voucherDraftTitle,
  voucherFigure, voucherFinding, voucherLine, voucherLock, voucherOf, voucherRegister, VOID_KEPT_DAYS, VOUCHER_STATUSES, voucherTone, voucherTotal, voucherWaiting, type VoucherStatus, ID, TAG, refersTo,
} from './rules';
import { BankAccountPicker, Fills, SaveDraftButton, SavedDrafts, SignatoryPicker, useDraft, useSavedDrafts, useKeystone, useModuleApp, type ModuleApp, type ModuleDef, printElement, savePdf, FormCard, LineEditor, Workspace } from '@keystone/kit';
import { VoucherPaper } from './VoucherPaper';

/** The form's draft key; Overview's actions set it through ModuleApp.setDraft. */
const DRAFT = `${ID}.draft`;

/** The screen's two tabs: the register of vouchers, and the form with the voucher it prints. */
type View = 'register' | 'entry';

/** Which tab is shown, kept with the drafts so it is the same on coming back; Overview's and Home's actions open the form's. */
const VIEW = `${ID}.view`;

/** A group of the form's fields, turned off together while the voucher is locked. */
const FIELDS = 'm-0 flex min-w-0 flex-col gap-3.5 border-0 p-0';

/** The first account Bank Accounts keeps, as printed: a new voucher's bank before any voucher names one. "" without it. */
function firstBank(app: ModuleApp): string {
  const banks = app.service(SERVICES.bankAccounts);
  const first = banks?.accounts(app.state)[0];

  return banks && first ? banks.label(first) : '';
}

function Vouchers() {
  const { state, ctx, run, files, notify } = useKeystone();
  const app = useModuleApp();
  const bank = firstBank(app);
  const confirm = useConfirm();
  const [draft, setDraft] = useDraft(DRAFT, () => newVoucher(state, ctx, bank));
  const [view, setView] = useDraft<View>(VIEW, () => 'register');
  const drafts = useSavedDrafts(draft, setDraft, { module: ID, title: voucherDraftTitle, blank: voucherDraftBlank, restore: (d) => voucherDraftFrom(state, ctx, bank, d) });
  const [error, setError] = useState<Refusal | null>(null);
  const paper = useRef<HTMLDivElement>(null);
  const editing = draft.editing ? state.cv.find((v) => v.no === draft.editing) : undefined;
  const locked = editing ? voucherLock(editing) : null;

  // A voucher released or void shows, prints and exports exactly as it was saved.
  const shown = useMemo(() => (locked && editing ? voucherDraftOf(state, editing) : draft), [locked, editing, draft, state]);
  const live = locked && editing ? editing : voucherOf(draft);
  // Saving a change to an approved voucher, beyond its check, sends it back for approval unless the CEO saves it.
  const reapproves = returnsForApproval(state, draft, ctx);
  const approvedNote = editing?.status === 'Approved' && !approvesOnSave(ctx);
  const total = voucherTotal(live);
  // The number it is saved, printed and exported under.
  const no = draftNo(state, draft);

  const save = useCallback((asNew = false) => {
    const r = run((s, c) => saveVoucher(s, draft, c, asNew));
    setError(r.ok ? null : r);

    if (!r.ok) return;
    drafts.finish(draft);
    // Number the next blank voucher from the state after the save.
    setDraft(newVoucher(r.state, ctx, bank));
  }, [run, draft, ctx, setDraft, bank, drafts]);

  /** Deletes a void voucher, and clears the form if it held that voucher. */
  const remove = (no: string) => {
    const r = run((st, c) => deleteVoucher(st, no, c));

    if (r.ok && draft.editing === no) setDraft(newVoucher(r.state, ctx, bank));
  };

  /** Deletes several void vouchers, unticks them, and clears the form if it held one of them. */
  const removeAll = (nos: string[], clear: () => void) => {
    const r = run((st, c) => deleteVouchers(st, nos, c));

    if (!r.ok) return;
    clear();

    if (draft.editing && nos.includes(draft.editing)) setDraft(newVoucher(r.state, ctx, bank));
  };

  const register = voucherRegister(state, ctx);
  // Everyone who has signed a voucher, to pick again.
  const signed = useMemo(() => state.cv.flatMap((v) => [v.prepared, v.checked, v.approved]), [state.cv]);

  const toForm = () => setView('entry');

  const open = (v: Voucher) => { setDraft(voucherDraftOf(state, v)); setError(null); notify(`${v.no} loaded into the form.`); toForm(); };

  const actions = (v: Voucher) => [
    { label: voucherLock(v) ? 'View voucher' : 'Edit voucher', onSelect: () => open(v) },
    ...VOUCHER_STATUSES.filter((s) => s !== 'Void').map((s) => ({ label: `Mark ${s.toLowerCase()}`, disabled: v.status === s || v.status === 'Void', onSelect: () => run((st, c) => setVoucherStatus(st, v.no, s, c)) })),
    v.status === 'Void'
      ? { label: 'Delete voucher…', danger: true, onSelect: () => confirm({ title: `Delete ${v.no}?`, body: `The void voucher for ${peso(voucherTotal(v))} to ${payeeOf(state, v).name} is removed from the register now, instead of on ${shortDate(clearsOn(v))}.${freesNumber(state, v.no) ? ` The next new voucher takes ${v.no} again.` : ''}`, confirm: 'Delete voucher', danger: true, onConfirm: () => remove(v.no) }) }
      : { label: 'Void voucher…', danger: true, onSelect: () => confirm({ title: `Void ${v.no}?`, body: `${peso(voucherTotal(v))} to ${payeeOf(state, v).name}. A void voucher cannot be reopened, and is cleared from the register ${VOID_KEPT_DAYS} days after.`, confirm: 'Void voucher', danger: true, onConfirm: () => run((st, c) => setVoucherStatus(st, v.no, 'Void', c)) }) },
  ];

  /** What can be done to the vouchers ticked in a register: each action counts and takes only those it applies to. */
  const bulk = (picked: Voucher[], clear: () => void): RowAction[] => {
    const to = (status: VoucherStatus) => picked.filter((v) => canMoveTo(v, status));
    const move = (status: VoucherStatus, nos: string[]) => { if (run((st, c) => setVouchersStatus(st, nos, status, c)).ok) clear(); };
    const voidable = to('Void');
    const voided = picked.filter((v) => v.status === 'Void');

    return [
      ...VOUCHER_STATUSES.filter((s) => s !== 'Void').map((s) => ({ label: `Mark ${s.toLowerCase()} (${to(s).length})`, disabled: !to(s).length, onSelect: () => move(s, to(s).map((v) => v.no)) })),
      { label: `Void (${voidable.length})…`, danger: true, disabled: !voidable.length, onSelect: () => confirm({ title: `Void ${count(voidable.length, 'voucher')}?`, body: `${voidable.map((v) => v.no).join(', ')}, ${peso(sumCentavos(voidable, voucherTotal))} in all. A void voucher cannot be reopened, and is cleared from the register ${VOID_KEPT_DAYS} days after.`, confirm: 'Void vouchers', danger: true, onConfirm: () => move('Void', voidable.map((v) => v.no)) }) },
      { label: `Delete void (${voided.length})…`, danger: true, disabled: !voided.length, onSelect: () => confirm({ title: `Delete ${count(voided.length, 'void voucher')}?`, body: `${voided.map((v) => v.no).join(', ')} are removed from the register now. Numbering carries on from the highest voucher left.`, confirm: 'Delete vouchers', danger: true, onConfirm: () => removeAll(voided.map((v) => v.no), clear) }) },
    ];
  };

  const columns: Column<Voucher>[] = [
    { key: 'no', header: 'CV No.', width: 120, cell: (v) => <span className="font-semibold text-gold-bright tabular-nums">{v.no}</span> },
    { key: 'date', header: 'Date', width: 104, cell: (v) => <span className="text-ink-2 tabular-nums">{shortDate(v.date)}</span> },
    { key: 'payee', header: 'Payee', cell: (v) => caps(payeeOf(state, v).name) },
    // The check number over its date, so the payee keeps the width at the narrowest window.
    { key: 'check', header: 'Check', width: 112, cell: (v) => <><span className="block truncate tabular-nums">{v.check || DASH}</span> {v.checkDate && <span className="block truncate text-xs text-ink-2 tabular-nums">{shortDate(v.checkDate)}</span>}</> },
    { key: 'amount', header: 'Amount', width: 128, align: 'right', cell: (v) => <span className="font-semibold">{peso(voucherTotal(v))}</span> },
    { key: 'status', header: 'Status', width: 150, align: 'right', cell: (v) => <StatusPill status={v.status} tone={voucherTone(v.status)} /> },
  ];

  // Vouchers to the same payee fold into one row that opens to show them, so a payee paid often takes one line.
  const byPayee: RowGroup<Voucher> = {
    key: (v) => payeeKey(state, v),
    label: (vs) => payeeFoldLabel(state, vs),
    summary: (vs) => (
      <>
        <span className="truncate font-semibold">{caps(payeeOf(state, vs[0]).name)}</span>
        <span className="shrink-0 rounded-full bg-surface-2 px-2 text-xs font-semibold text-ink-2 tabular-nums">{count(vs.length, 'voucher')}</span>
        <span className="ml-auto shrink-0 font-semibold tabular-nums">{peso(sumCentavos(vs, voucherTotal))}</span>
      </>
    ),
  };

  return (
    <>
      <ScreenHeader
        eyebrow="Disbursements"
        title="Check Vouchers"
        line={voucherLine(state)}
        actions={<Button onClick={() => { setDraft(newVoucher(state, ctx, bank)); setError(null); toForm(); }}>New voucher</Button>}
      />
      <Tabs<View>
        label="Check vouchers"
        value={view}
        onChange={setView}
        tabs={[
          {
            value: 'register',
            label: 'Voucher register',
            note: state.cv.length,
            panel: (
              <>
              <SavedDrafts drafts={drafts} noun="voucher" onOpen={() => { setError(null); toForm(); }} />
              <Panel>
                <Register
                  label="Voucher register"
                  columns={columns}
                  rows={register.current}
                  rowKey={(v) => v.no}
                  onOpen={open}
                  actions={actions}
                  bulk={bulk}
                  current={draft.editing}
                  pageSize={PAGE_SIZE}
                  group={byPayee}
                  empty={<EmptyState text={register.earlier.length ? 'Nothing open and nothing yet this month.' : 'No vouchers yet.'} action={<Button size="sm" kind="primary" onClick={toForm}>Write {register.earlier.length ? 'one' : 'the first one'}</Button>} />}
                />
                {/* Earlier months' released and void vouchers, folded away, newest month first. */}
                {register.earlier.map((m) => (
                  <details key={m.month} className="group mt-3 border-t border-line pt-3">
                    <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 rounded-control px-1 py-1 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                      <span className="flex items-baseline gap-2 font-semibold">
                        <span aria-hidden="true" className="inline-block text-ink-2 transition-transform group-open:rotate-90">›</span>
                        <span>{m.label}</span>
                      </span>
                      <span className="text-xs text-ink-2 tabular-nums">{count(m.vouchers.length, 'voucher')} · {peso(m.total)}</span>
                    </summary>
                    <div className="mt-2">
                      <Register label={`Vouchers, ${m.label}`} columns={columns} rows={m.vouchers} rowKey={(v) => v.no} onOpen={open} actions={actions} bulk={bulk} current={draft.editing} pageSize={PAGE_SIZE} group={byPayee} empty={null} />
                    </div>
                  </details>
                ))}
              </Panel>
              </>
            ),
          },
          {
            value: 'entry',
            label: 'Voucher entry',
            note: editing ? editing.no : 'New',
            panel: (
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
                      <Button onClick={() => paper.current && savePdf(paper.current, `${no}.pdf`, files).then((n) => n && notify(`Saved ${n}.`), (e) => notify(String(e), 'error'))}>Export PDF</Button>
                      {editing && locked && <Button onClick={() => { setDraft(copyVoucher(state, editing, ctx)); setError(null); notify(`${editing.no} copied to a new voucher.`); }}>Copy to new voucher</Button>}
                      {editing && !locked && <Button onClick={() => save(true)}>Save as new</Button>}
                      {!locked && <SaveDraftButton drafts={drafts} />}
                      {!locked && <Button kind="primary" type="submit">{editing ? (reapproves ? 'Save and return for approval' : 'Save changes') : approvesOnSave(ctx) ? 'Save and approve' : 'Save and route for approval'}</Button>}
                    </>}
                  >
                    {locked && <p className="m-0 text-[13px] text-pretty text-ink-2">{locked}</p>}
                    {approvedNote && <p className="m-0 text-[13px] text-pretty text-ink-2">{editing?.no} is approved. The check number and date of check can be written in as it is; any other change sends it back for approval.</p>}
                    {/* A disabled fieldset turns every control inside it off at once. */}
                    <fieldset disabled={!!locked} className={FIELDS}>
                      <FieldRow>
                        {/* The next number, to change if need be; a saved voucher keeps its own. */}
                        <Fills part="no">
                          <Field label="CV No.">
                            <TextInput figures readOnly={!!editing} value={draft.typedNo && !editing ? draft.no : no} onChange={(typed) => setDraft({ ...draft, no: typed, typedNo: true })} />
                          </Field>
                        </Fills>
                        <Fills part="date"><Field label="Date"><TextInput type="date" value={shown.date} onChange={(date) => setDraft({ ...draft, date })} /></Field></Fills>
                      </FieldRow>
                      <Fills part="payee"><Field name="payee" label="Payee"><TextInput value={shown.payee} onChange={(payee) => setDraft({ ...draft, payee: caps(payee) })} /></Field></Fills>
                      <Fills part="address"><Field label="Address"><TextInput value={shown.address} onChange={(address) => setDraft({ ...draft, address })} /></Field></Fills>
                      <Fills part="tin"><Field label="TIN" hint="Optional. The voucher prints a TIN only when one is typed here."><TextInput figures placeholder="000-000-000-000" value={shown.tin} onChange={(tin) => setDraft({ ...draft, tin })} /></Field></Fills>
                      <Fills part="issuer"><Field label="Issuer" hint="Who issues the check, printed beside the bank."><TextInput value={shown.issuer} onChange={(issuer) => setDraft({ ...draft, issuer: caps(issuer) })} /></Field></Fills>
                      <Fills part="bank">
                        <BankAccountPicker
                          label="Bank"
                          value={shown.bank}
                          onChange={(b) => setDraft({ ...draft, bank: b })}
                          hint="The account the check is drawn on. Others adds one not listed."
                          noneHint="No bank accounts are kept yet: add the one the check is drawn on under Others."
                          after="every voucher after this one"
                          kept="Vouchers already saved keep the bank written on them."
                        />
                      </Fills>
                    </fieldset>
                    <fieldset disabled={!!locked} className={FIELDS}>
                      <FieldRow>
                        <Fills part="check"><Field label="Check No." hint="Needed before the voucher is released."><TextInput figures placeholder="0004512" value={shown.check} onChange={(check) => setDraft({ ...draft, check })} /></Field></Fills>
                        <Fills part="checkDate"><Field label="Date of check"><TextInput type="date" value={shown.checkDate} onChange={(checkDate) => setDraft({ ...draft, checkDate })} /></Field></Fills>
                      </FieldRow>
                    </fieldset>
                    <fieldset disabled={!!locked} className={FIELDS}>
                      <Fills part="lines"><LineEditor title="Particulars" lines={shown.lines} onChange={(lines) => setDraft({ ...draft, lines })} /></Fills>
                      <div className="text-right" aria-live="polite">
                        <p className="m-0 font-display text-lg font-semibold text-gold-bright tabular-nums">{peso(total)}</p>
                        <p className="m-0 text-[13px] text-ink-2">{amountInWords(total)}</p>
                      </div>
                      {/* Each signatory's name over their position, as the voucher prints them. */}
                      <FieldRow min={120}>
                        <Fills part="prepared">
                          <div className="flex min-w-0 flex-col gap-2.5">
                            <SignatoryPicker label="Prepared by" names={signed} value={shown.prepared} onChange={(prepared) => setDraft({ ...draft, prepared: caps(prepared) })} />
                            <Field label="Preparer's position"><TextInput value={shown.preparedPos} onChange={(preparedPos) => setDraft({ ...draft, preparedPos })} /></Field>
                          </div>
                        </Fills>
                        <Fills part="checked">
                          <div className="flex min-w-0 flex-col gap-2.5">
                            <SignatoryPicker label="Audited by" names={signed} value={shown.checked} onChange={(checked) => setDraft({ ...draft, checked: caps(checked) })} />
                            <Field label="Auditor's position"><TextInput value={shown.checkedPos} onChange={(checkedPos) => setDraft({ ...draft, checkedPos })} /></Field>
                          </div>
                        </Fills>
                        <Fills part="approved">
                          <div className="flex min-w-0 flex-col gap-2.5">
                            <SignatoryPicker label="Approved by" names={signed} value={shown.approved} onChange={(approved) => setDraft({ ...draft, approved: caps(approved) })} />
                            <Field label="Approver's position"><TextInput value={shown.approvedPos} onChange={(approvedPos) => setDraft({ ...draft, approvedPos })} /></Field>
                          </div>
                        </Fills>
                      </FieldRow>
                    </fieldset>
                  </FormCard>
                }
                preview={<VoucherPaper ref={paper} voucher={{ ...live, no }} payee={payeeOf(state, live)} company={companyOf(state)} />}
              />
            ),
          },
        ]}
      />
    </>
  );
}

export const vouchersModule: ModuleDef = {
  id: ID,
  title: 'Check Vouchers',
  blurb: 'Prepare check vouchers, print each twice on one A4 sheet to cut in half, and route them for signatures.',
  order: 2,
  onHome: true,
  stat: (s) => ['Awaiting approval', String(awaitingApproval(s).length)],
  figure: voucherFigure,
  finding: voucherFinding,
  waiting: voucherWaiting,
  openWaiting: (no, app) => {
    const v = app.state.cv.find((x) => x.no === no);

    if (v) {
      app.setDraft(DRAFT, voucherDraftOf(app.state, v));
      app.setDraft<View>(VIEW, 'entry');
    }

    app.go(ID);
  },
  create: { label: 'New check voucher', run: (app) => { app.setDraft(DRAFT, newVoucher(app.state, app.ctx, firstBank(app))); app.setDraft<View>(VIEW, 'entry'); app.go(ID); } },
  refersTo,
  onOpen: clearVoided,
  logTags: { [TAG]: 'Vouchers' },
  provides: { [SERVICES.voucherDrafts]: voucherDrafts },
  Screen: Vouchers,
};
