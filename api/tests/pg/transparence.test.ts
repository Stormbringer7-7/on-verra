// PgTransparence sur la vraie base, en lecture seule (DATABASE_URL_LECTURE ; sautés sinon) :
// déclarations HATVP de Franck Allisio (DIA du 05/08/2024, opendata/docs/sources/hatvp.md),
// représentant d'intérêts AI2P (SIREN 413728676), rapprochements lobbying (aucun produit au
// 24/10/2026 : `analytique.affirmation` vide).

import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { PgTransparence, elementsDeclares } from '../../src/infra/pg/transparence';
import type { SqlDatabase, SqlParams } from '../../src/ports';

const URL_LECTURE = process.env.DATABASE_URL_LECTURE;

/** SqlDatabase minimal, session en lecture seule : aucune écriture possible depuis ces tests. */
function base(url: string): { db: SqlDatabase; fermer: () => Promise<void> } {
  const pool = new pg.Pool({ connectionString: url, max: 4, options: '-c default_transaction_read_only=on -c statement_timeout=120000' });
  const all = async <T>(sql: string, params: SqlParams = {}): Promise<T[]> => {
    const noms: string[] = [];
    const text = sql.replace(/\$([A-Za-z_]\w*)/g, (_, nom: string) => {
      let i = noms.indexOf(nom);
      if (i < 0) i = noms.push(nom) - 1;
      return `$${i + 1}`;
    });
    return (await pool.query(text, noms.map((n) => params[n]))).rows as T[];
  };
  return { db: { all, first: async <T>(sql: string, params?: SqlParams) => (await all<T>(sql, params))[0] ?? null }, fermer: () => pool.end() };
}

describe('elementsDeclares (contenu publié imbriqué)', () => {
  it('aplatit les éléments des listes `items`, champs tels que publiés', () => {
    const contenu = {
      items: [{ items: [{ motif: { id: 'CREATION' }, descriptionMandat: 'CONSEILLER REGIONAL', remuneration: { brutNet: 'Net' } }, { description: null }] }],
    };
    expect(elementsDeclares(contenu)).toEqual([
      { 'motif.id': 'CREATION', descriptionMandat: 'CONSEILLER REGIONAL', 'remuneration.brutNet': 'Net' },
      { description: null },
    ]);
    expect(elementsDeclares({})).toEqual([]);
  });
});

