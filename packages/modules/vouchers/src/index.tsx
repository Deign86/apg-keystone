import { Button, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SectionLabel, SelectInput, StatusPill, TextInput, useConfirm, type Column } from '@keystone/ui';
import { useCallback, useMemo, useRef, useState } from 'react';
import { amountInWords, companyOf, count, payees, peso, recordOf, SERVICES, shortDate, toneOf, VOUCHER_STATUSES, type Voucher } from '@keystone/core';
import { awaitingApproval, copyVoucher, newVoucher, saveVoucher, setVoucherStatus, voucherDraftOf, voucherDrafts, voucherFigure, voucherFinding, voucherLine, voucherLock, voucherOf, vouchersNewestFirst, voucherTotal, voucherWaiting } from './rules';
import { useDraft, useKeystone, useModuleApp, type ModuleApp, type ModuleDef, printElement, savePdf, FormCard, LineEditor, Workspace } from '@keystone/kit';
import { VoucherPaper } from './VoucherPaper';

/** The form's draft key; Overview's actions set it through ModuleApp.setDraft. */
const DRAFT = 'vouchers.draft';

/** The first account Bank Accounts keeps, as printed: a new voucher's bank before any voucher names one. "" without it. */
function firstBank(app: ModuleApp): string {
  const banks = app.service(SERVICES.bankAccounts);
  const first = banks?.accounts(app.state)[0];

  return banks && first ? banks.label(first) : '';
}

/** The last choice in the Bank list, for an account not kept yet. No account's label is this: each has " · ". */
const OTHERS = 'others';

/** An account typed under Others, before Bank Accounts keeps it. */
type NewAccount = { bank: string; branch: string; name: string; number: string };

/**
 * The account the check is drawn on, picked from Bank Accounts when it is installed. The voucher keeps it as printed.
 * One not in the list is typed under Others and saved to Bank Accounts, so every voucher after lists it too; the one
 * picked can be removed from there. Nothing needs adding on the Bank Accounts screen first.
 */
