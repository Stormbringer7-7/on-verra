/// <reference types="node" />
// node:sqlite (Node 22.5+) : mêmes requêtes que l'app, pour les tests et les scripts.
// Jamais importé par l'app (Metro ne connaît pas node:sqlite).

import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { gunzipSync } from 'fflate';

import type { LocalDatabases, SqlDatabase, SqlParams } from '../../core/ports';

export class NodeSqliteDatabase implements SqlDatabase {
  constructor(private readonly db: DatabaseSync) {}

  async all<T>(sql: string, params: SqlParams = {}): Promise<T[]> {
    return this.db.prepare(sql).all(params as Record<string, SQLInputValue>) as T[];
  }

  async first<T>(sql: string, params: SqlParams = {}): Promise<T | null> {
    return (this.db.prepare(sql).get(params as Record<string, SQLInputValue>) as T | undefined) ?? null;
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

/** Bases locales en mémoire pour les tests ; `copies` simule ce qui est déjà sur l'appareil. */
export class MemoireNodeSqlite implements LocalDatabases {
  readonly installations: string[] = [];

  constructor(private readonly copies = new Map<string, Uint8Array>()) {}

  async installees(): Promise<string[]> {
    return [...this.copies.keys()];
  }

  async ouvrir(legislature: string): Promise<SqlDatabase | null> {
    const octets = this.copies.get(legislature);
    if (!octets) return null;
    const db = new DatabaseSync(':memory:');
    db.deserialize(octets);
    return new NodeSqliteDatabase(db);
  }

  async installer(legislature: string, gzip: Uint8Array): Promise<SqlDatabase> {
    this.copies.set(legislature, gunzipSync(gzip));
    this.installations.push(legislature);
    return (await this.ouvrir(legislature))!;
  }
}
