// Positions des textes non aboutis sur la vraie base, en lecture seule (DATABASE_URL_LECTURE ;
// sautés sinon) : règles de DossiersRepository.positions, vérifiées contre la projection.

import { afterAll, describe, expect, it } from 'vitest';

import { ouvrirPostgres } from '../../src/infra/PgDatabase';
import { PgDossiers } from '../../src/infra/pg/dossiers';
import { DATABASE_URL_LECTURE } from '../support';

describe.skipIf(!DATABASE_URL_LECTURE)('PgDossiers.positions (DATABASE_URL_LECTURE)', () => {
  const { db, fermer } = ouvrirPostgres(DATABASE_URL_LECTURE ?? '', { max: 2, delaiRequete: 60_000 });
  afterAll(fermer);
  const depot = new PgDossiers(db);

  it('un texte par dossier, jamais un texte publié au JO ou retiré, attente positive', async () => {
    const r = await depot.positions('17');
    if (!r) return; // projection pas encore chargée
    const ids = r.positions.map((p) => p.dossier);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of r.positions) {
      if (p.jours !== null) expect(p.jours, p.dossier).toBeGreaterThanOrEqual(0);
      if (p.horsParlement === 'decision_cc') expect([p.etape.cle, p.situation]).toEqual(['cc', 'en_examen']);
      if (p.horsParlement === 'promulgation') expect(p.situation, p.dossier).toBe('en_attente');
    }
    const abouti = await db.all<{ id: string }>(
      `SELECT DISTINCT p.dossier_id AS id FROM lecture.parcours_dossier p
       LEFT JOIN lecture.parcours_dossier_synthese s ON s.dossier_id = p.dossier_id
       WHERE (p.cle IN ('jo', 'promulgation_jo') AND p.etat = 'faite') OR s.retire_le IS NOT NULL`,
    );
    const finis = new Set(abouti.map((a) => a.id));
    expect(ids.filter((id) => finis.has(id))).toEqual([]);
  });

  it('textes en attente rendus dans l’ordre des positions, avec leur titre', async () => {
    const r = await depot.positions('17');
    if (!r || r.positions.length === 0) return;
    const quelques = r.positions.slice(0, 5);
    const textes = await depot.textesEnAttente(quelques);
    expect(textes.map((t) => t.dossier.id)).toEqual(quelques.map((p) => p.dossier));
    for (const t of textes) expect(t.dossier.titre).not.toBe('');
  });
});
