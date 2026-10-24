// PgPersonnes sur la vraie base, en lecture seule (DATABASE_URL_LECTURE ; sautés sinon). Personnes
// réelles citées par la doc des sources (opendata/docs/sources/*.md) : Franck Allisio (PA793432),
// Gabriel Amard (PA794906, sénateur 20684B depuis le 01/10/2026, fiches fusionnées par la suite de
// chargement), Xavier Breton (PA330008), Julien Dive (rapporteur de DLR5L17N54085).
// Écrits pour tenir avant et après la fusion des fiches Sénat et la recréation des projections :
// ce qui dépend de l'état du chargement est conditionné à cet état, lu dans la base.

import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import type { Indicateur, Provenance } from '@contrat/domain/model';
import { PgPersonnes, debutDouzeMois } from '../../src/infra/pg/personnes';
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

const LENT = 180_000;

describe.skipIf(!URL_LECTURE)('PgPersonnes (base réelle, lecture seule)', () => {
  const { db, fermer } = base(URL_LECTURE ?? '');
  afterAll(fermer);
  const depot = new PgPersonnes(db);

  /** Entité canon d'un identifiant natif (correspondance VERIFIED). */
  const entite = async (systeme: string, type: string, id: string) =>
    (
      await db.first<{ id: string }>(
        `SELECT entite_id::text AS id FROM canon.correspondance WHERE systeme = $s AND type_source = $t AND id_source = $i AND statut = 'VERIFIED'`,
        { s: systeme, t: type, i: id },
      )
    )?.id ?? null;
  const dossier = (id: string) => entite('AN', 'dossier', id);
  const aProvenance = (p: Provenance) => {
    expect(p.idNatif).toBeTruthy();
    expect(['AN', 'SENAT', 'LEGIFRANCE', 'CONSTIT', 'HATVP', 'RNE', 'INSEE', 'CIVICTRACE']).toContain(p.systeme);
  };
  const indicateurComplet = (i: Indicateur) => {
    expect(i.reference.libelle).toBeTruthy();
    expect(i.ceQueLaDonneeNeDitPas.length).toBeGreaterThan(0);
    expect(i.calcul).toMatch(/^lecture\./);
    if (i.unite === 'pourcentage') {
      expect(i.denominateur).not.toBeNull();
      expect(i.valeur).toBeGreaterThanOrEqual(0);
      expect(i.valeur).toBeLessThanOrEqual(100);
    }
  };

  it('en-tête de Franck Allisio : député en cours, groupe RN, identités AN et HATVP', async () => {
    const id = (await entite('AN', 'acteur', 'PA793432'))!;
    const e = (await depot.entete(id))!;
    expect(e).toMatchObject({ id, identite: 'personne', nom: 'Franck Allisio', civilite: 'M.' });
    expect(e.enCours.map((x) => x.libelle)).toContain('Député · Bouches-du-Rhône, 12e circonscription');
    expect(e.enCours.find((x) => x.groupe)?.groupe).toMatchObject({ abrege: 'RN', chambre: 'AN' });
    expect(e.provenance).toContainEqual({
      systeme: 'AN',
      type: 'acteur',
      idNatif: 'PA793432',
      url: 'https://www.assemblee-nationale.fr/dyn/deputes/PA793432',
    });
    expect(e.provenance.map((p) => `${p.systeme}:${p.idNatif}`)).toContain('HATVP:allisio-franck-24180');
  });

  it("annuaire : le député et sa fiche RNE homonyme restent distincts tant que la revue ne les a pas reliés", async () => {
    const id = (await entite('AN', 'acteur', 'PA793432'))!;
    const a = await depot.annuaire({ q: 'ALLISIO' }, { page: 1, taille: 20 });
    const personne = a.personnes.elements.find((x) => x.id === id)!;
    expect(personne).toMatchObject({ identite: 'personne', role: 'depute', source: 'AN', nom: 'Franck Allisio' });
    expect(personne.fonction).toBe('Député · Bouches-du-Rhône, 12e circonscription · RN');
    expect(personne.groupe?.couleur).toMatch(/^#/);
    // Fiches RNE locales au nom d'Allisio : seules si `personne_id` est vide, jamais fondues par le nom.
    const fiches = await db.all<{ id: string; personne_id: string | null }>(
      `SELECT entite_id::text AS id, personne_id::text FROM canon.mandat_rne
       WHERE lower(nom) = 'allisio' AND type_mandat IN ('maire', 'conseiller_communautaire')`,
    );
    for (const f of fiches) {
      const element = a.personnes.elements.find((x) => x.id === f.id);
      if (f.personne_id) expect(element).toBeUndefined();
      else expect(element).toMatchObject({ identite: 'fiche_rne', role: 'elu_local', source: 'RNE', groupe: null });
    }
    expect(a.personnes.total).toBe(a.personnes.elements.length);
    // Effectifs en fonction aujourd'hui.
    const effectifs = Object.fromEntries(a.effectifs.map((x) => [x.role, x.nombre]));
    expect(effectifs.depute).toBeGreaterThan(550);
    expect(effectifs.depute).toBeLessThanOrEqual(577);
    expect(effectifs.senateur).toBeGreaterThan(300);
    expect(effectifs.senateur).toBeLessThanOrEqual(348);
    expect(effectifs.gouvernement).toBeGreaterThan(10);
  }, LENT);

  it('annuaire : filtre par rôle, sans accents ni casse, paginé', async () => {
    const senateurs = await depot.annuaire({ role: 'senateur', q: 'amard' }, { page: 1, taille: 5 });
    expect(senateurs.personnes.elements.map((x) => x.nom)).toContain('Gabriel Amard');
    expect(senateurs.personnes.elements.every((x) => x.role === 'senateur' && x.source === 'SENAT')).toBe(true);
    const deputes = await depot.annuaire({ role: 'depute' }, { page: 2, taille: 10 });
    expect(deputes.personnes).toMatchObject({ page: 2, taille: 10, suivante: 3 });
    expect(deputes.personnes.elements).toHaveLength(10);
    expect(deputes.personnes.total).toBe(deputes.effectifs.find((x) => x.role === 'depute')!.nombre);
    const accents = await depot.annuaire({ q: 'genevard' }, { page: 1, taille: 5 });
    const sansAccent = await depot.annuaire({ q: 'GENEVÀRD' }, { page: 1, taille: 5 });
    expect(sansAccent.personnes.elements.map((x) => x.id)).toEqual(accents.personnes.elements.map((x) => x.id));
    const locaux = await depot.annuaire({ role: 'elu_local', q: 'evalet taponat' }, { page: 1, taille: 5 });
    expect(locaux.personnes.elements.every((x) => x.source === 'RNE' && x.role === 'elu_local')).toBe(true);
  }, LENT);

  it("annuaire « Tous » : d'abord les fonctions nationales en cours, puis les élus locaux du RNE", async () => {
    const nationale = (x: { role: string }) => x.role !== 'elu_local';
    const premiere = await depot.annuaire({}, { page: 1, taille: 20 });
    expect(premiere.personnes.elements).toHaveLength(20);
    expect(premiere.personnes.elements.some((x) => x.identite === 'fiche_rne')).toBe(false);
    expect(premiere.personnes.elements.every(nationale)).toBe(true);
    expect(premiere.personnes.elements.some((x) => x.role === 'depute')).toBe(true);
    // Total inchangé par l'ordre : chaque personne une fois (rôle prioritaire), plus chaque fiche RNE seule.
    const effectifs = Object.fromEntries(premiere.effectifs.map((x) => [x.role, x.nombre]));
    expect(premiere.personnes.total).toBeGreaterThan(effectifs.elu_local);
    // Pages voisines de la bascule entre blocs (environ 950 personnes nationales : 577 députés,
    // 348 sénateurs, le Gouvernement, moins les cumuls) : mêmes lignes qu'une grande page, sans doublon.
    const pages = await Promise.all(Array.from({ length: 10 }, (_, i) => depot.annuaire({}, { page: 41 + i, taille: 20 })));
    const enchainees = pages.flatMap((p) => p.personnes.elements);
    const grande = await depot.annuaire({}, { page: 5, taille: 200 });
    expect(enchainees.map((x) => x.id)).toEqual(grande.personnes.elements.map((x) => x.id));
    expect(new Set(enchainees.map((x) => x.id)).size).toBe(200);
    expect(pages.every((p) => p.personnes.total === premiere.personnes.total)).toBe(true);
    // Un seul passage du bloc national au bloc local.
    const blocs = enchainees.map(nationale);
    expect(blocs.indexOf(false)).toBeGreaterThan(0);
    expect(blocs.slice(blocs.indexOf(false)).every((b) => !b)).toBe(true);
  }, LENT);

  it('annuaire : la recherche garde les blocs, un parlementaire homonyme passe avant les fiches RNE (« Abad »)', async () => {
    const a = await depot.annuaire({ q: 'Abad' }, { page: 1, taille: 50 });
    const elements = a.personnes.elements;
    const premiereRne = elements.findIndex((x) => x.identite === 'fiche_rne');
    expect(premiereRne).toBeGreaterThan(0);
    expect(elements.slice(0, premiereRne).every((x) => x.role !== 'elu_local')).toBe(true);
    expect(elements.slice(premiereRne).every((x) => x.role === 'elu_local')).toBe(true);
    // Audrey Abadie-Amiel, députée en cours : en tête, devant les fiches RNE « ABAD », « ABADIA »…
    expect(elements[0]).toMatchObject({ identite: 'personne', role: 'depute', nom: 'Audrey Abadie-Amiel' });
    // La fiche RNE « Damien ABAD » (conseiller communautaire) reste une fiche RNE : la revue ne l'a pas
    // reliée, rien n'est fondu par le nom.
    const ficheAbad = elements.find((x) => x.identite === 'fiche_rne' && x.nom === 'Damien ABAD');
    expect(ficheAbad).toMatchObject({ role: 'elu_local', source: 'RNE', groupe: null });
    // Damien Abad, ancien député (fiche personne AN) : l'annuaire ne liste que les fonctions en cours.
    // S'il y figure (fonction nationale en cours), c'est avant la fiche RNE.
    const personne = await db.first<{ id: string }>(
      `SELECT entite_id::text AS id FROM canon.personne WHERE nom_affiche = 'Damien Abad'`,
    );
    const iPersonne = elements.findIndex((x) => x.id === personne?.id);
    if (iPersonne >= 0) expect(iPersonne).toBeLessThan(elements.indexOf(ficheAbad!));
  }, LENT);

  it('Gabriel Amard : identités AN et Sénat, frise député puis sénateur, sans doublon de source (après fusion)', async () => {
    const id = (await entite('AN', 'acteur', 'PA794906'))!;
    const senat = await entite('SENAT', 'senateur', '20684B');
    const frise = await depot.fonctions(id);
    const deputes = frise.filter((f) => f.type === 'depute');
    expect(deputes.map((f) => [f.titre, f.debut, f.fin])).toContainEqual(['Député · Rhône, 6e circonscription', '2024-07-08', '2026-09-30']);
    expect(deputes.every((f) => f.source === 'AN' && f.provenance.systeme === 'AN')).toBe(true);
    for (const f of frise) aProvenance(f.provenance);
    expect(frise.map((f) => f.debut ?? '')).toEqual([...frise.map((f) => f.debut ?? '')].sort());
    if (senat === id) {
      // Fusion faite : une seule personne, ses deux identités natives.
      const e = (await depot.entete(id))!;
      expect(e.provenance.map((p) => `${p.systeme}:${p.idNatif}`)).toEqual(expect.arrayContaining(['AN:PA794906', 'SENAT:20684B']));
      const senateur = frise.filter((f) => f.type === 'senateur');
      expect(senateur).toHaveLength(1);
      expect(senateur[0]).toMatchObject({ debut: '2026-10-01', fin: null, source: 'SENAT' });
      expect(e.enCours[0].libelle).toBe('Sénateur');
      // L'entité absorbée est ignorée (G2).
      const absorbee = await db.first<{ id: string }>(`SELECT entite_id::text AS id FROM canon.entite WHERE fusionnee_dans = $id LIMIT 1`, { id });
      if (absorbee) {
        expect(await depot.entete(absorbee.id)).toBeNull();
        expect(await depot.fonctions(absorbee.id)).toEqual([]);
      }
    } else if (senat) {
      // Avant la fusion : deux fiches distinctes, jamais reliées par le nom.
      expect((await depot.entete(senat))?.provenance.map((p) => p.systeme)).not.toContain('AN');
    }
  }, LENT);

  it('fiche RNE seule (député 0101, Xavier Breton) : jamais rattachée au député par le nom', async () => {
    const breton = (await entite('AN', 'acteur', 'PA330008'))!;
    const fiche = await db.first<{ id: string; personne_id: string | null }>(
      `SELECT m.entite_id::text AS id, m.personne_id::text FROM canon.mandat_rne m
       JOIN canon.correspondance c ON c.entite_id = m.entite_id AND c.statut = 'VERIFIED'
       WHERE c.systeme = 'RNE' AND c.type_source = 'mandat' AND c.id_source = 'depute:0101:2024-07-08'`,
    );
    if (!fiche) return; // RNE pas encore chargé
    const e = (await depot.entete(fiche.id))!;
    if (fiche.personne_id === null) {
      expect(e).toMatchObject({ id: fiche.id, identite: 'fiche_rne', nom: 'Xavier BRETON', civilite: null });
      expect(e.provenance[0]).toMatchObject({ systeme: 'RNE', type: 'mandat', idNatif: 'depute:0101:2024-07-08' });
      const frise = await depot.fonctions(fiche.id);
      expect(frise).toHaveLength(1);
      expect(frise[0]).toMatchObject({ type: 'depute', source: 'RNE', debut: '2024-07-08' });
      expect(frise[0].rattachement).toBeUndefined();
      // Le député, lui, n'a aucun mandat RNE dans sa frise.
      expect((await depot.fonctions(breton)).some((f) => f.source === 'RNE')).toBe(false);
    } else {
      // Rattachée par une décision de revue : la fiche renvoie à la personne, avec le rattachement.
      expect(e.identite).toBe('personne');
      const rne = (await depot.fonctions(fiche.personne_id)).filter((f) => f.source === 'RNE');
      expect(rne.every((f) => f.rattachement?.methode === 'revue_humaine')).toBe(true);
    }
    const d = (await depot.fonctions(breton)).find((f) => f.type === 'depute' && f.fin === null)!;
    expect(d).toMatchObject({ titre: 'Député · Ain, 1e circonscription', source: 'AN' });
  });

  it('choix de Franck Allisio : participation et écarts comparés à son groupe, présence en commission', async () => {
    const id = (await entite('AN', 'acteur', 'PA793432'))!;
    const c = await depot.choix(id);
    expect(c.themes).toEqual([]);
    const participation = c.indicateurs.find((i) => i.libelle.startsWith('Participation'))!;
    expect(participation).toMatchObject({ unite: 'pourcentage', denominateur: { libelle: 'scrutins publics pendant son mandat' } });
    expect(participation.denominateur!.valeur).toBeGreaterThan(100);
    expect(participation.reference.libelle).toContain('(RN)');
    expect(participation.reference.valeur).not.toBeNull();
    const ecarts = c.indicateurs.find((i) => i.libelle.startsWith('Écarts'))!;
    expect(ecarts).toMatchObject({ unite: 'nombre', denominateur: { libelle: 'votes en groupe' } });
    expect(ecarts.valeur).toBeLessThanOrEqual(ecarts.denominateur!.valeur);
    // Fenêtre de 12 mois qui finit au dernier scrutin AN chargé.
    const fin = (await db.first<{ fin: string }>(`SELECT to_char(max(date), 'YYYY-MM-DD') AS fin FROM canon.scrutin WHERE chambre = 'AN'`))!.fin;
    expect(participation.periode).toEqual({ debut: debutDouzeMois(fin), fin });
    for (const i of c.indicateurs) indicateurComplet(i);
    const commission = c.indicateurs.filter((i) => i.calcul === 'lecture.indicateur_commission');
    for (const i of commission) expect(i.reference.libelle).toContain('même commission');
  }, LENT);

  it("choix d'un membre du Gouvernement sans mandat parlementaire : note, aucun vote mesuré", async () => {
    const membre = await db.first<{ id: string }>(
      `SELECT f.personne_id::text AS id FROM canon.fonction f JOIN canon.organisation o ON o.entite_id = f.organisation_id
       WHERE o.type = 'ministere' AND f.type = 'membre_gouvernement' AND f.qualite = 'Ministre' AND f.fin IS NULL
         AND NOT EXISTS (SELECT 1 FROM canon.fonction m WHERE m.personne_id = f.personne_id AND m.type IN ('depute', 'senateur'))
         AND o.parent_id = (SELECT entite_id FROM canon.organisation WHERE type = 'gouvernement' AND fin IS NULL ORDER BY debut DESC LIMIT 1)
       ORDER BY f.debut LIMIT 1`,
    );
    if (!membre) return;
    const c = await depot.choix(membre.id);
    expect(c.note).toContain('Gouvernement');
    expect(c.indicateurs.filter((i) => i.calcul !== 'lecture.indicateur_commission')).toEqual([]);
  });

  it('rôles de Xavier Breton dans les dossiers', async () => {
    const id = (await entite('AN', 'acteur', 'PA330008'))!;
    const roles = await depot.roles(id);
    const parType = Object.fromEntries(roles.map((r) => [r.type, r]));
    expect(parType.amendements.nombre).toBeGreaterThan(50);
    expect(parType.amendements.detail).toMatch(/adoptés au total/);
    expect(parType.cosignataire.nombre).toBeGreaterThan(parType.amendements.nombre);
    expect(parType.interventions.nombre).toBeGreaterThan(0);
    expect(parType.rapporteur.nombre).toBeGreaterThanOrEqual(1);
    expect(roles.every((r) => r.nombre > 0)).toBe(true);
    // canon.question vide avant le chargement des questions AN : pas de ligne « questions » inventée.
    const questions = await db.first<{ n: number }>(`SELECT count(*)::int AS n FROM canon.question WHERE auteur_id = $id AND type IN ('QG', 'QE', 'QOSD')`, { id });
    expect(roles.some((r) => r.type === 'questions')).toBe((questions?.n ?? 0) > 0);
  }, LENT);

  it('questions : page triée, chacune avec sa source AN (vide tant que canon.question ne l’est pas)', async () => {
    const id = (await entite('AN', 'acteur', 'PA330008'))!;
    const p = await depot.questions(id, { page: 1, taille: 5 });
    const n = (await db.first<{ n: number }>(`SELECT count(*)::int AS n FROM canon.question WHERE auteur_id = $id AND type IN ('QG', 'QE', 'QOSD')`, { id }))!.n;
    expect(p).toMatchObject({ page: 1, taille: 5, total: n, suivante: n > 5 ? 2 : null });
    for (const q of p.elements) {
      expect(['QG', 'QE', 'QOSD']).toContain(q.type);
      expect(q.provenance).toMatchObject({ systeme: 'AN', type: 'question' });
      expect(q.provenance.idNatif).toMatch(/^QANR5L17Q/);
    }
    const dates = p.elements.map((q) => q.date ?? '');
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('actes de Julien Dive sur DLR5L17N54085 : rapporteur, amendements, vote sur l’ensemble', async () => {
    const id = (await db.first<{ id: string }>(
      `SELECT p.entite_id::text AS id FROM canon.personne p WHERE p.nom = 'Dive' AND p.prenom = 'Julien'
         AND EXISTS (SELECT 1 FROM canon.entite e WHERE e.entite_id = p.entite_id AND e.fusionnee_dans IS NULL)`,
    ))!.id;
    const d = (await dossier('DLR5L17N54085'))!;
    const actes = await depot.actesSurLeDossier(id, d);
    const rapporteur = actes.filter((a) => a.type === 'rapporteur').map((a) => a.libelle);
    expect(rapporteur).toEqual(expect.arrayContaining(['Rapporteur au fond en 1re lecture à l’Assemblée', 'Rapporteur de la commission mixte paritaire']));
    const vote = actes.find((a) => a.type === 'vote' && a.provenance.idNatif === 'VTANR5L17V7259')!;
    expect(vote.libelle).toBe('Sur l’ensemble (AN, scrutin n° 7259 du 02/06/2026) : a voté pour');
    expect(vote.vers.type).toBe('scrutin');
    expect(actes.find((a) => a.type === 'amendements')?.vers.type).toBe('amendement');
    for (const a of actes) aProvenance(a.provenance);
    expect(await depot.actesSurLeDossier(id, (await dossier('DLR5L17N51670'))!)).not.toContainEqual(expect.objectContaining({ type: 'rapporteur' }));
  });

  it('classement AN par écarts : au moins 20 votes en groupe, ordre par taux, même référence pour tous', async () => {
    const c = await depot.classement({ chambre: 'AN', critere: 'ecarts', ordre: 'desc', limite: 10 });
    expect(c.themesAppliques).toEqual([]);
    expect(c.lignes.map((l) => l.rang)).toEqual(c.lignes.map((_, i) => i + 1));
    const taux = c.lignes.map((l) => l.indicateur.valeur / l.indicateur.denominateur!.valeur);
    expect(taux).toEqual([...taux].sort((a, b) => b - a));
    expect(c.lignes.every((l) => l.indicateur.denominateur!.valeur >= 20)).toBe(true);
    expect(new Set(c.lignes.map((l) => l.indicateur.reference.valeur)).size).toBe(1);
    expect(c.lignes[0].indicateur.periode).toEqual(c.periode);
    for (const l of c.lignes) indicateurComplet(l.indicateur);
  }, LENT);

  it('classements AN par participation et par positions : indicateurs complets', async () => {
    for (const critere of ['absences', 'positions'] as const) {
      const c = await depot.classement({ chambre: 'AN', critere, ordre: 'desc', limite: 5 });
      expect(c.lignes.length).toBeGreaterThan(0);
      for (const l of c.lignes) {
        indicateurComplet(l.indicateur);
        expect(l.indicateur.reference.valeur).not.toBeNull();
      }
    }
  }, LENT * 2);

  it('identifiant inconnu ou mal formé : null ou vide, sans exception (G5)', async () => {
    const inconnu = '00000000-0000-0000-0000-000000000000';
    expect(await depot.entete(inconnu)).toBeNull();
    expect(await depot.entete('PA793432')).toBeNull();
    expect(await depot.fonctions(inconnu)).toEqual([]);
    expect(await depot.roles('nimporte quoi')).toEqual([]);
    expect(await depot.choix(inconnu)).toEqual({ indicateurs: [], note: null, themes: [] });
    expect((await depot.questions(inconnu, { page: 1, taille: 20 })).elements).toEqual([]);
    expect(await depot.actesSurLeDossier(inconnu, inconnu)).toEqual([]);
  });
});
