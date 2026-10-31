import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let loading: Promise<SqlJsStatic> | null = null;

/** SQLite in WebAssembly, loaded once, for reading other apps' databases. */
export const loadSql = () => (loading ??= initSqlJs({ locateFile: () => wasmUrl }));
