import { Button } from '@keystone/ui';
import { useEffect, useState } from 'react';
import { useRuntime } from './context';
import type { InstallWay } from './platform';

/**
 * In the web app, how to put Keystone on this device's home screen, so it opens full screen like an app and starts
 * from what it keeps even offline (docs/adr/0046): a button for the browser's own dialog, or, on an iPhone or iPad,
 * where the browser keeps it. Shows nothing once Keystone is installed, and nowhere it cannot be (the desktop app).
 */
export function InstallNotice() {
  const { platform } = useRuntime();
  const installer = platform.installer;
  const [way, setWay] = useState<InstallWay | null>(() => installer?.way() ?? null);

  useEffect(() => {
    if (!installer) return;
    setWay(installer.way());

    return installer.watch(() => setWay(installer.way()));
  }, [installer]);

  if (!installer || !way) return null;

  return (
    <div className="mb-3 rounded-control border border-line p-2.5">
      {way === 'prompt' ? (
        <>
          <p className="m-0 text-ink">Keystone can open like an app on this device.</p>
          <Button size="sm" className="mt-2" onClick={() => void installer.prompt()}>Install Keystone</Button>
        </>
      ) : (
        <p className="m-0 text-ink">To open Keystone like an app, tap Share, then Add to Home Screen.</p>
      )}
    </div>
  );
}
