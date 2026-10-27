// Dossiers législatifs sur Postgres (schémas `canon` et `lecture`) : listes, en-tête, barre de
// parcours, étapes (une case de la barre), articles et versions, amendements, acteurs, chiffres et
// sources. Garanties G1 à G6 de `ports.ts` : rien n'est inventé (donnée absente → null ou liste
// vide), entités retirées ou fusionnées ignorées, chaque fait avec sa `Provenance`.
//
// La barre vient de la projection `lecture.parcours_*` (opendata, projections/55) ; tant qu'elle
// n'est pas chargée en base, ce qui en dépend est rendu vide ou null (pas d'erreur).
//
// Règles propres à l'adaptateur (documentées ici, jamais des suppositions sur les faits) :
//   - titre d'un dossier : `titre_court` s'il est un titre ; l'AN y met parfois le chemin de sa page
//     (« projet_loi_urgence_pour_… ») : c'est alors le titre officiel qui est rendu ;
//   - URL d'une provenance : celle de la correspondance, sinon celle que `canon.provenance` donne à
//     l'objet (page AN d'un dossier) ; jamais l'URL de l'archive du jeu de données ;
//   - ordre des versions d'un texte : celui que publie la navette (`modification_article`,
//     version précédente → version), complété par la date publiée puis la nature du texte ; une
//     version sans date ni étape prend celles du premier acte qui cite son document (lien
//     « texte » : AN1-DEBATS-DEC → texte adopté) ; une version autre que le texte déposé datée du
//     jour du dépôt du dossier (textes du Sénat en base au 24/10/2026) est rendue sans date ;
//   - personnes : mandat et groupe au moment du rôle (dépôt, nomination, CMP), sinon aujourd'hui ;
//   - diff d'un article : celui de `modification_article` quand il compare les deux mêmes versions,
//     sinon un diff mot à mot calculé ici (typographie ignorée : espaces insécables, apostrophes).

import type {
  AmendementResume,
  ArticleRef,
  ArticleResume,
  Auteur,
  CaseCompacte,
  CaseParcours,
  ChangementDepuisLeDepot,
  ChangementEtape,
  Chiffre,
  CleCase,
  DeviationParcours,
  DocumentOfficiel,
  DossierLie,
  DossierRef,
  DossierResume,
  Echeance,
  EffetDeviation,
  EnteteDossier,
  EtapeResume,
  EtatCase,
  EtatDossier,
  Facette,
  FamilleParcours,
  FicheAmendement,
  FicheArticle,
  FicheEtape,
  FiltreDossiers,
  GroupeActeurs,
  GroupeRef,
  ActeurDossier,
  AvisAmendement,
  Lieu,
  ListeDossiers,
  NatureEtape,
  NatureTexte,
  Origine,
  OrigineModification,
  OrganisationRef,
  Page,
  Parcours,
  PersonneRef,
  Provenance,
  SegmentDiff,
  SortAmendement,
  StatAmendementsEtape,
  StatutVersionArticle,
  Systeme,
  TexteEnAttente,
  TypeDocument,
  VersionArticle,
} from '@contrat/domain/model';
import type { ActeSuivi, DossiersRepository, Pagination, PositionTexte, SqlDatabase, SqlParams } from '../../ports';
import { groupe as groupeRef } from './personnes';

// ---------- Vocabulaire ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const estUuid = (id: string | null | undefined): id is string => !!id && UUID.test(id);

/**
 * Entité ni retirée de la source, ni fusionnée dans une autre (G2). Écrit en anti-jointure : les
 * entités écartées sont peu nombreuses, le planificateur part alors de la table métier.
 */
const vivant = (colonne: string) =>
  `NOT EXISTS (SELECT 1 FROM canon.entite x_ WHERE x_.entite_id = ${colonne} AND (x_.retiree_de_la_source_le IS NOT NULL OR x_.fusionnee_dans IS NOT NULL))`;

const SYSTEMES: readonly Systeme[] = ['AN', 'SENAT', 'LEGIFRANCE', 'CONSTIT', 'HATVP', 'RNE', 'INSEE', 'CIVICTRACE'];
const ETATS_DOSSIER: readonly EtatDossier[] = [
  'en_cours', 'adopte', 'promulgue', 'rejete', 'retire', 'caduc', 'fusionne', 'irrecevable', 'rapport_publie',
];
const SORTS: readonly SortAmendement[] = ['adopte', 'rejete', 'retire', 'tombe', 'non_soutenu', 'irrecevable', 'en_attente'];
/** Clé d'étape d'un modèle de parcours (`canon.parcours_etape.cle`) : mot en minuscules et « _ ». */
const cleEtape = (valeur: string | null | undefined): CleCase | null =>
  valeur != null && /^[a-z0-9_]+$/.test(valeur) ? valeur : null;
const FAMILLES: readonly FamilleParcours[] = ['legislatif', 'resolution', 'controle', 'gouvernement', 'autre'];
const NATURES: readonly NatureEtape[] = ['obligatoire', 'conditionnelle', 'facultative'];
const EFFETS: readonly EffetDeviation[] = ['rejoint', 'termine', 'remplace', 'suspend'];
const ETATS_CASE: readonly EtatCase[] = ['faite', 'en_cours', 'a_venir', 'sans_objet', 'inconnu'];
const STATUTS_VERSION: readonly StatutVersionArticle[] = ['present', 'ajoute', 'supprime', 'conforme', 'non_modifie'];
const LIEUX: readonly Lieu[] = ['AN', 'SENAT', 'CMP', 'CC', 'PR', 'JO', 'GOUVERNEMENT'];
const TYPES_DOCUMENT: readonly TypeDocument[] = [
  'projet', 'proposition', 'rapport', 'avis', 'texte_commission', 'texte_adopte', 'etude_impact', 'avis_ce', 'compte_rendu',
  'saisine', 'decision', 'loi', 'accord', 'motion', 'autre',
];

const dans = <T extends string>(liste: readonly T[], valeur: string | null | undefined): T | null =>
  valeur != null && (liste as readonly string[]).includes(valeur) ? (valeur as T) : null;

const LIBELLES_ETAT: Record<EtatDossier, string> = {
  en_cours: 'En cours',
  adopte: 'Adoptés',
  promulgue: 'Promulgués',
  rejete: 'Rejetés',
  retire: 'Retirés',
  caduc: 'Caducs',
  fusionne: 'Fusionnés',
  irrecevable: 'Irrecevables',
  rapport_publie: 'Rapports publiés',
};
const LIBELLES_ORIGINE: Record<Origine, string> = { gouvernement: 'Gouvernement', parlementaire: 'Parlementaires' };
const LIBELLES_DOCUMENT: Record<TypeDocument, string> = {
  projet: 'Projet de loi',
  proposition: 'Proposition de loi',
  rapport: 'Rapport',
  avis: 'Avis',
  texte_commission: 'Texte de la commission',
  texte_adopte: 'Texte adopté',
  etude_impact: 'Étude d’impact',
  avis_ce: 'Avis du Conseil d’État',
  compte_rendu: 'Compte rendu',
  saisine: 'Saisine',
  decision: 'Décision',
  loi: 'Loi',
  accord: 'Accord',
  motion: 'Motion',
  autre: 'Document',
};
const LIBELLES_AVIS: Record<string, string> = {
  favorable: 'Favorable',
  defavorable: 'Défavorable',
  sagesse: 'Sagesse',
  retrait: 'Demande de retrait',
  avis_du_gouvernement: 'Avis du Gouvernement',
};

/**
 * État d'un dossier : l'issue de son parcours (`lecture.parcours_dossier_synthese.issue`, cf.
 * projection 55) : déviation qui termine (retrait, caducité, fusion…), sinon dernière étape faite
 * qui porte une issue (« rejete » si sa conclusion dit un rejet), sinon en cours. Une ligne par
 * dossier de la projection.
 */
const ETATS_PARCOURS = `SELECT s.dossier_id, s.issue AS etat FROM lecture.parcours_dossier_synthese s`;

/** Statut publié dans canon.dossier, s'il est du vocabulaire. */
const STATUT_PUBLIE = `CASE WHEN d.statut IN (${ETATS_DOSSIER.map((e) => `'${e}'`).join(', ')}) THEN d.statut END`;

// ---------- Lignes SQL ----------

interface LigneDossier {
  id: string;
  titre: string;
  titre_court: string | null;
  type_procedure: string | null;
  procedure_acceleree: boolean | null;
  initiative: string | null;
  legislature: string | null;
  date_depot: string | null;
  statut: string | null;
}

interface LigneCase {
  dossier_id: string;
  modele: string;
  version: number;
  procedure: string;
  origine: string | null;
  rang: number;
  cle: string;
  libelle: string;
  chambre: string | null;
  nature: string;
  facultative: boolean;
  etat: string;
  debut: string | null;
  fin: string | null;
  programmee_le: string | null;
  conclusion: string | null;
  courante: boolean;
  attendue: boolean;
  deviation: boolean;
  provenance: string[] | null;
  date_reference: string;
}

interface LigneSynthese {
  dossier_id: string;
  etape_courante: string | null;
  etape_courante_libelle: string | null;
  etape_courante_etat: string | null;
  cases_faites: number;
  cases_affichees: number;
  retire_le: string | null;
  prochaine_echeance: string | null;
  prochaine_echeance_heure: string | null;
  prochaine_echeance_libelle: string | null;
  prochaine_echeance_etat: string | null;
  prochaine_echeance_cle: string | null;
}

interface VersionTexte {
  id: string;
  nature: string;
  chambre: string | null;
  date: string | null;
  etape_id: string | null;
  id_natif: string | null;
  rang: number;
}

interface VersionArticleLigne {
  id: string;
  article: string;
  version_texte: string;
  numero: string;
  intitule: string | null;
  ordre: number;
  empreinte: string;
  statut: string;
  mention: string | null;
}

interface LigneModification {
  version_article_id: string;
  version_precedente_id: string | null;
  origine: string;
  amendement_id: string | null;
  statut: string;
  diff: { format?: string; operations?: [string, string][]; motif?: string } | null;
}

/** Navette d'un dossier : versions du texte ordonnées, et versions de chaque article suivi. */
interface Navette {
  versions: VersionTexte[];
  /** Rang 0 : texte déposé (premier texte déposé de la navette), null si aucun n'est chargé. */
  depose: string | null;
  articles: Map<string, { intitule: string | null; versions: VersionArticleLigne[] }>;
}

// ---------- Fonctions pures ----------

/**
 * Titre affiché : le titre court officiel, sauf quand la source y met un chemin d'URL
 * (« fin_de_vie_17e ») ou l'identifiant du dossier (« DLR5L17N55154 ») : un seul mot avec des
 * chiffres ou des « _ » n'est pas un titre.
 */
export function titreAffiche(titre: string, titreCourt: string | null): string {
  if (!titreCourt?.trim() || (!/\s/.test(titreCourt.trim()) && /[_\d]/.test(titreCourt))) return titre;
  return titreCourt.trim();
}

function natureTexte(typeProcedure: string | null): NatureTexte | null {
  if (!typeProcedure) return null;
  if (/^projet/i.test(typeProcedure)) return 'projet';
  if (/^proposition/i.test(typeProcedure)) return 'proposition';
  return null;
}

const procedureDe = (acceleree: boolean | null) => (acceleree === true ? 'acceleree' : acceleree === false ? 'normale' : null);
const lieuDe = (chambre: string | null): Lieu | null => dans(LIEUX, chambre);
const feminin = (civilite: string | null) => !!civilite && /^m(me|lle)/i.test(civilite);

/** « 2026-08-19 » → « 19/08/2026 ». */
const dateFr = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

function joursEntre(debut: string, fin: string): number {
  return Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000);
}

function compacte(c: LigneCase): CaseCompacte {
  return {
    cle: c.cle,
    libelle: c.libelle,
    etat: dans(ETATS_CASE, c.etat) ?? 'inconnu',
    courante: c.courante,
    attendue: c.attendue,
    deviation: c.deviation,
  };
}

function page<T>(elements: T[], pagination: Pagination, total: number): Page<T> {
  return {
    elements,
    page: pagination.page,
    taille: pagination.taille,
    total,
    suivante: pagination.page * pagination.taille < total ? pagination.page + 1 : null,
  };
}

/** Rang d'une nature de texte dans une lecture : déposé, transmis, commission, adopté, définitif. */
function rangNature(nature: string): number {
  const n = nature.toLowerCase();
  if (/^d[ée]pos/.test(n)) return 0;
  if (/^transmis/.test(n)) return 1;
  if (/commission/.test(n)) return 2;
  if (/d[ée]finitiv/.test(n)) return 4;
  if (/adopt|modifi|rejet|devenu/.test(n)) return 3;
  return 5;
}

/**
 * Ordre des versions : celui que la navette publie (arêtes précédente → version), puis la date
 * publiée, la nature et l'identifiant natif pour ce que la navette ne dit pas. Tri topologique
 * stable ; une boucle dans les données laisse l'ordre par date.
 */
export function ordonnerVersions<T extends { id: string; nature: string; date: string | null; id_natif: string | null }>(
  versions: T[],
  aretes: { avant: string; apres: string }[],
): T[] {
  const cle = (v: T) => [v.date ?? '9999-99-99', String(rangNature(v.nature)), v.id_natif ?? v.id].join('|');
  const tries = [...versions].sort((a, b) => (cle(a) < cle(b) ? -1 : cle(a) > cle(b) ? 1 : 0));
  const connus = new Set(versions.map((v) => v.id));
  const entrants = new Map<string, number>(versions.map((v) => [v.id, 0]));
  const suivants = new Map<string, string[]>();
  const vues = new Set<string>();
  for (const { avant, apres } of aretes) {
    if (avant === apres || !connus.has(avant) || !connus.has(apres) || vues.has(`${avant}>${apres}`)) continue;
    vues.add(`${avant}>${apres}`);
    entrants.set(apres, (entrants.get(apres) ?? 0) + 1);
    suivants.set(avant, [...(suivants.get(avant) ?? []), apres]);
  }
  const resultat: T[] = [];
  const restants = new Set(tries.map((v) => v.id));
  while (restants.size > 0) {
    const prochaine = tries.find((v) => restants.has(v.id) && entrants.get(v.id) === 0) ?? tries.find((v) => restants.has(v.id))!;
    restants.delete(prochaine.id);
    resultat.push(prochaine);
    for (const s of suivants.get(prochaine.id) ?? []) entrants.set(s, (entrants.get(s) ?? 1) - 1);
  }
  return resultat;
}

