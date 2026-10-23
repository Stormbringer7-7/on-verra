// Web : expo-file-system n'existe pas, chaque législature consultée est gardée en mémoire
// (SQLite en WebAssembly) le temps de la visite.
//
// sql.js plutôt qu'expo-sqlite : le worker d'expo-sqlite initialise toujours le stockage OPFS,
// même pour une base en mémoire, et échoue (« Security error when calling GetDirectory »,
// puis « Invalid VFS state ») en navigation privée ou quand le site ne peut rien stocker.

import { gunzipSync } from 'fflate';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
// @ts-expect-error module wasm : Metro le sert comme un fichier et renvoie son adresse
import wasm from 'sql.js/dist/sql-wasm-browser.wasm';

import type { LocalDatabases, SqlDatabase, SqlParams } from '../../core/ports';

let sqlJs: Promise<SqlJsStatic> | null = null;

function charger(): Promise<SqlJsStatic> {
  sqlJs ??= initSqlJs({ locateFile: () => wasm as string });
  sqlJs.catch(() => (sqlJs = null));
  return sqlJs;
}

class SqlJsDatabase implements SqlDatabase {
  constructor(private readonly db: Database) {}

  async all<T>(sql: string, params: SqlParams = {}): Promise<T[]> {
    const stmt = this.db.prepare(sql, params);
    try {
      const lignes: T[] = [];
      while (stmt.step()) lignes.push(stmt.getAsObject() as T);
      return lignes;
    } finally {
      stmt.free();
    }
  }

  async first<T>(sql: string, params: SqlParams = {}): Promise<T | null> {
    const stmt = this.db.prepare(sql, params);
    try {
      return stmt.step() ? (stmt.getAsObject() as T) : null;
    } finally {
      stmt.free();
    }
  }

  async transaction(statements: string[]): Promise<void> {
    this.db.exec('BEGIN');
    try {
      for (const s of statements) this.db.exec(s);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

export class MemoireSqlite implements LocalDatabases {
  private readonly bases = new Map<string, SqlDatabase>();

  async installees(): Promise<string[]> {
    return [...this.bases.keys()];
  }

  async ouvrir(legislature: string): Promise<SqlDatabase | null> {
    return this.bases.get(legislature) ?? null;
  }

  async installer(legislature: string, gzip: Uint8Array): Promise<SqlDatabase> {
    const SQL = await charger();
    const db = new SqlJsDatabase(new SQL.Database(gunzipSync(gzip)));
    this.bases.set(legislature, db);
    return db;
  }
}
