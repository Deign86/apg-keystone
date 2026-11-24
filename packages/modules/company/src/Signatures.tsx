import { Button, EmptyState, Panel, SectionLabel, Sheet, useConfirm } from '@keystone/ui';
import { useRef, useState, type PointerEvent } from 'react';
import { companyOf, sentenceOf } from '@keystone/core';
import { SignatoryPicker, trimSignature, useKeystone } from '@keystone/kit';
import { setSignature } from './rules';

// Each signatory's signature, kept with the company's details (docs/adr/0038). Uploaded once, as a scan or a photo, or
// drawn here; every voucher, statement and request then prints it above that person's name.

/** The most room a signature takes: it is scaled down to fit, and never up. */
const WIDTH = 480;
const HEIGHT = 160;

/** How light a pixel of a scan has to be to count as the paper behind the ink, made see-through. */
const PAPER = 215;

/** A scan or photo of a signature as it is kept: scaled to fit 480 × 160, its paper see-through, as a PNG (trimmed on saving). */
async function signatureImage(bytes: Uint8Array): Promise<string> {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
  const scale = Math.min(1, WIDTH / bitmap.width, HEIGHT / bitmap.height);
  const canvas = document.createElement('canvas');

  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const g = canvas.getContext('2d');

  if (!g) throw new Error('This computer cannot read images here.');
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const pixels = g.getImageData(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < pixels.data.length; i += 4) {
    if (pixels.data[i] > PAPER && pixels.data[i + 1] > PAPER && pixels.data[i + 2] > PAPER) pixels.data[i + 3] = 0;
  }

  g.putImageData(pixels, 0, 0);

  return canvas.toDataURL('image/png');
}

/** A box to sign in with the mouse, a pen or a finger. */
function SignaturePad({ onSave, onCancel }: { onSave: (image: string) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [signed, setSigned] = useState(false);

  /** Where the pointer is, in the canvas's own pixels, however wide the box is drawn. */
  const at = (e: PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();

    return [(e.clientX - box.left) * (WIDTH / box.width), (e.clientY - box.top) * (HEIGHT / box.height)] as const;
  };

  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    const g = e.currentTarget.getContext('2d');

    if (!g) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    g.lineWidth = 2.5;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#111111';
    g.beginPath();
    g.moveTo(...at(e));
  };

  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    const g = e.currentTarget.getContext('2d');

    if (!drawing.current || !g) return;
    g.lineTo(...at(e));
    g.stroke();
    setSigned(true);
  };

  const clear = () => {
    canvas.current?.getContext('2d')?.clearRect(0, 0, WIDTH, HEIGHT);
    setSigned(false);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* White, as the paper it prints on. */}
      <canvas
        ref={canvas}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label="Sign here"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => { drawing.current = false; }}
        onPointerLeave={() => { drawing.current = false; }}
        className="aspect-[3/1] w-full touch-none rounded-control border border-line-bright bg-white"
      />
      <div className="flex items-center justify-end gap-2">
        <Button kind="quiet" className="mr-auto" onClick={clear}>Clear</Button>
        <Button onClick={onCancel}>Cancel</Button>
        <Button kind="primary" disabled={!signed} onClick={() => canvas.current && onSave(canvas.current.toDataURL('image/png'))}>Save signature</Button>
      </div>
    </div>
  );
}

/** The signatures Company Details keeps: whose, each as it prints, to add, replace or remove. Only an owner changes them. */
export function SignaturesPanel({ editable }: { editable: boolean }) {
  const { state, run, files, notify } = useKeystone();
  const confirm = useConfirm();
  const [who, setWho] = useState('');
  const [pad, setPad] = useState(false);
  const kept = Object.entries(companyOf(state).signatures ?? {}).sort(([a], [b]) => a.localeCompare(b));

  // Kept trimmed to its ink, so it is drawn the same size as everyone else's on every paper.
  const save = async (image: string) => {
    const tight = await trimSignature(image).catch(() => image);

    if (run((s, c) => setSignature(s, who, tight, c)).ok) setPad(false);
  };

  const upload = async () => {
    try {
      const file = await files.open([{ name: 'Signature', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]);

      if (file) await save(await signatureImage(file.bytes));
    } catch (e) {
      notify(`That file could not be used as a signature: ${sentenceOf(e)}`, 'error');
    }
  };

  return (
    <Panel aria-labelledby="signatures-title" className="mt-4 flex flex-col gap-3.5">
      <div>
        <SectionLabel id="signatures-title">Signatures</SectionLabel>
        <p className="m-0 mt-1 text-[13px] text-pretty text-ink-2">Each person&apos;s signature prints above their name on every voucher, statement and request they sign.</p>
      </div>
      {editable && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <SignatoryPicker anyone label="Whose signature" value={who} onChange={setWho} />
          </div>
          <Button disabled={!who.trim()} onClick={() => void upload()}>Upload signature…</Button>
          <Button disabled={!who.trim()} onClick={() => setPad(true)}>Draw signature…</Button>
        </div>
      )}
      {kept.length ? (
        <ul aria-label="Signatures kept" className="m-0 flex list-none flex-col p-0">
          {kept.map(([name, image]) => (
            <li key={name} className="flex items-center gap-3 border-t border-line py-2">
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{name}</span>
              <img src={image} alt={`Signature of ${name}`} className="h-12 w-36 rounded-control bg-white object-contain p-1" />
              {editable && (
                <Button
                  size="sm"
                  kind="quiet"
                  onClick={() => confirm({ title: `Remove the signature of ${name}?`, body: 'Documents stop printing it, those already printed and exported keep it.', confirm: 'Remove signature', danger: true, onConfirm: () => run((s, c) => setSignature(s, name, null, c)) })}
                >
                  Remove…
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : <EmptyState text="No signatures yet. Documents leave the line to sign by hand." />}
      <Sheet open={pad} onOpenChange={setPad} title={`Signature of ${who}`} description="Sign in the box. It prints as drawn, above the name.">
        {pad && <SignaturePad onSave={save} onCancel={() => setPad(false)} />}
      </Sheet>
    </Panel>
  );
}