/** Empreinte effective : une version « Conforme » ou « Non modifié » reprend la précédente. */
function empreintesEffectives(versions: VersionArticleLigne[]): string[] {
  const resultat: string[] = [];
  for (const v of versions) {
    const precedente = resultat.at(-1);
    resultat.push((v.statut === 'conforme' || v.statut === 'non_modifie') && precedente !== undefined ? precedente : v.empreinte);
  }
  return resultat;
}

/** Jeton de comparaison : un mot et l'espace qui le suit ; la typographie ne compte pas. */
function jetons(texte: string): { texte: string; cle: string }[] {
  return (texte.match(/\s*\S+\s*/g) ?? []).map((t) => ({
    texte: t,
    cle: t
      .normalize('NFC')
      .trim()
      .replace(/[   ]/g, ' ')
      .replace(/[’‘ʼ]/g, "'")
      .replace(/[‐‑–]/g, '-')
      .replace(/œ/g, 'oe'),
  }));
}

function fusionner(segments: SegmentDiff[]): SegmentDiff[] {
  const resultat: SegmentDiff[] = [];
  for (const s of segments) {
    if (!s.texte) continue;
    const dernier = resultat.at(-1);
    if (dernier && dernier.type === s.type) dernier.texte += s.texte;
    else resultat.push({ ...s });
  }
  return resultat;
}

/**
 * Diff mot à mot (Myers) de deux textes d'article : segments égaux, supprimés, ajoutés. Au-delà de
 * 2 000 différences, le texte est donné supprimé puis ajouté (comme opendata/src/diffs.py).
 */
export function diffMots(ancien: string, nouveau: string): SegmentDiff[] {
  const a = jetons(ancien);
  const b = jetons(nouveau);
  let debut = 0;
  while (debut < a.length && debut < b.length && a[debut].cle === b[debut].cle) debut++;
  let finA = a.length;
  let finB = b.length;
  while (finA > debut && finB > debut && a[finA - 1].cle === b[finB - 1].cle) {
    finA--;
    finB--;
  }
  const egal = (de: number, a_: number) => b.slice(de, a_).map((t) => t.texte).join('');
  const prefixe: SegmentDiff = { type: 'egal', texte: egal(0, debut) };
  const suffixe: SegmentDiff = { type: 'egal', texte: egal(finB, b.length) };
  const x = a.slice(debut, finA);
  const y = b.slice(debut, finB);
  const n = x.length;
  const m = y.length;
  const max = n + m;
  const brut = (): SegmentDiff[] => [
    { type: 'supprime', texte: x.map((t) => t.texte).join('') },
    { type: 'ajoute', texte: y.map((t) => t.texte).join('') },
  ];
  if (max === 0) return fusionner([prefixe, suffixe]);
  const decalage = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  let trouve = -1;
  for (let d = 0; d <= Math.min(max, 2000) && trouve < 0; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let i = k === -d || (k !== d && v[k - 1 + decalage] < v[k + 1 + decalage]) ? v[k + 1 + decalage] : v[k - 1 + decalage] + 1;
      let j = i - k;
      while (i < n && j < m && x[i].cle === y[j].cle) {
        i++;
        j++;
      }
      v[k + decalage] = i;
      if (i >= n && j >= m) {
        trouve = d;
        break;
      }
    }
  }
  if (trouve < 0) return fusionner([prefixe, ...brut(), suffixe]);
  const inverse: SegmentDiff[] = [];
  let i = n;
  let j = m;
  for (let d = trouve; d >= 0; d--) {
    const w = trace[d];
    const k = i - j;
    const precK = k === -d || (k !== d && w[k - 1 + decalage] < w[k + 1 + decalage]) ? k + 1 : k - 1;
    const precI = w[precK + decalage];
    const precJ = precI - precK;
    while (i > precI && j > precJ) {
      inverse.push({ type: 'egal', texte: y[j - 1].texte });
      i--;
      j--;
    }
    if (d > 0) {
      if (i === precI) inverse.push({ type: 'ajoute', texte: y[j - 1].texte });
      else inverse.push({ type: 'supprime', texte: x[i - 1].texte });
    }
    i = precI;
    j = precJ;
  }
  return fusionner([prefixe, ...inverse.reverse(), suffixe]);
}

/** Diff publié par opendata (`modification_article.diff`, format « mots ») → segments. */
export function segmentsPublies(diff: LigneModification['diff']): SegmentDiff[] | null {
  if (!diff || diff.format !== 'mots' || !Array.isArray(diff.operations)) return null;
  const types: Record<string, SegmentDiff['type']> = { '=': 'egal', '-': 'supprime', '+': 'ajoute' };
  return fusionner(diff.operations.filter(([op]) => op in types).map(([op, texte]) => ({ type: types[op], texte: String(texte) })));
}

// ---------- Adaptateur ----------

/** Paramètres nommés écrits sans « $ » (`{ id }`), passés au port avec (`{ $id }`, cf. PgDatabase). */
function avecDollar(db: SqlDatabase): SqlDatabase {
  const p = (params?: SqlParams) =>
    params && Object.fromEntries(Object.entries(params).map(([k, v]) => [k.startsWith('$') ? k : `$${k}`, v]));
  return { all: (sql, params) => db.all(sql, p(params)), first: (sql, params) => db.first(sql, p(params)) };
}

export class PgDossiers implements DossiersRepository {
  private projectionChargee = false;
  private readonly db: SqlDatabase;
  /** Personnes de civilité « Mme » vues par `personnes()` : accord des rôles (« rapporteure »). */
  private readonly feminins = new Set<string>();

  constructor(db: SqlDatabase) {
    this.db = avecDollar(db);
  }

  // ----- Socle : projection, provenances, personnes -----

  /** La projection `lecture.parcours_*` est-elle en base ? (vrai une fois vu, revérifié sinon) */
  private async projection(): Promise<boolean> {
    if (this.projectionChargee) return true;
    const r = await this.db.first<{ ok: boolean }>(
      `SELECT to_regclass('lecture.parcours_dossier') IS NOT NULL AND to_regclass('lecture.parcours_acte') IS NOT NULL
              AND to_regclass('lecture.parcours_dossier_synthese') IS NOT NULL AS ok`,
    );
    this.projectionChargee = r?.ok === true;
    return this.projectionChargee;
  }

  /**
   * Provenance de chaque entité (G3) : sa correspondance VERIFIED (identifiant officiel d'abord) ;
   * à défaut, l'enregistrement brut qui l'a écrite ; à défaut, son identité CIVICTRACE.
   */
  private async provenances(ids: string[]): Promise<Map<string, Provenance>> {
    const uniques = [...new Set(ids.filter(estUuid))];
    const resultat = new Map<string, Provenance>();
    if (uniques.length === 0) return resultat;
    const lignes = await this.db.all<{ id: string; systeme: string; type: string; id_natif: string | null; url: string | null; rang: number }>(
      `WITH c AS (
         SELECT DISTINCT ON (c.entite_id) c.entite_id AS id, c.systeme, c.type_source AS type, c.id_source AS id_natif, c.url,
                1 AS rang
         FROM canon.correspondance c
         WHERE c.entite_id = ANY($ids::uuid[]) AND c.statut = 'VERIFIED'
         ORDER BY c.entite_id, (c.methode = 'OFFICIAL_ID') DESC, (c.systeme = 'CIVICTRACE'), c.systeme, c.id_source
       ), b AS (
         SELECT DISTINCT ON (p.entite_id) p.entite_id AS id, s.systeme, e.type, s.id_source AS id_natif, NULL::text AS url,
                2 AS rang
         FROM canon.provenance p
         JOIN brut.enregistrement_source s ON s.source_id = p.source_id
         JOIN canon.entite e ON e.entite_id = p.entite_id
         WHERE p.entite_id = ANY($ids::uuid[]) AND s.id_source IS NOT NULL AND p.entite_id NOT IN (SELECT id FROM c)
         ORDER BY p.entite_id, p.vu_le DESC
       ), toutes AS (SELECT * FROM c UNION ALL SELECT * FROM b)
       SELECT t.id, t.systeme, t.type, t.id_natif, t.rang,
              COALESCE(t.url, (
                SELECT p.url FROM canon.provenance p JOIN brut.enregistrement_source s ON s.source_id = p.source_id
                WHERE p.entite_id = t.id AND s.systeme = t.systeme AND p.url IS NOT NULL AND p.url IS DISTINCT FROM s.url
                ORDER BY p.vu_le DESC LIMIT 1)) AS url
       FROM toutes t`,
      { ids: uniques },
    );
    for (const l of lignes) {
      const systeme = dans(SYSTEMES, l.systeme);
      if (!systeme || !l.id_natif) continue;
      resultat.set(l.id, { systeme, type: l.type, idNatif: l.id_natif, url: l.url });
    }
    const manquants = uniques.filter((id) => !resultat.has(id));
    if (manquants.length > 0) {
      const types = await this.db.all<{ id: string; type: string }>(
        `SELECT entite_id AS id, type FROM canon.entite WHERE entite_id = ANY($ids::uuid[])`,
        { ids: manquants },
      );
      for (const t of types) resultat.set(t.id, { systeme: 'CIVICTRACE', type: t.type, idNatif: t.id, url: null });
    }
    return resultat;
  }

  private async provenance(id: string): Promise<Provenance | null> {
    return (await this.provenances([id])).get(id) ?? null;
  }

  /**
   * Références de personnes à une date (groupe et mandat ce jour-là, sinon aujourd'hui).
   * Clé : `${id}|${jour ?? ''}`. Une personne retirée ou fusionnée n'est pas rendue.
   */
  private async personnes(demandes: { id: string; jour: string | null }[]): Promise<Map<string, PersonneRef>> {
    const resultat = new Map<string, PersonneRef>();
    const vues = new Map<string, { id: string; jour: string | null }>();
    for (const d of demandes) if (estUuid(d.id)) vues.set(`${d.id}|${d.jour ?? ''}`, d);
    if (vues.size === 0) return resultat;
    const liste = [...vues.values()];
    const lignes = await this.db.all<{
      cle: number;
      id: string;
      nom: string;
      civilite: string | null;
      mandat: string | null;
      gouvernement: string | null;
      groupe_id: string | null;
      abrege: string | null;
      libelle: string | null;
      couleur: string | null;
      source_couleur: string | null;
      chambre: string | null;
    }>(
      `SELECT q.cle::int AS cle, p.entite_id AS id, p.nom_affiche AS nom, p.civilite,
              (SELECT f.type FROM canon.fonction f
               WHERE f.personne_id = p.entite_id AND f.type IN ('depute', 'senateur')
                 AND (f.debut IS NULL OR f.debut <= q.jour) AND (f.fin IS NULL OR f.fin >= q.jour) AND ${vivant('f.entite_id')}
               ORDER BY f.debut DESC NULLS LAST LIMIT 1) AS mandat,
              (SELECT CASE WHEN f.qualite = o.nom THEN f.qualite ELSE f.titre END
               FROM canon.fonction f LEFT JOIN canon.organisation o ON o.entite_id = f.organisation_id
               WHERE f.personne_id = p.entite_id AND f.type = 'membre_gouvernement' AND COALESCE(f.qualite, '') <> 'membre'
                 AND (f.debut IS NULL OR f.debut <= q.jour) AND (f.fin IS NULL OR f.fin >= q.jour) AND ${vivant('f.entite_id')}
               ORDER BY f.debut DESC NULLS LAST LIMIT 1) AS gouvernement,
              g.id AS groupe_id, g.abrege, g.libelle, g.couleur, g.source_couleur, g.chambre
       FROM (SELECT u.id, COALESCE(NULLIF(u.jour, '')::date, CURRENT_DATE) AS jour, u.cle
             FROM unnest($ids::uuid[], $jours::text[]) WITH ORDINALITY AS u(id, jour, cle)) q
       JOIN canon.personne p ON p.entite_id = q.id
       LEFT JOIN LATERAL (
         SELECT o.entite_id AS id, COALESCE(o.nom_court, o.abrege, o.nom) AS abrege, o.nom AS libelle,
                COALESCE(cg.couleur, o.couleur) AS couleur, cg.source AS source_couleur, o.chambre
         FROM lecture.appartenance_groupe ag JOIN canon.organisation o ON o.entite_id = ag.groupe_id
         LEFT JOIN lecture.couleur_groupe cg ON cg.groupe_id = o.entite_id
         WHERE ag.personne_id = p.entite_id AND ag.debut <= q.jour AND ag.fin >= q.jour AND o.chambre IN ('AN', 'SENAT')
         ORDER BY ag.debut DESC LIMIT 1) g ON true
       WHERE ${vivant('p.entite_id')}`,
      { ids: liste.map((d) => d.id), jours: liste.map((d) => d.jour ?? '') },
    );
    for (const l of lignes) {
      const d = liste[l.cle - 1];
      const f = feminin(l.civilite);
      const mandat = l.mandat === 'depute' ? (f ? 'Députée' : 'Député') : l.mandat === 'senateur' ? (f ? 'Sénatrice' : 'Sénateur') : null;
      const groupe: GroupeRef | null =
        l.groupe_id && (l.chambre === 'AN' || l.chambre === 'SENAT')
          ? groupeRef({ id: l.groupe_id, abrege: l.abrege ?? '', libelle: l.libelle ?? '', couleur: l.couleur, sourceCouleur: l.source_couleur, chambre: l.chambre })
          : null;
      resultat.set(`${d.id}|${d.jour ?? ''}`, { id: l.id, nom: l.nom, fonction: mandat ?? l.gouvernement ?? null, groupe });
      if (f) this.feminins.add(l.id);
    }
    return resultat;
  }

