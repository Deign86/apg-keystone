import { unzipSync } from 'fflate';
import type { SqlJsStatic } from 'sql.js';
import type { ExternalPerson, ExternalPhoto } from '@keystone/core';

// Reads the attendance tracker's portable backup (.apbackup): a ZIP holding manifest.json,
// database/attendance.db (a VACUUM INTO snapshot) and the app's data folder, including
// photos/<USER_ID>.webp. See alpha-premier-attendance src-tauri/src/database.rs
// (create_portable_backup). Nothing in the attendance app changes.

export interface BackupContents {
  people: ExternalPerson[];
  photos: ExternalPhoto[];
  /** When the backup says it was made, if it says. */
  skipped: number;
}

const PHOTO = /(?:^|\/)photos\/([^/]+)\.(webp|jpe?g|png)$/i;
const TYPES = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' } as const;

export function isAttendanceBackup(files: Record<string, Uint8Array>): boolean {
  try {
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    return manifest.format === 'alpha-premier-application-backup';
  } catch {
    return false;
  }
}

/** Active employee cards from the backup, with their photos. Admin-assist cards and inactive people are left out. */
export async function readAttendanceBackup(zip: Uint8Array, loadSql: () => Promise<SqlJsStatic>): Promise<BackupContents> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zip);
  } catch {
    throw new Error('That file is not an attendance backup (it is not a ZIP archive).');
  }
  if (!isAttendanceBackup(files)) throw new Error('That file is not an attendance backup (no Alpha Premier manifest).');
  const dbBytes = files['database/attendance.db'];
  if (!dbBytes) throw new Error('The attendance backup has no database in it.');

  const SQL = await loadSql();
  const db = new SQL.Database(dbBytes);
  try {
    const columns = new Set((db.exec('PRAGMA table_info(users)')[0]?.values ?? []).map((r) => String(r[1])));
    if (!columns.has('user_id') || !columns.has('full_name')) throw new Error('The attendance backup has no employee list.');
    const pick = (c: string) => (columns.has(c) ? c : `NULL AS ${c}`);
    const rows = db.exec(
      `SELECT user_id, full_name, ${pick('department')}, ${pick('status')}, ${pick('card_type')}, ${pick('designation')} FROM users ORDER BY full_name`,
    )[0]?.values ?? [];

    const people: ExternalPerson[] = [];
    let skipped = 0;
    for (const [userId, fullName, department, status, cardType, designation] of rows) {
      if ((status && status !== 'ACTIVE') || (cardType && cardType !== 'EMPLOYEE')) { skipped++; continue; }
      people.push({
        externalId: String(userId),
        name: String(fullName ?? '').trim(),
        ...(designation ? { position: String(designation) } : {}),
        ...(department ? { department: String(department) } : {}),
      });
    }

    const wanted = new Set(people.map((p) => p.externalId.toUpperCase()));
    const photos: ExternalPhoto[] = [];
    for (const [path, bytes] of Object.entries(files)) {
      const m = PHOTO.exec(path);
      if (!m || !bytes.length) continue;
      const id = people.find((p) => p.externalId.toUpperCase() === m[1].toUpperCase())?.externalId;
      if (!id || !wanted.has(id.toUpperCase())) continue;
      photos.push({ externalId: id, bytes, type: TYPES[m[2].toLowerCase() as keyof typeof TYPES] });
    }
    return { people, photos, skipped };
  } finally {
    db.close();
  }
}
