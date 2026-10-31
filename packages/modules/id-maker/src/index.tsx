import { Button, EmptyState, Field, FieldRow, Panel, Register, ScreenHeader, SectionLabel, SelectInput, StatusPill, TextInput, type Column } from '@keystone/ui';
import { useCallback, useRef, useState } from 'react';
import { count, ID_STATUSES, recordsOf, shortDate, toneOf, type IDRecord } from '@keystone/core';
import { idDraftOf, idFigure, idFinding, idOf, idsNewestFirst, idWaiting, issueID, markExpired, newID, queuedForPrinting, setIDStatus, withEmployee } from './rules';
import { useDraft, useKeystone, useModuleApp, usePhoto, type ModuleDef, printElement, savePdf, FormCard, Workspace } from '@keystone/kit';
import { IDCardSheet } from './IDCard';

/** The select's value for "no directory record"; Base UI treats an empty value as unselected. */
const MANUAL = 'manual';

/** Crops the centre square at 640px and returns JPEG bytes. */
async function squareJpeg(bytes: Uint8Array): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([bytes.slice()]));
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 640;
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 640, 640);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the photo.'))), 'image/jpeg', 0.88));

  return new Uint8Array(await blob.arrayBuffer());
}

const DRAFT = 'id-maker.draft';

function IDMaker() {
  const { state, ctx, run, platform, notify, store, registry } = useKeystone();
  const app = useModuleApp();
  const peopleSource = registry.connectors.find((c) => c.people);
  const [draft, setDraft] = useDraft(DRAFT, () => newID(state, ctx));
  const [error, setError] = useState<string | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const photo = usePhoto(draft.photo);
  const editing = draft.editing ? state.ids.find((i) => i.no === draft.editing) : undefined;
  const queued = queuedForPrinting(state);
  const ref = ctx.seed.reference;

  const save = useCallback((asNew = false) => {
    const r = run((s, c) => issueID(s, draft, c, asNew));
    setError(r.ok ? null : r.error);

    if (r.ok) setDraft(newID(store.getState(), ctx));
  }, [run, draft, ctx, setDraft, store]);

  const choosePhoto = async () => {
    try {
      const file = await platform.openFile([{ name: 'Photo', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic'] }]);

      if (!file) return;
      const name = `card-${Date.now()}.jpg`;
      await platform.putPhoto(name, await squareJpeg(file.bytes));
      setDraft({ ...draft, photo: name });
    } catch (e) {
      notify(`That file could not be used as a photo: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  const columns: Column<IDRecord>[] = [
    { key: 'no', header: 'ID No.', width: 136, cell: (i) => <span className="font-semibold text-gold-bright tabular-nums">{i.no}</span> },
    { key: 'name', header: 'Name', cell: (i) => i.name },
    { key: 'pos', header: 'Position', width: 188, cell: (i) => <span className="text-ink-2">{i.pos}</span> },
    { key: 'issued', header: 'Issued', width: 104, cell: (i) => <span className="text-ink-2 tabular-nums">{shortDate(i.issued)}</span> },
    { key: 'valid', header: 'Valid until', width: 104, cell: (i) => <span className="text-ink-2 tabular-nums">{shortDate(i.valid)}</span> },
    { key: 'status', header: 'Status', width: 150, align: 'right', cell: (i) => <StatusPill status={i.status} tone={toneOf(i.status)} /> },
  ];

  const employees = recordsOf(state, 'Employee');

  return (
    <>
      <ScreenHeader
        eyebrow="Employee IDs"
        title="ID Maker"
        line={queued.length
          ? `${count(queued.length, 'card')} waiting to be printed: ${queued.map((i) => i.name).join(', ')}.`
          : 'No card is waiting to be printed. Pick an employee and the card renders front and back.'}
        actions={<Button onClick={() => { setDraft(newID(state, ctx)); setError(null); }}>New ID</Button>}
      />
      <Panel className="mb-4">
        <div className="mb-2 flex items-baseline justify-between">
          <SectionLabel>Issued IDs</SectionLabel>
          <span className="text-xs text-ink-2">{count(state.ids.length, 'card')}</span>
        </div>
        <Register
          label="Issued IDs"
          columns={columns}
          rows={idsNewestFirst(state)}
          rowKey={(i) => i.no}
          onOpen={(i) => { setDraft(idDraftOf(i)); setError(null); notify(`${i.no} loaded for preview.`); }}
          actions={(i) => ID_STATUSES.map((s) => ({ label: s === 'Active' ? 'Mark printed and handed over' : `Mark ${s.toLowerCase()}`, disabled: i.status === s, danger: s === 'Revoked', onSelect: () => run((st, c) => setIDStatus(st, i.no, s, c)) }))}
          empty={<EmptyState text="No cards issued yet." action={<Button size="sm" kind="primary" onClick={() => document.getElementById('id-form')?.scrollIntoView({ block: 'start' })}>Make the first card</Button>} />}
        />
      </Panel>

      <Workspace
        previewTitle="Card preview"
        previewNote="Front and back, CR80"
        form={
          <FormCard
            id="id-form"
            eyebrow="Card entry"
            title={editing ? `Editing ${editing.no}` : 'New ID'}
            onSubmit={() => save()}
            error={error}
            actions={<>
              <Button onClick={() => sheet.current && printElement(sheet.current)}>Print</Button>
              <Button onClick={() => sheet.current && savePdf(sheet.current, `${draft.editing ?? draft.no}.pdf`, platform).then((n) => n && notify(`Saved ${n}.`), (e) => notify(String(e), 'error'))}>Export print file</Button>
              {editing && <Button onClick={() => save(true)}>Issue as new</Button>}
              <Button kind="primary" type="submit">{editing ? 'Save changes' : 'Save and issue'}</Button>
            </>}
          >
            <FieldRow>
              <Field label="ID No."><TextInput readOnly value={draft.editing ?? draft.no} onChange={() => {}} /></Field>
              <Field label="Employee" hint={!employees.some((e) => e.links) && peopleSource && (app.has('home') || app.has('connections')) ? `Bring people in from ${peopleSource.name} on ${app.has('home') ? 'Home' : 'Connections'}.` : undefined}>
                <SelectInput value={draft.emp || MANUAL} onChange={(emp) => setDraft(withEmployee(state, draft, emp === MANUAL ? '' : emp))} options={[{ value: MANUAL, label: 'Type details by hand' }, ...employees.map((d) => ({ value: d.code, label: `${d.name} (${d.code})` }))]} />
              </Field>
            </FieldRow>
            <Field label="Name on card"><TextInput value={draft.name} onChange={(name) => setDraft({ ...draft, name })} /></Field>
            <FieldRow>
              <Field label="Position"><TextInput value={draft.pos} onChange={(pos) => setDraft({ ...draft, pos })} /></Field>
              <Field label="Department"><TextInput value={draft.dept} onChange={(dept) => setDraft({ ...draft, dept })} /></Field>
            </FieldRow>
            <FieldRow min={130}>
              <Field label="Date issued"><TextInput type="date" value={draft.issued} onChange={(issued) => setDraft({ ...draft, issued })} /></Field>
              <Field label="Valid until"><TextInput type="date" value={draft.valid} onChange={(valid) => setDraft({ ...draft, valid })} /></Field>
              <Field label="Blood type"><SelectInput value={draft.blood} onChange={(blood) => setDraft({ ...draft, blood })} options={ref.bloodTypes.map((b) => ({ value: b, label: b }))} /></Field>
            </FieldRow>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium">Photo</span>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button size="sm" onClick={choosePhoto}>{draft.photo ? 'Replace photo…' : 'Choose photo…'}</Button>
                {draft.photo && <Button size="sm" kind="quiet" onClick={() => setDraft({ ...draft, photo: undefined })}>Remove</Button>}
                <span className="text-xs text-ink-2">Cropped square from the centre.{peopleSource ? ` People imported from ${peopleSource.name} bring their photo.` : ''}</span>
              </div>
            </div>
            <FieldRow>
              <Field label="Emergency contact"><TextInput placeholder="Name" value={draft.iceName} onChange={(iceName) => setDraft({ ...draft, iceName })} /></Field>
              <Field label="Contact number"><TextInput type="tel" placeholder="09XX XXX XXXX" value={draft.iceNo} onChange={(iceNo) => setDraft({ ...draft, iceNo })} /></Field>
            </FieldRow>
            <Field label="Authorized signatory"><TextInput value={draft.signatory} onChange={(signatory) => setDraft({ ...draft, signatory })} /></Field>
          </FormCard>
        }
        preview={<div className="overflow-hidden rounded-card border border-line"><IDCardSheet ref={sheet} card={{ ...idOf(draft), no: draft.editing ?? draft.no }} photo={photo} company={ctx.seed.company} /></div>}
      />
    </>
  );
}

export const idMakerModule: ModuleDef = {
  id: 'id-maker',
  title: 'ID Maker',
  section: 'Employee IDs',
  blurb: 'Pick a person, add a photo, and print the card front and back.',
  order: 4,
  onHome: true,
  stat: (s) => ['Queued for printing', String(queuedForPrinting(s).length)],
  figure: idFigure,
  finding: idFinding,
  waiting: idWaiting,
  openWaiting: (no, app) => {
    const i = app.state.ids.find((x) => x.no === no);

    if (i) app.setDraft(DRAFT, idDraftOf(i));
    app.go('id-maker');
  },
  create: { label: 'New ID', run: (app) => { app.setDraft(DRAFT, newID(app.state, app.ctx)); app.go('id-maker'); } },
  logTags: { ID: 'IDs' },
  onOpen: markExpired,
  Screen: IDMaker,
};
