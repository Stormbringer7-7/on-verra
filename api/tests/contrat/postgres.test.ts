// Contrat sur les adaptateurs Postgres (depotsPostgres), joués sur la vraie base en lecture
// seule : DATABASE_URL_LECTURE=postgres://…/civictrace. Sautés sans elle. Les entités retirées ou
// fusionnées viennent de canon.entite (requête courte, lecture seule).

import { afterAll, describe } from 'vitest';

import { ouvrirPostgres } from '../../src/infra/PgDatabase';
import { depotsPostgres } from '../../src/infra/pg';
import { HorlogeSysteme } from '../../src/infra/composition';
import { DATABASE_URL_LECTURE } from '../support';
import { type Retiree, suiteContrat } from './suite';

const TYPES: Record<string, Retiree['type']> = {
  dossier: 'dossier',
  personne: 'personne',
  amendement: 'amendement',
  scrutin: 'scrutin',
  representant_interets: 'representant',
};

describe.skipIf(!DATABASE_URL_LECTURE)('Postgres (DATABASE_URL_LECTURE)', () => {
  const { db, fermer } = ouvrirPostgres(DATABASE_URL_LECTURE ?? '', { max: 3, delaiRequete: 20_000 });
  afterAll(fermer);

  suiteContrat('postgres', () => depotsPostgres(db), {
    horloge: new HorlogeSysteme(),
    max: 80,
    retirees: async () =>
      (
        await db.all<{ id: string; type: string }>(
          `SELECT DISTINCT ON (type) entite_id::text AS id, type FROM canon.entite
           WHERE (retiree_de_la_source_le IS NOT NULL OR fusionnee_dans IS NOT NULL)
             AND type IN ('dossier', 'personne', 'amendement', 'scrutin', 'representant_interets')
           ORDER BY type, entite_id`,
        )
      ).map((r) => ({ id: r.id, type: TYPES[r.type] })),
  });
});
