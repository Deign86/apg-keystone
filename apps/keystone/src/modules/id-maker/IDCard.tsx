import logo from '@keystone/ui/logo.png';
import { forwardRef } from 'react';
import { shortDate, verificationCells, verificationSeed, VERIFICATION_SIZE, type Company, type IDRecord } from '@keystone/core';

function Pattern({ text }: { text: string }) {
  const cells = verificationCells(text);
  const n = VERIFICATION_SIZE;
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className="block size-16 rounded-[3px] border-[3px] border-white bg-white" role="img" aria-label="Verification pattern" shapeRendering="crispEdges">
      {cells.flatMap((row, y) => row.map((dark, x) => (dark ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#111" /> : null)))}
    </svg>
  );
}

const CARD = 'relative h-[var(--size-card-h)] w-[var(--size-card-w)] shrink-0 overflow-hidden rounded-id-card border border-line text-ink';

/** Front and back of a CR80 card. The foil stripe is flat gold: no gradients anywhere. */
export const IDCardSheet = forwardRef<HTMLDivElement, { card: IDRecord; photo: string | null; company: Company }>(function IDCardSheet({ card, photo, company }, ref) {
  return (
    <div ref={ref} data-ui="document" className="flex flex-wrap justify-center gap-4 bg-surface p-4">
      <div className={`${CARD} bg-card-bg`} aria-label={`ID card front for ${card.name || 'a new employee'}`}>
        <div className="flex items-center gap-2 border-b border-line px-3.5 pt-3.5 pb-2.5">
          <img src={logo} alt="" className="size-[26px] object-contain" />
          <div>
            <p className="m-0 font-display text-[8.5px] leading-tight font-bold">ALPHA PREMIER <span className="text-gold-bright">GROUP</span></p>
            <p className="m-0 text-[7.5px] tracking-[0.12em] text-ink-2 uppercase">Employee identification</p>
          </div>
        </div>
        <div className="mx-auto mt-4 mb-2.5 grid size-[118px] place-items-center overflow-hidden rounded-[8px] border-2 border-gold bg-surface-2 text-[10.5px] text-ink-3">
          {photo ? <img src={photo} alt="" className="size-full object-cover" /> : <span className="text-ink-2">2×2 photo</span>}
        </div>
        <p className="m-0 px-2.5 text-center font-display text-xs leading-tight font-semibold break-words">{card.name || 'Employee name'}</p>
        <p className="mt-1 mb-0 px-2.5 text-center text-[10.5px] font-semibold text-gold-bright">{card.pos || 'Position'}</p>
        <p className="m-0 text-center text-[9.5px] text-ink-2">{card.dept}</p>
        <div className="absolute right-3.5 bottom-3.5 left-3.5 flex items-end justify-between text-[10px] text-gold-bright tabular-nums">
          <div><p className="m-0 text-[7.5px] tracking-[0.1em] text-ink-3 uppercase">ID No.</p>{card.no}</div>
          <div className="text-right"><p className="m-0 text-[7.5px] tracking-[0.1em] text-ink-3 uppercase">Valid until</p>{shortDate(card.valid)}</div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[5px] bg-gold" />
      </div>
      <div className={`${CARD} bg-card-back`} aria-label="ID card back">
        <div className="mt-[18px] h-[34px] bg-black" />
        <div className="px-3.5 pt-2.5 text-[8.5px] leading-snug text-ink-2">
          <p className="m-0 mb-0.5 text-[8px] tracking-[0.1em] text-gold uppercase">Emergency contact</p>
          <p className="m-0 mb-2 text-ink">{card.iceName || '—'}{card.iceNo ? ` · ${card.iceNo}` : ''}<br />Blood type: {card.blood}</p>
          <p className="m-0 mb-0.5 text-[8px] tracking-[0.1em] text-gold uppercase">If found</p>
          <p className="m-0 mb-1.5 text-ink">Please return to Alpha Premier Group, {company.shortAddress}, or call {company.phone}. This card is company property and must be surrendered upon separation.</p>
          <div className="flex justify-center"><Pattern text={verificationSeed(card.no, card.name)} /></div>
        </div>
        <div className="mx-3.5 mt-2 border-t border-gold pt-0.5 text-center text-[8px] text-ink-2">
          <p className="m-0 text-[9px] font-semibold text-ink">{card.signatory}</p>
          Authorized signature
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[5px] bg-gold" />
      </div>
    </div>
  );
});