  private async dossierLigne(id: string): Promise<LigneDossier | null> {
    if (!estUuid(id)) return null;
    return this.db.first<LigneDossier>(
      `SELECT d.entite_id AS id, d.titre, d.titre_court, d.type_procedure, d.procedure_acceleree, d.initiative,
              d.legislature, d.date_depot::text AS date_depot, d.statut
       FROM canon.dossier d WHERE d.entite_id = $id AND ${vivant('d.entite_id')}`,
      { id },
    );
  }

  private async cases(ids: string[]): Promise<Map<string, LigneCase[]>> {
    const resultat = new Map<string, LigneCase[]>();
    if (ids.length === 0 || !(await this.projection())) return resultat;
    const lignes = await this.db.all<LigneCase>(
      `SELECT p.dossier_id, p.modele, p.version::int AS version, p.procedure, p.origine, p.rang::int AS rang, p.cle, p.libelle,
              p.chambre, p.nature, p.facultative, p.etat, p.debut::text AS debut, p.fin::text AS fin,
              p.programmee_le::text AS programmee_le, p.conclusion, p.courante, p.attendue,
              EXISTS (SELECT 1 FROM lecture.parcours_deviation v WHERE v.dossier_id = p.dossier_id AND v.etape_cle = p.cle) AS deviation,
              p.provenance::text[] AS provenance, p.date_reference::text AS date_reference
       FROM lecture.parcours_dossier p WHERE p.dossier_id = ANY($ids::uuid[]) ORDER BY p.dossier_id, p.rang`,
      { ids },
    );
    for (const l of lignes) resultat.set(l.dossier_id, [...(resultat.get(l.dossier_id) ?? []), l]);
    return resultat;
  }

  private async syntheses(ids: string[]): Promise<Map<string, LigneSynthese>> {
    const resultat = new Map<string, LigneSynthese>();
    if (ids.length === 0 || !(await this.projection())) return resultat;
    const lignes = await this.db.all<LigneSynthese>(
      `SELECT s.dossier_id, s.etape_courante, s.etape_courante_libelle, s.etape_courante_etat,
              s.cases_faites::int AS cases_faites, s.cases_affichees::int AS cases_affichees, s.retire_le::text AS retire_le,
              s.prochaine_echeance::text AS prochaine_echeance, to_json(s.prochaine_echeance_heure) #>> '{}' AS prochaine_echeance_heure,
              s.prochaine_echeance_libelle, s.prochaine_echeance_etat, s.prochaine_echeance_cle
       FROM lecture.parcours_dossier_synthese s WHERE s.dossier_id = ANY($ids::uuid[])`,
      { ids },
    );
    for (const l of lignes) resultat.set(l.dossier_id, l);
    return resultat;
  }

  private echeance(s: LigneSynthese | undefined): Echeance | null {
    if (!s?.prochaine_echeance) return null;
    return {
      date: s.prochaine_echeance,
      heure: s.prochaine_echeance_heure,
      libelle: s.prochaine_echeance_libelle ?? '',
      etat: s.prochaine_echeance_etat,
      cle: cleEtape(s.prochaine_echeance_cle),
    };
  }

  /** Clé de case (et libellé) de chaque étape canon, d'après `lecture.parcours_acte`. */
  private async casesDesEtapes(etapes: string[]): Promise<Map<string, { cle: CleCase; libelle: string }>> {
    const resultat = new Map<string, { cle: CleCase; libelle: string }>();
    const ids = [...new Set(etapes.filter(estUuid))];
    if (ids.length === 0 || !(await this.projection())) return resultat;
    const lignes = await this.db.all<{ etape_id: string; cle: string; libelle: string }>(
      `SELECT a.etape_id, a.cle, p.libelle
       FROM lecture.parcours_acte a JOIN lecture.parcours_dossier p ON p.dossier_id = a.dossier_id AND p.cle = a.cle
       WHERE a.etape_id = ANY($ids::uuid[]) AND a.categorie = 'case'`,
      { ids },
    );
    for (const l of lignes) {
      const cle = cleEtape(l.cle);
      if (cle) resultat.set(l.etape_id, { cle, libelle: l.libelle });
    }
    return resultat;
  }

  /** Résumés de dossiers, dans l'ordre des identifiants. */
  private async resumes(ids: string[]): Promise<DossierResume[]> {
    if (ids.length === 0) return [];
    const projection = await this.projection();
    const [lignes, cases, syntheses] = await Promise.all([
      this.db.all<
        LigneDossier & {
          etat_parcours: string | null;
          dernier_date: string | null;
          dernier_libelle: string | null;
          parent_id: string | null;
          parent_titre: string | null;
          parent_titre_court: string | null;
          parent_etape: string | null;
          parent_etape_libelle: string | null;
        }
      >(
        projection
          ? `WITH etats AS (${ETATS_PARCOURS} WHERE s.dossier_id = ANY($ids::uuid[])),
             dernier AS (
               SELECT DISTINCT ON (a.dossier_id) a.dossier_id, a.debut::text AS date,
                      p.libelle || COALESCE(' · ' || COALESCE(a.conclusion, a.libelle), '') AS libelle
               FROM lecture.parcours_acte a JOIN lecture.parcours_dossier p ON p.dossier_id = a.dossier_id AND p.cle = a.cle
               WHERE a.dossier_id = ANY($ids::uuid[]) AND a.categorie = 'case' AND a.accompli AND a.debut IS NOT NULL
               ORDER BY a.dossier_id, a.debut DESC, a.ordre DESC)
             SELECT d.entite_id AS id, d.titre, d.titre_court, d.type_procedure, d.procedure_acceleree, d.initiative,
                    d.legislature, d.date_depot::text AS date_depot, ${STATUT_PUBLIE} AS statut,
                    e.etat AS etat_parcours, n.date AS dernier_date, n.libelle AS dernier_libelle,
                    pa.id AS parent_id, pa.titre AS parent_titre, pa.titre_court AS parent_titre_court, pa.etape AS parent_etape,
                    pa.etape_libelle AS parent_etape_libelle
             FROM canon.dossier d LEFT JOIN etats e ON e.dossier_id = d.entite_id LEFT JOIN dernier n ON n.dossier_id = d.entite_id
             LEFT JOIN LATERAL (
               -- dossier dont celui-ci est un événement (lien explicite, cf. projection 55)
               SELECT q.entite_id AS id, q.titre, q.titre_court, l.etape_cle AS etape, r.libelle AS etape_libelle
               FROM lecture.dossier_lien l JOIN canon.dossier q ON q.entite_id = l.parent_id
               LEFT JOIN lecture.parcours_dossier r ON r.dossier_id = l.parent_id AND r.cle = l.etape_cle
               WHERE l.enfant_id = d.entite_id AND ${vivant('q.entite_id')} ORDER BY q.entite_id LIMIT 1) pa ON true
             WHERE d.entite_id = ANY($ids::uuid[]) AND ${vivant('d.entite_id')}`
          : `SELECT d.entite_id AS id, d.titre, d.titre_court, d.type_procedure, d.procedure_acceleree, d.initiative,
                    d.legislature, d.date_depot::text AS date_depot, ${STATUT_PUBLIE} AS statut,
                    NULL::text AS etat_parcours, NULL::text AS dernier_date, NULL::text AS dernier_libelle,
                    NULL::uuid AS parent_id, NULL::text AS parent_titre, NULL::text AS parent_titre_court, NULL::text AS parent_etape,
                    NULL::text AS parent_etape_libelle
             FROM canon.dossier d WHERE d.entite_id = ANY($ids::uuid[]) AND ${vivant('d.entite_id')}`,
        { ids },
      ),
      this.cases(ids),
      this.syntheses(ids),
    ]);
    const parId = new Map(lignes.map((l) => [l.id, l]));
    return ids.flatMap((id) => {
      const d = parId.get(id);
      if (!d) return [];
      const s = syntheses.get(id);
      const courante = s?.etape_courante ? cleEtape(s.etape_courante) : null;
      return [
        {
          id,
          titre: titreAffiche(d.titre, d.titre_court),
          titreOfficiel: d.titre,
          titreEnClair: null,
          type: d.type_procedure ?? '',
          nature: natureTexte(d.type_procedure),
          origine: dans(['gouvernement', 'parlementaire'] as const, d.initiative),
          theme: null,
          etat: dans(ETATS_DOSSIER, d.statut) ?? dans(ETATS_DOSSIER, d.etat_parcours),
          procedure: procedureDe(d.procedure_acceleree),
          barre: (cases.get(id) ?? []).map(compacte),
          etapeCourante:
            courante && s
              ? { cle: courante, libelle: s.etape_courante_libelle ?? '', etat: dans(ETATS_CASE, s.etape_courante_etat) ?? 'inconnu' }
              : null,
          prochaineEcheance: this.echeance(s),
          dernierEvenement: d.dernier_date && d.dernier_libelle ? { date: d.dernier_date, libelle: d.dernier_libelle } : null,
          parent:
            d.parent_id && d.parent_titre
              ? {
                  dossier: { id: d.parent_id, titre: titreAffiche(d.parent_titre, d.parent_titre_court) },
                  etape: cleEtape(d.parent_etape),
                  etapeLibelle: d.parent_etape_libelle,
                }
              : null,
        },
      ];
    });
  }

  // ----- Listes -----

  async aSuivre(limite: number): Promise<DossierResume[]> {
    if (!(await this.projection())) return [];
    const lignes = await this.db.all<{ id: string }>(
      `SELECT s.dossier_id AS id
       FROM lecture.parcours_dossier_synthese s
       JOIN canon.dossier d ON d.entite_id = s.dossier_id
       LEFT JOIN lecture.parcours_dossier c ON c.dossier_id = s.dossier_id AND c.courante
       WHERE d.legislature = '17' AND ${vivant('d.entite_id')}
         AND (s.prochaine_echeance >= s.date_reference OR s.etape_courante IS NOT NULL)
       ORDER BY (s.prochaine_echeance >= s.date_reference) IS NOT TRUE, s.prochaine_echeance, c.debut DESC NULLS LAST, s.dossier_id
       LIMIT $limite`,
      { limite: Math.max(0, Math.floor(limite)) },
    );
    return this.resumes(lignes.map((l) => l.id));
  }

  async lister(filtre: FiltreDossiers, pagination: Pagination): Promise<Pick<ListeDossiers, 'facettes' | 'dossiers'>> {
    const legislature = filtre.legislature ?? '17';
    const projection = await this.projection();
    const liste = `
      WITH ${projection ? `etats AS (${ETATS_PARCOURS}),
      dernier AS (SELECT a.dossier_id, max(a.debut) AS le FROM lecture.parcours_acte a WHERE a.accompli GROUP BY a.dossier_id),` : ''}
      liste AS (
        SELECT d.entite_id AS id, d.initiative, d.date_depot,
               COALESCE(${STATUT_PUBLIE}, ${projection ? 'e.etat' : 'NULL::text'}) AS etat,
               ${projection ? 'n.le' : 'NULL::date'} AS dernier
        FROM canon.dossier d
        ${projection ? 'LEFT JOIN etats e ON e.dossier_id = d.entite_id LEFT JOIN dernier n ON n.dossier_id = d.entite_id' : ''}
        WHERE d.legislature = $legislature AND ${vivant('d.entite_id')})`;
    const ou = `WHERE ($etat::text IS NULL OR etat = $etat) AND ($origine::text IS NULL OR initiative = $origine)
                  AND $theme::text IS NULL`;
    const params = {
      legislature,
      etat: filtre.etat ?? null,
      origine: filtre.origine ?? null,
      theme: filtre.theme ?? null,
      taille: pagination.taille,
      decalage: (pagination.page - 1) * pagination.taille,
    };
    const [etats, origines, total, ids] = await Promise.all([
      this.db.all<{ valeur: string; nombre: number }>(
        `${liste} SELECT etat AS valeur, count(*)::int AS nombre FROM liste WHERE etat IS NOT NULL GROUP BY 1`,
        params,
      ),
      this.db.all<{ valeur: string; nombre: number }>(
        `${liste} SELECT initiative AS valeur, count(*)::int AS nombre FROM liste WHERE initiative IS NOT NULL GROUP BY 1`,
        params,
      ),
      this.db.first<{ n: number }>(`${liste} SELECT count(*)::int AS n FROM liste ${ou}`, params),
      this.db.all<{ id: string }>(
        `${liste} SELECT id FROM liste ${ou}
         ORDER BY COALESCE(dernier, date_depot) DESC NULLS LAST, id LIMIT $taille OFFSET $decalage`,
        params,
      ),
    ]);
    const facettesEtats: Facette<EtatDossier>[] = ETATS_DOSSIER.flatMap((e) => {
      const n = etats.find((x) => x.valeur === e)?.nombre ?? 0;
      return n > 0 ? [{ valeur: e, libelle: LIBELLES_ETAT[e], nombre: n }] : [];
    });
    const facettesOrigines: Facette<Origine>[] = (['gouvernement', 'parlementaire'] as const).flatMap((o) => {
      const n = origines.find((x) => x.valeur === o)?.nombre ?? 0;
      return n > 0 ? [{ valeur: o, libelle: LIBELLES_ORIGINE[o], nombre: n }] : [];
    });
    return {
      facettes: { etats: facettesEtats, origines: facettesOrigines, themes: [] },
      dossiers: page(await this.resumes(ids.map((l) => l.id)), pagination, total?.n ?? 0),
    };
  }

