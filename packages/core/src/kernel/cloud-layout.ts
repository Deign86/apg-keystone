import layout from './cloud-layout.json';

/**
 * What firestore.rules allows under keystone/{company}, written once (cloud-layout.json). The rules cannot import it,
 * so `npm run check` (scripts/check-cloud-layout.mjs) reads firestore.rules and fails when one differs from the other:
 *
 * - `lists`: the collections every member reads and writes, one { pos, body } document per record (`recordFields`),
 *   its body shorter than `maxBody` characters. A module's whole `ext` data is one such document.
 * - `company`: the collection of the company's details: `id`, the document only an owner writes, and `layout`, the
 *   sizes and places of its signatures, which any member writes from a paper (docs/adr/0045).
 * - `own`: a collection the rules name for one module's records (ModuleDef.documents), or for the kernel's saved drafts
 *   (DRAFT_DOCUMENTS, docs/adr/0041), with the fields they check beside the body and the statuses they accept, if any.
 * - `reserved`: collections the rules keep for something that is not a list of records; no module may take one.
 * - `maxName`: the longest name of a member or a device.
 */
export const CLOUD_LAYOUT = layout;
