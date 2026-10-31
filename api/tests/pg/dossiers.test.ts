// PgDossiers sur la vraie base, en lecture seule (DATABASE_URL_LECTURE ; sautés sinon). Valeurs
// réelles des deux dossiers prototypes (opendata/docs/sources/an.md, senat.md, indicateurs.md
// « Parcours », modifications.md) et garanties G1 à G6 de ports.ts.
//
// La projection `lecture.parcours_*` et `canon.modification_article` peuvent ne pas être encore
// chargées : chaque test qui en dépend vérifie le comportement des deux états (vide → null ou
// liste vide ; rempli → valeurs de la documentation).

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PgDatabase } from '../../src/infra/PgDatabase';
import { PgDossiers, diffMots, ordonnerVersions, segmentsPublies, titreAffiche } from '../../src/infra/pg/dossiers';

const URL_LECTURE = process.env.DATABASE_URL_LECTURE;
const INCONNU = '00000000-0000-4000-8000-000000000000';

describe('diff mot à mot (fonctions pures)', () => {
  it('article 13 de la PPL fin de vie : « du présent chapitre » → « de la présente sous-section »', () => {
    const avant = 'Un décret en Conseil d’État précise les conditions d’application du présent chapitre, notamment :';
    const apres = 'Un décret en Conseil d’État précise les conditions d’application de la présente sous-section, notamment :';
    const diff = diffMots(avant, apres);
    expect(diff.filter((s) => s.type === 'supprime').map((s) => s.texte.trim())).toEqual(['du présent chapitre,']);
    expect(diff.filter((s) => s.type === 'ajoute').map((s) => s.texte.trim())).toEqual(['de la présente sous-section,']);
    // Les « = » et « + » recomposent la nouvelle version ; l'espace insécable n'est pas un changement.
    expect(diff.filter((s) => s.type !== 'supprime').map((s) => s.texte).join('')).toBe(apres);
  });

  it('textes identiques : un seul segment égal ; texte vide : tout ajouté', () => {
    expect(diffMots('Article inchangé.', 'Article inchangé.')).toEqual([{ type: 'egal', texte: 'Article inchangé.' }]);
    expect(diffMots('', 'Nouvel article.')).toEqual([{ type: 'ajoute', texte: 'Nouvel article.' }]);
  });

  it('diff publié par opendata (format « mots ») repris tel quel', () => {
    const segments = segmentsPublies({
      format: 'mots',
      operations: [['=', 'précise les conditions d’application '], ['-', 'du présent chapitre'], ['+', 'de la présente sous-section']],
    });
    expect(segments).toEqual([
      { type: 'egal', texte: 'précise les conditions d’application ' },
      { type: 'supprime', texte: 'du présent chapitre' },
      { type: 'ajoute', texte: 'de la présente sous-section' },
    ]);
    expect(segmentsPublies(null)).toBeNull();
  });

  it('titre affiché : le titre court, sauf un chemin d’URL ou un identifiant', () => {
    const officiel = 'Projet de loi relatif à la lutte contre les ingérences étrangères dans la vie démocratique';
    expect(titreAffiche(officiel, 'DLR5L17N54703')).toBe(officiel);
    expect(titreAffiche(officiel, 'projet_loi_urgence_pour_protection_et_souverainete_agricoles')).toBe(officiel);
    expect(titreAffiche('Proposition de loi relative à la fin de vie', 'Fin de vie')).toBe('Fin de vie');
    expect(titreAffiche(officiel, null)).toBe(officiel);
  });

  it('ordre des versions : la navette publiée prime sur la date', () => {
    const v = (id: string, nature: string, date: string | null) => ({ id, nature, date, id_natif: id });
    const versions = [v('senat-com', 'de la commission', '2025-03-11'), v('an-depose', 'depose', '2025-03-11'), v('an-com', 'commission', '2025-05-02')];
    expect(ordonnerVersions(versions, []).map((x) => x.id)).toEqual(['an-depose', 'senat-com', 'an-com']);
    expect(ordonnerVersions(versions, [{ avant: 'an-com', apres: 'senat-com' }]).map((x) => x.id)).toEqual(['an-depose', 'an-com', 'senat-com']);
  });
});