  async deposesParLeGouvernement(depuis: string, limite: number): Promise<{ total: number; dossiers: DossierResume[] }> {
    const where = `d.initiative = 'gouvernement' AND d.legislature = '17' AND d.date_depot >= $depuis::date AND ${vivant('d.entite_id')}`;
    const params = { depuis, limite: Math.max(0, Math.floor(limite)) };
    const [total, ids] = await Promise.all([
      this.db.first<{ n: number }>(`SELECT count(*)::int AS n FROM canon.dossier d WHERE ${where}`, params),
      this.db.all<{ id: string }>(
        `SELECT d.entite_id AS id FROM canon.dossier d WHERE ${where} ORDER BY d.date_depot DESC, d.entite_id LIMIT $limite`,
        params,
      ),
    ]);
    return { total: total?.n ?? 0, dossiers: await this.resumes(ids.map((l) => l.id)) };
  }

  // ----- Où en sont les textes -----

  async positions(legislature: string): Promise<{ dateReference: string; indetermines: number; positions: PositionTexte[] } | null> {
    if (!(await this.projection())) return null;
    const lignes = await this.db.all<{
      dossier: string;
      initiative: string | null;
      date_reference: string;
      cle: string | null;
      libelle: string | null;
      chambre: string | null;
      en_examen: boolean | null;
      depuis: string | null;
      jours: number | null;
      hors_parlement: string | null;
    }>(
      `WITH d AS (
         SELECT s.dossier_id, s.date_reference, k.initiative
         FROM lecture.parcours_dossier_synthese s
         JOIN canon.dossier k ON k.entite_id = s.dossier_id
         JOIN lecture.dossier_modele m ON m.dossier_id = s.dossier_id AND m.famille = 'legislatif'
         WHERE k.legislature = $legislature AND ${vivant('k.entite_id')}
       ), c AS (
         SELECT p.* FROM lecture.parcours_dossier p JOIN d ON d.dossier_id = p.dossier_id
       ), abouti AS (
         -- issue du parcours : publié au JO, rejeté, retiré, caduc, fusionné, irrecevable (adopté et
         -- pas encore publié reste dans la file : promulgation, publication)
         SELECT dossier_id FROM lecture.parcours_dossier_synthese WHERE issue NOT IN ('en_cours', 'adopte')
       ), position AS (
         -- case active (faite ou en cours) de plus haut rang ; en cours, elle n'est « en examen »
         -- qu'avec un acte d'examen (réunion, rapport, débat, décision, saisine du Conseil) : un
         -- dépôt, un renvoi en commission ou une nomination de rapporteur seuls la laissent en attente
         SELECT DISTINCT ON (c.dossier_id) c.dossier_id, c.rang, c.cle, c.libelle, c.chambre, c.etat = 'faite' AS faite,
                c.etat = 'en_cours' AND EXISTS (
                  SELECT 1 FROM lecture.parcours_acte a
                  WHERE a.dossier_id = c.dossier_id AND a.cle = c.cle AND a.categorie = 'case' AND a.accompli
                    AND (a.code_source !~ '(DEPOT|SAISIE|NOMIN)$' OR a.code_source LIKE 'CC-SAISIE%')) AS en_examen,
                CASE WHEN c.etat = 'en_cours' THEN c.debut ELSE COALESCE(c.fin, c.debut) END AS depuis
         FROM c WHERE c.etat IN ('faite', 'en_cours')
         ORDER BY c.dossier_id, c.rang DESC
       ), suite AS (
         -- case suivante qui aura encore lieu (le Conseil constitutionnel à venir, facultatif, est sauté)
         SELECT DISTINCT ON (c.dossier_id) c.dossier_id, c.cle
         FROM c JOIN position p ON p.dossier_id = c.dossier_id AND c.rang > p.rang
         WHERE c.etat <> 'sans_objet' AND NOT (c.cle = 'cc' AND c.etat = 'a_venir')
         ORDER BY c.dossier_id, c.rang
       )
       SELECT d.dossier_id AS dossier, d.initiative, d.date_reference::text AS date_reference,
              p.cle, p.libelle, p.chambre, p.en_examen, p.depuis::text AS depuis, (d.date_reference - p.depuis)::int AS jours,
              CASE
                WHEN p.cle = 'cc' AND p.en_examen THEN 'decision_cc'
                WHEN p.faite AND p.cle <> 'depot' AND s.cle = 'promulgation' THEN 'promulgation'
                WHEN p.faite AND p.cle = 'promulgation' AND s.cle = 'jo' THEN 'publication_jo'
              END AS hors_parlement
       FROM d
       LEFT JOIN position p ON p.dossier_id = d.dossier_id
       LEFT JOIN suite s ON s.dossier_id = d.dossier_id
       WHERE d.dossier_id NOT IN (SELECT dossier_id FROM abouti)`,
      { legislature },
    );
    if (lignes.length === 0) return null;
    const positions: PositionTexte[] = [];
    let indetermines = 0;
    for (const l of lignes) {
      const cle = cleEtape(l.cle);
      if (!cle || l.en_examen === null) {
        indetermines++;
        continue;
      }
      positions.push({
        dossier: l.dossier,
        origine: dans(['gouvernement', 'parlementaire'] as const, l.initiative),
        etape: { cle, libelle: l.libelle ?? '', lieu: dans(LIEUX, l.chambre) },
        situation: l.en_examen ? 'en_examen' : 'en_attente',
        depuis: l.depuis,
        jours: l.jours,
        horsParlement: dans(['decision_cc', 'promulgation', 'publication_jo'] as const, l.hors_parlement),
      });
    }
    return { dateReference: lignes[0].date_reference, indetermines, positions };
  }

  async textesEnAttente(positions: PositionTexte[]): Promise<TexteEnAttente[]> {
    const resumes = new Map((await this.resumes(positions.map((p) => p.dossier))).map((r) => [r.id, r]));
    return positions.flatMap((p) => {
      const r = resumes.get(p.dossier);
      if (!r) return [];
      const { horsParlement: _h, dossier: _d, ...position } = p;
      return [{ ...position, dossier: { id: r.id, titre: r.titre }, dernierActe: r.dernierEvenement, prochaineEcheance: r.prochaineEcheance }];
    });
  }

  // ----- Mes suivis -----

  async resumesDe(ids: string[]): Promise<DossierResume[]> {
    return this.resumes([...new Set(ids.filter(estUuid))]);
  }

  async actesDepuis(ids: string[], depuis: string, limite: number): Promise<ActeSuivi[]> {
    const uuids = [...new Set(ids.filter(estUuid))];
    if (uuids.length === 0 || !(await this.projection())) return [];
    const lignes = await this.db.all<{ dossier: string; etape: string; date: string; cle: string; libelle: string }>(
      `SELECT a.dossier_id AS dossier, a.etape_id AS etape, a.debut::text AS date, a.cle,
              p.libelle || COALESCE(' · ' || COALESCE(a.conclusion, a.libelle), '') AS libelle
       FROM lecture.parcours_acte a
       JOIN lecture.parcours_dossier p ON p.dossier_id = a.dossier_id AND p.cle = a.cle
       WHERE a.dossier_id = ANY($ids::uuid[]) AND a.categorie = 'case' AND a.accompli
         AND a.debut >= $depuis::date AND a.debut <= a.date_reference AND ${vivant('a.etape_id')}
       ORDER BY a.debut DESC, a.ordre DESC
       LIMIT $limite`,
      { ids: uuids, depuis, limite: Math.max(0, Math.floor(limite)) },
    );
    const [refs, provenances] = await Promise.all([this.resumes([...new Set(lignes.map((l) => l.dossier))]), this.provenances(lignes.map((l) => l.etape))]);
    const titres = new Map(refs.map((r) => [r.id, r.titre]));
    return lignes.flatMap((l) => {
      const titre = titres.get(l.dossier);
      const provenance = provenances.get(l.etape);
      if (titre === undefined || !provenance) return [];
      return [{ type: 'acte' as const, date: l.date, dossier: { id: l.dossier, titre }, cle: cleEtape(l.cle), libelle: l.libelle, provenance }];
    });
  }

  // ----- Dossier -----

  /** Initiateurs publiés du dossier (personnes ou organisations), dans l'ordre publié. */
  private async initiateurs(id: string) {
    return this.db.all<{ id: string; type: string; ordre: number | null; nom: string | null; type_organisation: string | null }>(
      `SELECT l.vers_id AS id, e.type, l.ordre, o.nom, o.type AS type_organisation
       FROM canon.lien l
       JOIN canon.entite e ON e.entite_id = l.vers_id
       LEFT JOIN canon.organisation o ON o.entite_id = l.vers_id
       WHERE l.de_id = $id AND l.nature IN ('auteur', 'initiateur') AND ${vivant('l.vers_id')}
       ORDER BY (l.nature = 'auteur') DESC, l.ordre NULLS LAST, l.vers_id`,
      { id },
    );
  }

  async entete(id: string): Promise<EnteteDossier | null> {
    const d = await this.dossierLigne(id);
    if (!d) return null;
    const [initiateurs, cosignataires, resume] = await Promise.all([
      this.initiateurs(id),
      this.db.first<{ n: number }>(
        `SELECT count(*)::int AS n FROM canon.lien l WHERE l.de_id = $id AND l.nature = 'cosignataire' AND ${vivant('l.vers_id')}`,
        { id },
      ),
      this.resumes([id]),
    ]);
    const personnes = await this.personnes(initiateurs.filter((i) => i.type === 'personne').map((i) => ({ id: i.id, jour: d.date_depot })));
    const ref = (pid: string) => personnes.get(`${pid}|${d.date_depot ?? ''}`) ?? null;
    let auteur: Auteur | null = null;
    if (d.initiative === 'gouvernement') {
      // Le ministre qui porte le texte : le premier initiateur publié qui n'est pas le Premier ministre.
      const membres = initiateurs.filter((i) => i.type === 'personne' && ref(i.id));
      const ministre = membres.find((i) => ref(i.id)?.fonction !== 'Premier ministre') ?? membres[0];
      auteur = { type: 'gouvernement', ministre: ministre ? ref(ministre.id) : null };
    } else {
      const premier = initiateurs[0];
      if (premier?.type === 'personne' && ref(premier.id)) auteur = { type: 'personne', personne: ref(premier.id)! };
      else if (premier?.type === 'organisation' && premier.nom)
        auteur = premier.type_organisation === 'gouvernement'
          ? { type: 'gouvernement', ministre: null }
          : { type: 'commission', organisation: { id: premier.id, nom: premier.nom } };
    }
    return {
      id,
      titre: titreAffiche(d.titre, d.titre_court),
      titreOfficiel: d.titre,
      titreEnClair: null,
      type: d.type_procedure ?? '',
      nature: natureTexte(d.type_procedure),
      procedure: procedureDe(d.procedure_acceleree),
      origine: dans(['gouvernement', 'parlementaire'] as const, d.initiative),
      theme: null,
      legislature: d.legislature,
      dateDepot: d.date_depot,
      etat: resume[0]?.etat ?? null,
      auteur,
      cosignataires: cosignataires?.n ?? 0,
      resumeEnClair: null,
    };
  }

