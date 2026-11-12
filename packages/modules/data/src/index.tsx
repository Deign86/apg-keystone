import { Button, Panel, ScreenHeader, SectionLabel, useConfirm } from '@keystone/ui';
import { count, localDate, parseBackup } from '@keystone/core';
import { useKeystone, type ModuleDef } from '@keystone/kit';

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
      const next = parseBackup(new TextDecoder().decode(file.bytes));
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
      </div>
    </Panel>
  );
}

/** Backing up and restoring the data, and the parts the registry left out. Keystone has no sample data to reset to (docs/adr/0018). */
function Data() {
  const { registry } = useKeystone();

  return (
    <>
      <ScreenHeader
        eyebrow="Settings"
        title="Data"
        line="Back up what Keystone holds, or restore it from a backup."
      />
      <div className="grid items-start gap-4 min-[1000px]:grid-cols-2">
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

export const dataModule: ModuleDef = {
  id: 'data',
  title: 'Data',
  section: 'Settings',
  blurb: 'Back up or restore the data, and see any part that was left out.',
  order: 90,
  Screen: Data,
};
