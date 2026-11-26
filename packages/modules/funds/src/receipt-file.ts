import type { Receipt } from './rules';

// A picked file as a receipt the request keeps (docs/adr/0050). A request is one document in the cloud, so a phone's
// photo of several megabytes is drawn again as a JPEG no longer than READABLE on its long side, still sharp enough to
// read, and smaller each time until it fits ONE_MOST. A PDF is kept as it is; the rule refuses one too large to keep.

/** The extensions the file picker offers. */
export const RECEIPT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];

/** The long side of a receipt's photo, in pixels, and the most one photo may come to, in characters of its data URL. */
const READABLE = 1600;
const ONE_MOST = 260_000;

/** Bytes as base64, a chunk at a time, so a large file does not overflow the call stack. */
function base64(bytes: Uint8Array): string {
  let text = '';

  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));

  return btoa(text);
}

function decoded(bytes: Uint8Array, type: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type }));

  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('It could not be read as a photo.')); };

    img.src = url;
  });
}

/** The photo drawn on white at `side` pixels at most on its long side, as a JPEG data URL. */
function drawn(img: HTMLImageElement, side: number, quality: number): string {
  const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const g = canvas.getContext('2d');

  if (!g) throw new Error('This browser cannot draw the photo.');
  // A transparent PNG would turn black as a JPEG.
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', quality);
}

/** A picked file as a receipt: a PDF as it is, a photo as a JPEG small enough to keep. Throws when it is neither. */
export async function receiptOf(file: { name: string; bytes: Uint8Array }): Promise<Receipt> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'pdf') return { name: file.name, data: `data:application/pdf;base64,${base64(file.bytes)}` };

  const img = await decoded(file.bytes, ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  let data = drawn(img, READABLE, 0.8);

  for (const [side, quality] of [[1400, 0.7], [1200, 0.6], [1000, 0.55]] as const) {
    if (data.length <= ONE_MOST) break;
    data = drawn(img, side, quality);
  }

  return { name, data };
}

/** A kept receipt's file, to save: its name and its bytes. */
export function receiptBytes(r: Receipt): Uint8Array {
  const text = atob(r.data.slice(r.data.indexOf(',') + 1));

  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}