describe.skipIf(!URL_LECTURE)('PgDossiers (base réelle, lecture seule)', () => {
  const pool = new pg.Pool({ connectionString: URL_LECTURE, max: 4, options: '-c default_transaction_read_only=on -c statement_timeout=60000' });
  const db = new PgDatabase(pool);
  const depot = new PgDossiers(db);
  let agricole: string; // DLR5L17N54085, projet de loi, procédure accélérée
  let finDeVie: string; // DLR5L17N51670, proposition de loi, navette normale
  let projection: boolean;
  let modifications: boolean;

  const entite = async (systeme: string, type: string, idSource: string) =>
    (await db.first<{ id: string }>(
      `SELECT entite_id AS id FROM canon.correspondance WHERE systeme = $s AND type_source = $t AND id_source = $i AND statut = 'VERIFIED'`,
      { $s: systeme, $t: type, $i: idSource },
    ))!.id;

  beforeAll(async () => {
    agricole = await entite('AN', 'dossier', 'DLR5L17N54085');
    finDeVie = await entite('AN', 'dossier', 'DLR5L17N51670');
    projection = (await db.first<{ ok: boolean }>(`SELECT to_regclass('lecture.parcours_dossier') IS NOT NULL AS ok`))!.ok;
    modifications = (await db.first<{ n: number }>(`SELECT count(*)::int AS n FROM (SELECT 1 FROM canon.modification_article LIMIT 1) x`))!.n > 0;
  });
  afterAll(() => pool.end());

  // ----- En-tête et sources -----

  it('en-tête du projet de loi agricole : titre officiel, procédure, Gouvernement et sa ministre', async () => {
    const e = (await depot.entete(agricole))!;
    expect(e).toMatchObject({
      id: agricole,
      titreOfficiel: 'Projet de loi d’urgence pour la protection et la souveraineté agricoles',
      // titre_court est le chemin de la page AN (« projet_loi_urgence_… ») : le titre officiel est rendu
      titre: 'Projet de loi d’urgence pour la protection et la souveraineté agricoles',
      type: 'Projet de loi ordinaire',
      nature: 'projet',
      procedure: 'acceleree',
      origine: 'gouvernement',
      legislature: '17',
      dateDepot: '2026-04-08',
      theme: null,
      titreEnClair: null,
      resumeEnClair: null,
    });
    // Initiateurs publiés : Sébastien Lecornu (Premier ministre) puis Annie Genevard : elle porte le texte.
    expect(e.auteur).toMatchObject({ type: 'gouvernement', ministre: { nom: 'Annie Genevard' } });
    expect(e.auteur?.type === 'gouvernement' && e.auteur.ministre?.fonction).toMatch(/agriculture/i);
  });

  it('en-tête de la proposition de loi fin de vie : auteur Olivier Falorni, navette normale', async () => {
    const e = (await depot.entete(finDeVie))!;
    expect(e).toMatchObject({ titre: 'Fin de vie', nature: 'proposition', procedure: 'normale', origine: 'parlementaire', dateDepot: '2025-03-11' });
    expect(e.auteur).toMatchObject({ type: 'personne', personne: { nom: 'Olivier Falorni' } });
  });

  it('sources officielles : une provenance par système, URL publiée ou page de l’objet', async () => {
    const s = await depot.sources(agricole);
    expect(s).toEqual(
      expect.arrayContaining([
        { systeme: 'AN', type: 'dossier', idNatif: 'DLR5L17N54085', url: 'https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N54085' },
        { systeme: 'SENAT', type: 'dossier', idNatif: 'pjl25-689', url: 'http://www.senat.fr/dossier-legislatif/pjl25-689.html' },
        expect.objectContaining({ systeme: 'LEGIFRANCE', idNatif: 'AGRS2603566L' }),
        { systeme: 'CONSTIT', type: 'decision', idNatif: '2026-914', url: 'https://www.conseil-constitutionnel.fr/decision/2026/2026914DC.htm' },
      ]),
    );
    expect(new Set(s.map((p) => p.systeme)).size).toBe(s.length);
    // Jamais l'archive du jeu de données comme page de l'objet.
    expect(s.every((p) => !p.url?.includes('/static/openData/'))).toBe(true);
  });

  // ----- G5 : identifiant inconnu -----

  it('identifiant inconnu ou mal formé : null ou vide, jamais une exception', async () => {
    for (const id of [INCONNU, 'pas-un-uuid', '']) {
      expect(await depot.entete(id)).toBeNull();
      expect(await depot.parcours(id)).toBeNull();
      expect(await depot.barre(id)).toBeNull();
      expect(await depot.etape(id, 'depot')).toBeNull();
      expect(await depot.article(id, null, 'precedente')).toBeNull();
      expect(await depot.amendement(id)).toBeNull();
      expect(await depot.etapes(id)).toEqual([]);
      expect(await depot.ceQuiAChange(id)).toEqual([]);
      expect(await depot.acteurs(id)).toEqual([]);
      expect(await depot.chiffres(id)).toEqual([]);
      expect(await depot.sources(id)).toEqual([]);
      expect(await depot.articles(id)).toEqual({ articles: [], versionsDuTexte: 0 });
      expect((await depot.amendements(id, {}, { page: 1, taille: 5 })).liste).toMatchObject({ elements: [], total: 0, suivante: null });
    }
  });

  // ----- Barre de parcours -----

  it('parcours du projet agricole : 16 étapes du modèle loi ordinaire, celles de indicateurs.md (vide tant que la projection manque)', async () => {
    const p = await depot.parcours(agricole);
    const barre = (await depot.barre(agricole))!;
    expect(barre.dossier).toEqual({ id: agricole, titre: 'Projet de loi d’urgence pour la protection et la souveraineté agricoles' });
    if (!projection) {
      expect(p).toBeNull();
      expect(barre.cases).toEqual([]);
      return;
    }
    expect(p).toMatchObject({
      modele: { cle: 'loi_ordinaire', famille: 'legislatif' }, procedure: 'acceleree', origine: 'AN', prochaineEcheance: null,
      branches: [{ de: 'conclusions_cmp', vers: 'cc', libelle: 'Texte de la CMP adopté : fin de la navette' }],
      parent: null, enfants: [],
    });
    // procédure accélérée : déviation au dépôt, le parcours reprend
    expect(p!.deviations).toEqual([expect.objectContaining({ cle: 'procedure_acceleree', etape: 'depot', effet: 'rejoint' })]);
    const c = Object.fromEntries(p!.cases.map((x) => [x.cle, x]));
    expect(p!.cases).toHaveLength(16);
    expect(c.depot).toMatchObject({ etat: 'faite', debut: '2026-04-08', fin: '2026-04-08', nature: 'obligatoire' });
    expect(c.commission_1_o).toMatchObject({ etat: 'faite', fin: '2026-05-07', libelle: 'Commission AN' });
    expect(c.seance_1_o).toMatchObject({ etat: 'faite', fin: '2026-06-02', conclusion: 'adopté' });
    expect(c.transmission_1_s).toMatchObject({ etat: 'faite', debut: '2026-06-03', libelle: 'Transmission Sénat' });
    expect(c.seance_1_s).toMatchObject({ etat: 'faite', conclusion: 'modifié' });
    expect(c.lecture_2_o.etat).toBe('sans_objet');
    expect(c.cmp).toMatchObject({ etat: 'faite', debut: '2026-07-06', fin: '2026-07-17', conclusion: 'Accord' });
    expect(c.conclusions_cmp).toMatchObject({ etat: 'faite', lieu: null, fin: '2026-07-21' });
    expect(c.nouvelle_lecture.etat).toBe('sans_objet');
    expect(c.cc).toMatchObject({ etat: 'faite', fin: '2026-08-14' });
    expect(c.cc.provenance).toEqual(expect.arrayContaining([expect.objectContaining({ systeme: 'CONSTIT', idNatif: '2026-914' })]));
    expect(c.promulgation).toMatchObject({ etat: 'faite', conclusion: 'Loi n° 2026-796' });
    expect(c.jo).toMatchObject({ etat: 'faite', debut: '2026-08-19', conclusion: 'JO n° 192' });
    expect(p!.cases.filter((x) => x.etat !== 'sans_objet')).toHaveLength(11);
    expect(p!.cases.some((x) => x.courante)).toBe(false);
    // Chaque case faite porte la provenance des actes qui l'établissent.
    expect(p!.cases.filter((x) => x.etat === 'faite').every((x) => x.provenance.length > 0)).toBe(true);
    expect(barre.cases.map((x) => x.cle)).toEqual(p!.cases.map((x) => x.cle));
  });

  it('parcours fin de vie : navette normale, CMP en désaccord, lecture définitive, loi 2026-794', async () => {
    const p = await depot.parcours(finDeVie);
    if (!projection) return expect(p).toBeNull();
    expect(p).toMatchObject({ procedure: 'normale', origine: 'AN', deviations: [] });
    const c = Object.fromEntries(p!.cases.map((x) => [x.cle, x]));
    expect(p!.cases).toHaveLength(16);
    expect(c.seance_1_s).toMatchObject({ etat: 'faite', conclusion: 'rejetée' });
    expect(c.cmp).toMatchObject({ etat: 'faite', conclusion: 'Désaccord' });
    // CMP en désaccord : branche du droit commun vers la nouvelle lecture
    expect(p!.branches).toEqual([{ de: 'cmp', vers: 'nouvelle_lecture', libelle: 'CMP sans accord : nouvelle lecture' }]);
    expect(c.conclusions_cmp.etat).toBe('sans_objet');
    expect(c.nouvelle_lecture).toMatchObject({ etat: 'faite', conclusion: 'AN : adoptée · Sénat : rejetée' });
    expect(c.lecture_definitive).toMatchObject({ etat: 'faite', fin: '2026-07-15', conclusion: 'adoptée' });
    expect(c.promulgation).toMatchObject({ etat: 'faite', fin: '2026-08-18', conclusion: 'Loi n° 2026-794' });
    expect(c.jo).toMatchObject({ etat: 'faite', fin: '2026-08-19', conclusion: 'JO n° 192' });
  });

  it('étapes : une ligne par case affichée, avec son organe (vide sans projection)', async () => {
    const e = await depot.etapes(agricole);
    if (!projection) return expect(e).toEqual([]);
    expect(e.map((x) => x.cle)).toEqual([
      'depot', 'commission_1_o', 'seance_1_o', 'transmission_1_s', 'commission_1_s', 'seance_1_s', 'cmp', 'conclusions_cmp', 'cc',
      'promulgation', 'jo',
    ]);
    expect(e.find((x) => x.cle === 'commission_1_o')?.organe?.nom).toBe('Commission des affaires économiques');
    expect(e.find((x) => x.cle === 'cc')?.organe?.nom).toBe('Conseil constitutionnel');
    expect(e.every((x) => x.resume === null && x.chiffres.every((c) => typeof c.valeur === 'number' && c.valeur >= 0))).toBe(true);
  });

  it('fiche d’étape : commission AN (rapport n° 2765), Conseil constitutionnel (décision 2026-914 DC)', async () => {
    const commission = await depot.etape(agricole, 'commission_1_o');
    const cc = await depot.etape(agricole, 'cc');
    if (!projection) {
      expect(commission).toBeNull();
      expect(cc).toBeNull();
      return;
    }
    expect(commission).toMatchObject({ numero: 2, organe: { nom: 'Commission des affaires économiques' }, resume: null });
    expect(commission!.precedente).toEqual({ cle: 'depot', libelle: 'Dépôt AN' });
    expect(commission!.suivante).toEqual({ cle: 'seance_1_o', libelle: 'Séance AN' });
    expect(commission!.documents.every((d) => d.provenance && d.provenance.idNatif)).toBe(true);
    expect(cc!.documents).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'decision', titre: 'Décision n° 2026-914 DC', provenance: expect.objectContaining({ systeme: 'CONSTIT' }) })]),
    );
    // Sans modification_article : origine jamais affirmée.
    if (!modifications) expect([...commission!.changements, ...cc!.changements].every((c) => c.origine.type === 'non_etablie')).toBe(true);
    expect(await depot.etape(agricole, 'lecture_1_o')).toBeNull(); // clé d'aucune étape du modèle
    // Séance AN de la PPL fin de vie : texte de la commission (BTC1364) puis texte adopté
    // (BTA0122), cités par les actes de l'étape ; un changement par article.
    const lecture = (await depot.etape(finDeVie, 'seance_1_o'))!;
    const ids = lecture.changements.map((c) => c.article.id);
    expect(new Set(ids).size).toBe(ids.length);
    const art13 = lecture.changements.find((c) => c.article.numero === '13');
    expect(art13).toBeDefined();
    if (modifications) expect(art13!.origine).toMatchObject({ type: 'amendement', amendement: { statut: 'verifie' } });
    else expect(art13!.origine).toEqual({ type: 'non_etablie' });
  });

  // ----- Texte : articles et versions -----

  it('articles de la PPL fin de vie : suivis à travers la navette, versions retirées ignorées', async () => {
    const { articles, versionsDuTexte } = await depot.articles(finDeVie);
    const versionsEnBase = (await db.first<{ n: number }>(
      `SELECT count(*)::int AS n FROM canon.version_texte v JOIN canon.entite x ON x.entite_id = v.entite_id
       WHERE v.dossier_id = $id AND x.retiree_de_la_source_le IS NULL AND x.fusionnee_dans IS NULL`,
      { $id: finDeVie },
    ))!.n;
    expect(versionsDuTexte).toBe(versionsEnBase);
    expect(versionsDuTexte).toBeGreaterThanOrEqual(20);
    const art13 = articles.find((a) => a.article.numero === '13');
    expect(art13).toMatchObject({ etat: 'modifie' });
    expect(art13!.modifications).toBeGreaterThan(0);
    const changes = await depot.ceQuiAChange(finDeVie);
    expect(changes.map((c) => c.article.id).sort()).toEqual(articles.filter((a) => a.etat !== 'inchange').map((a) => a.article.id).sort());
    expect(changes.every((c) => c.resume === null)).toBe(true);
  });

  it('article 13 : diff du texte déposé (B1100) au texte de la commission (BTC1364), origine selon modification_article', async () => {
    const article = await entite('CIVICTRACE', 'article_suivi', 'SENAT:dossier:ppl24-661#13');
    const depose = await entite('AN', 'article', 'PIONANR5L17B1100#13');
    const commission = await entite('AN', 'article', 'PIONANR5L17BTC1364#13');
    const f = (await depot.article(article, commission, 'depose'))!;
    expect(f.dossier).toBe(finDeVie);
    expect(f.affichee).toMatchObject({ version: commission, comparaison: 'depose', compareeA: depose });
    expect(f.affichee.diff.filter((s) => s.type === 'supprime').map((s) => s.texte).join(' ')).toContain('du présent chapitre');
    expect(f.affichee.diff.filter((s) => s.type === 'ajoute').map((s) => s.texte).join(' ')).toContain('de la présente sous-section');
    expect(f.affichee.diff.filter((s) => s.type !== 'supprime').map((s) => s.texte).join('')).toBe(f.affichee.texte);
    expect(f.versions.find((v) => v.id === depose)).toMatchObject({ rang: 0, libelle: 'Texte déposé', numero: '13', lieu: 'AN' });
    if (modifications) {
      expect(f.affichee.origine).toMatchObject({ type: 'amendement', amendement: { statut: 'verifie', cible: { chambre: 'AN' } } });
    } else {
      expect(f.affichee.origine).toEqual({ type: 'non_etablie' });
      expect(f.affichee.pourquoi).toEqual({ expose: null, synthese: null });
    }
    // Texte déposé affiché : pas de comparaison, pas d'origine.
    const d = (await depot.article(article, depose, 'precedente'))!;
    expect(d.affichee).toMatchObject({ compareeA: null, origine: null });
    // Version inconnue → null (G5).
    expect(await depot.article(article, INCONNU, 'precedente')).toBeNull();
  });

  it('G2 : versions d’article retirées de la source jamais rendues', async () => {
    const retirees = await db.all<{ id: string; article: string }>(
      `SELECT va.entite_id AS id, va.article_suivi_id AS article FROM canon.version_article va
       JOIN canon.entite x ON x.entite_id = va.entite_id JOIN canon.article_suivi s ON s.entite_id = va.article_suivi_id
       WHERE x.retiree_de_la_source_le IS NOT NULL AND s.dossier_id = $id LIMIT 3`,
      { $id: finDeVie },
    );
    for (const r of retirees) {
      const f = await depot.article(r.article, null, 'precedente');
      expect(f?.versions.some((v) => v.id === r.id) ?? false).toBe(false);
      expect(await depot.article(r.article, r.id, 'precedente')).toBeNull();
    }
  });

  // ----- Amendements -----

  it('amendements du projet agricole : comptes de la base, adoptés d’abord, pagination et filtre', async () => {
    const compte = await db.first<{ n: number; adoptes: number }>(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE a.sort = 'adopte')::int AS adoptes FROM canon.amendement a
       JOIN canon.entite x ON x.entite_id = a.entite_id
       WHERE a.dossier_id = $id AND x.retiree_de_la_source_le IS NULL AND x.fusionnee_dans IS NULL`,
      { $id: agricole },
    );
    expect(compte!.n).toBeGreaterThan(5000); // 5 584 au 24/10/2026 (AN 4 038, Sénat 1 546)
    const tous = await depot.amendements(agricole, {}, { page: 1, taille: 20 });
    expect(tous.liste).toMatchObject({ page: 1, taille: 20, total: compte!.n, suivante: 2 });
    expect(tous.liste.elements).toHaveLength(20);
    expect(tous.liste.elements.every((a) => a.sort === 'adopte' && a.objet === null)).toBe(true);
    const adoptes = await depot.amendements(agricole, { sort: 'adopte' }, { page: 1, taille: 100 });
    expect(adoptes.liste.total).toBe(compte!.adoptes);
    const rejetes = await depot.amendements(agricole, { sort: 'rejete' }, { page: 2, taille: 10 });
    expect(rejetes.liste.elements.every((a) => a.sort === 'rejete')).toBe(true);
    const fin = await depot.amendements(agricole, {}, { page: Math.ceil(compte!.n / 100), taille: 100 });
    expect(fin.liste.suivante).toBeNull();
    // parEtape : par case du parcours, seulement si la projection et amendement.etape_id sont chargés.
    if (!projection) expect(tous.parEtape).toEqual([]);
    for (const s of tous.parEtape) expect(s.adoptes).toBeLessThanOrEqual(s.deposes);
  });

  it('amendement AN CE154 (article 4) et amendement Sénat n° 999 (avis publiés)', async () => {
    const an = (await depot.amendement(await entite('AN', 'amendement', 'AMANR5L17PO419610B2632P0D1N000154')))!;
    expect(an).toMatchObject({
      dossier: agricole,
      amendement: { numero: 'CE154', chambre: 'AN' },
      avis: { publies: false },
      exposeEnClair: null,
      provenance: { systeme: 'AN', type: 'amendement', idNatif: 'AMANR5L17PO419610B2632P0D1N000154' },
    });
    expect(an.provenance.url).toBeNull(); // l'archive du jeu n'est pas la page de l'amendement
    expect(an.amendement.auteur).toMatchObject({ type: 'personne', personne: { nom: expect.any(String) } });
    const senat = (await depot.amendement(await entite('SENAT', 'amendement', '1328039')))!;
    expect(senat).toMatchObject({
      amendement: { numero: '999', chambre: 'SENAT', division: 'Article 21', sort: 'non_soutenu' },
      dateDepot: '2026-06-25',
      avis: { publies: true },
      vote: { type: 'sans_vote' },
    });
    // Article suivi : « 21 » s'il est relié (amendement.article_suivi_id), null sinon.
    if (senat.amendement.article) expect(senat.amendement.article.numero).toBe('21');
    expect(senat.cosignataires.total).toBe(senat.cosignataires.personnes.length);
  });

  it('amendement AC127 : versions comparées (dépôt → commission), discuté en commission le 14/01/2026', async () => {
    const debut = Date.now();
    const f = (await depot.amendement(await entite('AN', 'amendement', 'AMANR5L17PO419604B2107P0D1N000127')))!;
    expect(Date.now() - debut).toBeLessThan(1_000);
    expect(f.amendement.numero).toBe('AC127');
    expect(f.dispositif.diff).not.toBeNull();
    expect(f.dispositif.versions).toEqual({
      avant: { etape: { cle: 'depot', libelle: 'Dépôt AN' }, date: '2025-11-18' },
      apres: { etape: { cle: 'commission_1_o', libelle: 'Commission AN' }, date: '2026-01-14' },
    });
    expect(f.discussion).toMatchObject({
      commission: { date: '2026-01-14', compteRendu: { url: 'https://www.assemblee-nationale.fr/dyn/opendata/CRCANR5L17S2026PO419604N031.html', ancre: null } },
      seance: null,
    });
  });

  it('amendement 1076 : séance de discussion publiée (seance_id) le 31/03/2026 et son compte rendu ; CE154 : sans diff, versions null', async () => {
    const f = (await depot.amendement(await entite('AN', 'amendement', 'AMANR5L17PO838901BTC2250P0D1N001076')))!;
    expect(f.dispositif.versions).toEqual({
      avant: { etape: { cle: 'commission_1_s', libelle: 'Commission AN' }, date: '2025-12-17' },
      apres: { etape: { cle: 'seance_1_s', libelle: 'Séance AN' }, date: null },
    });
    expect(f.discussion).toMatchObject({
      commission: null,
      seance: {
        date: '2026-03-31',
        compteRendu: { url: 'https://www.assemblee-nationale.fr/dyn/17/comptes-rendus/seance/CRSANR5L17S2026O1N187', provenance: { systeme: 'AN' } },
      },
    });
    const ce154 = (await depot.amendement(await entite('AN', 'amendement', 'AMANR5L17PO419610B2632P0D1N000154')))!;
    expect(ce154.dispositif).toMatchObject({ diff: null, versions: null });
  });

  it('dates de dépôt et de sort : CE154 déposé le 28/04/2026, tombé le 06/05/2026 ; Sénat n° 999 sans date de sort', async () => {
    const ce154 = await entite('AN', 'amendement', 'AMANR5L17PO419610B2632P0D1N000154');
    const s999 = await entite('SENAT', 'amendement', '1328039');
    const r = await depot.resumesAmendements([ce154, s999]);
    expect(r.get(ce154)).toMatchObject({ numero: 'CE154', sort: 'tombe', dateDepot: '2026-04-28', dateSort: '2026-05-06' });
    expect(r.get(s999)).toMatchObject({ numero: '999', sort: 'non_soutenu', dateDepot: '2026-06-25', dateSort: null });
  });

  it('amendements du projet agricole par sort : dossier entier et Commission AN (base au 31/10/2026)', async () => {
    const a = await depot.amendements(agricole, {}, { page: 1, taille: 1 });
    expect(a.parSort).toEqual({ adopte: 842, rejete: 1728, retire: 516, tombe: 639, non_soutenu: 361, irrecevable: 1176, en_attente: 322 });
    if (!projection) return;
    const commission = a.parEtape.find((e) => e.cle === 'commission_1_o')!;
    expect(commission).toMatchObject({ deposes: 1592, adoptes: 242 });
    expect(commission.parSort).toEqual({ adopte: 242, rejete: 440, retire: 174, tombe: 220, non_soutenu: 80, irrecevable: 435, en_attente: 1 });
    for (const e of a.parEtape) expect(e.parSort!.adopte).toBe(e.adoptes);
  });

  // ----- Rattachements (49.3), effet conditionnel -----

  it('PLF 2026 : trois 49.3 rattachés, chacun avec ses motions de censure (voix pour, sort publié)', async () => {
    if (!projection) return;
    const plf = await entite('AN', 'dossier', 'DLR5L17N52428');
    const p = (await depot.parcours(plf))!;
    const premiere = p.enfants.find((e) => e.dossier.titre.startsWith('Engagement de la responsabilité du Gouvernement sur la première partie'))!;
    expect(premiere).toMatchObject({ etape: 'nouvelle_lecture', etapeLibelle: 'Nouvelle lecture' });
    expect(premiere.scrutins).toEqual([
      expect.objectContaining({ numero: '5154', date: '2026-01-23', nature: 'motion_censure', sort: 'rejeté', adopte: false, pour: 269 }),
      expect.objectContaining({ numero: '5155', date: '2026-01-23', nature: 'motion_censure', sort: 'rejeté', adopte: false, pour: 142 }),
    ]);
    const definitive = p.enfants.find((e) => e.etape === 'lecture_definitive')!;
    expect(definitive.scrutins!.map((s) => [s.numero, s.pour])).toEqual([['5284', 260], ['5285', 135]]);
    expect(p.enfants).toHaveLength(3);
    // Le modèle loi ordinaire définit l'effet du 49.3 si une motion est adoptée : fin du parcours.
    expect(p.deviations.filter((d) => d.cle === 'engagement_responsabilite').every((d) => d.effetSi === 'termine')).toBe(true);
    // Vu du 49.3 : le même rattachement, les mêmes motions.
    const enfant = (await depot.parcours(premiere.dossier.id))!;
    expect(enfant.parent).toMatchObject({ dossier: { id: plf, titre: 'Projet de loi de finances pour 2026' }, etape: 'nouvelle_lecture' });
    expect(enfant.parent!.scrutins!.map((s) => s.numero)).toEqual(['5154', '5155']);
    // Procédure accélérée : aucun effet conditionnel dans le modèle.
    expect((await depot.parcours(agricole))!.deviations[0].effetSi).toBeNull();
  });

  // ----- Personnes d'une étape -----

  it('personnes des étapes du projet agricole : auteurs au dépôt, rapporteurs en commission, CMP présidée par Dominique Estrosi Sassone', async () => {
    if (!projection) return;
    const nom = (p: { qui: { type: string } & Record<string, any> }) => (p.qui.type === 'personne' ? p.qui.personne.nom : p.qui.nom);
    const parRole = (liste: { role: string; qui: any }[], role: string) => liste.filter((p) => p.role === role).map(nom);
    const depotAn = (await depot.etape(agricole, 'depot'))!;
    expect(depotAn.modele).toMatchObject({ cle: 'loi_ordinaire', famille: 'legislatif' });
    expect(parRole(depotAn.personnes!, 'auteur')).toEqual(['Sébastien Lecornu', 'Annie Genevard']);
    const commission = (await depot.etape(agricole, 'commission_1_o'))!;
    expect(parRole(commission.personnes!, 'rapporteur').sort()).toEqual(['Jean-René Cazeneuve', 'Julien Dive']);
    expect(parRole(commission.personnes!, 'rapporteur_avis').sort()).toEqual(['Nathalie Coggia', 'Xavier Roseren']);
    expect(commission.personnes!.find((p) => nom(p) === 'Nathalie Coggia')!.detail).toContain('rapporteure pour avis');
    const cmp = (await depot.etape(agricole, 'cmp'))!;
    expect(parRole(cmp.personnes!, 'president')).toEqual(['Dominique Estrosi Sassone']);
    expect(cmp.personnes!.find((p) => p.role === 'president')!.detail).toContain('Présidente');
    expect(parRole(cmp.personnes!, 'membre')).toHaveLength(14);
    // 49.3 sur la première partie du PLF 2026 : l'initiateur est Premier ministre ce jour-là.
    const premiere = (await depot.parcours(await entite('AN', 'dossier', 'DLR5L17N52428')))!.enfants.find((e) => e.etape === 'nouvelle_lecture')!;
    const declaration = (await depot.etape(premiere.dossier.id, 'declaration'))!;
    expect(declaration.modele?.cle).toBe('responsabilite_gouvernement');
    expect(parRole(declaration.personnes!, 'premier_ministre')).toEqual(['Sébastien Lecornu']);
  });

  it('commission d’enquête TikTok : 29 membres publiés, présidée par Arthur Delaporte, rapporteure Laure Miller', async () => {
    const tiktok = (await db.first<{ id: string }>(
      `SELECT entite_id AS id FROM canon.dossier WHERE titre = 'Commission d’enquête sur les effets psychologiques de TikTok sur les mineurs'`,
    ))!.id;
    const chiffres = Object.fromEntries((await depot.chiffres(tiktok)).map((c) => [c.libelle, c]));
    expect(chiffres.Membres.valeur).toBe(29);
    const membres = (await depot.acteurs(tiktok)).find((g) => g.role === 'membres')!;
    expect(membres.total).toBe(29);
    expect(membres.acteurs[0]).toMatchObject({ qui: { personne: { nom: 'Arthur Delaporte' } } });
    expect(membres.acteurs[0].role).toContain('Président');
    if (!projection) return;
    const nomination = (await depot.etape(tiktok, 'nomination'))!;
    expect(nomination.modele?.cle).toBe('commission_enquete');
    const nom = (p: { qui: any }) => p.qui.personne.nom;
    expect(nomination.personnes!.filter((p) => p.role === 'president').map(nom)).toEqual(['Arthur Delaporte']);
    expect(nomination.personnes!.filter((p) => p.role === 'rapporteur').map(nom)).toEqual(['Laure Miller']);
  });

  // ----- Acteurs, chiffres -----

  it('acteurs du projet agricole : Gouvernement, rapporteurs, CMP présidée par Dominique Estrosi Sassone', async () => {
    const groupes = await depot.acteurs(agricole);
    const g = Object.fromEntries(groupes.map((x) => [x.role, x]));
    const noms = (role: string) => (g[role]?.acteurs ?? []).map((a) => (a.qui.type === 'personne' ? a.qui.personne.nom : a.qui.nom));
    expect(noms('gouvernement')).toEqual(expect.arrayContaining(['Annie Genevard']));
    expect(noms('rapporteur')).toEqual(expect.arrayContaining(['Julien Dive', 'Jean-René Cazeneuve', 'Laurent Duplomb', 'Pierre Cuypers']));
    expect(noms('cmp')[0]).toBe('Dominique Estrosi Sassone');
    expect(g.cmp.total).toBe(noms('cmp').length);
    expect(g.auteurs_amendements.acteurs).toHaveLength(5);
    expect(g.auteurs_amendements.acteurs.every((a) => a.activite?.libelle === 'Amendements')).toBe(true);
    expect(g.auteur).toBeUndefined(); // projet de loi : pas d'auteur parlementaire
    expect(g.auditionnes).toBeUndefined(); // canon.audition vide au 24/10/2026
    // Une personne auditionnée n'est jamais rapprochée par son nom : rien d'autre qu'un nom publié sans personne_id.
    expect(groupes.every((x) => x.acteurs.length > 0)).toBe(true);
  });

  it('chiffres clés : comptes de la base ; étapes et durée seulement avec la projection', async () => {
    const c = Object.fromEntries((await depot.chiffres(agricole)).map((x) => [x.libelle, x]));
    const scrutins = (await db.first<{ n: number }>(`SELECT count(*)::int AS n FROM canon.scrutin WHERE dossier_id = $id`, { $id: agricole }))!.n;
    expect(c['Scrutins publics'].valeur).toBe(scrutins);
    expect(c['Amendements adoptés'].valeur).toBeLessThan(c['Amendements déposés'].valeur as number);
    expect(c['Interventions en séance'].valeur).toBeGreaterThan(10_000);
    if (!projection) {
      expect(c['Étapes franchies']).toBeUndefined();
      expect(c['Durée d’examen']).toBeUndefined();
    } else {
      expect(c['Étapes franchies']).toMatchObject({ valeur: 11, detail: 'sur 11 étapes' });
      expect(c['Durée d’examen']).toMatchObject({ valeur: '133 jours', detail: 'du 08/04/2026 au 19/08/2026' });
    }
  });

  // ----- Listes -----

  it('liste des dossiers de la 17e : facettes, filtre par origine, thème sans résultat', async () => {
    const enBase = (await db.first<{ n: number; gouv: number }>(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE initiative = 'gouvernement')::int AS gouv FROM canon.dossier d
       JOIN canon.entite x ON x.entite_id = d.entite_id
       WHERE d.legislature = '17' AND x.retiree_de_la_source_le IS NULL AND x.fusionnee_dans IS NULL`,
    ))!;
    const l = await depot.lister({}, { page: 1, taille: 10 });
    expect(l.dossiers.total).toBe(enBase.n);
    expect(l.dossiers.elements).toHaveLength(10);
    expect(l.facettes.themes).toEqual([]);
    expect(l.facettes.origines.find((o) => o.valeur === 'gouvernement')?.nombre).toBe(enBase.gouv);
    expect(l.dossiers.elements.every((d) => d.theme === null && d.titreEnClair === null)).toBe(true);
    const gouv = await depot.lister({ origine: 'gouvernement' }, { page: 1, taille: 50 });
    expect(gouv.dossiers.total).toBe(enBase.gouv);
    expect(gouv.dossiers.elements.every((d) => d.origine === 'gouvernement')).toBe(true);
    expect((await depot.lister({ theme: 'energie' }, { page: 1, taille: 10 })).dossiers).toMatchObject({ elements: [], total: 0 });
    if (!projection) {
      // canon.dossier.statut toujours null : aucun état sans la projection.
      expect(l.facettes.etats).toEqual([]);
      expect(l.dossiers.elements.every((d) => d.barre.length === 0 && d.etat === null)).toBe(true);
    } else {
      const promulgues = await depot.lister({ etat: 'promulgue' }, { page: 1, taille: 100 });
      expect(promulgues.dossiers.elements.every((d) => d.etat === 'promulgue')).toBe(true);
      expect(l.facettes.etats.find((e) => e.valeur === 'promulgue')?.nombre).toBe(promulgues.dossiers.total);
    }
  });

  it('dossiers à suivre (Accueil) : échéance ou étape courante (vide sans projection)', async () => {
    const a = await depot.aSuivre(8);
    if (!projection) return expect(a).toEqual([]);
    expect(a.length).toBeLessThanOrEqual(8);
    expect(a.every((d) => d.barre.length > 0 && (d.prochaineEcheance !== null || d.etapeCourante !== null))).toBe(true);
    // Promulgués au 24/10/2026 : ni étape courante ni échéance, donc pas à suivre.
    expect(a.some((d) => d.id === agricole || d.id === finDeVie)).toBe(false);
    const echeances = a.flatMap((d) => (d.prochaineEcheance ? [d.prochaineEcheance.date] : []));
    expect(echeances).toEqual([...echeances].sort());
  });

  it('Accueil, un jour : dossiers sans parent qui y ont un acte, décidés ou qui avancent ; jours datés', async () => {
    const jours = await depot.joursActifs('2026-09-28', '2026-11-15');
    if (!projection) {
      expect(jours).toEqual([]);
      return expect(await depot.duJour('2026-10-14', 5)).toEqual({ decides: [], avancent: [] });
    }
    expect(jours).toEqual([...jours].sort());
    expect(jours.every((j) => j >= '2026-09-28' && j <= '2026-11-15')).toBe(true);
    const jour = jours.at(-1);
    if (!jour) return;
    const { decides, avancent } = await depot.duJour(jour, 5);
    expect(decides.length + avancent.length).toBeGreaterThan(0);
    expect(decides.length).toBeLessThanOrEqual(5);
    expect([...decides, ...avancent].every((d) => d.parent === null)).toBe(true);
    expect(decides.some((d) => avancent.some((x) => x.id === d.id))).toBe(false);
  });

  it('résumé compact (Accueil) : lieu et début de chaque case, déviations du parcours', async () => {
    if (!projection) return;
    const [agri] = await depot.resumesDe([agricole]);
    const caseDe = (cle: string) => agri.barre.find((c) => c.cle === cle);
    // Dépôt AN le 08/04/2026 (lieu AN), CMP, vote du texte de la CMP aux deux chambres (« AN+SENAT » : null), Conseil, JO.
    expect(caseDe('depot')).toMatchObject({ lieu: 'AN', debut: '2026-04-08' });
    expect(caseDe('commission_1_s')).toMatchObject({ lieu: 'SENAT', debut: '2026-06-03' });
    expect(caseDe('cmp')).toMatchObject({ lieu: 'CMP', debut: '2026-07-06' });
    expect(caseDe('conclusions_cmp')).toMatchObject({ lieu: null, debut: '2026-07-20' });
    expect(caseDe('cc')).toMatchObject({ lieu: 'CC', debut: '2026-07-24' });
    expect(caseDe('promulgation')).toMatchObject({ lieu: 'PR', debut: '2026-08-18' });
    expect(caseDe('jo')).toMatchObject({ lieu: 'JO', debut: '2026-08-19' });
    expect(caseDe('lecture_2_o')).toMatchObject({ lieu: 'AN', debut: null, etat: 'sans_objet' });
    expect(agri.deviations).toEqual([{ cle: 'procedure_acceleree', libelle: 'Procédure accélérée', etape: 'depot', issue: null }]);

    // PLF 2026 : deux 49.3, en nouvelle lecture et en lecture définitive (issue du modèle : rejeté si censure).
    const [plf] = await depot.resumesDe([await entite('AN', 'dossier', 'DLR5L17N52428')]);
    expect(plf.titreOfficiel).toBe('Projet de loi de finances pour 2026');
    expect(plf.deviations).toEqual([
      { cle: 'engagement_responsabilite', libelle: 'Engagement de la responsabilité du Gouvernement (49.3)', etape: 'nouvelle_lecture', issue: 'rejete' },
      { cle: 'engagement_responsabilite', libelle: 'Engagement de la responsabilité du Gouvernement (49.3)', etape: 'lecture_definitive', issue: 'rejete' },
    ]);

    // Étape en cours datée : la séance AN des jeunes majeurs de l'ASE, depuis le 29/10/2026.
    const [ase] = await depot.resumesDe([await entite('AN', 'dossier', 'DLR5L17N54298')]);
    expect(ase.barre.find((c) => c.courante)).toMatchObject({ cle: 'seance_1_o', libelle: 'Séance AN', lieu: 'AN', debut: '2026-10-29' });
  });

  it('réunions du jour par chambre : commissions et séances ; commissions du Sénat non publiées (null)', async () => {
    expect(await depot.reunionsDuJour('2026-10-27')).toEqual([
      { chambre: 'AN', commissions: 9, seances: 3 },
      { chambre: 'SENAT', commissions: null, seances: 1 },
    ]);
    expect(await depot.reunionsDuJour('2026-10-27', { chambres: ['SENAT'], dossiers: null })).toEqual([
      { chambre: 'SENAT', commissions: null, seances: 1 },
    ]);
    expect(await depot.reunionsDuJour('2026-10-27', { chambres: [], dossiers: null })).toEqual([]);
    // PLF 2027 à l'ordre du jour de deux séances et d'une commission de l'AN ce jour-là.
    const plf2027 = await entite('AN', 'dossier', 'DLR5L17N54629');
    expect((await depot.resumesDe([plf2027]))[0].titreOfficiel).toBe('Projet de loi de finances pour 2027');
    expect(await depot.reunionsDuJour('2026-10-27', { chambres: null, dossiers: [plf2027] })).toEqual([
      { chambre: 'AN', commissions: 1, seances: 2 },
      { chambre: 'SENAT', commissions: null, seances: 0 },
    ]);
  });

  it('Accueil filtré : chambre de séance des actes, dossiers suivis ; une liste vide ne garde rien', async () => {
    if (!projection) return;
    const tous = await depot.duJour('2026-10-27', 100);
    const senat = await depot.duJour('2026-10-27', 100, { chambres: ['SENAT'], dossiers: null });
    const ids = (r: typeof tous) => [...r.decides, ...r.avancent].map((d) => d.id);
    expect(ids(senat).length).toBeGreaterThan(0);
    expect(ids(senat).length).toBeLessThan(ids(tous).length);
    expect(ids(senat).every((id) => ids(tous).includes(id))).toBe(true);
    const un = ids(senat)[0];
    expect(ids(await depot.duJour('2026-10-27', 100, { chambres: null, dossiers: [un] }))).toEqual([un]);
    expect(await depot.duJour('2026-10-27', 100, { chambres: null, dossiers: [] })).toEqual({ decides: [], avancent: [] });

    const jours = await depot.joursActifs('2026-10-01', '2026-10-31');
    const joursSenat = await depot.joursActifs('2026-10-01', '2026-10-31', { chambres: ['SENAT'], dossiers: null });
    expect(joursSenat).toContain('2026-10-27');
    expect(joursSenat.every((j) => jours.includes(j))).toBe(true);
    expect(await depot.joursActifs('2026-10-01', '2026-10-31', { chambres: null, dossiers: [] })).toEqual([]);
  });

  it('projets de loi déposés par le Gouvernement depuis le 1er avril 2026, le plus récent d’abord', async () => {
    const r = await depot.deposesParLeGouvernement('2026-04-01', 50);
    expect(r.total).toBeGreaterThanOrEqual(r.dossiers.length);
    expect(r.dossiers.every((d) => d.origine === 'gouvernement' && d.nature === 'projet')).toBe(true);
    const agri = r.dossiers.find((d) => d.id === agricole);
    expect(agri).toMatchObject({ procedure: 'acceleree', type: 'Projet de loi ordinaire' });
    if (projection) expect(agri).toMatchObject({ etat: 'promulgue', dernierEvenement: expect.objectContaining({ date: '2026-08-18' }) });
    else expect(agri).toMatchObject({ etat: null, barre: [], dernierEvenement: null });
  });
});
