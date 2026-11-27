import {
  clampOffset, COMPANY, companyOf, isOwner, KeystoneError, logged, SIGNATURE_SIZE, signatureKey, signatureOffsetOf, signatureSizeOf, type Change, type SignatureOffset, type SignatureSizes, type CompanyDetails, type Ctx, type Defaults, type TerminalState,
} from '@keystone/core';

// What the company's documents start from (docs/adr/0018). Core keeps them with the records (`state.company`, in the
// cloud an owner-only document) and every part reads them with `companyOf`; this module is the one place they are
// changed. The company itself (name, address, contacts) is built in, core's `COMPANY` (docs/adr/0023), not typed here.

/** This module's id, written once: its route, its ModuleDef.id. */
export const ID = 'company';
export const TAG = 'CO';

/** The form: what documents start from, every field as typed, days and years too. */
export type CompanyDraft = { [K in keyof Defaults]: string };

export const companyDraftOf = (s: TerminalState): CompanyDraft => {
  const d = companyOf(s);

  return {
    preparedBy: d.preparedBy, checkedBy: d.checkedBy, approvedBy: d.approvedBy, paymentInstructions: d.paymentInstructions,
    billingNote: d.billingNote, signatory: d.signatory, billingTerms: d.billingTerms,
    dueInDays: d.dueInDays ? String(d.dueInDays) : '', idValidYears: d.idValidYears ? String(d.idValidYears) : '',
  };
};

/** Signed in, only an owner changes them, as firestore.rules hold. On a computer where nobody signs in, whoever uses it. */
export const canChange = (ctx: Ctx) => !ctx.who || isOwner(ctx.who);

/** One line with single spaces. */
const line = (x: string) => x.trim().replace(/\s+/g, ' ');

/** Lines kept as typed, without spaces or blank lines at either end. */
const lines = (x: string) => x.trim();

/** A whole number from 0 up to `most`, or the sentence that refuses it, naming `field`. Blank is 0: not set. */
function whole(text: string, most: number, what: string, field: keyof CompanyDraft): number {
  const t = text.trim();

  if (!t) return 0;

  if (!/^\d+$/.test(t) || Number(t) > most) throw new KeystoneError(`Enter ${what} as a whole number from 0 to ${most}, or leave it blank.`, field);

  return Number(t);
}

export function saveCompany(s: TerminalState, d: CompanyDraft, ctx: Ctx): Change<CompanyDetails> {
  if (!canChange(ctx)) throw new KeystoneError('Only the CEO changes the company\'s details.');
  const { name } = COMPANY;

  const details: CompanyDetails = {
    ...COMPANY, preparedBy: line(d.preparedBy), checkedBy: line(d.checkedBy), approvedBy: line(d.approvedBy),
    paymentInstructions: lines(d.paymentInstructions), billingNote: lines(d.billingNote), signatory: line(d.signatory),
    billingTerms: line(d.billingTerms), dueInDays: whole(d.dueInDays, 365, 'the days to pay', 'dueInDays'), idValidYears: whole(d.idValidYears, 10, 'the years an ID is valid', 'idValidYears'),
  };

  // The signatures, their sizes and places are saved one at a time (setSignature, resizeSignature, moveSignature);
  // saving the form keeps them.
  if (s.company?.signatures) details.signatures = s.company.signatures;

  if (s.company?.signatureSizes) details.signatureSizes = s.company.signatureSizes;

  if (s.company?.signatureOffsets) details.signatureOffsets = s.company.signatureOffsets;

  return { state: logged({ ...s, company: details }, TAG, `Company details for ${name} saved.`, ctx), record: details, message: 'Company details saved.' };
}

/** The longest one signature may be, as a data: URL: a signature scaled to fit 480 × 160 is far smaller. */
export const SIGNATURE_MOST = 200_000;

/** The most all the company's details may come to, signatures and all: the cloud keeps them in one record (cloud-layout.json › maxBody). */
const DETAILS_MOST = 800_000;

/**
 * Saves `image` (a data: URL) as the signature of whoever is named, replacing theirs; null removes it. Every document
 * then prints it above that name. Signed in, only an owner changes signatures.
 */
