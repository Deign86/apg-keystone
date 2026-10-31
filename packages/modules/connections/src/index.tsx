import { Button, Checkbox, Field, Panel, ScreenHeader, SectionLabel, StatusPill, TextInput, useConfirm } from '@keystone/ui';
import { useState } from 'react';
import { bundledSeed, count, localDate, parseState, type Connector } from '@keystone/core';
import { useConnectorStatus, useImportPeople, useKeystone, type ModuleDef } from '@keystone/kit';

/** A connector's settings form, drawn from the fields it declares. */
function ConnectorSettings({ connector }: { connector: Connector }) {
  const { connections, notify } = useKeystone();
  const status = useConnectorStatus(connector.id);
  const [values, setValues] = useState(() => connections.settingsOf(connector));
  const [secrets, setSecrets] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const importPeople = useImportPeople();
  const h = status.health;

  const save = async () => {
    setBusy(true);

    try {
      const changed = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v !== ''));
      await connections.configure(connector, values, changed);
      setSecrets({});
      const after = connections.statusOf(connector.id).health;
      notify(after ? `${connector.name}: ${after.detail}` : `${connector.name} saved.`, after?.state === 'ready' || after?.state === 'setup' ? 'success' : 'error');
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel aria-label={connector.name} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="m-0 font-display text-[15px] font-semibold">{connector.name}</h2>
          <p className="mt-1 mb-0 text-[13px] text-ink-2">{connector.about}</p>
        </div>
        <StatusPill status={!h ? 'Checking' : h.state === 'ready' ? 'Connected' : h.state === 'setup' ? 'Set up' : h.state === 'unsupported' ? 'Desktop only' : h.state === 'offline' ? 'Offline' : 'Problem'} tone={!h ? 'neutral' : h.state === 'ready' ? 'good' : h.state === 'setup' ? 'warn' : h.state === 'unsupported' ? 'neutral' : 'bad'} />
      </div>
      <p className="m-0 rounded-control bg-gold-tint px-3 py-2.5 text-[12.5px]" aria-live="polite">{h?.detail ?? 'Checking…'}</p>
      {connector.settings.length === 0 ? (
        <p className="m-0 text-[13px] text-ink-2">Nothing to set up: Keystone finds it on this computer by itself.</p>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {connector.settings.map((f) =>
            f.kind === 'toggle' ? (
              <Checkbox key={f.key} checked={values[f.key] === 'true'} onChange={(v) => setValues({ ...values, [f.key]: String(v) })}>{f.label}</Checkbox>
            ) : f.kind === 'secret' ? (
              <Field key={f.key} label={f.label} hint={f.help}>
                <div className="flex gap-2">
                  <TextInput type="password" placeholder="Saved in this computer’s keychain when set" value={secrets[f.key] ?? ''} onChange={(v) => setSecrets({ ...secrets, [f.key]: v })} />
                  <Button size="sm" kind="quiet" className="h-9" onClick={() => setSecrets({ ...secrets, [f.key]: null })}>Clear</Button>
                </div>
              </Field>
            ) : (
              <Field key={f.key} label={f.label} hint={f.help}>
                <TextInput type={f.kind === 'url' ? 'url' : 'text'} placeholder={f.placeholder} value={values[f.key] ?? ''} onChange={(v) => setValues({ ...values, [f.key]: v })} />
              </Field>
            ),
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            {connector.people && <Button className="mr-auto" disabled={busy || h?.state === 'unsupported'} onClick={() => { setBusy(true); void importPeople(connector).finally(() => setBusy(false)); }}>{connector.people.label}</Button>}
            <Button disabled={busy} onClick={() => void connections.refresh(connector)}>Test again</Button>
            <Button kind="primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Save and connect'}</Button>
          </div>
        </form>
      )}
    </Panel>
  );
}

function DataPanel() {
  const { state, store, platform, notify } = useKeystone();
  const confirm = useConfirm();

  const backup = async () => {
    const name = await platform.saveFile(`keystone-backup-${localDate(new Date())}.json`, new TextEncoder().encode(JSON.stringify(state, null, 2)), [{ name: 'Keystone backup', extensions: ['json'] }]);

    if (name) notify(`Saved ${name}.`);
  };

  const restore = async () => {
    const file = await platform.openFile([{ name: 'Keystone backup', extensions: ['json'] }]);

    if (!file) return;

    try {
      const next = parseState(new TextDecoder().decode(file.bytes));
      confirm({
        title: `Restore ${file.name}?`,
        body: `It holds ${count(next.cv.length, 'voucher')}, ${count(next.bs.length, 'statement')}, ${count(next.ids.length, 'ID')} and ${count(next.dir.length, 'directory record')}. Everything Keystone holds now is replaced.`,
        confirm: 'Replace with backup',
        danger: true,
        onConfirm: () => { store.replaceAll(next); notify(`Restored ${file.name}.`); },
      });
    } catch (e) {
      notify(e instanceof Error ? e.message : 'That file is not a Keystone backup.', 'error');
    }
  };

  const reset = () => confirm({
    title: 'Reset to the sample data?',
    body: 'Every voucher, statement, ID and directory record is replaced with the sample set. Back up first if you may need them.',
    confirm: 'Reset data',
    danger: true,
    onConfirm: () => { store.replaceAll(structuredClone(bundledSeed.state)); notify('Data reset to the sample set.'); },
  });

  return (
    <Panel aria-labelledby="data" className="flex flex-col gap-3">
      <SectionLabel id="data">Data</SectionLabel>
      <p className="m-0 text-[13px] text-ink-2">
        {platform.kind === 'desktop' ? 'Saved on this computer in Keystone’s data folder, with card photos beside it.' : 'This browser preview keeps data in this browser only.'}
        {' '}A backup is one JSON file in the same format as the prototype, so it opens in any Keystone.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={backup}>Back up data…</Button>
        <Button onClick={restore}>Restore from backup…</Button>
        <Button kind="danger" className="ml-auto" onClick={reset}>Reset to sample data…</Button>
      </div>
    </Panel>
  );
}

function Connections() {
  const { registry } = useKeystone();

  return (
    <>
      <ScreenHeader
        eyebrow="Settings"
        title="Connections"
        line={`${count(registry.connectors.length, 'system')} connected to Keystone. Each has its own settings; one that is offline never affects the others.`}
      />
      <div className="grid items-start gap-4 min-[1000px]:grid-cols-2">
        {registry.connectors.map((c) => <ConnectorSettings key={c.id} connector={c} />)}
        <DataPanel />
        {registry.refused.length > 0 && (
          <Panel aria-labelledby="refused">
            <SectionLabel id="refused" className="text-bad">Not loaded</SectionLabel>
            <ul className="mt-2 mb-0 pl-4 text-[13px] text-ink-2">
              {registry.refused.map((r) => <li key={r.id}><b className="text-ink">{r.id}</b>: {r.reason}</li>)}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}

export const connectionsModule: ModuleDef = {
  id: 'connections',
  title: 'Connections',
  section: 'Settings',
  blurb: 'Settings for each connected system, and backing up your data.',
  order: 90,
  Screen: Connections,
};