  async parcours(id: string): Promise<Parcours | null> {
    if (!estUuid(id) || !(await this.dossierLigne(id))) return null;
    const [cases, syntheses] = await Promise.all([this.cases([id]), this.syntheses([id])]);
    const lignes = cases.get(id) ?? [];
    if (lignes.length === 0) return null;
    const [modele, deviations, branches, liens] = await Promise.all([
      this.db.first<{ cle: string; version: number; libelle: string; famille: string; fondement: string }>(
        `SELECT cle, version::int AS version, libelle, famille, fondement FROM canon.parcours_modele
         WHERE cle = $cle AND version = $version`,
        { cle: lignes[0].modele, version: lignes[0].version },
      ),
      this.db.all<{ cle: string; libelle: string; fondement: string; etape_cle: string; effet: string; debut: string | null;
                    conclusion: string | null; provenance: string[] }>(
        `SELECT cle, libelle, fondement, etape_cle, effet, debut::text AS debut, conclusion, provenance::text[] AS provenance
         FROM lecture.parcours_deviation WHERE dossier_id = $id ORDER BY ordre`,
        { id },
      ),
      this.db.all<{ de: string; vers: string; libelle: string }>(
        `SELECT b.de, b.vers, b.libelle FROM lecture.parcours_branche b
         JOIN lecture.parcours_dossier p ON p.dossier_id = b.dossier_id AND p.cle = b.de
         WHERE b.dossier_id = $id ORDER BY p.rang`,
        { id },
      ),
      this.db.all<{
        sens: 'parent' | 'enfant';
        id: string;
        titre: string;
        titre_court: string | null;
        etape: string | null;
        etape_libelle: string | null;
      }>(
        // libellé de l'étape : celle du dossier parent, où le lien a lieu
        `SELECT 'parent' AS sens, d.entite_id AS id, d.titre, d.titre_court, l.etape_cle AS etape, p.libelle AS etape_libelle
         FROM lecture.dossier_lien l JOIN canon.dossier d ON d.entite_id = l.parent_id
         LEFT JOIN lecture.parcours_dossier p ON p.dossier_id = l.parent_id AND p.cle = l.etape_cle
         WHERE l.enfant_id = $id AND ${vivant('d.entite_id')}
         UNION ALL
         SELECT 'enfant', d.entite_id, d.titre, d.titre_court, l.etape_cle, p.libelle
         FROM lecture.dossier_lien l JOIN canon.dossier d ON d.entite_id = l.enfant_id
         LEFT JOIN lecture.parcours_dossier p ON p.dossier_id = l.parent_id AND p.cle = l.etape_cle
         WHERE l.parent_id = $id AND ${vivant('d.entite_id')}
         ORDER BY 1, 2`,
        { id },
      ),
    ]);
    if (!modele) return null;
    const provenances = await this.provenances([...lignes.flatMap((c) => c.provenance ?? []), ...deviations.flatMap((d) => d.provenance)]);
    const sources = (ids: string[] | null) =>
      (ids ?? []).flatMap((p) => {
        const v = provenances.get(p);
        return v ? [v] : [];
      });
    const toutes: CaseParcours[] = lignes.map((c) => ({
      rang: c.rang,
      cle: c.cle,
      libelle: c.libelle,
      lieu: lieuDe(c.chambre),
      facultative: c.facultative,
      nature: dans(NATURES, c.nature) ?? 'obligatoire',
      etat: dans(ETATS_CASE, c.etat) ?? 'inconnu',
      courante: c.courante,
      attendue: c.attendue,
      deviation: c.deviation,
      debut: c.debut,
      fin: c.fin,
      programmeeLe: c.programmee_le,
      conclusion: c.conclusion,
      provenance: sources(c.provenance),
    }));
    const lie = (l: (typeof liens)[number]): DossierLie => ({
      dossier: { id: l.id, titre: titreAffiche(l.titre, l.titre_court) },
      etape: cleEtape(l.etape),
      etapeLibelle: l.etape_libelle,
    });
    const parent = liens.find((l) => l.sens === 'parent');
    return {
      modele: {
        cle: modele.cle,
        version: modele.version,
        libelle: modele.libelle,
        famille: dans(FAMILLES, modele.famille) ?? 'autre',
        fondement: modele.fondement,
      },
      procedure: lignes[0].procedure === 'acceleree' ? 'acceleree' : 'normale',
      origine: lignes[0].origine === 'SENAT' ? 'SENAT' : lignes[0].origine === 'AN' ? 'AN' : null,
      cases: toutes,
      deviations: deviations.map(
        (d): DeviationParcours => ({
          cle: d.cle,
          libelle: d.libelle,
          fondement: d.fondement,
          etape: d.etape_cle,
          effet: dans<EffetDeviation>(EFFETS, d.effet) ?? 'rejoint',
          debut: d.debut,
          conclusion: d.conclusion,
          provenance: sources(d.provenance),
        }),
      ),
      branches: branches.map((b) => ({ de: b.de, vers: b.vers, libelle: b.libelle })),
      parent: parent ? lie(parent) : null,
      enfants: liens.filter((l) => l.sens === 'enfant').map(lie),
      dateReference: lignes[0].date_reference,
      prochaineEcheance: this.echeance(syntheses.get(id)),
    };
  }

  async barre(id: string): Promise<{ dossier: DossierRef; cases: CaseCompacte[] } | null> {
    const d = await this.dossierLigne(id);
    if (!d) return null;
    const cases = await this.cases([id]);
    return { dossier: { id, titre: titreAffiche(d.titre, d.titre_court) }, cases: (cases.get(id) ?? []).map(compacte) };
  }

  /** Organe de chaque case : celui de l'acte qui la conclut, sinon du premier acte qui en a un. */
  private async organesEtChiffres(dossier: string, cle: CleCase | null) {
    return this.db.all<{
      cle: string;
      organe_id: string | null;
      organe_nom: string | null;
      deposes: number;
      adoptes: number;
      scrutins: number;
      reunions: number;
    }>(
      `WITH actes AS (
         SELECT a.cle, a.etape_id, a.conclusif, a.ordre FROM lecture.parcours_acte a
         WHERE a.dossier_id = $dossier AND a.categorie = 'case' AND ($cle::text IS NULL OR a.cle = $cle)
       ), organe AS (
         SELECT DISTINCT ON (a.cle) a.cle, o.entite_id AS id, o.nom
         FROM actes a JOIN canon.etape e ON e.entite_id = a.etape_id JOIN canon.organisation o ON o.entite_id = e.organe_id
         ORDER BY a.cle, a.conclusif DESC, a.ordre
       ), amendements AS (
         SELECT a.cle, count(*)::int AS deposes, count(*) FILTER (WHERE m.sort = 'adopte')::int AS adoptes
         FROM canon.amendement m JOIN actes a ON a.etape_id = m.etape_id
         WHERE m.dossier_id = $dossier AND ${vivant('m.entite_id')} GROUP BY a.cle
       ), scrutins AS (
         SELECT a.cle, count(*)::int AS n FROM canon.scrutin s JOIN actes a ON a.etape_id = s.etape_id
         WHERE s.dossier_id = $dossier AND ${vivant('s.entite_id')} GROUP BY a.cle
       ), reunions AS (
         SELECT a.cle, count(DISTINCT l.vers_id)::int AS n FROM canon.lien l JOIN actes a ON a.etape_id = l.de_id
         WHERE l.nature = 'reunion' AND ${vivant('l.vers_id')} GROUP BY a.cle
       )
       SELECT c.cle, o.id AS organe_id, o.nom AS organe_nom, COALESCE(m.deposes, 0) AS deposes, COALESCE(m.adoptes, 0) AS adoptes,
              COALESCE(s.n, 0) AS scrutins, COALESCE(r.n, 0) AS reunions
       FROM (SELECT DISTINCT cle FROM actes) c
       LEFT JOIN organe o ON o.cle = c.cle LEFT JOIN amendements m ON m.cle = c.cle
       LEFT JOIN scrutins s ON s.cle = c.cle LEFT JOIN reunions r ON r.cle = c.cle`,
      { dossier, cle },
    );
  }

  async etapes(id: string): Promise<EtapeResume[]> {
    if (!estUuid(id) || !(await this.projection())) return [];
    const [cases, details] = await Promise.all([this.cases([id]), this.organesEtChiffres(id, null)]);
    const parCle = new Map(details.map((d) => [d.cle, d]));
    return (cases.get(id) ?? [])
      .filter((c) => c.etat !== 'sans_objet')
      .map((c) => {
        const d = parCle.get(c.cle);
        return {
          cle: c.cle as CleCase,
          libelle: c.libelle,
          lieu: lieuDe(c.chambre),
          organe: d?.organe_id && d.organe_nom ? { id: d.organe_id, nom: d.organe_nom } : null,
          etat: dans(ETATS_CASE, c.etat) ?? 'inconnu',
          courante: c.courante,
          debut: c.debut,
          fin: c.fin,
          conclusion: c.conclusion,
          resume: null,
          chiffres: d ? chiffresEtape(d, false) : [],
        };
      });
  }

  // ----- Texte : versions et articles -----

  private async navette(dossier: string): Promise<Navette> {
    const versions = await this.db.all<Omit<VersionTexte, 'rang'>>(
      // Date et étape d'une version : les siennes ; sinon celles du document et du premier acte qui
      // le cite (canon.lien « texte », ex. AN1-DEBATS-DEC → texte adopté). Une version autre que le
      // texte déposé datée du jour du dépôt du dossier (textes du Sénat en base) n'a pas de date.
      `SELECT v.entite_id AS id, v.nature, v.chambre,
              COALESCE(CASE WHEN v.date = d.date_depot AND v.nature !~* '^d[ée]pos' THEN NULL ELSE v.date END,
                       doc.date, cite.debut)::text AS date,
              COALESCE(v.etape_id, cite.etape_id) AS etape_id,
              (SELECT c.id_source FROM canon.correspondance c WHERE c.entite_id = v.entite_id AND c.statut = 'VERIFIED'
               ORDER BY (c.methode = 'OFFICIAL_ID') DESC, c.id_source LIMIT 1) AS id_natif
       FROM canon.version_texte v
       JOIN canon.dossier d ON d.entite_id = v.dossier_id
       LEFT JOIN canon.document doc ON doc.entite_id = v.document_id
       LEFT JOIN LATERAL (
         SELECT e.entite_id AS etape_id, e.debut FROM canon.lien l JOIN canon.etape e ON e.entite_id = l.de_id
         WHERE l.vers_id = v.document_id AND l.nature = 'texte' AND e.dossier_id = v.dossier_id AND ${vivant('e.entite_id')}
         ORDER BY e.ordre LIMIT 1) cite ON true
       WHERE v.dossier_id = $dossier AND ${vivant('v.entite_id')}`,
      { dossier },
    );
    if (versions.length === 0) return { versions: [], depose: null, articles: new Map() };
    const ids = versions.map((v) => v.id);
    const [aretes, lignes] = await Promise.all([
      this.db.all<{ avant: string; apres: string }>(
        `SELECT DISTINCT vp.version_texte_id AS avant, vc.version_texte_id AS apres
         FROM canon.modification_article m
         JOIN canon.version_article vc ON vc.entite_id = m.version_article_id
         JOIN canon.version_article vp ON vp.entite_id = m.version_precedente_id
         WHERE vc.version_texte_id = ANY($ids::uuid[])`,
        { ids },
      ),
      this.db.all<VersionArticleLigne & { suivi_intitule: string | null }>(
        `SELECT va.entite_id AS id, va.article_suivi_id AS article, va.version_texte_id AS version_texte, va.numero, va.intitule,
                va.ordre, va.empreinte, va.statut, va.mention, s.intitule AS suivi_intitule
         FROM canon.version_article va JOIN canon.article_suivi s ON s.entite_id = va.article_suivi_id
         WHERE va.version_texte_id = ANY($ids::uuid[]) AND ${vivant('va.entite_id')} AND ${vivant('s.entite_id')}`,
        { ids },
      ),
    ]);
    const ordonnees = ordonnerVersions(versions, aretes).map((v, rang) => ({ ...v, rang }));
    const rangs = new Map(ordonnees.map((v) => [v.id, v.rang]));
    const articles = new Map<string, { intitule: string | null; versions: VersionArticleLigne[] }>();
    for (const l of lignes) {
      const a = articles.get(l.article) ?? { intitule: l.suivi_intitule, versions: [] };
      a.versions.push(l);
      articles.set(l.article, a);
    }
    for (const a of articles.values()) a.versions.sort((x, y) => rangs.get(x.version_texte)! - rangs.get(y.version_texte)!);
    const depose = ordonnees.find((v) => rangNature(v.nature) === 0)?.id ?? null;
    return { versions: ordonnees, depose, articles };
  }

  /** Résumé d'un article suivi à travers la navette (null s'il n'a aucune version). */
  private resumeArticle(navette: Navette, id: string, modifications: Map<string, LigneModification[]>): ArticleResume | null {
    const a = navette.articles.get(id);
    if (!a || a.versions.length === 0) return null;
    const empreintes = empreintesEffectives(a.versions);
    const derniere = a.versions.at(-1)!;
    const iDepose = a.versions.findIndex((v) => v.version_texte === navette.depose);
    let changements = 0;
    for (let i = 1; i < empreintes.length; i++) if (empreintes[i] !== empreintes[i - 1]) changements++;
    const etat: ArticleResume['etat'] =
      derniere.statut === 'supprime'
        ? 'supprime'
        : iDepose < 0
          ? 'ajoute'
          : empreintes.at(-1) !== empreintes[iDepose]
            ? 'modifie'
            : 'inchange';
    let ajoutePar: ArticleResume['ajoutePar'] = null;
    if (etat === 'ajoute') {
      const premiere = a.versions[0];
      const cmp = (modifications.get(premiere.id) ?? []).some((m) => m.origine === 'compromis_cmp' && m.statut === 'VERIFIED');
      const chambre = navette.versions.find((v) => v.id === premiere.version_texte)?.chambre;
      ajoutePar = cmp ? 'CMP' : chambre === 'AN' || chambre === 'SENAT' ? chambre : null;
    }
    return {
      article: { id, numero: derniere.numero },
      intitule: a.intitule ?? derniere.intitule,
      modifications: changements,
      etat,
      ajoutePar,
    };
  }

  private async modifications(versionsArticle: string[]): Promise<Map<string, LigneModification[]>> {
    const resultat = new Map<string, LigneModification[]>();
    const ids = [...new Set(versionsArticle.filter(estUuid))];
    if (ids.length === 0) return resultat;
    const lignes = await this.db.all<LigneModification>(
      `SELECT m.version_article_id, m.version_precedente_id, m.origine,
              CASE WHEN m.amendement_id IS NOT NULL AND ${vivant('m.amendement_id')} THEN m.amendement_id END AS amendement_id,
              m.statut, m.diff
       FROM canon.modification_article m WHERE m.version_article_id = ANY($ids::uuid[]) AND m.statut <> 'REJECTED'`,
      { ids },
    );
    for (const l of lignes) resultat.set(l.version_article_id, [...(resultat.get(l.version_article_id) ?? []), l]);
    return resultat;
  }

  private ordreArticles(navette: Navette, resumes: ArticleResume[]): ArticleResume[] {
    const derniereVersion = navette.versions.at(-1)?.id;
    const cle = (r: ArticleResume) => {
      const v = navette.articles.get(r.article.id)!.versions.at(-1)!;
      return [v.version_texte === derniereVersion ? 0 : 1, -navette.versions.findIndex((x) => x.id === v.version_texte), v.ordre];
    };
    return [...resumes].sort((a, b) => {
      const [x, y] = [cle(a), cle(b)];
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    });
  }

  async articles(id: string): Promise<{ articles: ArticleResume[]; versionsDuTexte: number }> {
    if (!(await this.dossierLigne(id))) return { articles: [], versionsDuTexte: 0 };
    const navette = await this.navette(id);
    const premieres = [...navette.articles.values()].flatMap((a) => (a.versions[0] ? [a.versions[0].id] : []));
    const modifications = await this.modifications(premieres);
    const resumes = [...navette.articles.keys()].flatMap((a) => this.resumeArticle(navette, a, modifications) ?? []);
    return { articles: this.ordreArticles(navette, resumes), versionsDuTexte: navette.versions.length };
  }

