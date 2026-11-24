// @keystone/core is the kernel: what every part of Keystone may rely on, and nothing else.
export * from './kernel/money';

export * from './kernel/dates';

export * from './kernel/format';

export * from './kernel/schema';

export * from './kernel/state';

// Restoring a backup: every record checked before anything is replaced.
export * from './kernel/backup';

// The saved state as one document per record, for the cloud database (docs/adr/0009).
export * from './kernel/documents';

// What firestore.rules allows, declared once and checked against the rules by `npm run check`.
export * from './kernel/cloud-layout';

// Saved drafts: a form's work kept with the records to be finished later (docs/adr/0041).
export * from './kernel/drafts';

// Live updates: what others save, told as it arrives (docs/adr/0049).
export * from './kernel/live';

export * from './kernel/lines';

export * from './kernel/insight';

export * from './kernel/connectors';

export * from './kernel/services';

// Members of the records in the cloud, what the CEO may give them, and the one test of "is this the CEO".
export * from './kernel/accounts';

// The directory is the shared kernel every area refers to by code (docs/adr/0003).
export * from './kernel/directory';

// Rules for each area live in that area's module package (packages/modules/*), not here.
//
// No records, company details or reference data are built in: everything Keystone shows comes from what was saved, in
// the cloud for a signed-in build (docs/adr/0018). The tests' sample records are @keystone/core/sample.
