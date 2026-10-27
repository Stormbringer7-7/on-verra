// Recherche par familles sur la vraie base, en lecture seule (DATABASE_URL_LECTURE ; sautés sinon) :
// numéros officiels exacts et ambigus, comptes, résultats qui disent où ils mènent.

import { afterAll, describe, expect, it } from 'vitest';

import { DISPONIBLES, analyserNumero } from '@contrat/domain/familles';

import { ouvrirPostgres } from '../../src/infra/PgDatabase';
import { PgFamilles } from '../../src/infra/pg/familles';
import { DATABASE_URL_LECTURE } from '../support';

describe.skipIf(!DATABASE_URL_LECTURE)('PgFamilles (DATABASE_URL_LECTURE)', () => {
  const { db, fermer } = ouvrirPostgres(DATABASE_URL_LECTURE ?? '', { max: 3, delaiRequete: 60_000 });
  afterAll(fermer);
  const f = new PgFamilles(db);

  it('scrutin 1874 : un seul candidat, qui mène à sa fiche et filtre l’Explorer', async () => {
    const c = await f.candidats(analyserNumero('scrutin 1874')!, 20);
    expect(c.length).toBe(1);
    expect(c[0]).toMatchObject({ declinaison: 'votes', famille: 'action', fiche: { type: 'scrutin' } });
    expect(c[0].filtres).toEqual({ scrutin: c[0].id });
  });

  it('655 : numéro ambigu, plusieurs amendements distingués par leur contexte', async () => {
    const c = await f.candidats(analyserNumero('655')!, 20);
    expect(c.length).toBeGreaterThan(1);
    expect(new Set(c.map((x) => x.contexte)).size).toBeGreaterThan(1);
  });

  it('« Silence pour la France » + Jean-Philippe Tanguy : expression exacte et liens publiés seulement', async () => {
    const personne = (await db.first<{ id: string }>(
      `SELECT entite_id::text AS id FROM canon.personne WHERE nom = 'Tanguy' AND prenom = 'Jean-Philippe'`,
    ))?.id;
    expect(personne).toBeDefined();
    expect((await f.personne(personne!))?.nom).toBe('Jean-Philippe Tanguy');
    const filtres = { textes: ['Silence pour la France'], personne: personne! };
    const comptes = await f.compter(null, ['interventions', 'questions', 'amendements', 'commissions'], filtres);
    // Pas de lien publié entre une personne et une commission : rien, jamais par le texte.
    expect(comptes.commissions).toEqual({ nombre: 0, plafonne: false });
    const questions = await f.chercher(null, 'questions', { page: 1, taille: 20 }, filtres);
    expect(questions.total).toBe(comptes.questions!.nombre);
    for (const q of questions.elements) expect(q.filtres).toEqual({ personne });
    // Sans la personne, l'expression seule trouve plus d'interventions qu'avec elle.
    const seule = await f.compter(null, ['interventions'], { textes: filtres.textes, personne: null });
    expect(seule.interventions!.nombre).toBeGreaterThanOrEqual(comptes.interventions!.nombre);
  });

  it('parcourir : chaque déclinaison cherchable se compte et rend des résultats titrés', async () => {
    const comptes = await f.compter(null, DISPONIBLES);
    for (const d of DISPONIBLES) {
      expect(comptes[d], d).toBeDefined();
      if (comptes[d]!.nombre === 0) continue;
      const p = await f.chercher(null, d, { page: 1, taille: 2 });
      expect(p.elements.length, d).toBeGreaterThan(0);
      for (const r of p.elements) {
        expect(r.titre, d).not.toBe('');
        if (r.groupe) expect(r.groupe.couleur, d).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('« énergie » : des dossiers, avec un total exact', async () => {
    const p = await f.chercher('énergie', 'dossiers', { page: 1, taille: 3 });
    expect(p.elements.length).toBe(3);
    expect(p.total).toBeGreaterThan(3);
  });
});