  async ceQuiAChange(id: string): Promise<ChangementDepuisLeDepot[]> {
    const { articles } = await this.articles(id);
    return articles.filter((a) => a.etat !== 'inchange').map((a) => ({ article: a.article, resume: null }));
  }

  /** Numéro de chaque article suivi dans sa version la plus récente. */
  private numeros(navette: Navette): Map<string, string> {
    return new Map([...navette.articles].flatMap(([id, a]) => (a.versions.length ? [[id, a.versions.at(-1)!.numero] as const] : [])));
  }

  /** Origine d'une version d'article (cf. port `etape`) ; null si aucune ligne n'en dit rien. */
  private async origines(versions: string[]): Promise<Map<string, { origine: OrigineModification; expose: string | null }>> {
    const resultat = new Map<string, { origine: OrigineModification; expose: string | null }>();
    const modifications = await this.modifications(versions);
    const amendements = [...modifications.values()].flat().flatMap((m) => (m.amendement_id && m.origine === 'amendement' ? [m.amendement_id] : []));
    const resumes = await this.resumesAmendements(amendements);
    const exposes = amendements.length
      ? new Map(
          (
            await this.db.all<{ id: string; expose: string | null }>(
              `SELECT entite_id AS id, expose FROM canon.amendement WHERE entite_id = ANY($ids::uuid[])`,
              { ids: [...new Set(amendements)] },
            )
          ).map((l) => [l.id, l.expose]),
        )
      : new Map<string, string | null>();
    const preuves = await this.provenances(amendements);
    for (const [version, lignes] of modifications) {
      const verifiee = lignes.find((m) => m.statut === 'VERIFIED' && m.origine === 'amendement' && m.amendement_id && resumes.has(m.amendement_id));
      const cmp = lignes.find((m) => m.statut === 'VERIFIED' && m.origine === 'compromis_cmp');
      const enRevue = lignes.find((m) => m.statut === 'NEEDS_REVIEW' && m.origine === 'amendement' && m.amendement_id && resumes.has(m.amendement_id));
      if (verifiee) {
        resultat.set(version, {
          origine: {
            type: 'amendement',
            amendement: {
              statut: 'verifie',
              cible: resumes.get(verifiee.amendement_id!)!,
              rapprochement: {
                statut: 'verifie',
                methode: 'reference_explicite',
                motif: verifiee.diff?.motif ?? 'seul amendement adopté sur l’article, dispositif retrouvé dans le changement',
                preuve: preuves.get(verifiee.amendement_id!) ?? null,
              },
            },
          },
          expose: exposes.get(verifiee.amendement_id!) ?? null,
        });
      } else if (cmp) {
        resultat.set(version, { origine: { type: 'compromis_cmp' }, expose: null });
      } else if (enRevue) {
        resultat.set(version, {
          origine: {
            type: 'amendement',
            amendement: {
              statut: 'a_verifier',
              candidat: resumes.get(enRevue.amendement_id!)!,
              rapprochement: {
                statut: 'a_verifier',
                methode: 'attribution_en_revue',
                motif: 'attribution en revue',
                avertissement: 'L’amendement à l’origine de ce changement n’est pas encore établi.',
              },
            },
          },
          expose: null,
        });
      } else {
        resultat.set(version, { origine: { type: 'non_etablie' }, expose: null });
      }
    }
    return resultat;
  }

  private libelleVersion(v: VersionTexte, depose: string | null): string {
    if (v.id === depose) return 'Texte déposé';
    // Natures AN codées (depose, commission, adopte) ; natures Sénat publiées en clair.
    const codes: Record<string, string> = { depose: 'déposé', commission: 'de la commission', adopte: 'adopté' };
    const libelle = `Texte ${codes[v.nature] ?? v.nature}`;
    const chambre = v.chambre === 'AN' ? 'AN' : v.chambre === 'SENAT' ? 'Sénat' : null;
    return chambre && !/s[ée]nat|assembl/i.test(v.nature) ? `${libelle} (${chambre})` : libelle;
  }

  async article(
    id: string,
    version: string | null,
    comparaison: 'precedente' | 'depose',
  ): Promise<(Omit<FicheArticle, 'barre'> & { dossier: string }) | null> {
    if (!estUuid(id)) return null;
    const suivi = await this.db.first<{ dossier: string }>(
      `SELECT s.dossier_id AS dossier FROM canon.article_suivi s
       WHERE s.entite_id = $id AND ${vivant('s.entite_id')} AND ${vivant('s.dossier_id')}`,
      { id },
    );
    if (!suivi) return null;
    const navette = await this.navette(suivi.dossier);
    const a = navette.articles.get(id);
    if (!a || a.versions.length === 0) return null;
    const affichee = version ? a.versions.find((v) => v.id === version) : a.versions.at(-1);
    if (!affichee) return null;
    const textes = new Map(navette.versions.map((v) => [v.id, v]));
    const [modifications, cases] = await Promise.all([
      this.modifications(a.versions.map((v) => v.id)),
      this.casesDesEtapes(navette.versions.flatMap((v) => (v.etape_id ? [v.etape_id] : []))),
    ]);
    const i = a.versions.indexOf(affichee);
    const estDeposee = affichee.version_texte === navette.depose;
    const lignes = modifications.get(affichee.id) ?? [];
    let comparee: VersionArticleLigne | null = null;
    if (comparaison === 'depose') {
      comparee = estDeposee ? null : (a.versions.find((v) => v.version_texte === navette.depose) ?? null);
    } else if (i > 0) {
      const publiee = lignes.find((m) => m.version_precedente_id && a.versions.some((v) => v.id === m.version_precedente_id));
      comparee = publiee ? a.versions.find((v) => v.id === publiee.version_precedente_id)! : a.versions[i - 1];
    }
    const corps = await this.db.all<{ id: string; texte: string }>(
      `SELECT entite_id AS id, texte FROM canon.version_article WHERE entite_id = ANY($ids::uuid[])`,
      { ids: [affichee.id, ...(comparee ? [comparee.id] : [])] },
    );
    const texte = corps.find((c) => c.id === affichee.id)?.texte ?? '';
    const texteCompare = comparee ? (corps.find((c) => c.id === comparee.id)?.texte ?? '') : null;
    let diff: SegmentDiff[];
    if (!comparee) diff = texte ? [{ type: estDeposee ? 'egal' : 'ajoute', texte }] : [];
    else {
      const publie = lignes.find((m) => m.version_precedente_id === comparee.id);
      diff = segmentsPublies(publie?.diff ?? null) ?? diffMots(texteCompare ?? '', texte);
    }
    const origines = estDeposee ? new Map() : await this.origines([affichee.id]);
    const origine = estDeposee ? null : (origines.get(affichee.id)?.origine ?? { type: 'non_etablie' as const });
    const empreintes = empreintesEffectives(a.versions);
    let changements = 0;
    for (let k = 1; k < empreintes.length; k++) if (empreintes[k] !== empreintes[k - 1]) changements++;
    const versions: VersionArticle[] = a.versions.map((v) => {
      const t = textes.get(v.version_texte)!;
      return {
        id: v.id,
        rang: t.rang,
        libelle: this.libelleVersion(t, navette.depose),
        etape: t.etape_id ? (cases.get(t.etape_id) ?? null) : null,
        lieu: lieuDe(t.chambre),
        date: t.date,
        numero: v.numero,
        statut: dans(STATUTS_VERSION, v.statut) ?? 'present',
        mention: v.mention,
      };
    });
    return {
      dossier: suivi.dossier,
      article: { id, numero: a.versions.at(-1)!.numero },
      intitule: a.intitule ?? a.versions.at(-1)!.intitule,
      modifications: changements,
      versions,
      affichee: {
        version: affichee.id,
        comparaison,
        compareeA: comparee?.id ?? null,
        texte,
        diff,
        origine,
        pourquoi: { expose: origines.get(affichee.id)?.expose ?? null, synthese: null },
      },
    };
  }

  // ----- Amendements -----

  /** Résumés d'amendements (G2 : retirés et fusionnés ignorés), par identifiant. */
  /** Résumés d'amendements (aussi pour l'Explorer) ; inconnus ou retirés omis. */
  async resumesAmendements(ids: string[]): Promise<Map<string, AmendementResume>> {
    const resultat = new Map<string, AmendementResume>();
    const uniques = [...new Set(ids.filter(estUuid))];
    if (uniques.length === 0) return resultat;
    const lignes = await this.db.all<{
      id: string;
      numero: string;
      chambre: string;
      dossier_id: string | null;
      etape_id: string | null;
      article_suivi_id: string | null;
      division: string | null;
      sort: string | null;
      date_depot: string | null;
      auteur_id: string | null;
      auteur_type: string | null;
      auteur_nom: string | null;
      auteur_organisation: string | null;
      cosignataires: number;
    }>(
      `SELECT m.entite_id AS id, m.numero, m.chambre, m.dossier_id, m.etape_id, m.article_suivi_id, m.division, m.sort,
              m.date_depot::text AS date_depot, au.id AS auteur_id, au.type AS auteur_type, au.nom AS auteur_nom,
              au.type_organisation AS auteur_organisation,
              (SELECT count(*)::int FROM canon.lien c WHERE c.de_id = m.entite_id AND c.nature = 'cosignataire' AND ${vivant('c.vers_id')})
                AS cosignataires
       FROM canon.amendement m
       LEFT JOIN LATERAL (
         SELECT l.vers_id AS id, e.type, o.nom, o.type AS type_organisation
         FROM canon.lien l JOIN canon.entite e ON e.entite_id = l.vers_id LEFT JOIN canon.organisation o ON o.entite_id = l.vers_id
         WHERE l.de_id = m.entite_id AND l.nature = 'auteur' AND ${vivant('l.vers_id')}
         ORDER BY l.ordre NULLS LAST LIMIT 1) au ON true
       WHERE m.entite_id = ANY($ids::uuid[]) AND ${vivant('m.entite_id')}`,
      { ids: uniques },
    );
    const dossiers = [...new Set(lignes.flatMap((l) => (l.dossier_id && l.article_suivi_id ? [l.dossier_id] : [])))];
    const [personnes, cases, navettes] = await Promise.all([
      this.personnes(lignes.flatMap((l) => (l.auteur_id && l.auteur_type === 'personne' ? [{ id: l.auteur_id, jour: l.date_depot }] : []))),
      this.casesDesEtapes(lignes.flatMap((l) => (l.etape_id ? [l.etape_id] : []))),
      Promise.all(dossiers.map(async (d) => [d, this.numeros(await this.navette(d))] as const)),
    ]);
    const numeros = new Map(navettes);
    for (const l of lignes) {
      let auteur: Auteur | null = null;
      if (l.auteur_id && l.auteur_type === 'personne') {
        const p = personnes.get(`${l.auteur_id}|${l.date_depot ?? ''}`);
        if (p) auteur = { type: 'personne', personne: p };
      } else if (l.auteur_id && l.auteur_type === 'organisation' && l.auteur_nom) {
        auteur = l.auteur_organisation === 'gouvernement' || l.auteur_organisation === 'ministere'
          ? { type: 'gouvernement', ministre: null }
          : { type: 'commission', organisation: { id: l.auteur_id, nom: l.auteur_nom } };
      }
      const numero = l.article_suivi_id && l.dossier_id ? numeros.get(l.dossier_id)?.get(l.article_suivi_id) : undefined;
      const article: ArticleRef | null = l.article_suivi_id && numero ? { id: l.article_suivi_id, numero } : null;
      resultat.set(l.id, {
        id: l.id,
        numero: l.numero,
        chambre: l.chambre === 'SENAT' ? 'SENAT' : 'AN',
        etape: l.etape_id ? (cases.get(l.etape_id) ?? null) : null,
        article,
        division: l.division,
        sort: dans(SORTS, l.sort),
        objet: null,
        auteur,
        cosignataires: l.cosignataires,
      });
    }
    return resultat;
  }

  async amendements(
    id: string,
    filtre: { sort?: SortAmendement },
    pagination: Pagination,
  ): Promise<{ parEtape: StatAmendementsEtape[]; liste: Page<AmendementResume> }> {
    const vide = { parEtape: [], liste: page<AmendementResume>([], pagination, 0) };
    if (!(await this.dossierLigne(id))) return vide;
    const sort = filtre.sort ? dans(SORTS, filtre.sort) : null;
    if (filtre.sort && !sort) return vide;
    const where = `m.dossier_id = $id AND ${vivant('m.entite_id')} AND ($sort::text IS NULL OR m.sort = $sort)`;
    const params = { id, sort, taille: pagination.taille, decalage: (pagination.page - 1) * pagination.taille };
    const [total, ids, parEtape] = await Promise.all([
      this.db.first<{ n: number }>(`SELECT count(*)::int AS n FROM canon.amendement m WHERE ${where}`, params),
      this.db.all<{ id: string }>(
        `SELECT m.entite_id AS id FROM canon.amendement m WHERE ${where}
         ORDER BY (m.sort = 'adopte') DESC NULLS LAST, m.date_sort DESC NULLS LAST, m.chambre, m.numero, m.entite_id
         LIMIT $taille OFFSET $decalage`,
        params,
      ),
      (async () =>
        (await this.projection())
          ? this.db.all<{ cle: string; libelle: string; deposes: number; adoptes: number }>(
              `SELECT p.cle, p.libelle, count(*)::int AS deposes, count(*) FILTER (WHERE m.sort = 'adopte')::int AS adoptes
               FROM canon.amendement m
               JOIN lecture.parcours_acte a ON a.etape_id = m.etape_id AND a.categorie = 'case'
               JOIN lecture.parcours_dossier p ON p.dossier_id = a.dossier_id AND p.cle = a.cle
               WHERE m.dossier_id = $id AND ${vivant('m.entite_id')}
               GROUP BY p.cle, p.libelle, p.rang ORDER BY p.rang`,
              { id },
            )
          : [])(),
    ]);
    const resumes = await this.resumesAmendements(ids.map((l) => l.id));
    return {
      parEtape: parEtape.flatMap((s) => {
        const cle = cleEtape(s.cle);
        return cle ? [{ cle, libelle: s.libelle, deposes: s.deposes, adoptes: s.adoptes }] : [];
      }),
      liste: page(ids.flatMap((l) => resumes.get(l.id) ?? []), pagination, total?.n ?? 0),
    };
  }

