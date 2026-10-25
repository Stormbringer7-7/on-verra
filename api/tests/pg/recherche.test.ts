// PgRecherche sur la vraie base, en lecture seule (DATABASE_URL_LECTURE ; sautés sans elle) : le
// dossier prototype DLR5L17N54085, le scrutin VTANR5L17V7259, Franck Allisio (PA793432), un
// amendement par son numéro, un groupe et des représentants d'intérêts par l'objet de leurs actions.

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PgDatabase } from '../../src/infra/PgDatabase';
import { PgRecherche, prefixes, tsquery } from '../../src/infra/pg/recherche';

const URL_LECTURE = process.env.DATABASE_URL_LECTURE;

describe('requêtes plein texte', () => {
  it('chaque mot en préfixe, tous requis, sans ponctuation', () => {
    expect(tsquery('souveraineté agri')).toBe('souveraineté:* & agri:*');
    expect(tsquery("l'amendement n° 357")).toBe('l:* & amendement:* & n:* & 357:*');
    expect(tsquery(' «» ')).toBeNull();
  });

  it('préfiltre : quatre premières lettres, accents indifférents', () => {
    expect(prefixes('souverainete:* & agricole:*')).toEqual(['s[oóòôöõ][uúùûü]v', '[aàâäáãå]gr[iíìîï]']);
  });
});

describe.skipIf(!URL_LECTURE)('PgRecherche (base réelle, lecture seule)', () => {
  const pool = new pg.Pool({
    connectionString: URL_LECTURE,
    max: 6,
    options: '-c default_transaction_read_only=on -c statement_timeout=30000',
  });
  const db = new PgDatabase(pool);
  const depot = new PgRecherche(db);
  afterAll(() => pool.end());

  const entite = async (systeme: string, type: string, id: string) => {
    const r = await db.first<{ id: string }>(
      `SELECT entite_id AS id FROM canon.correspondance
       WHERE systeme = $systeme AND type_source = $type AND id_source = $id AND statut = 'VERIFIED'`,
      { $systeme: systeme, $type: type, $id: id },
    );
    if (!r) throw new Error(`${systeme}:${type}:${id} absent de la base`);
    return r.id;
  };

  let dossier: string;
  let s7259: string;
  let allisio: string;
  let am357: string;

  beforeAll(async () => {
    [dossier, s7259, allisio, am357] = await Promise.all([
      entite('AN', 'dossier', 'DLR5L17N54085'),
      entite('AN', 'scrutin', 'VTANR5L17V7259'),
      entite('AN', 'acteur', 'PA793432'),
      entite('AN', 'amendement', 'AMANR5L17PO838901BTC2765P0D1N000357'),
    ]);
  });

  it('dossiers : par le titre, avec ou sans accents', async () => {
    for (const q of ['souveraineté agricoles urgence', 'souverainete agricoles urgence', 'SOUVERAINETÉ AGRICOLE']) {
      const r = await depot.rechercher({ q, type: 'dossiers' }, { page: 1, taille: 20 });
      expect(r.type).toBe('dossiers');
      const trouve = r.sections[0].resultats.elements.find((e) => e.id === dossier);
      expect(trouve, q).toMatchObject({
        type: 'dossiers',
        titre: 'Projet de loi d’urgence pour la protection et la souveraineté agricoles',
        groupe: null,
      });
      expect(r.sections[0].resultats.total).toBeGreaterThanOrEqual(1);
    }
  });

  it('personnes : par le nom, groupe actuel, identité canon', async () => {
    const r = await depot.rechercher({ q: 'allisio', type: 'personnes' }, { page: 1, taille: 5 });
    const p = r.sections[0].resultats.elements.find((e) => e.id === allisio)!;
    expect(p).toMatchObject({ titre: 'Franck Allisio', identite: 'personne' });
    expect(p.contexte).toMatch(/^Député · Bouches-du-Rhône/);
  });

  it('scrutins : par le numéro et par l’intitulé', async () => {
    const r = await depot.rechercher({ q: '7259', type: 'scrutins' }, { page: 1, taille: 5 });
    expect(r.sections[0].resultats.elements[0]).toEqual({
      type: 'scrutins',
      id: s7259,
      titre: 'Scrutin n° 7259',
      contexte: 'AN · 02/06/2026 · Adopté 369 – 178',
      groupe: null,
    });
  });

  it('amendements : par le numéro publié', async () => {
    const r = await depot.rechercher({ q: '357', type: 'amendements' }, { page: 1, taille: 100 });
    const a = r.sections[0].resultats.elements.find((e) => e.id === am357);
    expect(a).toMatchObject({ titre: 'Amendement 357' });
    expect(a!.contexte).toMatch(/^357 · AVANT ART\. PREMIER · Adopté · /);
  });

  it('organisations : groupes politiques et représentants (nom ou objet des actions déclarées)', async () => {
    const r = await depot.rechercher({ q: 'rassemblement national', type: 'organisations' }, { page: 1, taille: 10 });
    expect(r.sections[0].resultats.elements[0]).toMatchObject({
      titre: 'Rassemblement National',
      contexte: 'Groupe politique · AN',
      groupe: { abrege: 'RN', chambre: 'AN' },
    });
    const ri = await depot.rechercher({ q: 'coopération agricole', type: 'organisations' }, { page: 1, taille: 50 });
    expect(ri.sections[0].resultats.elements.some((e) => e.contexte.startsWith('Représentant d\'intérêts'))).toBe(true);
  });

  it('sans type : une section par type trouvé, sans compte exact ; pagination', async () => {
    const r = await depot.rechercher({ q: 'souveraineté agricole' }, { page: 1, taille: 3 });
    expect(r.type).toBeNull();
    const types = r.sections.map((s) => s.type);
    expect(types).toEqual(expect.arrayContaining(['dossiers', 'scrutins']));
    for (const s of r.sections) {
      expect(s.resultats.total).toBeNull();
      expect(s.resultats.elements.length).toBeGreaterThan(0);
      expect(s.resultats.elements.length).toBeLessThanOrEqual(3);
    }
    const p1 = await depot.rechercher({ q: 'souveraineté', type: 'dossiers' }, { page: 1, taille: 2 });
    const p2 = await depot.rechercher({ q: 'souveraineté', type: 'dossiers' }, { page: 2, taille: 2 });
    expect(p1.sections[0].resultats.suivante).toBe(2);
    expect(p2.sections[0].resultats.page).toBe(2);
    expect(p2.sections[0].resultats.total).toBe(p1.sections[0].resultats.total);
    expect(p2.sections[0].resultats.elements.map((e) => e.id)).not.toContain(p1.sections[0].resultats.elements[0].id);
  });

  it('rien à chercher, ou rien trouvé : aucune section', async () => {
    expect(await depot.rechercher({ q: '  ' }, { page: 1, taille: 5 })).toEqual({ q: '  ', type: null, sections: [] });
    expect(await depot.rechercher({ q: 'zzzzqxw', type: 'dossiers' }, { page: 1, taille: 5 })).toEqual({
      q: 'zzzzqxw',
      type: 'dossiers',
      sections: [],
    });
  });
});
