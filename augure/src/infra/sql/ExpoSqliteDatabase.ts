import type { SQLiteDatabase } from 'expo-sqlite';

import type { SqlDatabase, SqlParams } from '../../core/ports';

/** Une base expo-sqlite (fichier sur mobile, mémoire sur le web) derrière le port SqlDatabase. */
export class ExpoSqliteDatabase implements SqlDatabase {
  constructor(private readonly db: SQLiteDatabase) {}

  all<T>(sql: string, params: SqlParams = {}): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, params);
  }

  first<T>(sql: string, params: SqlParams = {}): Promise<T | null> {
    return this.db.getFirstAsync<T>(sql, params);
  }

  transaction(statements: string[]): Promise<void> {
    return this.db.withTransactionAsync(async () => {
      for (const s of statements) await this.db.execAsync(s);
    });
  }

  close(): Promise<void> {
    return this.db.closeAsync();
  }
}
