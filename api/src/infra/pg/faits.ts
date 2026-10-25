// Adaptateur Postgres du FaitsRepository (Explorer) : chaque type de fait est une sélection SQL
// (identifiant, date et dimensions de regroupement) qui applique les filtres par liens publiés
// seulement (règles dans api/src/ports.ts) ; compteurs, groupes, suggestions et pages en sont des
// agrégats. Les faits rendus sont ensuite construits par les autres adaptateurs (interventions,
// amendements, scrutins) pour garder une seule forme par objet.
//
// Choix propres à l'adaptateur :
//   - présidence de séance et didascalies exclues des interventions (comme « Qui intervient ») ;
//   - groupe d'un orateur : son appartenance publiée le jour de la réunion, dans la chambre ;
//   - groupe d'une personne de l'onglet « Personnes » : son appartenance du jour, sinon la dernière ;
//   - un amendement adopté ou rejeté sans scrutin public est un vote à main levée, montré seulement
//     sous son propre filtre (sinon chaque amendement doublerait l'onglet Votes).

import { APERCU_GROUPE, familleDe, type DemandeGroupes, type Nommes } from '@contrat/domain/explorer';
import type {
  AmendementResume,
  ArticleRef,
  CleCase,
  CleFiltre,
  ContexteFait,
  Fait,
  FicheVisee,
  FiltresFaits,
  GroupeFaits,
  GroupeRef,
  LienInteret,
  Page,
  PersonneRef,
  Position,
  Provenance,
  Regroupement,
  ScrutinFiltre,
  SortAmendement,
  SuggestionFiltre,
  TypeFait,
  VoteDuFiltre,
  VoteMembre,
} from '@contrat/domain/model';
import { estEcart, majoritaire } from '@contrat/domain/votes';

import type { FaitsRepository, SqlDatabase, SqlParams } from '../../ports';
import { HORS_PRESIDENCE, PgDiscussions, UN_ORATEUR, couper } from './discussions';
import { PgDossiers } from './dossiers';
import { type GroupeLu, dossiersRef, groupe as groupeRef } from './personnes';
import { EN_L17, PgScrutins, Projections, estUuid, sqlGroupe, sqlNumeroArticle, sqlProvenance } from './scrutins';
import { PgTransparence } from './transparence';

type Dimension = 'dossier' | 'etape' | 'article' | 'groupe' | 'personne' | 'chambre' | 'organe';
type Source = 'interventions' | 'amendements' | 'votes' | 'controle' | 'declarations';

const JOUR = `(r.debut AT TIME ZONE 'Europe/Paris')::date`;
const RETIREE = (colonne: string) =>
  `NOT EXISTS (SELECT 1 FROM canon.entite x_ WHERE x_.entite_id = ${colonne} AND (x_.retiree_de_la_source_le IS NOT NULL OR x_.fusionnee_dans IS NOT NULL))`;

/** Case du parcours d'une réunion pour un dossier : celle d'un acte qui cite la réunion (index dossier, lien). */
const CASE_DE_LA_REUNION = (reunion: string, dossier: string) =>
  `(SELECT pa.cle FROM canon.lien l JOIN lecture.parcours_acte pa ON pa.etape_id = l.de_id AND pa.categorie = 'case'
    WHERE l.vers_id = ${reunion} AND l.nature = 'reunion' AND pa.dossier_id = ${dossier} ORDER BY pa.cle LIMIT 1)`;
/** Case du parcours d'un acte du dossier (étape d'un amendement, d'un scrutin). */
const CASE_DE_L_ACTE = (etape: string, dossier: string) =>
  `(SELECT pa.cle FROM lecture.parcours_acte pa WHERE pa.dossier_id = ${dossier} AND pa.etape_id = ${etape} AND pa.categorie = 'case' LIMIT 1)`;
/** Actes de la case filtrée ($dossier, $etape). */
const ACTES_DE_LA_CASE = `SELECT etape_id FROM lecture.parcours_acte WHERE dossier_id = $dossier::uuid AND cle = $etape AND categorie = 'case'`;

const COLONNES = ['k', 'id', 'date', 'd_dossier', 'd_etape', 'd_article', 'd_groupe', 'd_personne', 'd_chambre', 'd_organe', 'd_sort', 'd_nature'];

/** Paramètres SQL des filtres posés ($dossier, $etape…). */
const parametres = (f: FiltresFaits): SqlParams =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined).map(([k, v]) => [`$${k}`, v as string]));

/** Un identifiant de filtre qui n'est pas un UUID ne retient rien (G5) : inutile d'interroger. */
const filtresLisibles = (f: FiltresFaits) =>
  (['dossier', 'article', 'groupe', 'personne', 'organe', 'scrutin', 'amendement'] as const).every((c) => f[c] === undefined || estUuid(f[c]!));

/**
 * Interventions lues dans la projection étroite `lecture.fait_intervention` (opendata,
 * projections/60) : mêmes faits et mêmes dimensions que la lecture de `canon.intervention`, déjà
 * calculées (retenues, jour, article, groupe du jour, case du parcours).
 */
function interventionsProjetees(f: FiltresFaits, c: (d: Dimension, expr: string) => string): string {
  const w: string[] = [];
  if (f.dossier)
    w.push(`fi.id IN (SELECT id FROM lecture.fait_intervention WHERE dossier_id = $dossier::uuid
      UNION SELECT de_id FROM canon.lien WHERE vers_id = $dossier::uuid AND nature = 'dossier')`);
  if (f.etape)
    w.push(`fi.reunion_id IN (SELECT l.vers_id FROM lecture.parcours_acte pa JOIN canon.lien l ON l.de_id = pa.etape_id AND l.nature = 'reunion'
      WHERE pa.dossier_id = $dossier::uuid AND pa.cle = $etape AND pa.categorie = 'case')`);
  if (f.article)
    w.push(`fi.id IN (SELECT id FROM lecture.fait_intervention WHERE article_suivi_id = $article::uuid
      UNION SELECT l.de_id FROM canon.amendement a2 JOIN canon.lien l ON l.vers_id = a2.entite_id AND l.nature = 'amendement'
        WHERE a2.article_suivi_id = $article::uuid)`);
  if (f.amendement)
    w.push(`fi.id IN (SELECT id FROM lecture.fait_intervention WHERE amendement_id = $amendement::uuid
      UNION SELECT de_id FROM canon.lien WHERE vers_id = $amendement::uuid AND nature = 'amendement')`);
  if (f.groupe)
    // Toute appartenance publiée du jour (deux peuvent se chevaucher), comme la lecture de canon.
    w.push(`fi.orateur_id = ANY(ARRAY(SELECT personne_id FROM lecture.appartenance_groupe WHERE groupe_id = $groupe::uuid))
      AND EXISTS (SELECT 1 FROM lecture.appartenance_groupe a WHERE a.personne_id = fi.orateur_id AND a.groupe_id = $groupe::uuid
                    AND a.chambre = fi.chambre AND fi.jour BETWEEN a.debut AND a.fin)`);
  if (f.personne) w.push('fi.orateur_id = $personne::uuid');
  if (f.chambre) w.push('fi.chambre = $chambre');
  if (f.organe) w.push('fi.organe_id = $organe::uuid');
  return `SELECT 'intervention' AS k, fi.id AS id, fi.jour AS date,
      ${c('dossier', 'fi.dossier_id')} AS d_dossier, ${c('etape', 'fi.cle')} AS d_etape,
      ${c('article', 'fi.article_suivi_id')} AS d_article, ${c('groupe', 'fi.groupe_id')} AS d_groupe,
      ${c('personne', 'fi.orateur_id')} AS d_personne, ${c('chambre', 'fi.chambre')} AS d_chambre,
      ${c('organe', 'fi.organe_id')} AS d_organe, NULL::text AS d_sort, NULL::text AS d_nature
    FROM lecture.fait_intervention fi WHERE true${w.map((x) => ` AND ${x}`).join('')}`;
}

/**
 * Amendements lus dans la projection étroite `lecture.fait_amendement` (opendata, projections/61) :
 * mêmes faits et mêmes dimensions que la lecture de `canon.amendement` (vivants ; groupe auteur,
 * premier auteur et case du parcours déjà calculés).
 */