  async amendement(
    id: string,
  ): Promise<(Omit<FicheAmendement, 'barre' | 'discussions' | 'interets'> & { dossier: string | null }) | null> {
    if (!estUuid(id)) return null;
    const [resumes, ligne] = await Promise.all([
      this.resumesAmendements([id]),
      this.db.first<{ dossier_id: string | null; date_depot: string | null; date_sort: string | null; dispositif: string | null; expose: string | null; chambre: string }>(
        `SELECT CASE WHEN m.dossier_id IS NOT NULL AND ${vivant('m.dossier_id')} THEN m.dossier_id END AS dossier_id,
                m.date_depot::text AS date_depot, (m.date_sort AT TIME ZONE 'Europe/Paris')::date::text AS date_sort,
                m.dispositif, m.expose, m.chambre
         FROM canon.amendement m WHERE m.entite_id = $id AND ${vivant('m.entite_id')}`,
        { id },
      ),
    ]);
    const resume = resumes.get(id);
    if (!resume || !ligne) return null;
    const [cosignataires, avis, provenance, modification] = await Promise.all([
      this.db.all<{ id: string }>(
        `SELECT l.vers_id AS id FROM canon.lien l JOIN canon.personne p ON p.entite_id = l.vers_id
         WHERE l.de_id = $id AND l.nature = 'cosignataire' AND ${vivant('l.vers_id')} ORDER BY l.ordre NULLS LAST, l.vers_id`,
        { id },
      ),
      this.db.all<{ emetteur: string; avis: string; avis_source: string | null }>(
        `SELECT emetteur, avis, avis_source FROM canon.avis_amendement WHERE amendement_id = $id
         ORDER BY CASE emetteur WHEN 'rapporteur' THEN 0 WHEN 'commission' THEN 1 ELSE 2 END`,
        { id },
      ),
      this.provenance(id),
      // Effet sur l'article visé : seulement quand l'amendement est l'origine vérifiée d'une modification.
      this.db.first<{ diff: LigneModification['diff'] }>(
        `SELECT m.diff FROM canon.modification_article m WHERE m.amendement_id = $id AND m.statut = 'VERIFIED' AND m.diff IS NOT NULL LIMIT 1`,
        { id },
      ),
    ]);
    const personnes = await this.personnes(cosignataires.map((c) => ({ id: c.id, jour: ligne.date_depot })));
    const refs = cosignataires.flatMap((c) => personnes.get(`${c.id}|${ligne.date_depot ?? ''}`) ?? []);
    const groupes = [...new Map(refs.flatMap((p) => (p.groupe ? [[p.groupe.id, p.groupe] as const] : []))).values()];
    const prov: Provenance = provenance ?? { systeme: 'CIVICTRACE', type: 'amendement', idNatif: id, url: null };
    const listeAvis: AvisAmendement[] = avis.flatMap((a) =>
      a.emetteur === 'rapporteur' || a.emetteur === 'commission' || a.emetteur === 'gouvernement'
        ? [{ emetteur: a.emetteur, avis: a.avis, libelle: LIBELLES_AVIS[a.avis] ?? a.avis_source, provenance: prov }]
        : [],
    );
    return {
      dossier: ligne.dossier_id,
      amendement: resume,
      dateDepot: ligne.date_depot,
      dateSort: ligne.date_sort,
      dispositif: { texte: ligne.dispositif, diff: segmentsPublies(modification?.diff ?? null) },
      expose: ligne.expose,
      exposeEnClair: null,
      cosignataires: { total: resume.cosignataires, personnes: refs, groupes },
      avis: { publies: ligne.chambre === 'SENAT', liste: listeAvis },
      vote: resume.sort === 'adopte' || resume.sort === 'rejete' ? { type: 'main_levee' } : { type: 'sans_vote' },
      provenance: prov,
    };
  }

  // ----- Étape (une case de la barre) -----

  async etape(dossier: string, cle: CleCase): Promise<Omit<FicheEtape, 'barre' | 'votes' | 'quiIntervient'> | null> {
    if (!cleEtape(cle) || !(await this.dossierLigne(dossier)) || !(await this.projection())) return null;
    const [toutes, details] = await Promise.all([this.cases([dossier]), this.organesEtChiffres(dossier, cle)]);
    const cases = toutes.get(dossier) ?? [];
    const c = cases.find((x) => x.cle === cle);
    if (!c) return null;
    const visibles = cases.filter((x) => x.etat !== 'sans_objet');
    const i = visibles.findIndex((x) => x.cle === cle);
    const voisine = (x: LigneCase | undefined) => (x ? { cle: x.cle as CleCase, libelle: x.libelle } : null);
    const d = details[0];
    const [parcours, documents, changements] = await Promise.all([
      this.parcours(dossier),
      this.documentsEtape(dossier, cle, c.provenance ?? []),
      this.changementsEtape(dossier, cle),
    ]);
    const caseParcours = parcours?.cases.find((x) => x.cle === cle);
    if (!caseParcours) return null;
    return {
      case: caseParcours,
      numero: i + 1,
      organe: d?.organe_id && d.organe_nom ? { id: d.organe_id, nom: d.organe_nom } : null,
      resume: null,
      chiffres: d ? chiffresEtape(d, true) : [],
      changements,
      documents,
      deviations: parcours!.deviations.filter((x) => x.etape === cle),
      enfants: parcours!.enfants.filter((x) => x.etape === cle),
      precedente: i > 0 ? voisine(visibles[i - 1]) : null,
      suivante: i >= 0 ? voisine(visibles[i + 1]) : null,
    };
  }

  private async documentsEtape(dossier: string, cle: CleCase, provenanceCase: string[]): Promise<DocumentOfficiel[]> {
    const lignes = await this.db.all<{
      id: string;
      sorte: string;
      type: string;
      titre: string | null;
      numero: string | null;
      date: string | null;
      url: string | null;
      ordre: number;
    }>(
      `WITH actes AS (
         SELECT a.etape_id, a.ordre FROM lecture.parcours_acte a WHERE a.dossier_id = $dossier AND a.cle = $cle AND a.categorie = 'case'
       ), documents AS (
         SELECT doc.entite_id AS id, 'document' AS sorte, doc.type, doc.titre, doc.numero, doc.date, doc.url, min(a.ordre) AS ordre
         FROM actes a JOIN canon.lien l ON l.de_id = a.etape_id AND l.nature = 'texte'
         JOIN canon.document doc ON doc.entite_id = l.vers_id
         WHERE ${vivant('doc.entite_id')} GROUP BY doc.entite_id
         UNION ALL
         SELECT doc.entite_id, 'document', doc.type, doc.titre, doc.numero, doc.date, doc.url, min(a.ordre)
         FROM actes a JOIN canon.lien l ON l.de_id = a.etape_id AND l.nature = 'reunion'
         JOIN canon.reunion r ON r.entite_id = l.vers_id JOIN canon.document doc ON doc.entite_id = r.compte_rendu_id
         WHERE ${vivant('r.entite_id')} AND ${vivant('doc.entite_id')} GROUP BY doc.entite_id
         UNION ALL
         SELECT k.entite_id, 'decision_cc', 'decision', k.numero || COALESCE(' ' || k.type, ''), k.numero, k.date, k.url, 1000000
         FROM canon.decision_cc k
         WHERE (k.entite_id = ANY($provenance::uuid[]) OR k.entite_id IN (
                  SELECT l.vers_id FROM actes a JOIN canon.lien l ON l.de_id = a.etape_id AND l.nature = 'decision_cc'))
           AND ${vivant('k.entite_id')}
         UNION ALL
         SELECT t.entite_id, 'texte_publie', 'loi', t.numero, t.numero, COALESCE(t.date_publication, t.date_signature), t.url, 1000001
         FROM canon.texte_publie t
         WHERE (t.entite_id = ANY($provenance::uuid[]) OR t.entite_id IN (
                  SELECT l.vers_id FROM actes a JOIN canon.lien l ON l.de_id = a.etape_id AND l.nature = 'texte_publie'))
           AND ${vivant('t.entite_id')}
       )
       SELECT DISTINCT ON (id) id, sorte, type, titre, numero, date::text AS date, url, ordre::int AS ordre FROM documents ORDER BY id, ordre`,
      { dossier, cle, provenance: provenanceCase.filter(estUuid) },
    );
    const provenances = await this.provenances(lignes.map((l) => l.id));
    return lignes
      .sort((a, b) => a.ordre - b.ordre || (a.date ?? '').localeCompare(b.date ?? '') || a.id.localeCompare(b.id))
      .flatMap((l) => {
        const provenance = provenances.get(l.id);
        if (!provenance) return [];
        let type = dans(TYPES_DOCUMENT, l.type) ?? 'autre';
        // L'uid AN dit la nature du texte (B déposé, BTC texte de la commission, BTA adopté).
        if (provenance.systeme === 'AN' && /BTC\d+$/.test(provenance.idNatif)) type = 'texte_commission';
        else if (provenance.systeme === 'AN' && /BTA\d+$/.test(provenance.idNatif)) type = 'texte_adopte';
        const titre =
          l.sorte === 'decision_cc'
            ? `Décision n° ${l.titre ?? l.numero ?? ''}`.trim()
            : l.sorte === 'texte_publie'
              ? l.numero ? `Loi n° ${l.numero}` : 'Loi'
              : type === 'compte_rendu' && l.titre
                ? l.titre
                : `${LIBELLES_DOCUMENT[type]}${l.numero && type !== 'compte_rendu' ? ` n° ${l.numero}` : ''}`;
        return [{ id: l.id, type, titre, numero: l.numero, date: l.date, url: l.url ?? provenance.url, provenance }];
      });
  }

  private async changementsEtape(dossier: string, cle: CleCase): Promise<ChangementEtape[]> {
    const etapes = await this.db.all<{ etape_id: string }>(
      `SELECT a.etape_id FROM lecture.parcours_acte a WHERE a.dossier_id = $dossier AND a.cle = $cle AND a.categorie = 'case'`,
      { dossier, cle },
    );
    const ids = new Set(etapes.map((e) => e.etape_id));
    const navette = await this.navette(dossier);
    const produites = new Set(navette.versions.filter((v) => v.etape_id && ids.has(v.etape_id)).map((v) => v.id));
    if (produites.size === 0) return [];
    const changees: { article: ArticleRef; version: string }[] = [];
    for (const [article, a] of navette.articles) {
      const empreintes = empreintesEffectives(a.versions);
      a.versions.forEach((v, i) => {
        if (!produites.has(v.version_texte)) return;
        if (i === 0 ? v.version_texte !== navette.depose : empreintes[i] !== empreintes[i - 1])
          changees.push({ article: { id: article, numero: a.versions.at(-1)!.numero }, version: v.id });
      });
    }
    // Un article par case, même s'il change dans plusieurs textes de la case (commission puis séance) :
    // l'origine la plus établie l'emporte (vérifiée, puis à vérifier, puis compromis de CMP).
    const origines = await this.origines(changees.map((c) => c.version));
    const poids = (o: OrigineModification) =>
      o.type === 'amendement' ? (o.amendement.statut === 'verifie' ? 3 : 2) : o.type === 'compromis_cmp' ? 1 : 0;
    const parArticle = new Map<string, ChangementEtape>();
    for (const c of changees) {
      const origine = origines.get(c.version)?.origine ?? { type: 'non_etablie' as const };
      const deja = parArticle.get(c.article.id);
      if (!deja || poids(origine) > poids(deja.origine)) parArticle.set(c.article.id, { article: c.article, origine, resume: null });
    }
    return [...parArticle.values()];
  }

  // ----- Acteurs, chiffres, sources -----

