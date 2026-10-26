// PgFaits (Explorer) sur la vraie base, en lecture seule (DATABASE_URL_LECTURE ; sautés sinon) :
// filtres cumulés par liens publiés, compteurs cohérents avec les groupes et les suggestions.
// Les tests qui construisent des faits attendent la projection `lecture.couleur_groupe`.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ouvrirPostgres } from '../../src/infra/PgDatabase';
import { PgFaits, selection } from '../../src/infra/pg/faits';
import { DATABASE_URL_LECTURE } from '../support';

const INCONNU = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!DATABASE_URL_LECTURE)('PgFaits (DATABASE_URL_LECTURE)', () => {
  const { db, fermer } = ouvrirPostgres(DATABASE_URL_LECTURE ?? '', { max: 3, delaiRequete: 60_000 });
  afterAll(fermer);
  const faits = new PgFaits(db);
  let dossier = '';
  let couleurs = false;

  beforeAll(async () => {
    // Un dossier de taille moyenne, avec des interventions et des amendements.
    const r = await db.first<{ id: string }>(
      `SELECT dossier_id::text AS id FROM canon.amendement WHERE dossier_id IS NOT NULL
       GROUP BY dossier_id HAVING count(*) BETWEEN 50 AND 200 ORDER BY count(*) DESC LIMIT 1`,
    );
    dossier = r!.id;
    couleurs = (await db.first<{ ok: boolean }>(`SELECT to_regclass('lecture.couleur_groupe') IS NOT NULL AS ok`))!.ok;
  });

  it('un filtre de plus ne fait jamais grandir un compteur', async () => {
    const large = await faits.compter({ dossier });
    const etroit = await faits.compter({ dossier, chambre: 'AN' });
    for (const t of Object.keys(large) as (keyof typeof large)[]) expect(etroit[t], t).toBeLessThanOrEqual(large[t]);
    expect(large.amendements).toBeGreaterThan(0);
  });

  it('identifiant inconnu : aucun nom (404 au cœur), aucun fait', async () => {
    expect(await faits.nommer({ dossier: INCONNU })).toBeNull();
    expect(await faits.nommer({ dossier: 'pas-un-uuid' })).toBeNull();
    const c = await faits.compter({ dossier: INCONNU });
    expect(Object.values(c).every((n) => n === 0)).toBe(true);
  });

  it('les suggestions d’étape se comptent sous le dossier, et le filtre étape les retrouve', async () => {
    const s = await faits.suggerer({ dossier }, 'etape', 8);
    expect(s.length).toBeGreaterThan(0);
    const premiere = s[0];
    const c = await faits.compter({ dossier, etape: premiere.id as never });
    expect(c.interventions + c.amendements + c.votes).toBe(premiere.nombre);
  });

  it('groupes : le total de chaque groupe redonne le compteur, l’aperçu est borné', async () => {
    if (!couleurs) return; // lecture.couleur_groupe pas encore projetée
    const c = await faits.compter({ dossier });
    const page = await faits.groupes({ filtres: { dossier }, onglet: 'amendements', regroupement: 'sort', page: { page: 1, taille: 20 } });
    expect(page.elements.reduce((n, g) => n + g.total, 0)).toBe(c.amendements);
    for (const g of page.elements) expect(g.faits.length).toBeLessThanOrEqual(3);
  });

  it('projections étroites (lecture.fait_intervention, fait_amendement) : mêmes faits et mêmes dimensions que canon', async () => {
    const projetees = (await db.first<{ i: boolean; a: boolean }>(
      `SELECT to_regclass('lecture.fait_intervention') IS NOT NULL AS i, to_regclass('lecture.fait_amendement') IS NOT NULL AS a`,
    ))!;
    if (!projetees.i || !projetees.a) return; // projections pas encore construites (opendata, projections/60 et 61)
    const groupe = (await db.first<{ id: string }>(
      `SELECT groupe_id::text AS id FROM lecture.appartenance_groupe WHERE chambre = 'AN' AND fin >= CURRENT_DATE GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`,
    ))!.id;
    const toutes = new Set(['dossier', 'etape', 'article', 'groupe', 'personne', 'chambre', 'organe'] as const);
    // Empreinte d'une sélection : chaque fait avec toutes ses dimensions, dans un ordre fixe.
    const empreinte = async (source: 'interventions' | 'amendements', f: Parameters<typeof selection>[1], avec: boolean) => {
      const sql = selection(source, f, toutes, false, { interventions: avec, amendements: avec })!;
      const params = Object.fromEntries(Object.entries(f).map(([k, v]) => [`$${k}`, v as string]));
      return db.first<{ n: number; md5: string }>(
        `SELECT count(*)::int AS n, md5(string_agg(concat_ws('|', id, date, d_dossier, d_etape, d_article, d_groupe, d_personne, d_chambre, d_organe, d_sort), ',' ORDER BY id)) AS md5
         FROM (${sql}) x`,
        params,
      );
    };
    for (const f of [{ dossier }, { dossier, groupe }, { groupe, chambre: 'AN' }] as Parameters<typeof selection>[1][]) {
      for (const source of ['interventions', 'amendements'] as const) {
        expect(await empreinte(source, f, true), `${source} ${JSON.stringify(f)}`).toEqual(await empreinte(source, f, false));
      }
    }
  });
});
