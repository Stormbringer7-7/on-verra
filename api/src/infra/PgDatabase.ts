// Postgres derrière le port SqlDatabase. Chaque législature est un schéma (« l17 ») chargé par
// opendata (python -m src charger) : un pool par schéma, dont c'est le search_path.

import pg from 'pg';

import type { SqlDatabase, SqlParams, SqlValue } from '../ports';

// COUNT et SUM rendent des bigint, les divisions des numeric : des nombres côté app.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, Number);

/** Paramètres nommés ($uid) → positionnels ($1), comme les attend Postgres. */
export function positionnels(sql: string, params: SqlParams): { text: string; values: SqlValue[] } {
  const noms: string[] = [];
  const text = sql.replace(/\$([A-Za-z_]\w*)/g, (_, nom: string) => {
    const cle = `$${nom}`;
    if (!(cle in params)) throw new Error(`Paramètre SQL manquant : ${cle}`);
    let i = noms.indexOf(cle);
    if (i < 0) i = noms.push(cle) - 1;
    return `$${i + 1}`;
  });
  return { text, values: noms.map((n) => params[n]) };
}

export class PgDatabase implements SqlDatabase {
  constructor(private readonly pool: pg.Pool) {}

  async all<T>(sql: string, params: SqlParams = {}): Promise<T[]> {
    const { text, values } = positionnels(sql, params);
    return (await this.pool.query(text, values)).rows as T[];
  }

  async first<T>(sql: string, params: SqlParams = {}): Promise<T | null> {
    return (await this.all<T>(sql, params))[0] ?? null;
  }
}

/** Pools partagés : un pour le schéma public (index), un par législature. */
export class Connexions {
  private readonly pools = new Map<string, pg.Pool>();

  constructor(private readonly url: string) {}

  base(schema = 'public'): PgDatabase {
    if (!/^(public|l\d+)$/.test(schema)) throw new Error(`Schéma inattendu : ${schema}`);
    let pool = this.pools.get(schema);
    if (!pool) {
      pool = new pg.Pool({ connectionString: this.url, max: 5, options: `-c search_path=${schema},public` });
      this.pools.set(schema, pool);
    }
    return new PgDatabase(pool);
  }

  async fermer(): Promise<void> {
    await Promise.all([...this.pools.values()].map((p) => p.end()));
  }
}