  async acteurs(id: string): Promise<GroupeActeurs[]> {
    const d = await this.dossierLigne(id);
    if (!d) return [];
    const [initiateurs, interventions, rapporteurs, cmp, auteursAmendements, saisissants, auditions] = await Promise.all([
      this.initiateurs(id),
      this.db.all<{ id: string; n: number }>(
        `SELECT i.orateur_id AS id, count(*)::int AS n FROM canon.intervention i
         WHERE i.dossier_id = $id AND i.orateur_id IS NOT NULL AND ${vivant('i.entite_id')} GROUP BY i.orateur_id`,
        { id },
      ),
      this.db.all<{ id: string; organe: string | null; chambre: string; ordre: number; jour: string | null }>(
        `SELECT DISTINCT ON (l.vers_id) l.vers_id AS id, o.nom AS organe, e.chambre, e.ordre, e.debut::text AS jour
         FROM canon.etape e JOIN canon.lien l ON l.de_id = e.entite_id AND l.nature = 'rapporteur'
         JOIN canon.personne p ON p.entite_id = l.vers_id
         LEFT JOIN canon.organisation o ON o.entite_id = e.organe_id
         WHERE e.dossier_id = $id AND e.chambre IN ('AN', 'SENAT') AND ${vivant('e.entite_id')} AND ${vivant('l.vers_id')}
         ORDER BY l.vers_id, e.ordre, l.ordre NULLS LAST`,
        { id },
      ),
      this.db.all<{ id: string; qualites: string[]; debut: string | null }>(
        `SELECT f.personne_id AS id, array_agg(DISTINCT split_part(f.titre, ' — ', 1)) AS qualites, min(f.debut)::text AS debut
         FROM canon.fonction f
         WHERE f.type = 'membre_cmp' AND ${vivant('f.entite_id')} AND ${vivant('f.personne_id')}
           AND f.organisation_id IN (SELECT e.organe_id FROM canon.etape e WHERE e.dossier_id = $id AND e.chambre = 'CMP' AND ${vivant('e.entite_id')})
         GROUP BY f.personne_id`,
        { id },
      ),
      this.db.all<{ id: string; n: number; total: number }>(
        // Compter d'abord, filtrer les personnes ensuite (CTE matérialisée : plan stable).
        `WITH auteurs AS MATERIALIZED (
           SELECT l.vers_id AS id, count(*)::int AS n
           FROM canon.amendement m JOIN canon.lien l ON l.de_id = m.entite_id AND l.nature = 'auteur'
           WHERE m.dossier_id = $id AND ${vivant('m.entite_id')} GROUP BY l.vers_id
         )
         SELECT a.id, a.n, (count(*) OVER ())::int AS total
         FROM auteurs a JOIN canon.personne p ON p.entite_id = a.id
         WHERE ${vivant('a.id')} ORDER BY a.n DESC, a.id LIMIT 5`,
        { id },
      ),
      this.db.all<{ id: string }>(
        `SELECT DISTINCT l.vers_id AS id FROM canon.etape e JOIN canon.lien l ON l.de_id = e.entite_id
         JOIN canon.personne p ON p.entite_id = l.vers_id
         WHERE e.dossier_id = $id AND e.type = 'saisine_cc' AND ${vivant('e.entite_id')} AND ${vivant('l.vers_id')}`,
        { id },
      ),
      this.db.all<{ personne_id: string | null; nom_publie: string; qualite: string | null; date: string | null }>(
        `SELECT DISTINCT ON (a.reunion_id, a.ordre) a.personne_id, a.nom_publie, a.qualite, (r.debut AT TIME ZONE 'Europe/Paris')::date::text AS date
         FROM canon.etape e JOIN canon.lien l ON l.de_id = e.entite_id AND l.nature = 'reunion'
         JOIN canon.reunion r ON r.entite_id = l.vers_id JOIN canon.audition a ON a.reunion_id = r.entite_id
         WHERE e.dossier_id = $id AND ${vivant('e.entite_id')} AND ${vivant('r.entite_id')}
         ORDER BY a.reunion_id, a.ordre`,
        { id },
      ),
    ]);
    // Chaque personne est montrée avec son mandat et son groupe au moment de son rôle : dépôt pour
    // les initiateurs, nomination pour les rapporteurs, réunion de la CMP, aujourd'hui sinon.
    const jourDe = new Map<string, string | null>();
    for (const i of initiateurs) jourDe.set(`initiateur:${i.id}`, d.date_depot);
    for (const r of rapporteurs) jourDe.set(`rapporteur:${r.id}`, r.jour ?? d.date_depot);
    for (const c of cmp) jourDe.set(`cmp:${c.id}`, c.debut);
    const jour = (contexte: string, pid: string) => jourDe.get(`${contexte}:${pid}`) ?? null;
    const demandes = [
      ...initiateurs.filter((i) => i.type === 'personne').map((i) => ({ id: i.id, jour: jour('initiateur', i.id) })),
      ...rapporteurs.map((r) => ({ id: r.id, jour: jour('rapporteur', r.id) })),
      ...cmp.map((c) => ({ id: c.id, jour: jour('cmp', c.id) })),
      ...[...auteursAmendements, ...saisissants].map((a) => ({ id: a.id, jour: null })),
      ...auditions.flatMap((a) => (a.personne_id ? [{ id: a.personne_id, jour: null }] : [])),
    ];
    const personnes = await this.personnes(demandes);
    const ref = (pid: string, contexte = '') => personnes.get(`${pid}|${jour(contexte, pid) ?? ''}`) ?? null;
    const parOrateur = new Map(interventions.map((i) => [i.id, i.n]));
    const activite = (pid: string): Chiffre | null => (parOrateur.get(pid) ? { libelle: 'Interventions', valeur: parOrateur.get(pid)! } : null);
    const accord = (pid: string, masculin: string, feminin: string) => (this.feminins.has(pid) ? feminin : masculin);
    const role = (p: PersonneRef, ...suite: (string | null)[]) => [p.fonction, p.groupe?.abrege ?? null, ...suite].filter(Boolean).join(' · ');
    const acteur = (
      pid: string,
      contexte: string,
      texte: (p: PersonneRef) => string,
      act: Chiffre | null = activite(pid),
    ): ActeurDossier[] => {
      const p = ref(pid, contexte);
      return p ? [{ qui: { type: 'personne', personne: p, qualite: null }, role: texte(p), activite: act }] : [];
    };
    const groupes: GroupeActeurs[] = [];
    const ajouter = (g: GroupeActeurs) => {
      if (g.acteurs.length > 0) groupes.push(g);
    };
    const personnesInitiatrices = initiateurs.filter((i) => i.type === 'personne');
    if (d.initiative === 'gouvernement') {
      const membres = personnesInitiatrices.flatMap((i) => acteur(i.id, 'initiateur', (p) => p.fonction ?? 'Membre du Gouvernement'));
      ajouter({ role: 'gouvernement', libelle: 'Gouvernement', acteurs: membres, total: membres.length });
    } else {
      const auteurs = personnesInitiatrices.flatMap((i, k) =>
        acteur(i.id, 'initiateur', (p) => role(p, k === 0 ? accord(i.id, 'auteur du texte', 'autrice du texte') : accord(i.id, 'coauteur', 'coautrice'))),
      );
      ajouter({ role: 'auteur', libelle: auteurs.length > 1 ? 'Auteurs' : 'Auteur', acteurs: auteurs, total: auteurs.length });
    }
    const rapp = [...rapporteurs].sort((a, b) => a.ordre - b.ordre).flatMap((r) =>
      acteur(r.id, 'rapporteur', (p) => role(p, `${accord(r.id, 'rapporteur', 'rapporteure')}${r.organe ? ` · ${r.organe}` : ''}`)),
    );
    ajouter({ role: 'rapporteur', libelle: 'Rapporteurs', acteurs: rapp, total: rapp.length });
    const rangCmp = (q: string[]) =>
      q.some((x) => /^pr[ée]sident/i.test(x)) ? 0 : q.some((x) => /^vice/i.test(x)) ? 1 : q.some((x) => /^rapporteur/i.test(x)) ? 2 : q.some((x) => /titulaire/i.test(x)) ? 3 : 4;
    const membresCmp = [...cmp]
      .sort((a, b) => rangCmp(a.qualites) - rangCmp(b.qualites) || (ref(a.id, 'cmp')?.nom ?? '').localeCompare(ref(b.id, 'cmp')?.nom ?? ''))
      .flatMap((c) => acteur(c.id, 'cmp', (p) => role(p, [...c.qualites].sort().join(', ')), null));
    ajouter({ role: 'cmp', libelle: 'Commission mixte paritaire', acteurs: membresCmp, total: membresCmp.length });
    const actifs = auteursAmendements.flatMap((a) => acteur(a.id, '', (p) => role(p), { libelle: 'Amendements', valeur: a.n }));
    ajouter({ role: 'auteurs_amendements', libelle: 'Auteurs d’amendements les plus actifs', acteurs: actifs, total: auteursAmendements[0]?.total ?? 0 });
    const saisine = saisissants.flatMap((s) => acteur(s.id, '', (p) => role(p, 'saisine du Conseil constitutionnel'), null));
    ajouter({ role: 'saisissants_cc', libelle: 'Saisine du Conseil constitutionnel', acteurs: saisine, total: saisine.length });
    const auditionnes: ActeurDossier[] = auditions.flatMap((a) => {
      const p = a.personne_id ? ref(a.personne_id) : null;
      const act: Chiffre | null = a.date ? { libelle: 'Audition', valeur: dateFr(a.date) } : null;
      return [
        {
          qui: p ? { type: 'personne' as const, personne: p, qualite: a.qualite } : { type: 'nom_publie' as const, nom: a.nom_publie, qualite: a.qualite },
          role: p && this.feminins.has(p.id) ? 'Auditionnée en commission' : 'Auditionné(e) en commission',
          activite: act,
        },
      ];
    });
    ajouter({ role: 'auditionnes', libelle: 'Personnes auditionnées', acteurs: auditionnes, total: auditionnes.length });
    return groupes;
  }

  async chiffres(id: string): Promise<Chiffre[]> {
    const d = await this.dossierLigne(id);
    if (!d) return [];
    const [comptes, syntheses, cases] = await Promise.all([
      this.db.first<{ deposes: number; adoptes: number; scrutins: number; interventions: number }>(
        `SELECT (SELECT count(*)::int FROM canon.amendement m WHERE m.dossier_id = $id AND ${vivant('m.entite_id')}) AS deposes,
                (SELECT count(*)::int FROM canon.amendement m WHERE m.dossier_id = $id AND m.sort = 'adopte' AND ${vivant('m.entite_id')}) AS adoptes,
                (SELECT count(*)::int FROM canon.scrutin s WHERE s.dossier_id = $id AND ${vivant('s.entite_id')}) AS scrutins,
                (SELECT count(*)::int FROM canon.intervention i JOIN canon.reunion r ON r.entite_id = i.reunion_id
                 WHERE i.dossier_id = $id AND r.type = 'seance' AND ${vivant('i.entite_id')}) AS interventions`,
        { id },
      ),
      this.syntheses([id]),
      this.cases([id]),
    ]);
    const resultat: Chiffre[] = [];
    const s = syntheses.get(id);
    if (s) resultat.push({ libelle: 'Étapes franchies', valeur: s.cases_faites, detail: `sur ${s.cases_affichees} étapes` });
    if (comptes) {
      resultat.push({ libelle: 'Amendements déposés', valeur: comptes.deposes });
      resultat.push({ libelle: 'Amendements adoptés', valeur: comptes.adoptes });
      resultat.push({ libelle: 'Scrutins publics', valeur: comptes.scrutins });
      resultat.push({ libelle: 'Interventions en séance', valeur: comptes.interventions });
    }
    const fins = (cases.get(id) ?? []).flatMap((c) => (c.etat === 'faite' && c.fin ? [c.fin] : [])).sort();
    const debut = d.date_depot ?? (cases.get(id) ?? []).find((c) => c.cle === 'depot')?.debut ?? null;
    const fin = fins.at(-1);
    if (debut && fin && fin >= debut) {
      resultat.push({ libelle: 'Durée d’examen', valeur: `${joursEntre(debut, fin)} jours`, detail: `du ${dateFr(debut)} au ${dateFr(fin)}` });
    }
    return resultat;
  }

  async sources(id: string): Promise<Provenance[]> {
    if (!(await this.dossierLigne(id))) return [];
    const lignes = await this.db.all<{ id: string; ordre: number }>(
      `SELECT $id::uuid AS id, 0 AS ordre
       UNION ALL
       SELECT t.entite_id, 1 FROM canon.texte_publie t WHERE t.dossier_id = $id AND ${vivant('t.entite_id')}
       UNION ALL
       SELECT k.entite_id, 2 FROM canon.decision_cc k WHERE k.dossier_id = $id AND ${vivant('k.entite_id')}`,
      { id },
    );
    const toutes = await this.db.all<{ id: string; systeme: string; type: string; id_natif: string; url: string | null; ordre: number }>(
      `SELECT c.entite_id AS id, c.systeme, c.type_source AS type, c.id_source AS id_natif, u.ordre,
              COALESCE(c.url, (
                SELECT p.url FROM canon.provenance p JOIN brut.enregistrement_source s ON s.source_id = p.source_id
                WHERE p.entite_id = c.entite_id AND s.systeme = c.systeme AND p.url IS NOT NULL AND p.url IS DISTINCT FROM s.url
                ORDER BY p.vu_le DESC LIMIT 1)) AS url
       FROM canon.correspondance c JOIN unnest($ids::uuid[], $ordres::int[]) AS u(id, ordre) ON u.id = c.entite_id
       WHERE c.statut = 'VERIFIED' AND c.systeme <> 'CIVICTRACE'
       ORDER BY u.ordre, (c.methode = 'OFFICIAL_ID') DESC, c.systeme, c.id_source`,
      { ids: lignes.map((l) => l.id), ordres: lignes.map((l) => String(l.ordre)) },
    );
    // Une provenance par système : celle du dossier d'abord, puis la loi publiée, puis la décision.
    const parSysteme = new Map<Systeme, Provenance>();
    for (const l of toutes) {
      const systeme = dans(SYSTEMES, l.systeme);
      if (systeme && !parSysteme.has(systeme)) parSysteme.set(systeme, { systeme, type: l.type, idNatif: l.id_natif, url: l.url });
    }
    return [...parSysteme.values()];
  }
}

/** Résumé chiffré d'une case : seulement les nombres que la base relie à l'étape (jamais un 0 supposé). */
function chiffresEtape(d: { deposes: number; adoptes: number; scrutins: number; reunions: number }, reunions: boolean): Chiffre[] {
  const resultat: Chiffre[] = [];
  if (d.deposes > 0) {
    resultat.push({ libelle: 'Amendements déposés', valeur: d.deposes });
    resultat.push({ libelle: 'Amendements adoptés', valeur: d.adoptes });
  }
  if (d.scrutins > 0) resultat.push({ libelle: 'Scrutins publics', valeur: d.scrutins });
  if (reunions && d.reunions > 0) resultat.push({ libelle: 'Réunions', valeur: d.reunions });
  return resultat;
}