function amendementsProjetes(f: FiltresFaits, c: (d: Dimension, expr: string) => string): string {
  const w: string[] = [];
  if (f.dossier) w.push('fa.dossier_id = $dossier::uuid');
  if (f.etape) w.push(`fa.etape_id IN (${ACTES_DE_LA_CASE})`);
  if (f.article) w.push('fa.article_suivi_id = $article::uuid');
  if (f.amendement) w.push('fa.id = $amendement::uuid');
  if (f.groupe) w.push(`fa.id IN (SELECT de_id FROM canon.lien WHERE vers_id = $groupe::uuid AND nature = 'groupe_auteur')`);
  if (f.personne) w.push(`fa.id IN (SELECT de_id FROM canon.lien WHERE vers_id = $personne::uuid AND nature = 'auteur')`);
  if (f.chambre) w.push('fa.chambre = $chambre');
  if (f.organe) w.push('fa.organe_examen_id = $organe::uuid');
  return `SELECT 'amendement' AS k, fa.id AS id, fa.date AS date,
      ${c('dossier', 'fa.dossier_id')} AS d_dossier, ${c('etape', 'fa.cle')} AS d_etape,
      ${c('article', 'fa.article_suivi_id')} AS d_article, ${c('groupe', 'fa.groupe_id')} AS d_groupe,
      ${c('personne', 'fa.auteur_id')} AS d_personne, ${c('chambre', 'fa.chambre')} AS d_chambre,
      ${c('organe', 'fa.organe_examen_id')} AS d_organe, fa.sort AS d_sort, NULL::text AS d_nature
    FROM lecture.fait_amendement fa WHERE true${w.map((x) => ` AND ${x}`).join('')}`;
}

/** Projections étroites de l'Explorer présentes en base. */
export interface Projetees {
  interventions: boolean;
  amendements: boolean;
}

/**
 * Sélection d'une source sous les filtres : colonnes `COLONNES`, dimensions demandées seulement
 * (les autres à NULL). null : la source ne retient aucun fait sous ces filtres. `multi` : une
 * ligne par groupe ayant voté (votes), pour compter par groupe. `projetees` : les interventions et
 * les amendements sont lus dans `lecture.fait_intervention` et `lecture.fait_amendement` quand ces
 * projections sont en base.
 */
export function selection(
  source: Source,
  f: FiltresFaits,
  dims: ReadonlySet<Dimension>,
  multi = false,
  projetees: Projetees = { interventions: false, amendements: false },
): string | null {
  const w: string[] = [];
  const c = (d: Dimension, expr: string) => (dims.has(d) ? expr : 'NULL');
  switch (source) {
    case 'interventions': {
      if (f.scrutin) return null;
      if (projetees.interventions) return interventionsProjetees(f, c);
      if (f.dossier)
        w.push(`i.entite_id IN (SELECT entite_id FROM canon.intervention WHERE dossier_id = $dossier::uuid
          UNION SELECT de_id FROM canon.lien WHERE vers_id = $dossier::uuid AND nature = 'dossier')`);
      if (f.etape)
        w.push(`i.reunion_id IN (SELECT l.vers_id FROM lecture.parcours_acte pa JOIN canon.lien l ON l.de_id = pa.etape_id AND l.nature = 'reunion'
          WHERE pa.dossier_id = $dossier::uuid AND pa.cle = $etape AND pa.categorie = 'case')`);
      if (f.article)
        w.push(`i.entite_id IN (SELECT i2.entite_id FROM canon.amendement a2 JOIN canon.intervention i2 ON i2.amendement_id = a2.entite_id
            WHERE a2.article_suivi_id = $article::uuid
          UNION SELECT l.de_id FROM canon.amendement a2 JOIN canon.lien l ON l.vers_id = a2.entite_id AND l.nature = 'amendement'
            WHERE a2.article_suivi_id = $article::uuid)`);
      if (f.amendement)
        w.push(`i.entite_id IN (SELECT entite_id FROM canon.intervention WHERE amendement_id = $amendement::uuid
          UNION SELECT de_id FROM canon.lien WHERE vers_id = $amendement::uuid AND nature = 'amendement')`);
      if (f.groupe)
        // Par l'index des orateurs : la liste des membres (une centaine) plutôt qu'une jointure sur toute la table.
        w.push(`i.orateur_id = ANY(ARRAY(SELECT personne_id FROM lecture.appartenance_groupe WHERE groupe_id = $groupe::uuid))
          AND EXISTS (SELECT 1 FROM lecture.appartenance_groupe a WHERE a.personne_id = i.orateur_id AND a.groupe_id = $groupe::uuid
                        AND a.chambre = r.chambre AND ${JOUR} BETWEEN a.debut AND a.fin)`);
      if (f.personne) w.push('i.orateur_id = $personne::uuid');
      if (f.chambre) w.push('r.chambre = $chambre');
      if (f.organe) w.push('r.organe_id = $organe::uuid');
      return `SELECT 'intervention' AS k, i.entite_id AS id, ${JOUR} AS date,
          ${c('dossier', 'i.dossier_id')} AS d_dossier,
          ${c('etape', CASE_DE_LA_REUNION('i.reunion_id', 'i.dossier_id'))} AS d_etape,
          ${c('article', '(SELECT a3.article_suivi_id FROM canon.amendement a3 WHERE a3.entite_id = i.amendement_id)')} AS d_article,
          ${c('groupe', `(SELECT a.groupe_id FROM lecture.appartenance_groupe a WHERE a.personne_id = i.orateur_id AND a.chambre = r.chambre
                           AND ${JOUR} BETWEEN a.debut AND a.fin ORDER BY a.debut DESC LIMIT 1)`)} AS d_groupe,
          ${c('personne', 'i.orateur_id')} AS d_personne, ${c('chambre', 'r.chambre')} AS d_chambre,
          ${c('organe', 'r.organe_id')} AS d_organe, NULL::text AS d_sort, NULL::text AS d_nature
        FROM canon.intervention i JOIN canon.reunion r ON r.entite_id = i.reunion_id
        WHERE ${RETIREE('i.entite_id')} AND ${HORS_PRESIDENCE} AND ${UN_ORATEUR}${w.map((x) => ` AND ${x}`).join('')}`;
    }
    case 'amendements': {
      if (f.scrutin) return null;
      if (projetees.amendements) return amendementsProjetes(f, c);
      if (f.dossier) w.push('a.dossier_id = $dossier::uuid');
      if (f.etape) w.push(`a.etape_id IN (${ACTES_DE_LA_CASE})`);
      if (f.article) w.push('a.article_suivi_id = $article::uuid');
      if (f.amendement) w.push('a.entite_id = $amendement::uuid');
      if (f.groupe) w.push(`a.entite_id IN (SELECT de_id FROM canon.lien WHERE vers_id = $groupe::uuid AND nature = 'groupe_auteur')`);
      if (f.personne) w.push(`a.entite_id IN (SELECT de_id FROM canon.lien WHERE vers_id = $personne::uuid AND nature = 'auteur')`);
      if (f.chambre) w.push('a.chambre = $chambre');
      if (f.organe) w.push('a.organe_examen_id = $organe::uuid');
      return `SELECT 'amendement' AS k, a.entite_id AS id, a.date_sort AS date,
          ${c('dossier', 'a.dossier_id')} AS d_dossier,
          ${c('etape', CASE_DE_L_ACTE('a.etape_id', 'a.dossier_id'))} AS d_etape,
          ${c('article', 'a.article_suivi_id')} AS d_article,
          ${c('groupe', `(SELECT l.vers_id FROM canon.lien l WHERE l.de_id = a.entite_id AND l.nature = 'groupe_auteur' LIMIT 1)`)} AS d_groupe,
          ${c('personne', `(SELECT l.vers_id FROM canon.lien l JOIN canon.personne p ON p.entite_id = l.vers_id
                             WHERE l.de_id = a.entite_id AND l.nature = 'auteur' ORDER BY l.ordre NULLS LAST LIMIT 1)`)} AS d_personne,
          ${c('chambre', 'a.chambre')} AS d_chambre, ${c('organe', 'a.organe_examen_id')} AS d_organe,
          a.sort AS d_sort, NULL::text AS d_nature
        FROM canon.amendement a
        WHERE ${RETIREE('a.entite_id')}${w.map((x) => ` AND ${x}`).join('')}`;
    }
    case 'votes': {
      if (f.organe) return null;
      if (f.dossier) w.push('s.dossier_id = $dossier::uuid');
      if (f.etape) w.push(`s.etape_id IN (${ACTES_DE_LA_CASE})`);
      if (f.article) w.push('s.amendement_id IN (SELECT entite_id FROM canon.amendement WHERE article_suivi_id = $article::uuid)');
      if (f.amendement) w.push('s.amendement_id = $amendement::uuid');
      if (f.scrutin) w.push('s.entite_id = $scrutin::uuid');
      if (f.groupe) w.push('EXISTS (SELECT 1 FROM canon.position_groupe pg2 WHERE pg2.scrutin_id = s.entite_id AND pg2.groupe_id = $groupe::uuid)');
      if (f.personne) w.push('EXISTS (SELECT 1 FROM canon.vote v2 WHERE v2.scrutin_id = s.entite_id AND v2.personne_id = $personne::uuid)');
      if (f.chambre) w.push('s.chambre = $chambre');
      const publics = `SELECT 'scrutin' AS k, s.entite_id AS id, s.date AS date,
          ${c('dossier', 's.dossier_id')} AS d_dossier,
          ${c('etape', CASE_DE_L_ACTE('s.etape_id', 's.dossier_id'))} AS d_etape,
          ${c('article', '(SELECT a3.article_suivi_id FROM canon.amendement a3 WHERE a3.entite_id = s.amendement_id)')} AS d_article,
          ${multi && dims.has('groupe') ? 'pg.groupe_id' : 'NULL::uuid'} AS d_groupe,
          ${multi && dims.has('personne') && f.groupe ? 'v.personne_id' : 'NULL::uuid'} AS d_personne,
          ${c('chambre', 's.chambre')} AS d_chambre, NULL::uuid AS d_organe, NULL::text AS d_sort, NULL::text AS d_nature
        FROM canon.scrutin s
        ${multi && dims.has('groupe') ? 'JOIN canon.position_groupe pg ON pg.scrutin_id = s.entite_id' : ''}
        ${multi && dims.has('personne') && f.groupe ? 'JOIN canon.vote v ON v.scrutin_id = s.entite_id AND v.groupe_id = $groupe::uuid' : ''}
        WHERE ${EN_L17} AND ${RETIREE('s.entite_id')}${w.map((x) => ` AND ${x}`).join('')}`;
      // Vote à main levée : seulement sous le filtre de son amendement, sans filtre de personne ni de groupe.
      if (!f.amendement || f.groupe || f.personne || f.scrutin) return publics;
      const m: string[] = ["a.entite_id = $amendement::uuid", "a.sort IN ('adopte', 'rejete')", 'NOT EXISTS (SELECT 1 FROM canon.scrutin s WHERE s.amendement_id = a.entite_id)'];
      if (f.dossier) m.push('a.dossier_id = $dossier::uuid');
      if (f.etape) m.push(`a.etape_id IN (${ACTES_DE_LA_CASE})`);
      if (f.article) m.push('a.article_suivi_id = $article::uuid');
      if (f.chambre) m.push('a.chambre = $chambre');
      return `${publics}
        UNION ALL
        SELECT 'main_levee', a.entite_id, a.date_sort, ${c('dossier', 'a.dossier_id')},
          ${c('etape', CASE_DE_L_ACTE('a.etape_id', 'a.dossier_id'))}, ${c('article', 'a.article_suivi_id')},
          NULL::uuid, NULL::uuid, ${c('chambre', 'a.chambre')}, NULL::uuid, NULL::text, NULL::text
        FROM canon.amendement a WHERE ${RETIREE('a.entite_id')} AND ${m.join(' AND ')}`;
    }
    case 'controle': {
      if (f.dossier || f.etape || f.article || f.organe || f.scrutin || f.amendement) return null;
      if (f.groupe) w.push('q.groupe_auteur_id = $groupe::uuid');
      if (f.personne) w.push('q.auteur_id = $personne::uuid');
      if (f.chambre) w.push('q.chambre = $chambre');
      return `SELECT 'question' AS k, q.entite_id AS id, q.date AS date, NULL::uuid AS d_dossier, NULL::text AS d_etape,
          NULL::uuid AS d_article, ${c('groupe', 'q.groupe_auteur_id')} AS d_groupe, ${c('personne', 'q.auteur_id')} AS d_personne,
          ${c('chambre', 'q.chambre')} AS d_chambre, NULL::uuid AS d_organe, NULL::text AS d_sort, NULL::text AS d_nature
        FROM canon.question q WHERE ${RETIREE('q.entite_id')}${w.map((x) => ` AND ${x}`).join('')}`;
    }
    case 'declarations': {
      if (f.dossier || f.etape || f.article || f.organe || f.scrutin || f.amendement || f.chambre) return null;
      if (f.personne) w.push('d.personne_id = $personne::uuid');
      if (f.groupe) w.push('d.personne_id IN (SELECT personne_id FROM lecture.appartenance_groupe WHERE groupe_id = $groupe::uuid)');
      return `SELECT 'declaration' AS k, d.entite_id AS id, d.date_publication AS date, NULL::uuid AS d_dossier, NULL::text AS d_etape,
          NULL::uuid AS d_article, NULL::uuid AS d_groupe, ${c('personne', 'd.personne_id')} AS d_personne, NULL::text AS d_chambre,
          NULL::uuid AS d_organe, NULL::text AS d_sort, 'Déclarations d’intérêts' AS d_nature
        FROM canon.declaration d WHERE d.personne_id IS NOT NULL AND ${RETIREE('d.entite_id')}${w.map((x) => ` AND ${x}`).join('')}`;
    }
  }
}

