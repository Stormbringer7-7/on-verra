// PgScrutins sur la vraie base, en lecture seule (DATABASE_URL_LECTURE ; sautés sans elle). Valeurs
// des exemples réels de la doc (opendata/docs/sources/an.md et senat.md) : scrutin AN
// VTANR5L17V7259 (ensemble du projet de loi agricole, dossier DLR5L17N54085), scrutin Sénat
// 2025-325, mise au point du scrutin AN 1992. Les UUID changent d'une base à l'autre : on part des
// identifiants natifs. Écrits pour tenir avant et après la fin d'un chargement (projections recréées).

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exprimes } from '@contrat/domain/votes';
import { PgDatabase } from '../../src/infra/PgDatabase';
import { PgScrutins } from '../../src/infra/pg/scrutins';

const URL_LECTURE = process.env.DATABASE_URL_LECTURE;
const INCONNU = '00000000-0000-4000-8000-000000000000';

describe.skipIf(!URL_LECTURE)('PgScrutins (base réelle, lecture seule)', () => {
  const pool = new pg.Pool({
    connectionString: URL_LECTURE,
    max: 4,
    options: '-c default_transaction_read_only=on -c statement_timeout=30000',
  });
  const db = new PgDatabase(pool);
  const depot = new PgScrutins(db);
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

  let s7259: string;
  let s325: string;
  let s1992: string;
  let dossier: string;
  let allisio: string;

  beforeAll(async () => {
    [s7259, s325, s1992, dossier, allisio] = await Promise.all([
      entite('AN', 'scrutin', 'VTANR5L17V7259'),
      entite('SENAT', 'scrutin', '2025-325'),
      entite('AN', 'scrutin', 'VTANR5L17V1992'),
      entite('AN', 'dossier', 'DLR5L17N54085'),
      entite('AN', 'acteur', 'PA793432'),
    ]);
  });

  it('fiche AN VTANR5L17V7259 : décompte publié, dossier par l’acte, sens null, provenance', async () => {
    const f = (await depot.fiche(s7259))!;
    expect(f.scrutin).toMatchObject({
      id: s7259,
      chambre: 'AN',
      numero: '7259',
      date: '2026-06-02',
      nature: 'ensemble',
      intitule: "l'ensemble du projet de loi d'urgence pour la protection et la souveraineté agricoles (première lecture).",
      enClair: null,
      sort: 'adopté',
      adopte: true,
      decompte: { pour: 369, contre: 178, abstention: 15 },
      dossier: { id: dossier },
    });
    expect(f.objet).toEqual({ type: 'texte' });
    expect(f.sens).toEqual({ pour: null, contre: null });
    expect(f.nonVotants).toBe(1);
    expect(f.provenance).toEqual({
      systeme: 'AN',
      type: 'scrutin',
      idNatif: 'VTANR5L17V7259',
      url: 'https://www.assemblee-nationale.fr/dyn/17/scrutins/7259',
    });
    // Compte rendu : la séance que cite l'acte du vote (AN1-DEBATS-DEC), ce jour-là.
    expect(f.compteRendu).toMatchObject({
      url: 'https://www.assemblee-nationale.fr/dyn/17/comptes-rendus/seance/CRSANR5L17S2026O1N259',
      provenance: { systeme: 'AN', idNatif: 'CRSANR5L17S2026O1N259' },
    });
  });

  it('fiche AN : positions de groupe recalculées depuis les votes, absents, écarts à la ligne', async () => {
    const f = (await depot.fiche(s7259))!;
    const rn = f.groupes.find((g) => g.groupe.abrege === 'RN')!;
    expect(rn).toMatchObject({ ligne: 'pour', decompte: { pour: 120, contre: 0, abstention: 0 }, groupe: { chambre: 'AN' } });
    const soc = f.groupes.find((g) => g.groupe.abrege === 'SOC')!;
    expect(soc).toMatchObject({ ligne: 'contre', decompte: { pour: 2, contre: 57, abstention: 6 } });
    expect(f.groupes.map((g) => g.rang)).toEqual(f.groupes.map((_, i) => i));
    for (const g of f.groupes) {
      expect(g.membres).toBe(exprimes(g.decompte) + g.nonVotants + g.absents);
      expect(g.absents).toBeGreaterThanOrEqual(0);
    }
    const total = f.groupes.reduce((a, g) => a + exprimes(g.decompte), 0);
    expect(total).toBeLessThanOrEqual(369 + 178 + 15);
    expect(f.absents).toBeGreaterThanOrEqual(f.groupes.reduce((a, g) => a + g.absents, 0));
    // Écarts : votes exprimés ≠ ligne du groupe, au moins les 2 « pour » et 6 abstentions du groupe SOC.
    expect(f.votesDifferents.total).toBe(f.votesDifferents.personnes.length);
    expect(f.votesDifferents.personnes.filter((p) => p.personne.groupe?.abrege === 'SOC')).toHaveLength(8);
    for (const p of f.votesDifferents.personnes) expect(p.position).not.toBe(p.ligneDuGroupe);
  });

  it('fiche AN : chaque député en mandat, cohérent avec les groupes, de la gauche vers la droite', async () => {
    const t0 = Date.now();
    const f = (await depot.fiche(s7259))!;
    expect(Date.now() - t0).toBeLessThan(5_000);
    expect(new Set(f.votes.map((v) => v.personne.id)).size).toBe(f.votes.length);
    for (const g of f.groupes) {
      const votes = f.votes.filter((v) => v.personne.groupe?.id === g.groupe.id);
      const n = (p: string) => votes.filter((v) => v.position === p).length;
      expect([n('pour'), n('contre'), n('abstention'), n('non_votant'), n('absent')], g.groupe.abrege).toEqual([
        g.decompte.pour, g.decompte.contre, g.decompte.abstention, g.nonVotants, g.absents,
      ]);
    }
    const rangs = new Map(f.groupes.map((g) => [g.groupe.id, g.rang]));
    const suite = f.votes.map((v) => (v.personne.groupe ? (rangs.get(v.personne.groupe.id) ?? 99) : 99));
    expect(suite).toEqual([...suite].sort((a, b) => a - b));
    for (const v of f.votes) if (v.position === 'absent') expect([v.siege, v.parDelegation]).toEqual([null, false]);
  });

  it('fiche Sénat 2025-325 : décompte et sort publiés, trois amendements identiques → objet non choisi', async () => {
    const f = (await depot.fiche(s325))!;
    expect(f.scrutin).toMatchObject({
      chambre: 'SENAT',
      numero: '325',
      date: '2026-07-01',
      nature: 'amendement',
      sort: 'rejeté',
      adopte: false,
      decompte: { pour: 133, contre: 211, abstention: 0 },
      dossier: { id: dossier },
      etape: null,
    });
    expect(f.scrutin.intitule).toContain('à l’article 5 quater A du projet de loi d\'urgence');
    expect(f.objet).toEqual({ type: 'autre' });
    expect(f.compteRendu).toBeNull();
    expect(f.provenance).toEqual({
      systeme: 'SENAT',
      type: 'scrutin',
      idNatif: '2025-325',
      url: 'https://www.senat.fr/scrutin-public/2025/scr2025-325.html',
    });
    // Groupes : appartenance du jour (le Sénat ne publie pas le groupe avec le vote).
    const parGroupe = f.groupes.reduce((a, g) => a + exprimes(g.decompte), 0);
    expect(parGroupe).toBeLessThanOrEqual(344);
    for (const g of f.groupes) expect(g.groupe.chambre).toBe('SENAT');
  });

  it('vote de Franck Allisio (PA793432) sur 7259 : pour, par délégation, groupe RN', async () => {
    const v = (await depot.vote(s7259, allisio))!;
    expect(v.vote).toEqual({ position: 'pour', parDelegation: true, miseAuPoint: null });
    expect(v.groupe).toMatchObject({ groupe: { abrege: 'RN' }, ligne: 'pour', partLigne: 100, memePosition: 120, exprimes: 120 });
  });

  it('mise au point (scrutin 1992) : un fait à côté du vote, jamais une modification', async () => {
    const [pa721750, pa793342] = await Promise.all([entite('AN', 'acteur', 'PA721750'), entite('AN', 'acteur', 'PA793342')]);
    const chargees = await db.first<{ n: number }>(
      `SELECT count(*) AS n FROM canon.lien WHERE de_id = $s::uuid AND nature = 'mise_au_point'`,
      { $s: s1992 },
    );
    const absent = await depot.vote(s1992, pa721750);
    const delegue = (await depot.vote(s1992, pa793342))!;
    // Vote enregistré inchangé : contre, par délégation.
    expect(delegue.vote).toMatchObject({ position: 'contre', parDelegation: true });
    if (chargees!.n > 0) {
      expect(absent!.vote).toEqual({
        position: 'absent',
        parDelegation: false,
        miseAuPoint: 'Selon la mise au point publiée, voulait voter contre',
      });
      expect(delegue.vote.miseAuPoint).toBe(
        'Selon la mise au point publiée, voulait ne pas prendre part au vote, volontairement (dysfonctionnement du vote signalé)',
      );
    } else {
      // Mises au point pas encore chargées en canon.lien : rien n'est inventé.
      expect(delegue.vote.miseAuPoint).toBeNull();
      if (absent) expect(absent.vote).toMatchObject({ position: 'absent', miseAuPoint: null });
    }
  });

  it('scrutins entre deux dates, d’un dossier, d’une case, sur un amendement', async () => {
    const jour = await depot.entre('2026-06-02', '2026-06-02', 1000);
    expect(jour.map((s) => s.id)).toContain(s7259);
    expect(jour.every((s) => s.date === '2026-06-02')).toBe(true);

    const duDossier = await depot.duDossier(dossier);
    expect(duDossier.map((s) => s.id)).toEqual(expect.arrayContaining([s7259, s325]));
    expect(duDossier.every((s) => s.dossier?.id === dossier)).toBe(true);
    const dates = duDossier.map((s) => s.date);
    expect(dates).toEqual([...dates].sort().reverse());

    const seance = await depot.duDossier(dossier, 'seance_1_o');
    if (await existe('lecture.parcours_acte')) {
      expect(seance.map((s) => s.id)).toContain(s7259);
      expect(seance.find((s) => s.id === s7259)!.etape).toEqual({ cle: 'seance_1_o', libelle: 'Séance AN' });
    } else {
      expect(seance).toEqual([]);
    }

    const amendement = await db.first<{ id: string }>(
      'SELECT amendement_id AS id FROM canon.scrutin WHERE entite_id = $s::uuid',
      { $s: s1992 },
    );
    expect((await depot.surAmendement(amendement!.id))?.id).toBe(s1992);
    const f1992 = (await depot.fiche(s1992))!;
    expect(f1992.objet).toMatchObject({ type: 'amendement', amendement: { id: amendement!.id, chambre: 'AN' } });
  });

  it('derniers écarts : votes à l’inverse du groupe, du plus récent au plus ancien', async () => {
    const soc = (await depot.fiche(s7259))!.votesDifferents.personnes.find((p) => p.personne.groupe?.abrege === 'SOC')!;
    const ecarts = await depot.derniersEcarts(soc.personne.id, 50);
    expect(ecarts.length).toBeGreaterThan(0);
    expect(ecarts.length).toBeLessThanOrEqual(50);
    const dates = ecarts.map((s) => s.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('identifiant inconnu : null ou liste vide (G5)', async () => {
    expect(await depot.fiche('pas-un-uuid')).toBeNull();
    expect(await depot.fiche(INCONNU)).toBeNull();
    expect(await depot.vote(INCONNU, allisio)).toBeNull();
    expect(await depot.vote(s7259, INCONNU)).toBeNull();
    expect(await depot.surAmendement(INCONNU)).toBeNull();
    expect(await depot.duDossier('x')).toEqual([]);
    expect(await depot.derniersEcarts(INCONNU, 5)).toEqual([]);
  });
});
