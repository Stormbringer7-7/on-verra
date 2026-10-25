// PgDiscussions sur la vraie base, en lecture seule (DATABASE_URL_LECTURE ; sautés sans elle). Valeurs
// des exemples réels de la doc (opendata/docs/sources/an.md et senat.md) : intervention en séance AN
// CRSANR5L17S2026O1N237#4091148 (amendement 357), en commission AN CRCANR5L17S2026PO419865N040#14
// (nom publié seul), au Sénat d20260629#int_333 (amendement 448). Écrits pour tenir avant et après la
// fin du chargement en cours (relecture des débats du Sénat, projections parcours_* créées à la fin).

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Intervention } from '@contrat/domain/model';
import { PgDatabase } from '../../src/infra/PgDatabase';
import { PgDiscussions, couper } from '../../src/infra/pg/discussions';

const URL_LECTURE = process.env.DATABASE_URL_LECTURE;
const INCONNU = '00000000-0000-4000-8000-000000000000';

describe('extraits', () => {
  it('coupe sur un mot et dit si le texte est tronqué', () => {
    expect(couper('Court.')).toEqual({ extrait: 'Court.', tronque: false });
    const long = `${'mot '.repeat(50)}fin`;
    const { extrait, tronque } = couper(long);
    expect(tronque).toBe(true);
    expect(extrait.length).toBeLessThanOrEqual(160);
    expect(extrait.endsWith('mot')).toBe(true);
  });
});