export function setSignature(s: TerminalState, name: string, image: string | null, ctx: Ctx): Change<CompanyDetails> {
  if (!canChange(ctx)) throw new KeystoneError('Only the CEO changes signatures.');
  const who = line(name);

  if (!who) throw new KeystoneError('Choose whose signature this is.');

  if (image !== null && !/^data:image\/(png|jpeg|webp);base64,/.test(image)) throw new KeystoneError('That file is not an image.');

  if (image !== null && image.length > SIGNATURE_MOST) throw new KeystoneError('That signature is too large. Use a smaller image.');
  const current = companyOf(s);
  const signatures = { ...current.signatures };
  const had = !!signatures[signatureKey(who)];

  const sizes = { ...current.signatureSizes };
  const offsets = { ...current.signatureOffsets };

  if (image === null) {
    if (!had) throw new KeystoneError(`No signature is kept for ${who}.`);
    delete signatures[signatureKey(who)];
    // A size and a place go with the signature they were for.
    delete sizes[signatureKey(who)];
    delete offsets[signatureKey(who)];
  } else signatures[signatureKey(who)] = image;

  const details: CompanyDetails = { ...current, signatures, signatureSizes: sizes, signatureOffsets: offsets };

  if (!Object.keys(signatures).length) delete details.signatures;

  if (!Object.keys(sizes).length) delete details.signatureSizes;

  if (!Object.keys(offsets).length) delete details.signatureOffsets;

  if (JSON.stringify(details).length > DETAILS_MOST) throw new KeystoneError('There is no room for another signature. Remove one first.');
  const done = image === null ? 'removed' : had ? 'replaced' : 'added';

  return { state: logged({ ...s, company: details }, TAG, `Signature for ${who} ${done}.`, ctx), record: details, message: `Signature for ${who} ${done}.` };
}

/**
 * Draws whoever is named's signature at `size` of the standard height on every paper (from half to twice it, to the
 * nearest hundredth). The standard size keeps nothing. Any member resizes one, staff too: sizes are kept apart from
 * the details only an owner changes (docs/adr/0045).
 */
export function resizeSignature(s: TerminalState, name: string, size: number, ctx: Ctx): Change<CompanyDetails> {
  const who = line(name);
  const current = companyOf(s);
  const key = signatureKey(who);

  if (!who || !current.signatures?.[key]) throw new KeystoneError(`No signature is kept for ${who || 'that name'}.`);

  if (!Number.isFinite(size)) throw new KeystoneError('That is not a size.');
  const next = Math.round(Math.min(SIGNATURE_SIZE.most, Math.max(SIGNATURE_SIZE.least, size)) * 100) / 100;

  if (next === signatureSizeOf(current, who)) return { state: s, record: current, message: `${who}'s signature is already that size.` };
  const sizes = { ...current.signatureSizes };

  if (next === 1) delete sizes[key];
  else sizes[key] = next;

  const details: CompanyDetails = { ...current, signatureSizes: sizes };

  if (!Object.keys(sizes).length) delete details.signatureSizes;
  const message = `Signature for ${who} drawn at ${Math.round(next * 100)}%.`;

  return { state: logged({ ...s, company: details }, TAG, message, ctx), record: details, message };
}

/**
 * Moves whoever is named's signature from its place on its line, on every paper: a manual correction where trimming
 * left it off. Kept within the signatory's area (`SIGNATURE_OFFSET`); no offset keeps nothing. Any member moves one,
 * staff too, as any member resizes one.
 */
export function moveSignature(s: TerminalState, name: string, offset: SignatureOffset, ctx: Ctx): Change<CompanyDetails> {
  const who = line(name);
  const current = companyOf(s);
  const key = signatureKey(who);

  if (!who || !current.signatures?.[key]) throw new KeystoneError(`No signature is kept for ${who || 'that name'}.`);

  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) throw new KeystoneError('That is not a place.');
  const next = clampOffset(offset);
  const was = signatureOffsetOf(current, who);

  if (next.x === was.x && next.y === was.y) return { state: s, record: current, message: `${who}'s signature is already there.` };
  const offsets = { ...current.signatureOffsets };

  if (!next.x && !next.y) delete offsets[key];
  else offsets[key] = next;

  const details: CompanyDetails = { ...current, signatureOffsets: offsets };

  if (!Object.keys(offsets).length) delete details.signatureOffsets;
  const message = next.x || next.y ? `Signature for ${who} moved.` : `Signature for ${who} back on its line.`;

  return { state: logged({ ...s, company: details }, TAG, message, ctx), record: details, message };
}

/** Published as SERVICES.signatureSizes, for a paper that lets whoever uses Keystone resize and move a signature where it shows it. */
export const signatureSizes: SignatureSizes = { canResize: () => true, resize: resizeSignature, move: moveSignature };

/** The line under the title. */
export const COMPANY_LINE = 'What each new voucher, statement and ID starts from. The company\'s name, address and contacts are built in.';
