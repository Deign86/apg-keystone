import { Button, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SectionLabel, SelectInput, StatusPill, TextInput, useConfirm, type Column } from '@keystone/ui';
import { useCallback, useRef, useState } from 'react';
import {
  amountInWords, awaitingApproval, count, newVoucher, payees, peso, recordOf, saveVoucher, setVoucherStatus, shortDate,
  sumCentavos, toneOf, VOUCHER_STATUSES, voucherDraftOf, voucherOf, vouchersNewestFirst, voucherTotal, type Voucher,
} from '@keystone/core';
import { useDraft, useKeystone } from '../app/context';
import type { ModuleDef } from '../app/registry';
import { VoucherPaper } from '../documents/Paper';
import { printElement, savePdf } from '../documents/output';
import { FormCard, LineEditor, Workspace } from './shared';

function Vouchers() {
  const { state, ctx, run, platform, notify, store } = useKeystone();
  const confirm = useConfirm();
  const [draft, setDraft] = useDraft('cv', () => newVoucher(state, ctx));
  const [error, setError] = useState<string | null>(null);
  const paper = useRef<HTMLDivElement>(null);
  const ref = ctx.seed.reference;
  const pending = awaitingApproval(state);
  const editing = draft.editing ? state.cv.find((v) => v.no === draft.editing) : undefined;
  const live = voucherOf(draft);
  const total = voucherTotal(live);

  const save = useCallback((asNew = false) => {
    const r = run((s, c) => saveVoucher(s, draft, c, asNew));
    setError(r.ok ? null : r.error);
    // Number the next blank voucher from the state after the save.
    if (r.ok) setDraft(newVoucher(store.getState(), ctx));
  }, [run, draft, ctx, setDraft, store]);

  const columns: Column<Voucher>[] = [
    { key: 'no', header: 'CV No.', width: 128, cell: (v) => <span className="font-semibold text-gold-bright tabular-nums">{v.no}</span> },
    { key: 'date', header: 'Date', width: 104, cell: (v) => <span className="text-ink-2 tabular-nums">{shortDate(v.date)}</span> },
    { key: 'payee', header: 'Payee', cell: (v) => recordOf(state, v.payee)?.name ?? v.payee },
    { key: 'check', header: 'Bank / Check', width: 168, cell: (v) => <><span className="tabular-nums">{v.check || '—'}</span> <span className="text-ink-2">{v.bank.split(' –')[0]}</span></> },
    { key: 'amount', header: 'Amount', width: 128, align: 'right', cell: (v) => <span className="font-semibold">{peso(voucherTotal(v))}</span> },
    { key: 'status', header: 'Status', width: 150, align: 'right', cell: (v) => <StatusPill status={v.status} tone={toneOf(v.status)} /> },
  ];

  return (
    <>
      <ScreenHeader
        eyebrow="Disbursements"
        title="Check Vouchers"
        line={pending.length
          ? `${count(pending.length, 'voucher')} worth ${peso(sumCentavos(pending, voucherTotal))} ${pending.length === 1 ? 'waits' : 'wait'} for approval.`
          : 'Every voucher is signed. Record a disbursement and route it for signatures.'}
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
            title={editing ? `Editing ${editing.no}` : 'New voucher'}
            onSubmit={() => save()}
            error={error}
            actions={<>
              <Button onClick={() => paper.current && printElement(paper.current)}>Print</Button>
              <Button onClick={() => paper.current && savePdf(paper.current, `${live.no}.pdf`, platform).then((n) => n && notify(`Saved ${n}.`), (e) => notify(String(e), 'error'))}>Export PDF</Button>
              {editing && <Button onClick={() => save(true)}>Save as new</Button>}
              <Button kind="primary" type="submit">{editing ? 'Save changes' : 'Save and route for approval'}</Button>
            </>}
          >
            <FieldRow>
              <Field label="CV No."><TextInput readOnly value={draft.editing ?? draft.no} onChange={() => {}} /></Field>
              <Field label="Date"><TextInput type="date" value={draft.date} onChange={(date) => setDraft({ ...draft, date })} /></Field>
            </FieldRow>
            <Field label="Payee">
              <SelectInput value={draft.payee} onChange={(payee) => setDraft({ ...draft, payee })} options={payees(state).map((d) => ({ value: d.code, label: `${d.name} (${d.code})` }))} />
            </Field>
            <FieldRow>
              <Field label="Bank account"><SelectInput value={draft.bank} onChange={(bank) => setDraft({ ...draft, bank })} options={ref.banks.map((b) => ({ value: b, label: b }))} /></Field>
              <Field label="Check No." hint="Needed before the voucher is released."><TextInput figures placeholder="0004512" value={draft.check} onChange={(check) => setDraft({ ...draft, check })} /></Field>
            </FieldRow>
            <LineEditor title="Particulars" lines={draft.lines} accounts={ref.accounts} onChange={(lines) => setDraft({ ...draft, lines })} />
            <div className="text-right" aria-live="polite">
              <p className="m-0 font-display text-lg font-semibold text-gold-bright tabular-nums">{peso(total)}</p>
              <p className="m-0 text-xs text-ink-2">{amountInWords(total)}</p>
            </div>
            <FieldRow min={120}>
              <Field label="Prepared by"><TextInput value={draft.prepared} onChange={(prepared) => setDraft({ ...draft, prepared })} /></Field>
              <Field label="Checked by"><TextInput value={draft.checked} onChange={(checked) => setDraft({ ...draft, checked })} /></Field>
              <Field label="Approved by"><TextInput value={draft.approved} onChange={(approved) => setDraft({ ...draft, approved })} /></Field>
            </FieldRow>
          </FormCard>
        }
        preview={<VoucherPaper ref={paper} voucher={{ ...live, no: draft.editing ?? draft.no }} payee={recordOf(state, draft.payee)} company={ctx.seed.company} />}
      />
    </>
  );
}

export const vouchersModule: ModuleDef = {
  id: 'vouchers',
  title: 'Check Vouchers',
  section: 'Disbursements',
  blurb: 'Prepare disbursement vouchers, generate the amount in words, and route them for signatures.',
  order: 2,
  onHome: true,
  stat: (s) => ['Awaiting approval', String(awaitingApproval(s).length)],
  Screen: Vouchers,
};