describe.skipIf(!URL_LECTURE)('PgTransparence (base réelle, lecture seule)', () => {
  const { db, fermer } = base(URL_LECTURE ?? '');
  afterAll(fermer);
  const depot = new PgTransparence(db);
  const entite = async (systeme: string, type: string, id: string) =>
    (
      await db.first<{ id: string }>(
        `SELECT entite_id::text AS id FROM canon.correspondance WHERE systeme = $s AND type_source = $t AND id_source = $i AND statut = 'VERIFIED'`,
        { s: systeme, t: type, i: id },
      )
    )?.id ?? null;

  it('déclarations de Franck Allisio : DIA du 05/08/2024, PDF, rubriques, source HATVP', async () => {
    const personne = (await entite('AN', 'acteur', 'PA793432'))!;
    const declarations = await depot.declarations(personne);
    const dia = declarations.find((d) => d.provenance.idNatif === 'afedd0ca-2cd6-4789-85df-8b1bedd6d008')!;
    expect(dia).toMatchObject({
      type: 'DIA',
      libelle: 'Déclaration d\'intérêts et d\'activités',
      modificative: false,
      dateDepot: '2024-08-05',
      datePublication: '2025-06-17',
      qualite: 'Député des Bouches-du-Rhône',
      mandat: 'depute',
      url: 'https://www.hatvp.fr/livraison/dossiers/allisio-franck-dia30882-depute-13.pdf',
      provenance: { systeme: 'HATVP', type: 'declaration', url: 'https://www.hatvp.fr/pages_nominatives/allisio-franck-24180' },
    });
    const rubriques = Object.fromEntries(dia.rubriques.map((r) => [r.rubrique, r]));
    expect(rubriques.participationFinanciereDto).toMatchObject({ neant: true, elements: [], libelle: 'Participations financières dans des sociétés' });
    expect(rubriques.mandatElectifDto.neant).toBe(false);
    expect(rubriques.mandatElectifDto.elements.map((e) => e.descriptionMandat)).toContain('CONSEILLER REGIONAL');
    // Aucune donnée privée : ni adresse, ni date de naissance, ni pièce jointe encodée.
    const cles = dia.rubriques.flatMap((r) => r.elements.flatMap((e) => Object.keys(e)));
    expect(cles.some((c) => /adresse|naissance|b64|telephone|email/i.test(c))).toBe(false);
    const dates = declarations.map((d) => d.dateDepot ?? '');
    expect(dates).toEqual([...dates].sort().reverse());
    const resumees = await depot.declarationsResumees(personne);
    expect(resumees.map((d) => d.id)).toEqual(declarations.map((d) => d.id));
    expect(Object.keys(resumees[0]).sort()).toEqual(['dateDepot', 'datePublication', 'id', 'libelle', 'modificative', 'type', 'url']);
  });

  it('représentant AI2P : identifiant SIREN, dernier exercice clos, actions paginées', async () => {
    const id = (await entite('HATVP', 'representant', 'SIREN:413728676'))!;
    const r = (await depot.representant(id, { page: 1, taille: 5 }))!;
    expect(r).toMatchObject({
      denomination: 'AI2P',
      categorie: 'Cabinet de conseil',
      identifiant: { valeur: '413728676', type: 'SIREN' },
      inscritDepuis: '2017-11-30',
      provenance: { systeme: 'HATVP', type: 'representant', idNatif: 'SIREN:413728676' },
    });
    expect(r.secteurs).toContain('Energie');
    expect(r.exercice!.personnesDeclarees).toBeNull();
    expect(r.exercice!.periode.fin! < new Date().toISOString().slice(0, 10)).toBe(true);
    expect(r.actions.elements).toHaveLength(5);
    expect(r.actions.total).toBeGreaterThan(100);
    expect(r.actions.suivante).toBe(2);
    const debuts = r.actions.elements.map((a) => a.periode.debut);
    expect(debuts).toEqual([...debuts].sort().reverse());
    // Responsables visés : des catégories, jamais des personnes.
    expect(r.actions.elements.every((a) => a.responsables.length > 0)).toBe(true);
    const suivante = (await depot.representant(id, { page: 2, taille: 5 }))!;
    expect(suivante.actions.elements.map((a) => a.id)).not.toContain(r.actions.elements[0].id);
  });

  it('rapprochements : toujours « à vérifier » sauf citation explicite (aucun produit aujourd’hui)', async () => {
    const dossier = (await entite('AN', 'dossier', 'DLR5L17N54085'))!;
    const scrutin = (await entite('AN', 'scrutin', 'VTANR5L17V7259'))!;
    const personne = (await entite('AN', 'acteur', 'PA793432'))!;
    const representant = (await entite('HATVP', 'representant', 'SIREN:413728676'))!;
    const produits = (await db.first<{ n: number }>(`SELECT count(*)::int AS n FROM analytique.affirmation WHERE predicat = 'concerne'`))!.n;
    for (const cible of [
      { type: 'dossier' as const, id: dossier },
      { type: 'representant' as const, id: representant },
      { type: 'vote' as const, scrutin, personne },
    ]) {
      const liens = await depot.interetsDe(cible);
      if (!produits) expect(liens).toEqual([]);
      for (const l of liens) {
        if (l.vers.statut === 'verifie') expect(l.vers.rapprochement).toMatchObject({ methode: 'reference_explicite', motif: 'l’action cite le texte' });
        else expect(l.vers.rapprochement.avertissement).toMatch(/ni une rencontre, ni une influence/);
      }
    }
  });

  it('identifiant inconnu ou mal formé : null ou vide (G5)', async () => {
    const inconnu = '00000000-0000-0000-0000-000000000000';
    expect(await depot.declarations(inconnu)).toEqual([]);
    expect(await depot.declarationsResumees('allisio')).toEqual([]);
    expect(await depot.representant(inconnu, { page: 1, taille: 5 })).toBeNull();
    expect(await depot.representant('SIREN:413728676', { page: 1, taille: 5 })).toBeNull();
    expect(await depot.interetsDe({ type: 'article', id: 'x' })).toEqual([]);
    expect(await depot.interetsDe({ type: 'vote', scrutin: inconnu, personne: inconnu })).toEqual([]);
  });
});
