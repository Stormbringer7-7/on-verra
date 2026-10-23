// Web : expo-file-system n'existe pas, chaque législature consultée est gardée en mémoire
// (SQLite en WebAssembly) le temps de la visite.

import { deserializeDatabaseAsync } from 'expo-sqlite';
import { gunzipSync } from 'fflate';

import type { LocalDatabases, SqlDatabase } from '../../core/ports';
import { ExpoSqliteDatabase } from '../sql/ExpoSqliteDatabase';

export class MemoireSqlite implements LocalDatabases {
  private readonly bases = new Map<string, SqlDatabase>();

  async installees(): Promise<string[]> {
    return [...this.bases.keys()];
  }

  async ouvrir(legislature: string): Promise<SqlDatabase | null> {
    return this.bases.get(legislature) ?? null;
  }

  async installer(legislature: string, gzip: Uint8Array): Promise<SqlDatabase> {
    const db = new ExpoSqliteDatabase(await deserializeDatabaseAsync(gunzipSync(gzip)));
    this.bases.set(legislature, db);
    return db;
  }
}
