import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Dialog } from '@base-ui/react/dialog';
import { Toast } from '@base-ui/react/toast';
import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Button, cn } from './primitives';

// taste-skill-ignore: dialogs and toasts are real overlays and may float.
const POPUP = cn(
  'fixed top-1/2 left-1/2 z-40 w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-tile border border-line-bright bg-surface p-6',
  'shadow-[0_16px_48px_rgb(0_0_0/0.55)] outline-none transition-[opacity,transform] duration-150 ease-out',
  'data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0',
);
const BACKDROP = 'fixed inset-0 z-40 bg-black/60 transition-opacity duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0';

// ---------- confirmation for destructive or irreversible actions ----------

interface ConfirmRequest {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  onConfirm: () => void;
}

const ConfirmContext = createContext<(r: ConfirmRequest) => void>(() => {});

/** Ask before anything that cannot be undone: `confirm({ title, body, confirm, onConfirm })`. */
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [open, setOpen] = useState(false);
  const ask = useCallback((r: ConfirmRequest) => { setRequest(r); setOpen(true); }, []);
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <AlertDialog.Root open={open} onOpenChange={setOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className={BACKDROP} />
          <AlertDialog.Popup className={POPUP}>
            <AlertDialog.Title className="m-0 font-display text-[15px] font-semibold text-ink">{request?.title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 mb-0 text-[13px] text-ink-2">{request?.body}</AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Close render={<Button />}>Cancel</AlertDialog.Close>
              <Button
                kind={request?.danger ? 'danger' : 'primary'}
                onClick={() => { setOpen(false); request?.onConfirm(); }}
              >
                {request?.confirm}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  );
}

/** A plain dialog for forms and pickers. */
export function Sheet({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className={BACKDROP} />
        <Dialog.Popup className={cn(POPUP, 'w-[min(560px,calc(100vw-32px))]')}>
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="m-0 font-display text-[15px] font-semibold text-ink">{title}</Dialog.Title>
            <Dialog.Close aria-label="Close" className="grid size-8 place-items-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink">
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </div>
          {description && <Dialog.Description className="mt-1.5 mb-0 text-[13px] text-ink-2">{description}</Dialog.Description>}
          <div className="mt-5">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------- toasts ----------

/** `notify("CV-2026-0142 saved.")`, or `notify(text, "error")` for a refusal. */
export function useNotify() {
  const manager = Toast.useToastManager();
  return useCallback(
    (text: string, type: 'success' | 'error' = 'success') => manager.add({ title: text, type, timeout: type === 'error' ? 6000 : 3200 }),
    [manager],
  );
}

function Toasts() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed right-0 bottom-[max(20px,env(safe-area-inset-bottom))] left-[var(--size-rail)] z-50 mx-auto flex w-[min(520px,calc(100vw-var(--size-rail)-32px))] flex-col items-center gap-2 outline-none">
        {toasts.map((t) => (
          <Toast.Root
            key={t.id}
            toast={t}
            className={cn(
              'flex w-full items-start gap-3 rounded-control px-4 py-2.5 text-[13px] font-semibold',
              'shadow-[0_10px_30px_rgb(0_0_0/0.45)] transition-[opacity,transform] duration-200 ease-out', // taste-skill-ignore: toasts float
              'data-[ending-style]:translate-y-2 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0',
              t.type === 'error' ? 'border border-bad/60 bg-surface-2 text-bad' : 'bg-gold-bright text-gold-ink',
            )}
          >
            <Toast.Content className="min-w-0 flex-1">
              <Toast.Title className="m-0 text-pretty" />
            </Toast.Content>
            <Toast.Close aria-label="Dismiss" className="-mr-1 grid size-6 shrink-0 place-items-center rounded-[4px] opacity-70 hover:opacity-100">
              <X size={14} aria-hidden="true" />
            </Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider limit={3}>
      <ConfirmProvider>
        {children}
        <Toasts />
      </ConfirmProvider>
    </Toast.Provider>
  );
}