const SOURCES: Record<Exclude<TypeFait, 'personnes' | 'transparence'>, Source> = {
  interventions: 'interventions',
  amendements: 'amendements',
  votes: 'votes',
  controle: 'controle',
};

/** Expression de la clé d'un groupe (texte, NULL : « Sans … »). */
const CLE_GROUPE: Record<Regroupement, string> = {
  dossier: 'd_dossier::text',
  etape: "CASE WHEN d_dossier IS NOT NULL AND d_etape IS NOT NULL THEN d_dossier::text || '/' || d_etape END",
  article: 'd_article::text',
  groupe: 'd_groupe::text',
  personne: 'd_personne::text',
  organe: 'd_organe::text',
  date: 'date::text',
  sort: 'd_sort',
  nature: 'd_nature',
};
/** Regroupements par une colonne simple, rangés par nombre puis par clé (`n DESC, cle`). */
const COLONNE_SIMPLE: Partial<Record<Regroupement, string>> = {
  dossier: 'd_dossier',
  article: 'd_article',
  groupe: 'd_groupe',
  personne: 'd_personne',
  organe: 'd_organe',
};
const DIMENSION: Partial<Record<Regroupement, Dimension[]>> = {
  dossier: ['dossier'],
  etape: ['dossier', 'etape'],
  article: ['article'],
  groupe: ['groupe'],
  personne: ['personne'],
  organe: ['organe'],
};
const ORDRE_SORT: SortAmendement[] = ['adopte', 'rejete', 'retire', 'tombe', 'non_soutenu', 'irrecevable', 'en_attente'];
const LIBELLE_SORT: Record<SortAmendement, string> = {
  adopte: 'Adopté',
  rejete: 'Rejeté',
  retire: 'Retiré',
  tombe: 'Tombé',
  non_soutenu: 'Non soutenu',
  irrecevable: 'Irrecevable',
  en_attente: 'En attente',
};
const SANS: Record<Regroupement, string> = {
  dossier: 'Sans dossier',
  etape: 'Sans étape précise',
  article: 'Sans article précis',
  groupe: 'Sans groupe',
  personne: 'Orateur sans personne identifiée',
  organe: 'Sans organe',
  date: 'Sans date',
  sort: 'Sort non publié',
  nature: 'Autres',
};
const CLE_FILTRE: Partial<Record<Regroupement, CleFiltre>> = {
  dossier: 'dossier',
  etape: 'etape',
  article: 'article',
  groupe: 'groupe',
  personne: 'personne',
  organe: 'organe',
};
const ORDRE_GROUPES: Record<Regroupement, string> = {
  dossier: 'n DESC, cle',
  etape: 'premiere NULLS LAST, cle',
  article: 'n DESC, cle',
  groupe: 'n DESC, cle',
  personne: 'n DESC, cle',
  organe: 'n DESC, cle',
  date: 'cle DESC',
  sort: `array_position(ARRAY[${ORDRE_SORT.map((s) => `'${s}'`).join(', ')}]::text[], cle)`,
  nature: 'cle',
};

