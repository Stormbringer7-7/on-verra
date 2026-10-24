// Postgres derrière le port SqlDatabase : la base CivicTrace (schémas `canon` et `lecture`, plus
// `analytique.signalement` en écriture), chargée par opendata. Un seul pool ; requêtes courtes
// (statement_timeout), paramètres nommés.

import pg from 'pg';

import type { SqlDatabase, SqlParams, SqlValue } from '../ports';

// COUNT et SUM rendent des bigint, les divisions des numeric : des nombres côté app.
pg.types.setTypeParser(pg.types.builtins.INT8, Number);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, Number);
// Dates « AAAA-MM-JJ » telles quelles (G6), sans passer par un Date JavaScript et son fuseau.
pg.types.setTypeParser(pg.types.builtins.DATE, (v: string) => v);

/**
 * Paramètres nommés ($uid) → positionnels ($1), comme les attend Postgres. La clé du paramètre
 * s'écrit avec ou sans le « $ » (`{ $uid }` ou `{ uid }`) : les deux conventions coexistent dans
 * les adaptateurs.
 */
export function positionnels(sql: string, params: SqlParams): { text: string; values: SqlValue[] } {
  const noms: string[] = [];
  const text = sql.replace(/\$([A-Za-z_]\w*)/g, (_, nom: string) => {
    const cle = `$${nom}` in params ? `$${nom}` : nom;
    if (!(cle in params)) throw new Error(`Paramètre SQL manquant : $${nom}`);
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

export interface OptionsPostgres {
  /** Connexions simultanées. */
  max?: number;
  /** Au-delà, une requête est annulée par Postgres (ms). */
  delaiRequete?: number;
}

/** Ouvre le pool de la base ; `fermer` le libère (arrêt du serveur, fin des tests). */
export function ouvrirPostgres(url: string, { max = 5, delaiRequete = 15_000 }: OptionsPostgres = {}) {
  // Pas de plan parallèle : ses segments de mémoire partagée dépassent les 64 Mo de /dev/shm du
  // conteneur Postgres (annuaire, 97 000 fiches RNE), et l'API sert des requêtes courtes. Pas de
  // JIT non plus : sa compilation (≈ 300 ms) dépasse le gain sur des requêtes de quelques dizaines de ms.
  const pool = new pg.Pool({
    connectionString: url,
    max,
    options: `-c statement_timeout=${delaiRequete} -c max_parallel_workers_per_gather=0 -c jit=off`,
  });
  // Une connexion inactive coupée par le serveur ne doit pas arrêter l'API.
  pool.on('error', () => {});
  return { db: new PgDatabase(pool), fermer: () => pool.end() };
}
