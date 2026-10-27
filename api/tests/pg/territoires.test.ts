// PgTerritoires sur la vraie base, en lecture seule (DATABASE_URL_LECTURE ; sautés sinon) : carte
// d'un scrutin de l'Assemblée, circonscription par circonscription.

import { afterAll, describe, expect, it } from 'vitest';

import { ouvrirPostgres } from '../../src/infra/PgDatabase';
import { PgTerritoires } from '../../src/infra/pg/territoires';
import { DATABASE_URL_LECTURE } from '../support';

describe.skipIf(!DATABASE_URL_LECTURE)('PgTerritoires.circonscriptionsScrutin (DATABASE_URL_LECTURE)', () => {
  const { db, fermer } = ouvrirPostgres(DATABASE_URL_LECTURE ?? '', { max: 2, delaiRequete: 20_000 });
  afterAll(fermer);
  const depot = new PgTerritoires(db);

  it('dernier scrutin AN : une ligne par circonscription, au plus un député, codes « département-numéro »', async () => {
    const s = await db.first<{ id: string }>(`SELECT entite_id::text AS id FROM canon.scrutin WHERE chambre = 'AN' ORDER BY date DESC LIMIT 1`);
    if (!s) return;
    const debut = Date.now();
    const c = await depot.circonscriptionsScrutin(s.id);
    expect(Date.now() - debut).toBeLessThan(5_000);
    if (!c || c.length === 0) return; // projection pas encore chargée
    const codes = c.map((x) => x.circonscription.code);
    expect(new Set(codes).size).toBe(codes.length);
    // 577 sièges moins les 11 des Français établis hors de France (sans département du COG).
    expect(c.length).toBeLessThanOrEqual(566);
    expect(c.length).toBeGreaterThan(500);
    for (const x of c) {
      expect(x.circonscription.code).toMatch(/^(\d{2}|2[AB]|9[78]\d)-\d{2}$/);
      expect(x.depute === null).toBe(x.position === null);
      if (x.depute?.groupe) expect(x.depute.groupe.couleur).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('scrutin du Sénat : pas de circonscription ; inconnu : null', async () => {
    const s = await db.first<{ id: string }>(`SELECT entite_id::text AS id FROM canon.scrutin WHERE chambre = 'SENAT' ORDER BY date DESC LIMIT 1`);
    if (s) expect(await depot.circonscriptionsScrutin(s.id)).toEqual([]);
    expect(await depot.circonscriptionsScrutin('00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
