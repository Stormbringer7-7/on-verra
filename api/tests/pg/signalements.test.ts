// PgSignalements sur la vraie base (DATABASE_URL_LECTURE ; sauté sans elle) : l'INSERT dans
// `analytique.signalement` est joué dans une transaction annulée (ROLLBACK), sur une seule connexion :
// rien n'est écrit dans la base.

import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import type { SqlDatabase, SqlParams } from '../../src/ports';
import { positionnels } from '../../src/infra/PgDatabase';
import { PgSignalements } from '../../src/infra/pg/signalements';

const URL_LECTURE = process.env.DATABASE_URL_LECTURE;

/** SqlDatabase sur une connexion unique, pour rester dans la transaction. */
const surClient = (client: pg.Client): SqlDatabase => {
  const all = async <T>(sql: string, params: SqlParams = {}) => {
    const { text, values } = positionnels(sql, params);
    return (await client.query(text, values)).rows as T[];
  };
  return { all, first: async <T>(sql: string, params?: SqlParams) => (await all<T>(sql, params))[0] ?? null };
};

describe.skipIf(!URL_LECTURE)('PgSignalements (transaction annulée)', () => {
  const client = new pg.Client({ connectionString: URL_LECTURE, options: '-c statement_timeout=15000' });
  const connecte = client.connect();
  afterAll(() => client.end());

  /** Joue `essai` dans une transaction toujours annulée ; vérifie ensuite que rien n'est resté. */
  async function annule<T>(essai: (db: SqlDatabase) => Promise<T>): Promise<T> {
    await connecte;
    await client.query('BEGIN READ WRITE');
    try {
      return await essai(surClient(client));
    } finally {
      await client.query('ROLLBACK');
    }
  }

  it('enregistre un signalement NOUVEAU et rend son accusé', async () => {
    const cible = '2e6c05af-2482-4972-b9ae-01d20fac2861';
    const { accuse, ligne } = await annule(async (db) => {
      const accuse = await new PgSignalements(db).enregistrer({
        cible: { type: 'dossier', id: cible },
        message: '  Source manquante pour la CMP.  ',
        contact: 'lecteur@example.org',
        ecran: 'Dossier',
      });
      const ligne = await db.first<Record<string, unknown>>(
        `SELECT cible_type, cible_id, message, contact, statut FROM analytique.signalement WHERE signalement_id = $id::uuid`,
        { $id: accuse.id },
      );
      return { accuse, ligne };
    });
    expect(accuse.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(accuse.recuLe).toISOString()).toBe(accuse.recuLe);
    expect(ligne).toEqual({
      cible_type: 'dossier',
      cible_id: cible,
      message: 'Source manquante pour la CMP.\n— écran : Dossier',
      contact: 'lecteur@example.org',
      statut: 'NOUVEAU',
    });
    // Annulé : la ligne n'existe pas hors de la transaction.
    const apres = await client.query('SELECT count(*)::int AS n FROM analytique.signalement WHERE signalement_id = $1', [accuse.id]);
    expect(apres.rows[0].n).toBe(0);
  });

  it('identifiant qui n’est pas un UUID : gardé dans le message, cible_id vide ; sans contact', async () => {
    const ligne = await annule(async (db) => {
      const { id } = await new PgSignalements(db).enregistrer({ cible: { type: 'autre', id: 'VTANR5L17V7259' }, message: 'Vote mal rattaché' });
      return db.first<Record<string, unknown>>(
        'SELECT cible_type, cible_id, message, contact FROM analytique.signalement WHERE signalement_id = $id::uuid',
        { $id: id },
      );
    });
    expect(ligne).toEqual({ cible_type: 'autre', cible_id: null, message: 'Vote mal rattaché\n— identifiant : VTANR5L17V7259', contact: null });
  });
});