function DrawnOn({ value, onChange }: { value: string; onChange: (bank: string) => void }) {
  const { state, run, store } = useKeystone();
  const app = useModuleApp();
  const confirm = useConfirm();
  const banks = app.service(SERVICES.bankAccounts);
  // The account's name starts as the company's: its checks are drawn on its own accounts.
  const blank = (): NewAccount => ({ bank: '', branch: '', name: companyOf(state).name, number: '' });
  const [adding, setAdding] = useState<NewAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!banks) return null;
  const accounts = banks.accounts(state);
  const labels = accounts.map((a) => banks.label(a));
  const picked = accounts.find((a) => banks.label(a) === value);
  // An older voucher may name an account no longer kept, or one typed by hand; it stays as it was saved.
  const options = [...(value && !labels.includes(value) ? [value] : []), ...labels, OTHERS];

  const pick = (choice: string) => {
    setError(null);
    setAdding(choice === OTHERS ? blank() : null);

    if (choice !== OTHERS) onChange(choice);
  };

  const save = () => {
    if (!adding) return;
    const r = run((s, c) => banks.add(s, adding, c));

    if (!r.ok) return setError(r.error);
    onChange(banks.label(r.record));
    setAdding(null);
    setError(null);
  };

  const remove = (id: string) => {
    const r = run((s, c) => banks.remove(s, id, c));
    const next = banks.accounts(store.getState())[0];

    // The check is then drawn on the first account still kept, if any.
    if (r.ok) onChange(next ? banks.label(next) : '');
  };

  const field = (key: keyof NewAccount) => ({ value: adding?.[key] ?? '', onChange: (v: string) => adding && setAdding({ ...adding, [key]: v }) });

  return (
    <div className="flex flex-col gap-2.5">
      <Field label="Bank" hint={accounts.length ? 'The account the check is drawn on. Others adds one not listed.' : 'No bank accounts are kept yet: add the one the check is drawn on under Others.'}>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <SelectInput
              value={adding ? OTHERS : value}
              onChange={pick}
              options={options.map((l) => ({ value: l, label: l === OTHERS ? 'Others…' : l }))}
            />
          </div>
          {picked && !adding && (
            <Button
              onClick={() => confirm({
                title: `Remove ${picked.id}?`,
                body: `${banks.label(picked)}, in the name of ${picked.name}, is removed from Bank Accounts and from this list. Vouchers already saved keep the bank written on them.`,
                confirm: 'Remove account',
                danger: true,
                onConfirm: () => remove(picked.id),
              })}
            >
              Remove…
            </Button>
          )}
        </div>
      </Field>
      {adding && (
        // Inside the voucher's own form, so Enter saves the account here, not the voucher.
        <div
          role="group"
          aria-label="New bank account"
          className="flex flex-col gap-2.5 rounded-control border border-line p-3"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
        >
          <FieldRow>
            <Field label="Bank name"><TextInput autoFocus placeholder="BDO" {...field('bank')} /></Field>
            <Field label="Account number"><TextInput figures placeholder="0012 3456 7890" {...field('number')} /></Field>
          </FieldRow>
          <FieldRow>
            <Field label="Account name" hint="As the bank holds it."><TextInput {...field('name')} /></Field>
            <Field label="Branch"><TextInput placeholder="Optional" {...field('branch')} /></Field>
          </FieldRow>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {error
              ? <p role="alert" className="m-0 mr-auto max-w-[36ch] text-xs text-pretty text-bad">{error}</p>
              : <span className="mr-auto text-xs text-pretty text-ink-2">Saved to Bank Accounts, for every voucher after this one.</span>}
            {accounts.length > 0 && <Button size="sm" onClick={() => { setAdding(null); setError(null); }}>Cancel</Button>}
            <Button size="sm" onClick={save}>Save account</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Vouchers() {
  const { state, ctx, run, platform, notify, store } = useKeystone();
  const app = useModuleApp();
  const bank = firstBank(app);
  const confirm = useConfirm();
  const [draft, setDraft] = useDraft(DRAFT, () => newVoucher(state, ctx, bank));
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
    if (r.ok) setDraft(newVoucher(store.getState(), ctx, bank));
  }, [run, draft, ctx, setDraft, store, bank]);

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
        actions={<Button onClick={() => { setDraft(newVoucher(state, ctx, bank)); setError(null); }}>New voucher</Button>}
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
              <Field label="TIN" hint="Optional. The voucher prints a TIN only when one is typed here."><TextInput figures placeholder="000-000-000-000" value={shown.tin} onChange={(tin) => setDraft({ ...draft, tin })} /></Field>
              <DrawnOn value={shown.bank} onChange={(b) => setDraft({ ...draft, bank: b })} />
              <Field label="Issuer" hint="Who issues the check, printed beside the bank."><TextInput value={shown.issuer} onChange={(issuer) => setDraft({ ...draft, issuer })} /></Field>
              <FieldRow>
                <Field label="Check No." hint="Needed before the voucher is released."><TextInput figures placeholder="0004512" value={shown.check} onChange={(check) => setDraft({ ...draft, check })} /></Field>
                <Field label="Date of check"><TextInput type="date" value={shown.checkDate} onChange={(checkDate) => setDraft({ ...draft, checkDate })} /></Field>
              </FieldRow>
              <LineEditor title="Particulars" lines={shown.lines} onChange={(lines) => setDraft({ ...draft, lines })} />
              <div className="text-right" aria-live="polite">
                <p className="m-0 font-display text-lg font-semibold text-gold-bright tabular-nums">{peso(total)}</p>
                <p className="m-0 text-xs text-ink-2">{amountInWords(total)}</p>
              </div>
              {/* Each signatory's position over their name, as the voucher prints them. */}
              <FieldRow min={120}>
                <div className="flex min-w-0 flex-col gap-2.5">
                  <Field label="Preparer's position"><TextInput value={shown.preparedPos} onChange={(preparedPos) => setDraft({ ...draft, preparedPos })} /></Field>
                  <Field label="Prepared by"><TextInput value={shown.prepared} onChange={(prepared) => setDraft({ ...draft, prepared })} /></Field>
                </div>
                <div className="flex min-w-0 flex-col gap-2.5">
                  <Field label="Auditor's position"><TextInput value={shown.checkedPos} onChange={(checkedPos) => setDraft({ ...draft, checkedPos })} /></Field>
                  <Field label="Audited by"><TextInput value={shown.checked} onChange={(checked) => setDraft({ ...draft, checked })} /></Field>
                </div>
                <div className="flex min-w-0 flex-col gap-2.5">
                  <Field label="Approver's position"><TextInput value={shown.approvedPos} onChange={(approvedPos) => setDraft({ ...draft, approvedPos })} /></Field>
                  <Field label="Approved by"><TextInput value={shown.approved} onChange={(approved) => setDraft({ ...draft, approved })} /></Field>
                </div>
              </FieldRow>
            </fieldset>
          </FormCard>
        }
        preview={<VoucherPaper ref={paper} voucher={{ ...live, no: draft.editing ?? draft.no }} payee={recordOf(state, live.payee)} company={companyOf(state)} />}
      />
    </>
  );
}

export const vouchersModule: ModuleDef = {
  id: 'vouchers',
  title: 'Check Vouchers',
  section: 'Disbursements',
  blurb: 'Prepare check vouchers, print each twice on one A4 sheet to cut in half, and route them for signatures.',
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
  create: { label: 'New check voucher', run: (app) => { app.setDraft(DRAFT, newVoucher(app.state, app.ctx, firstBank(app))); app.go('vouchers'); } },
  logTags: { CV: 'Vouchers' },
  provides: { [SERVICES.voucherDrafts]: voucherDrafts },
  Screen: Vouchers,
};