const CHAMBRES: Record<string, string> = { AN: 'Assemblée nationale', SENAT: 'Sénat' };
const VIDE: Record<TypeFait, number> = { interventions: 0, amendements: 0, votes: 0, controle: 0, transparence: 0, personnes: 0 };
const pageDe = <T>(elements: T[], { page, taille }: { page: number; taille: number }, total: number): Page<T> => ({
  elements,
  page,
  taille,
  total,
  suivante: page * taille < total ? page + 1 : null,
});

/** Ligne d'un fait sélectionné : de quoi le construire. */
interface Repere {
  k: string;
  id: string;
}

export class PgFaits implements FaitsRepository {
  private readonly projections: Projections;
  private readonly discussions: PgDiscussions;
  private readonly dossiers: PgDossiers;
  private readonly scrutins: PgScrutins;
  private readonly transparence: PgTransparence;

  constructor(private readonly db: SqlDatabase) {
    this.projections = new Projections(db);
    this.discussions = new PgDiscussions(db);
    this.dossiers = new PgDossiers(db);
    this.scrutins = new PgScrutins(db);
    this.transparence = new PgTransparence(db);
  }

  /** Projections étroites en base : vu par `lisible`, avant toute sélection. */
  private projetees: Projetees = { interventions: false, amendements: false };

  private sel(source: Source, f: FiltresFaits, dims: ReadonlySet<Dimension>, multi = false): string | null {
    return selection(source, f, dims, multi, this.projetees);
  }

  /** Les projections du parcours et des appartenances sont-elles en base ? Sinon : étape, groupe d'orateur → rien. */
  private async lisible(f: FiltresFaits): Promise<boolean> {
    if (!filtresLisibles(f)) return false;
    const [parcours, appartenance, interventions, amendements] = await Promise.all([
      this.projections.existe('lecture.parcours_acte'),
      this.projections.existe('lecture.appartenance_groupe'),
      this.projections.existe('lecture.fait_intervention'),
      this.projections.existe('lecture.fait_amendement'),
    ]);
    this.projetees = { interventions, amendements };
    return parcours && appartenance;
  }

  // ----- Transparence : rapprochements d'un dossier ou d'un amendement filtré, et déclarations -----

  /** Rapprochements de lobbying sous ces filtres : seulement un dossier et/ou un amendement filtrés. */
  private async interets(f: FiltresFaits): Promise<LienInteret[]> {
    const autres = (['etape', 'article', 'groupe', 'personne', 'chambre', 'organe', 'scrutin'] as const).some((c) => f[c] !== undefined);
    if (autres || (!f.dossier && !f.amendement)) return [];
    return f.amendement
      ? this.transparence.interetsDe({ type: 'amendement', id: f.amendement })
      : this.transparence.interetsDe({ type: 'dossier', id: f.dossier! });
  }

  // ----- Personnes -----

  /** Actes par personne (interventions, amendements, votes du scrutin filtré) sous ces filtres. */
  private actesParPersonne(f: FiltresFaits): string | null {
    const dims = new Set<Dimension>(['personne']);
    const parties = [
      ...(this.sel('interventions', f, dims) ? [`SELECT 'interventions' AS t, d_personne AS p FROM (${this.sel('interventions', f, dims)}) x`] : []),
      // Auteurs par jointure sur les liens (une sous-requête par amendement coûte cher sans filtre).
      ...(this.sel('amendements', f, new Set())
        ? [`SELECT 'amendements' AS t, l.vers_id AS p FROM (${this.sel('amendements', f, new Set())}) x
             JOIN canon.lien l ON l.de_id = x.id AND l.nature = 'auteur' JOIN canon.personne pe ON pe.entite_id = l.vers_id`]
        : []),
      ...(f.scrutin
        ? [`SELECT 'votes' AS t, v.personne_id AS p FROM canon.vote v WHERE v.scrutin_id = $scrutin::uuid
             ${f.groupe ? 'AND v.groupe_id = $groupe::uuid' : ''} ${f.personne ? 'AND v.personne_id = $personne::uuid' : ''}
             AND ${!f.organe ? 'true' : 'false'}`]
        : []),
    ];
    if (!parties.length) return null;
    return `SELECT x.p AS id, count(*) FILTER (WHERE x.t = 'interventions')::int AS interventions,
              count(*) FILTER (WHERE x.t = 'amendements')::int AS amendements, count(*) FILTER (WHERE x.t = 'votes')::int AS votes
            FROM (${parties.join(' UNION ALL ')}) x
            WHERE x.p IS NOT NULL AND ${RETIREE('x.p')}
            GROUP BY x.p`;
  }

  // ----- Compteurs -----

  /**
   * Compteurs déjà calculés, par filtres, pour la version des données en cours : l'élargissement
   * redemande souvent les mêmes (sans filtre : plusieurs secondes). Vidés à chaque nouveau
   * chargement (oid du schéma `lecture`, recréé par chaque projection).
   */
  private readonly comptes = new Map<string, Promise<Record<TypeFait, number>>>();
  private marque: string | null = null;