describe.skipIf(!URL_LECTURE)('PgDiscussions (base réelle, lecture seule)', () => {
  const pool = new pg.Pool({
    connectionString: URL_LECTURE,
    max: 4,
    options: '-c default_transaction_read_only=on -c statement_timeout=30000',
  });
  const db = new PgDatabase(pool);
  const depot = new PgDiscussions(db);
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
  const existe = async (table: string) =>
    (await db.first<{ oid: string | null }>('SELECT to_regclass($table)::text AS oid', { $table: table }))?.oid != null;
  /** Page (de `taille`) de la réunion où se trouve l'intervention, dans l'ordre des prises de parole. */
  const pageDe = async (intervention: string, taille: number) => {
    const r = await db.first<{ reunion: string; rang: number }>(
      `SELECT i.reunion_id AS reunion,
              (SELECT count(*) FROM canon.intervention j WHERE j.reunion_id = i.reunion_id AND j.ordre < i.ordre) AS rang
       FROM canon.intervention i WHERE i.entite_id = $id::uuid`,
      { $id: intervention },
    );
    return { reunion: r!.reunion, page: Math.floor(r!.rang / taille) + 1 };
  };

  let dossier: string;
  let am357: string;
  let i4091148: string;
  let am448: string;
  let int333: string;
  let marc: string;

  beforeAll(async () => {
    [dossier, am357, i4091148, am448, int333, marc] = await Promise.all([
      entite('AN', 'dossier', 'DLR5L17N54085'),
      entite('AN', 'amendement', 'AMANR5L17PO838901BTC2765P0D1N000357'),
      entite('AN', 'intervention', 'CRSANR5L17S2026O1N237#4091148'),
      entite('SENAT', 'amendement', '1327464'),
      entite('SENAT', 'intervention', 'd20260629#int_333'),
      entite('SENAT', 'senateur', '14111D'),
    ]);
  });

  it('séance AN, amendement 357 : texte intégral, orateur certain, sujet par liens explicites, ancre', async () => {
    const r = (await depot.interventions({ type: 'amendement', id: am357 }, { page: 1, taille: 20 }))!;
    expect(r.libelle).toMatch(/^Amendement 357/);
    const i = r.interventions.elements.find((e) => e.id === i4091148)!;
    expect(i).toMatchObject({
      ordre: 37,
      horodatage: 1438.76,
      texte:
        'J’appelle maintenant, dans le texte de la commission, les articles du projet de loi.\nLa parole est à M. Fabrice Brun, pour soutenir l’amendement no 357.',
      reunion: { type: 'seance', chambre: 'AN' },
      sujet: {
        dossier: { id: dossier },
        article: 'Avant_ 1er',
        amendement: { id: am357, numero: '357', chambre: 'AN' },
        point: 'Protection et souveraineté agricoles',
      },
      compteRendu: {
        url: 'https://www.assemblee-nationale.fr/dyn/17/comptes-rendus/seance/CRSANR5L17S2026O1N237',
        ancre: "/compteRendu//paragraphe[@id_syceron='4091148']",
        provenance: { systeme: 'AN', type: 'intervention', idNatif: 'CRSANR5L17S2026O1N237#4091148' },
      },
      synthese: null,
    });
    // PA719024, identifiant officiel du compte rendu : une personne, présidence publiée telle quelle.
    expect(i.orateur).toMatchObject({ type: 'personne', personne: { id: await entite('AN', 'acteur', 'PA719024') }, qualite: 'M. le président' });
    expect(r.interventions).toMatchObject({ page: 1, taille: 20, total: r.interventions.elements.length, suivante: null });

    const extraits = await depot.surAmendement(am357, 10);
    expect(extraits.total).toBe(r.interventions.total);
    expect(extraits.extraits.map((e) => e.id)).toContain(i4091148);
  });

  it('commission AN : l’orateur n’est que le nom publié tant qu’aucune revue ne l’a relié', async () => {
    const id = await entite('AN', 'intervention', 'CRCANR5L17S2026PO419865N040#14');
    const ligne = await db.first<{ orateur_id: string | null }>(
      'SELECT orateur_id FROM canon.intervention WHERE entite_id = $id::uuid',
      { $id: id },
    );
    const { reunion, page } = await pageDe(id, 50);
    const r = (await depot.interventions({ type: 'reunion', id: reunion }, { page, taille: 50 }))!;
    expect(r.libelle).toMatch(/^Commission AN · .+ · 15\/04\/2026$/);
    const i = r.interventions.elements.find((e) => e.id === id)!;
    expect(i.texte.startsWith('S’agissant des zones humides, l’article ne fait que rappeler le principe de proportionnalité')).toBe(true);
    expect(i.compteRendu.url).toBe('https://www.assemblee-nationale.fr/dyn/opendata/CRCANR5L17S2026PO419865N040.html');
    if (ligne!.orateur_id === null) {
      expect(i.orateur).toEqual({ type: 'nom_publie', nom: 'M. Mathieu Lefèvre', qualite: 'ministre délégué' });
      expect(i.groupe).toBeNull();
    } else {
      expect(i.orateur).toMatchObject({ type: 'personne', personne: { id: ligne!.orateur_id } });
    }
  });

  it('séance Sénat d20260629#int_333 : matricule publié → personne, texte intégral, amendement 448 si relié', async () => {
    const { reunion, page } = await pageDe(int333, 100);
    const r = (await depot.interventions({ type: 'reunion', id: reunion }, { page, taille: 100 }))!;
    expect(r.libelle).toBe('Séance Sénat · 29/06/2026');
    const i: Intervention = r.interventions.elements.find((e) => e.id === int333)!;
    expect(i).toMatchObject({
      texte: 'Je mets aux voix l’amendement n° 448.\n(L’amendement n’est pas adopté.)',
      orateur: { type: 'personne', personne: { id: marc }, qualite: 'président de séance' },
      reunion: { type: 'seance', chambre: 'SENAT' },
      sujet: { dossier: { id: dossier }, article: 'Article 1er' },
      compteRendu: { url: null, ancre: "/cri//intervenant[@id='int_333']", provenance: { systeme: 'SENAT', idNatif: 'd20260629#int_333' } },
    });
    const relie = await db.first<{ n: number }>(
      `SELECT count(*) AS n FROM canon.intervention WHERE entite_id = $i::uuid AND amendement_id = $a::uuid`,
      { $i: int333, $a: am448 },
    );
    const sur448 = await depot.surAmendement(am448, 50);
    if (relie!.n > 0) {
      // Après la relecture des débats du Sénat : « 448 » de la lecture en cours = SENAT:amendement:1327464.
      expect(i.sujet.amendement).toEqual({ id: am448, numero: '448', chambre: 'SENAT' });
      expect(sur448.extraits.map((e) => e.id)).toContain(int333);
    } else {
      expect(i.sujet.amendement).toBeNull();
    }
    expect(sur448.total).toBeGreaterThanOrEqual(sur448.extraits.length);
  });

  it('interventions d’une personne, sur un dossier : toutes de cet orateur', async () => {
    const r = (await depot.interventions({ type: 'personne', id: marc, dossier }, { page: 1, taille: 5 }))!;
    expect(r.libelle).toMatch(/^.+ · Projet de loi d’urgence pour la protection et la souveraineté agricoles$/);
    for (const i of r.interventions.elements) {
      expect(i.orateur).toMatchObject({ type: 'personne', personne: { id: marc } });
      expect(i.synthese).toBeNull();
    }
    if (r.interventions.total! > 5) expect(r.interventions.suivante).toBe(2);
  });

  it('« Qui intervient » sur la séance AN : orateurs du plus actif au moins actif, sans la présidence', async () => {
    const r = await depot.intervenants(dossier, 'seance_1_o', 10);
    if (!(await existe('lecture.parcours_acte'))) {
      expect(r).toEqual({ intervenants: [], total: 0 });
      return;
    }
    expect(r.intervenants.length).toBeGreaterThan(0);
    expect(r.total).toBeGreaterThanOrEqual(r.intervenants.length);
    const nombres = r.intervenants.map((i) => i.interventions);
    expect(nombres).toEqual([...nombres].sort((a, b) => b - a));
    for (const i of r.intervenants) {
      expect(i.orateur.qualite ?? '').not.toMatch(/^présidente? de séance$/);
      if (i.orateur.type === 'nom_publie') expect(i.orateur.nom).not.toMatch(/^(M\. le président|Mme la présidente)/);
      expect(i.extrait).not.toBeNull();
    }
  });

  it('avant le vote 7259 : ses interventions sur le dossier, le jour du vote ou avant', async () => {
    const s7259 = await entite('AN', 'scrutin', 'VTANR5L17V7259');
    const orateur = await db.first<{ id: string }>(
      `SELECT i.orateur_id AS id FROM canon.intervention i
       JOIN canon.reunion r ON r.entite_id = i.reunion_id
       JOIN canon.vote v ON v.scrutin_id = $s::uuid AND v.personne_id = i.orateur_id
       WHERE i.dossier_id = $d::uuid AND r.type = 'seance' AND r.chambre = 'AN' AND r.debut < DATE '2026-06-02'
         AND i.qualite IS DISTINCT FROM 'président de séance' AND i.orateur_libelle !~* '^(M\\. le président|Mme la présidente)'
       GROUP BY i.orateur_id ORDER BY count(*) DESC LIMIT 1`,
      { $s: s7259, $d: dossier },
    );
    const extraits = await depot.avantLeVote(s7259, orateur!.id, 5);
    expect(extraits.length).toBeGreaterThan(0);
    for (const e of extraits) {
      expect(e.orateur).toMatchObject({ type: 'personne', personne: { id: orateur!.id } });
      expect(e.date! <= '2026-06-02').toBe(true);
    }
    const dates = extraits.map((e) => e.date!);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('identifiant inconnu : null ou liste vide (G5)', async () => {
    expect(await depot.interventions({ type: 'reunion', id: 'x' }, { page: 1, taille: 5 })).toBeNull();
    expect(await depot.interventions({ type: 'reunion', id: INCONNU }, { page: 1, taille: 5 })).toBeNull();
    expect(await depot.interventions({ type: 'amendement', id: INCONNU }, { page: 1, taille: 5 })).toBeNull();
    expect(await depot.interventions({ type: 'personne', id: INCONNU }, { page: 1, taille: 5 })).toBeNull();
    expect(await depot.interventions({ type: 'etape', dossier: INCONNU, cle: 'cmp' }, { page: 1, taille: 5 })).toBeNull();
    expect(await depot.surAmendement(INCONNU, 5)).toEqual({ extraits: [], total: 0 });
    expect(await depot.intervenants(INCONNU, 'cmp', 5)).toEqual({ intervenants: [], total: 0 });
    expect(await depot.avantLeVote(INCONNU, INCONNU, 5)).toEqual([]);
  });
});