  async compter(f: FiltresFaits): Promise<Record<TypeFait, number>> {
    const marque = (await this.db.first<{ m: string | null }>("SELECT (SELECT oid::text FROM pg_namespace WHERE nspname = 'lecture') AS m"))?.m ?? null;
    if (marque !== this.marque) {
      this.comptes.clear();
      this.marque = marque;
    }
    const cle = JSON.stringify(Object.entries(f).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)));
    if (!this.comptes.has(cle)) {
      if (this.comptes.size >= 500) this.comptes.delete(this.comptes.keys().next().value!);
      const calcul = this.calculerComptes(f);
      this.comptes.set(cle, calcul);
      calcul.catch(() => this.comptes.delete(cle));
    }
    return { ...(await this.comptes.get(cle)!) };
  }

  private async calculerComptes(f: FiltresFaits): Promise<Record<TypeFait, number>> {
    if (!(await this.lisible(f))) return { ...VIDE };
    const params = parametres(f);
    const aucune = new Set<Dimension>();
    const compte = async (sql: string | null) => (sql ? ((await this.db.first<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) x`, params))?.n ?? 0) : 0);
    const personnes = this.actesParPersonne(f);
    const [interventions, amendements, votes, controle, declarations, interets, nPersonnes] = await Promise.all([
      compte(this.sel('interventions', f, aucune)),
      compte(this.sel('amendements', f, aucune)),
      compte(this.sel('votes', f, aucune)),
      compte(this.sel('controle', f, aucune)),
      compte(this.sel('declarations', f, aucune)),
      this.interets(f),
      compte(personnes),
    ]);
    return { interventions, amendements, votes, controle, transparence: declarations + interets.length, personnes: nPersonnes };
  }

  // ----- Groupes -----

  async groupes(d: DemandeGroupes): Promise<Page<GroupeFaits>> {
    const f = d.filtres;
    if (!(await this.lisible(f))) return pageDe([], d.page, 0);
    if (d.onglet === 'personnes') return this.groupesPersonnes(d);
    if (d.onglet === 'transparence') return this.groupesTransparence(d);
    const sql = this.sel(SOURCES[d.onglet], f, new Set(DIMENSION[d.regroupement] ?? []));
    if (!sql) return pageDe([], d.page, 0);
    const colonne = COLONNE_SIMPLE[d.regroupement];
    const params = { ...parametres(f), $taille: d.page.taille, $decalage: (d.page.page - 1) * d.page.taille };
    const lignes = await this.db.all<{ cle: string | null; n: number; reperes: Repere[]; total: number }>(
      colonne && ((d.onglet === 'interventions' && this.projetees.interventions) || (d.onglet === 'amendements' && this.projetees.amendements))
        ? // Projection : compter sans trier, puis les faits d'aperçu des seuls groupes de la page, par
          // l'index (colonne, jour, id) — même résultat que le tri de tous les faits (444 000 sans filtre).
          `WITH g AS (SELECT ${colonne} AS v, count(*)::int AS n FROM (${sql}) f GROUP BY 1),
           p AS (SELECT v, v::text AS cle, n, count(*) OVER ()::int AS total FROM g
                 ORDER BY (v IS NULL), n DESC, v::text LIMIT $taille OFFSET $decalage)
           SELECT p.cle, p.n, p.total,
             CASE WHEN p.v IS NULL
               THEN ARRAY(SELECT json_build_object('k', s.k, 'id', s.id) FROM (${sql}) s
                          WHERE s.${colonne} IS NULL ORDER BY s.date DESC NULLS LAST, s.id LIMIT ${APERCU_GROUPE})
               ELSE ARRAY(SELECT json_build_object('k', s.k, 'id', s.id) FROM (${sql}) s
                          WHERE s.${colonne} = p.v ORDER BY s.date DESC NULLS LAST, s.id LIMIT ${APERCU_GROUPE}) END AS reperes
           FROM p ORDER BY (p.v IS NULL), p.n DESC, p.cle`
        : `WITH f AS MATERIALIZED (${sql}),
       g AS (SELECT ${CLE_GROUPE[d.regroupement]} AS cle, count(*)::int AS n, min(date) AS premiere,
                    (array_agg(json_build_object('k', k, 'id', id) ORDER BY date DESC NULLS LAST, id))[1:${APERCU_GROUPE}] AS reperes
             FROM f GROUP BY 1)
       SELECT cle, n, reperes, count(*) OVER ()::int AS total FROM g
       ORDER BY (cle IS NULL), ${ORDRE_GROUPES[d.regroupement]}
       LIMIT $taille OFFSET $decalage`,
      params,
    );
    const [faits, tetes] = await Promise.all([
      this.construire(lignes.flatMap((l) => l.reperes), f),
      this.tetes(d.regroupement, lignes.map((l) => l.cle), f),
    ]);
    const elements = lignes.map((l, i) => ({
      ...tetes[i],
      total: l.n,
      faits: l.reperes.flatMap((r) => (faits.has(r.id) ? [faits.get(r.id)!] : [])),
    }));
    return pageDe(elements, d.page, lignes[0]?.total ?? 0);
  }

  async deplier(d: DemandeGroupes, cle: string): Promise<Page<Fait>> {
    const f = d.filtres;
    const prefixe = `${d.regroupement}:`;
    if (!cle.startsWith(prefixe) || !(await this.lisible(f))) return pageDe([], d.page, 0);
    const valeur = cle.slice(prefixe.length) || null;
    if (d.onglet === 'personnes' || d.onglet === 'transparence') {
      // Peu nombreux : le groupe entier, puis sa page.
      const faits = await this.groupeComplet(d, valeur);
      return pageDe(faits.slice((d.page.page - 1) * d.page.taille, d.page.page * d.page.taille), d.page, faits.length);
    }
    const sql = this.sel(SOURCES[d.onglet], f, new Set(DIMENSION[d.regroupement] ?? []));
    if (!sql) return pageDe([], d.page, 0);
    const params = { ...parametres(f), $valeur: valeur, $taille: d.page.taille, $decalage: (d.page.page - 1) * d.page.taille };
    const lignes = await this.db.all<Repere & { total: number }>(
      `WITH f AS MATERIALIZED (${sql})
       SELECT k, id, count(*) OVER ()::int AS total FROM f
       WHERE ${CLE_GROUPE[d.regroupement]} IS NOT DISTINCT FROM $valeur::text
       ORDER BY date DESC NULLS LAST, id LIMIT $taille OFFSET $decalage`,
      params,
    );
    const faits = await this.construire(lignes, f);
    return pageDe(lignes.flatMap((r) => (faits.has(r.id) ? [faits.get(r.id)!] : [])), d.page, lignes[0]?.total ?? 0);
  }

  /** Tous les faits d'un groupe de Personnes ou de Transparence (peu nombreux). */
  private async groupeComplet(d: DemandeGroupes, valeur: string | null): Promise<Fait[]> {
    const tous = await (d.onglet === 'personnes' ? this.personnesRetenues(d.filtres) : this.transparenceRetenue(d.filtres));
    return tous.filter((x) => x.cle(d.regroupement) === valeur).map((x) => x.fait);
  }

  private async personnesRetenues(f: FiltresFaits): Promise<{ fait: Fait; cle: (r: Regroupement) => string | null; n: number }[]> {
    const sql = this.actesParPersonne(f);
    if (!sql) return [];
    const lignes = await this.db.all<{ id: string; interventions: number; amendements: number; votes: number }>(
      `${sql} ORDER BY count(*) DESC, x.p LIMIT 2000`,
      parametres(f),
    );
    const refs = await this.personnesRef(lignes.map((l) => l.id));
    return lignes.flatMap((l) => {
      const personne = refs.get(l.id);
      if (!personne) return [];
      const fait: Fait = { type: 'personne', id: l.id, personne, interventions: l.interventions, amendements: l.amendements, votes: l.votes };
      return [{ fait, cle: () => personne.groupe?.id ?? null, n: l.interventions + l.amendements + l.votes }];
    });
  }

  private async groupesPersonnes(d: DemandeGroupes): Promise<Page<GroupeFaits>> {
    const tous = await this.personnesRetenues(d.filtres);
    const par = new Map<string | null, typeof tous>();
    for (const x of tous) par.set(x.cle('groupe'), [...(par.get(x.cle('groupe')) ?? []), x]);
    const ordonnes = [...par.entries()].sort(([a, x], [b, y]) => (a === null ? 1 : 0) - (b === null ? 1 : 0) || y.length - x.length || (a ?? '').localeCompare(b ?? ''));
    const page = ordonnes.slice((d.page.page - 1) * d.page.taille, d.page.page * d.page.taille);
    const tetes = await this.tetes('groupe', page.map(([cle]) => cle), d.filtres);
    return pageDe(
      page.map(([, liste], i) => ({ ...tetes[i], total: liste.length, faits: liste.slice(0, APERCU_GROUPE).map((x) => x.fait) })),
      d.page,
      ordonnes.length,
    );
  }

  private async transparenceRetenue(f: FiltresFaits): Promise<{ fait: Fait; cle: (r: Regroupement) => string | null; date: string | null }[]> {
    const sql = this.sel('declarations', f, new Set(['personne']));
    const [interets, lignes] = await Promise.all([
      this.interets(f),
      sql ? this.db.all<Repere & { date: string | null }>(`SELECT k, id, date::text AS date FROM (${sql}) x ORDER BY date DESC NULLS LAST, id LIMIT 2000`, parametres(f)) : [],
    ]);
    const declarations = await this.construire(lignes, f);
    return [
      ...interets.map((lien, n) => ({
        fait: { type: 'interet' as const, id: `interet-${lien.action.id}-${n}`, lien },
        date: lien.action.periode.fin,
        cle: (r: Regroupement) => (r === 'nature' ? 'Lobbying déclaré' : lien.action.periode.fin),
      })),
      ...lignes.flatMap((l) =>
        declarations.has(l.id)
          ? [{ fait: declarations.get(l.id)!, date: l.date, cle: (r: Regroupement) => (r === 'nature' ? 'Déclarations d’intérêts' : l.date) }]
          : [],
      ),
    ];
  }

  private async groupesTransparence(d: DemandeGroupes): Promise<Page<GroupeFaits>> {
    const tous = await this.transparenceRetenue(d.filtres);
    const par = new Map<string | null, typeof tous>();
    for (const x of tous) par.set(x.cle(d.regroupement), [...(par.get(x.cle(d.regroupement)) ?? []), x]);
    const ordonnes = [...par.entries()].sort(([a], [b]) => (d.regroupement === 'date' ? (b ?? '').localeCompare(a ?? '') : (a ?? '').localeCompare(b ?? '')));
    const page = ordonnes.slice((d.page.page - 1) * d.page.taille, d.page.page * d.page.taille);
    return pageDe(
      page.map(([cle, liste]) => ({
        cle: `${d.regroupement}:${cle ?? ''}`,
        libelle: cle ?? SANS[d.regroupement],
        detail: null,
        groupe: null,
        total: liste.length,
        faits: [...liste].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, APERCU_GROUPE).map((x) => x.fait),
        filtre: null,
      })),
      d.page,
      ordonnes.length,
    );
  }

  // ----- Suggestions -----

  async suggerer(f: FiltresFaits, cle: CleFiltre, limite: number): Promise<SuggestionFiltre[]> {
    if (!(await this.lisible(f))) return [];
    const dim: Dimension | null = (['dossier', 'etape', 'article', 'groupe', 'personne', 'chambre', 'organe'] as const).find((d) => d === cle) ?? null;
    if (!dim || (dim === 'etape' && !f.dossier) || (dim === 'personne' && !f.groupe)) return [];
    const dims = new Set<Dimension>([dim]);
    const parties = (['interventions', 'amendements', 'votes'] as const).flatMap((s) => {
      // Groupe d'un orateur : déjà dans la projection ; sinon cherché une fois par orateur, chambre
      // et jour, pas pour chaque prise de parole.
      if (s === 'interventions' && dim === 'groupe' && !this.projetees.interventions) {
        const sql = this.sel(s, f, new Set<Dimension>(['personne', 'chambre']));
        return sql
          ? [`SELECT ag.groupe_id::text AS v, x.n FROM (
                SELECT d_personne AS p, d_chambre AS c, date, count(*) AS n FROM (${sql}) y WHERE d_personne IS NOT NULL GROUP BY 1, 2, 3) x
              CROSS JOIN LATERAL (SELECT a.groupe_id FROM lecture.appartenance_groupe a WHERE a.personne_id = x.p AND a.chambre = x.c
                                    AND x.date BETWEEN a.debut AND a.fin ORDER BY a.debut DESC LIMIT 1) ag`]
          : [];
      }
      const sql = this.sel(s, f, dims, true);
      return sql ? [`SELECT d_${dim}::text AS v, 1 AS n FROM (${sql}) x`] : [];
    });
    if (!parties.length) return [];
    const lignes = await this.db.all<{ v: string; n: number }>(
      `SELECT v, sum(n)::int AS n FROM (${parties.join(' UNION ALL ')}) x
       WHERE v IS NOT NULL
       GROUP BY v ORDER BY n DESC, v LIMIT $limite`,
      { ...parametres(f), $limite: limite * 2 },
    );
    const noms = await this.nommerValeurs(dim, lignes.map((l) => l.v), f);
    return lignes
      .flatMap((l): SuggestionFiltre[] => {
        const nom = noms.get(l.v);
        return nom ? [{ cle, id: l.v, libelle: nom.libelle, nombre: l.n, groupe: nom.groupe }] : [];
      })
      .sort((a, b) => b.nombre - a.nombre || a.libelle.localeCompare(b.libelle))
      .slice(0, limite);
  }

  // ----- Scrutin filtré -----

  async scrutin(id: string, groupe: string | null): Promise<ScrutinFiltre | null> {
    if (!estUuid(id) || (groupe !== null && !estUuid(groupe))) return null;
    const fiche = await this.scrutins.fiche(id);
    if (!fiche) return null;
    let membres: VoteMembre[] | null = null;
    if (groupe) {
      const ligne = fiche.groupes.find((g) => g.groupe.id === groupe)?.ligne ?? null;
      const votes = await this.db.all<{ id: string; nom: string; position: Position; par_delegation: boolean | null }>(
        `SELECT v.personne_id AS id, p.nom_affiche AS nom, v.position, v.par_delegation
         FROM canon.vote v JOIN canon.personne p ON p.entite_id = v.personne_id
         WHERE v.scrutin_id = $scrutin::uuid AND v.groupe_id = $groupe::uuid AND ${RETIREE('v.personne_id')}
         ORDER BY p.nom, p.prenom`,
        { $scrutin: id, $groupe: groupe },
      );
      const ref = fiche.groupes.find((g) => g.groupe.id === groupe)?.groupe ?? null;
      membres = votes.map((v) => ({
        personne: { id: v.id, nom: v.nom, fonction: null, groupe: ref },
        position: v.position,
        parDelegation: v.par_delegation ?? false,
        contreSonGroupe: estEcart(v.position, ligne),
      }));
    }
    return { scrutin: fiche.scrutin, groupes: fiche.groupes, membres };
  }

  // ----- Noms -----

  async nommer(f: FiltresFaits): Promise<Nommes> {
    if (!filtresLisibles(f)) return null;
    const nommes: Exclude<Nommes, null> = [];
    const ajouter = (cle: CleFiltre, id: string, libelle: string, detail: string | null, groupe: GroupeRef | null, fiche: FicheVisee | null) =>
      nommes.push({ actif: { cle, famille: familleDe(cle), id, libelle, groupe }, focal: { cle, id, libelle, detail, groupe, fiche } });
    for (const cle of ['dossier', 'etape', 'article', 'groupe', 'personne', 'chambre', 'organe', 'scrutin', 'amendement'] as const) {
      const id = f[cle];
      if (id === undefined) continue;
      if (cle === 'chambre') {
        ajouter(cle, id, CHAMBRES[id], null, null, { type: 'institution', institution: id === 'AN' ? 'an' : 'senat' });
        continue;
      }
      if (cle === 'etape') {
        if (!(await this.projections.existe('lecture.parcours_dossier'))) return null;
        const c = await this.db.first<{ libelle: string; titre: string }>(
          `SELECT pd.libelle, d.titre FROM lecture.parcours_dossier pd JOIN canon.dossier d ON d.entite_id = pd.dossier_id
           WHERE pd.dossier_id = $dossier::uuid AND pd.cle = $etape`,
          { $dossier: f.dossier!, $etape: id },
        );
        if (!c) return null;
        ajouter(cle, id, c.libelle, c.titre, null, { type: 'etape', dossier: f.dossier!, cle: id as CleCase });
        continue;
      }
      const nom = (await this.nommerValeurs(cle, [id], f)).get(id);
      if (!nom) return null;
      ajouter(cle, id, nom.libelle, nom.detail, nom.groupe, nom.fiche);
    }
    return nommes;
  }

  /** Nom, détail, pastille et fiche de valeurs d'une dimension (objets vivants seulement). */
  private async nommerValeurs(
    dim: CleFiltre,
    valeurs: string[],
    f: FiltresFaits,
  ): Promise<Map<string, { libelle: string; detail: string | null; groupe: GroupeRef | null; fiche: FicheVisee | null }>> {
    const resultat = new Map<string, { libelle: string; detail: string | null; groupe: GroupeRef | null; fiche: FicheVisee | null }>();
    const ids = [...new Set(valeurs)];
    if (dim === 'chambre') {
      for (const v of ids) if (CHAMBRES[v]) resultat.set(v, { libelle: CHAMBRES[v], detail: null, groupe: null, fiche: { type: 'institution', institution: v === 'AN' ? 'an' : 'senat' } });
      return resultat;
    }
    if (dim === 'etape') {
      if (!f.dossier) return resultat;
      const lignes = await this.db.all<{ cle: string; libelle: string; titre: string }>(
        `SELECT pd.cle, pd.libelle, d.titre FROM lecture.parcours_dossier pd JOIN canon.dossier d ON d.entite_id = pd.dossier_id
         WHERE pd.dossier_id = $dossier::uuid AND pd.cle = ANY($cles::text[])`,
        { $dossier: f.dossier, $cles: ids },
      );
      for (const l of lignes) resultat.set(l.cle, { libelle: l.libelle, detail: l.titre, groupe: null, fiche: { type: 'etape', dossier: f.dossier, cle: l.cle as CleCase } });
      return resultat;
    }
    const uuids = ids.filter(estUuid);
    if (!uuids.length) return resultat;
    const p = { $ids: uuids };
    switch (dim) {
      case 'dossier': {
        const lignes = await this.db.all<{ id: string; titre: string; type: string | null }>(
          `SELECT d.entite_id AS id, d.titre, d.type_procedure AS type FROM canon.dossier d WHERE d.entite_id = ANY($ids::uuid[]) AND ${RETIREE('d.entite_id')}`,
          p,
        );
        for (const l of lignes) resultat.set(l.id, { libelle: l.titre, detail: l.type, groupe: null, fiche: { type: 'dossier', id: l.id } });
        break;
      }
      case 'article': {
        const lignes = await this.db.all<{ id: string; numero: string | null; titre: string | null }>(
          `SELECT a.entite_id AS id, ${sqlNumeroArticle('a.entite_id')} AS numero, d.titre
           FROM canon.article_suivi a LEFT JOIN canon.dossier d ON d.entite_id = a.dossier_id
           WHERE a.entite_id = ANY($ids::uuid[]) AND ${RETIREE('a.entite_id')}`,
          p,
        );
        for (const l of lignes) resultat.set(l.id, { libelle: `Art. ${l.numero ?? '?'}`, detail: l.titre, groupe: null, fiche: { type: 'article', id: l.id } });
        break;
      }
      case 'groupe': {
        const lignes = await this.db.all<{ groupe: GroupeLu }>(
          `SELECT ${sqlGroupe('o')} AS groupe FROM canon.organisation o
           WHERE o.entite_id = ANY($ids::uuid[]) AND o.type = 'groupe_politique' AND ${RETIREE('o.entite_id')}`,
          p,
        );
        for (const l of lignes) {
          const g = groupeRef(l.groupe)!;
          resultat.set(g.id, { libelle: g.libelle, detail: CHAMBRES[g.chambre], groupe: g, fiche: { type: 'institution', institution: g.chambre === 'AN' ? 'an' : 'senat' } });
        }
        break;
      }
      case 'personne': {
        const refs = await this.personnesRef(uuids);
        for (const [id, r] of refs) resultat.set(id, { libelle: r.nom, detail: r.fonction, groupe: r.groupe, fiche: { type: 'personne', id } });
        break;
      }
      case 'organe': {
        const lignes = await this.db.all<{ id: string; nom: string; chambre: string | null }>(
          `SELECT o.entite_id AS id, o.nom, o.chambre FROM canon.organisation o WHERE o.entite_id = ANY($ids::uuid[]) AND ${RETIREE('o.entite_id')}`,
          p,
        );
        for (const l of lignes) resultat.set(l.id, { libelle: l.nom, detail: l.chambre ? (CHAMBRES[l.chambre] ?? null) : null, groupe: null, fiche: null });
        break;
      }
      case 'scrutin': {
        const lignes = await this.db.all<{ id: string; numero: string; titre: string }>(
          `SELECT s.entite_id AS id, s.numero, s.titre FROM canon.scrutin s WHERE s.entite_id = ANY($ids::uuid[]) AND ${EN_L17} AND ${RETIREE('s.entite_id')}`,
          p,
        );
        for (const l of lignes) resultat.set(l.id, { libelle: `Scrutin n° ${l.numero}`, detail: l.titre, groupe: null, fiche: { type: 'scrutin', id: l.id } });
        break;
      }
      case 'amendement': {
        const lignes = await this.db.all<{ id: string; numero: string; division: string | null }>(
          `SELECT a.entite_id AS id, a.numero, a.division FROM canon.amendement a WHERE a.entite_id = ANY($ids::uuid[]) AND ${RETIREE('a.entite_id')}`,
          p,
        );
        for (const l of lignes) resultat.set(l.id, { libelle: `Amendement ${l.numero}`, detail: l.division, groupe: null, fiche: { type: 'amendement', id: l.id } });
        break;
      }
    }
    return resultat;
  }

  /** Têtes des groupes (nom, détail, pastille, filtre ajouté au toucher), dans l'ordre des clés. */
  private async tetes(r: Regroupement, cles: (string | null)[], f: FiltresFaits): Promise<Omit<GroupeFaits, 'total' | 'faits'>[]> {
    const filtreCle = CLE_FILTRE[r];
    const valeurDe = (cle: string) => (r === 'etape' ? cle.split('/')[1] : cle);
    const noms =
      filtreCle && r !== 'etape'
        ? await this.nommerValeurs(filtreCle, cles.filter((c): c is string => c !== null), f)
        : new Map<string, { libelle: string; detail: string | null; groupe: GroupeRef | null }>();
    const etapes =
      r === 'etape'
        ? await this.nommerEtapes(cles.filter((c): c is string => c !== null))
        : new Map<string, { libelle: string; detail: string | null }>();
    return cles.map((cle) => {
      const id = `${r}:${cle ?? ''}`;
      if (cle === null) return { cle: id, libelle: SANS[r], detail: null, groupe: null, filtre: null };
      const valeur = valeurDe(cle);
      const filtre =
        filtreCle && f[filtreCle] !== valeur && (r !== 'etape' || f.dossier === cle.split('/')[0]) ? { cle: filtreCle, id: valeur } : null;
      if (r === 'sort') return { cle: id, libelle: LIBELLE_SORT[cle as SortAmendement] ?? cle, detail: null, groupe: null, filtre: null };
      if (r === 'date' || r === 'nature') return { cle: id, libelle: cle, detail: null, groupe: null, filtre: null };
      if (r === 'etape') {
        const e = etapes.get(cle);
        return { cle: id, libelle: e?.libelle ?? valeur, detail: e?.detail ?? null, groupe: null, filtre };
      }
      const n = noms.get(cle);
      return {
        cle: id,
        libelle: n?.libelle ?? cle,
        detail: r === 'personne' ? (n?.detail ?? null) : null,
        groupe: r === 'groupe' || r === 'personne' ? (n?.groupe ?? null) : null,
        filtre,
      };
    });
  }

  /** « dossier/case » → libellé de la case et titre du dossier. */
  private async nommerEtapes(cles: string[]): Promise<Map<string, { libelle: string; detail: string | null }>> {
    const paires = cles.map((c) => c.split('/')).filter(([d]) => estUuid(d));
    const resultat = new Map<string, { libelle: string; detail: string | null }>();
    if (!paires.length) return resultat;
    const lignes = await this.db.all<{ dossier: string; cle: string; libelle: string; titre: string }>(
      `SELECT pd.dossier_id AS dossier, pd.cle, pd.libelle, d.titre
       FROM unnest($dossiers::uuid[], $cles::text[]) AS u(dossier, cle)
       JOIN lecture.parcours_dossier pd ON pd.dossier_id = u.dossier AND pd.cle = u.cle
       JOIN canon.dossier d ON d.entite_id = pd.dossier_id`,
      { $dossiers: paires.map(([d]) => d), $cles: paires.map(([, c]) => c) },
    );
    for (const l of lignes) resultat.set(`${l.dossier}/${l.cle}`, { libelle: l.libelle, detail: l.titre });
    return resultat;
  }

  /** Personnes (groupe : appartenance du jour, sinon la dernière), retirées omises. */
  private async personnesRef(ids: string[]): Promise<Map<string, PersonneRef>> {
    const uniques = [...new Set(ids.filter(estUuid))];
    const resultat = new Map<string, PersonneRef>();
    if (!uniques.length) return resultat;
    const lignes = await this.db.all<{ id: string; nom: string; groupe: GroupeLu | null }>(
      `SELECT p.entite_id AS id, p.nom_affiche AS nom,
              (SELECT ${sqlGroupe('o')} FROM lecture.appartenance_groupe a JOIN canon.organisation o ON o.entite_id = a.groupe_id
               WHERE a.personne_id = p.entite_id ORDER BY (CURRENT_DATE BETWEEN a.debut AND a.fin) DESC, a.fin DESC LIMIT 1) AS groupe
       FROM canon.personne p WHERE p.entite_id = ANY($ids::uuid[]) AND ${RETIREE('p.entite_id')}`,
      { $ids: uniques },
    );
    for (const l of lignes) resultat.set(l.id, { id: l.id, nom: l.nom, fonction: null, groupe: groupeRef(l.groupe) });
    return resultat;
  }

  // ----- Construction des faits -----

  /** Les faits de ces repères, construits par type ; inconnus ou retirés omis. */
  private async construire(reperes: Repere[], f: FiltresFaits): Promise<Map<string, Fait>> {
    const de = (k: string) => [...new Set(reperes.filter((r) => r.k === k).map((r) => r.id))];
    const [interventions, amendements, scrutins, mainsLevees, questions, declarations] = await Promise.all([
      this.interventions(de('intervention')),
      this.amendements(de('amendement')),
      this.scrutinsFaits(de('scrutin'), f),
      this.mainsLevees(de('main_levee')),
      this.questions(de('question')),
      this.declarations(de('declaration')),
    ]);
    return new Map([...interventions, ...amendements, ...scrutins, ...mainsLevees, ...questions, ...declarations].map((x) => [x.id, x]));
  }

  /** Contexte (dossier, case, article) d'interventions, par leurs liens. */
  private async interventions(ids: string[]): Promise<Fait[]> {
    if (!ids.length) return [];
    const [liste, contextes] = await Promise.all([
      this.discussions.parIds(ids),
      this.db.all<{ id: string; cle: string | null; libelle: string | null; article: ArticleRef | null }>(
        `SELECT i.entite_id AS id, rc.cle, pd.libelle,
                (SELECT json_build_object('id', a.article_suivi_id, 'numero', ${sqlNumeroArticle('a.article_suivi_id')})
                 FROM canon.amendement a WHERE a.entite_id = i.amendement_id AND a.article_suivi_id IS NOT NULL) AS article
         FROM canon.intervention i
         LEFT JOIN LATERAL (SELECT ${CASE_DE_LA_REUNION('i.reunion_id', 'i.dossier_id')} AS cle) rc ON true
         LEFT JOIN lecture.parcours_dossier pd ON pd.dossier_id = i.dossier_id AND pd.cle = rc.cle
         WHERE i.entite_id = ANY($ids::uuid[])`,
        { $ids: ids },
      ),
    ]);
    const parId = new Map(contextes.map((c) => [c.id, c]));
    return liste.map((i): Fait => {
      const c = parId.get(i.id);
      return {
        type: 'intervention',
        id: i.id,
        orateur: i.orateur,
        groupe: i.groupe,
        ...couper(i.texte),
        reunion: i.reunion,
        contexte: {
          dossier: i.sujet.dossier,
          etape: c?.cle && c.libelle ? { cle: c.cle as CleCase, libelle: c.libelle } : null,
          article: c?.article?.numero ? c.article : null,
          date: i.reunion.debut ? i.reunion.debut.slice(0, 10) : null,
        },
        compteRendu: i.compteRendu,
      };
    });
  }

  private async amendements(ids: string[]): Promise<Fait[]> {
    if (!ids.length) return [];
    const [resumes, lignes] = await Promise.all([
      this.dossiers.resumesAmendements(ids),
      this.db.all<{ id: string; dossier_id: string | null; date: string | null; provenance: Provenance }>(
        `SELECT a.entite_id AS id, a.dossier_id, a.date_sort::text AS date, ${sqlProvenance('a.entite_id', 'amendement')} AS provenance
         FROM canon.amendement a WHERE a.entite_id = ANY($ids::uuid[])`,
        { $ids: ids },
      ),
    ]);
    const dossiers = await dossiersRef(this.db, lignes.map((l) => l.dossier_id));
    return lignes.flatMap((l): Fait[] => {
      const a: AmendementResume | undefined = resumes.get(l.id);
      if (!a) return [];
      const contexte: ContexteFait = { dossier: (l.dossier_id && dossiers.get(l.dossier_id)) || null, etape: a.etape, article: a.article, date: l.date };
      return [{ type: 'amendement', id: l.id, amendement: a, contexte, provenance: l.provenance }];
    });
  }

  private async mainsLevees(ids: string[]): Promise<Fait[]> {
    const faits = await this.amendements(ids);
    return faits.flatMap((x): Fait[] =>
      x.type === 'amendement'
        ? [{
            type: 'main_levee',
            id: x.id,
            amendement: { id: x.amendement.id, numero: x.amendement.numero, chambre: x.amendement.chambre },
            sort: x.amendement.sort,
            contexte: x.contexte,
            provenance: x.provenance,
          }]
        : [],
    );
  }

  /** Scrutins, avec la position de la personne ou du groupe filtrés. */
  private async scrutinsFaits(ids: string[], f: FiltresFaits): Promise<Fait[]> {
    if (!ids.length) return [];
    const [resumes, provenances, duFiltre] = await Promise.all([
      this.scrutins.resumes(ids),
      this.db.all<{ id: string; provenance: Provenance }>(
        `SELECT s.entite_id AS id, ${sqlProvenance('s.entite_id', 'scrutin')} AS provenance FROM canon.scrutin s WHERE s.entite_id = ANY($ids::uuid[])`,
        { $ids: ids },
      ),
      this.duFiltre(ids, f),
    ]);
    const prov = new Map(provenances.map((p) => [p.id, p.provenance]));
    return resumes.map((s): Fait => ({ type: 'scrutin', id: s.id, scrutin: s, duFiltre: duFiltre.get(s.id) ?? null, provenance: prov.get(s.id)! }));
  }

  private async duFiltre(ids: string[], f: FiltresFaits): Promise<Map<string, VoteDuFiltre>> {
    const resultat = new Map<string, VoteDuFiltre>();
    if (f.personne && estUuid(f.personne)) {
      const votes = await this.db.all<{ id: string; position: Position; par_delegation: boolean | null; pour: number | null; contre: number | null; abstentions: number | null }>(
        `SELECT v.scrutin_id AS id, v.position, v.par_delegation, pg.pour, pg.contre, pg.abstentions
         FROM canon.vote v LEFT JOIN canon.position_groupe pg ON pg.scrutin_id = v.scrutin_id AND pg.groupe_id = v.groupe_id
         WHERE v.scrutin_id = ANY($ids::uuid[]) AND v.personne_id = $personne::uuid`,
        { $ids: ids, $personne: f.personne },
      );
      for (const v of votes) {
        const ligne = v.pour === null ? null : majoritaire({ pour: v.pour ?? 0, contre: v.contre ?? 0, abstention: v.abstentions ?? 0 });
        resultat.set(v.id, { type: 'personne', position: v.position, parDelegation: v.par_delegation ?? false, contreSonGroupe: estEcart(v.position, ligne) });
      }
    } else if (f.groupe && estUuid(f.groupe)) {
      const lignes = await this.db.all<{ id: string; pour: number; contre: number; abstentions: number; membres: number | null }>(
        `SELECT pg.scrutin_id AS id, pg.pour, pg.contre, pg.abstentions, pg.membres
         FROM canon.position_groupe pg WHERE pg.scrutin_id = ANY($ids::uuid[]) AND pg.groupe_id = $groupe::uuid`,
        { $ids: ids, $groupe: f.groupe },
      );
      for (const l of lignes) {
        const decompte = { pour: l.pour ?? 0, contre: l.contre ?? 0, abstention: l.abstentions ?? 0 };
        resultat.set(l.id, { type: 'groupe', ligne: majoritaire(decompte), decompte, membres: l.membres ?? 0 });
      }
    }
    return resultat;
  }

  private async questions(ids: string[]): Promise<Fait[]> {
    if (!ids.length) return [];
    const lignes = await this.db.all<{
      id: string;
      type: string;
      numero: string;
      date: string | null;
      titre: string | null;
      rubrique: string | null;
      ministere: string | null;
      date_reponse: string | null;
      auteur_id: string | null;
      provenance: Provenance;
    }>(
      `SELECT q.entite_id AS id, q.type, q.numero, q.date::text AS date, q.titre, q.rubrique,
              COALESCE(q.ministere_attributaire, q.ministere) AS ministere, q.date_reponse::text AS date_reponse, q.auteur_id,
              ${sqlProvenance('q.entite_id', 'question')} AS provenance
       FROM canon.question q WHERE q.entite_id = ANY($ids::uuid[])`,
      { $ids: ids },
    );
    const auteurs = await this.personnesRef(lignes.flatMap((l) => (l.auteur_id ? [l.auteur_id] : [])));
    return lignes.map((l): Fait => ({
      type: 'question',
      id: l.id,
      question: {
        id: l.id,
        type: l.type === 'QE' || l.type === 'QOSD' ? l.type : 'QG',
        numero: l.numero,
        date: l.date,
        titre: l.titre,
        rubrique: l.rubrique,
        ministere: l.ministere,
        dateReponse: l.date_reponse,
        provenance: l.provenance,
      },
      auteur: (l.auteur_id && auteurs.get(l.auteur_id)) || null,
    }));
  }

  private async declarations(ids: string[]): Promise<Fait[]> {
    if (!ids.length) return [];
    const lignes = await this.db.all<{
      id: string;
      personne_id: string;
      type: string;
      libelle: string | null;
      modificative: boolean | null;
      date_depot: string | null;
      date_publication: string | null;
      url: string | null;
      provenance: Provenance;
    }>(
      `SELECT d.entite_id AS id, d.personne_id, d.type, d.type_libelle AS libelle, d.modificative, d.date_depot::text AS date_depot,
              d.date_publication::text AS date_publication, d.url, ${sqlProvenance('d.entite_id', 'declaration')} AS provenance
       FROM canon.declaration d WHERE d.entite_id = ANY($ids::uuid[])`,
      { $ids: ids },
    );
    const personnes = await this.personnesRef(lignes.map((l) => l.personne_id));
    return lignes.flatMap((l): Fait[] => {
      const personne = personnes.get(l.personne_id);
      if (!personne) return [];
      return [{
        type: 'declaration',
        id: l.id,
        personne,
        declaration: {
          id: l.id,
          type: l.type,
          libelle: l.libelle ?? l.type,
          modificative: l.modificative ?? false,
          dateDepot: l.date_depot,
          datePublication: l.date_publication,
          url: l.url,
        },
        provenance: l.provenance,
      }];
    });
  }
}

