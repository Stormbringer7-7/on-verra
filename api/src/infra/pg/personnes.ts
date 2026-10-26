// Adaptateur Postgres du port PersonnesRepository : annuaire, en-tête, frise des fonctions datées,
// bilan comparé (participation, écarts, présence en commission), rôles dans les dossiers,
// questions et classements. Lit `canon` et `lecture` seulement (garanties G1 à G6 de ports.ts).
//
// Identités : une personne canon (acteur AN, sénateur, personne établie par revue), ou une fiche
// RNE seule (`canon.mandat_rne` sans `personne_id`). Un mandat RNE n'est rattaché à une personne que
// par `mandat_rne.personne_id`, posé par la revue humaine : jamais par le nom. Une personne issue
// d'une fusion garde toutes ses identités natives dans `canon.correspondance` ; l'entité absorbée
// (`fusionnee_dans`) est ignorée.
//
// Les assistants SQL partagés par les adaptateurs de ce lot (institutions.ts, transparence.ts) sont
// en tête de fichier : dates « AAAA-MM-JJ » rendues par Postgres (to_char, pas de fuseau horaire),
// nombres convertis en SQL (::int, ::float8) pour ne pas dépendre des analyseurs de types du pilote.

import type {
  ActeSurLeDossier,
  Annuaire,
  Chambre,
  ChoixTheme,
  Classement,
  CleCase,
  DemandeClassement,
  DossierRef,
  ElementAnnuaire,
  EntetePersonne,
  FiltreAnnuaire,
  FonctionDatee,
  GroupeRef,
  Indicateur,
  LigneClassement,
  Page,
  PersonneRef,
  Provenance,
  QuestionResume,
  RoleDansLesDossiers,
  RolePersonne,
  SourceCouleur,
  Systeme,
  TypeFonction,
} from '@contrat/domain/model';
import { normaliser } from '@contrat/domain/texte';
import type { Pagination, PersonnesRepository, SqlDatabase } from '../../ports';

// ---------- Assistants partagés (adaptateurs pg de ce lot) ----------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiant canon bien formé : sinon la fiche est inconnue (G5), sans requête. */
export const estUuid = (id: string): boolean => UUID.test(id);

/** Entité ni retirée de la source, ni fusionnée dans une autre (G2). */
export const actif = (colonne: string) =>
  `EXISTS (SELECT 1 FROM canon.entite x WHERE x.entite_id = ${colonne} AND x.retiree_de_la_source_le IS NULL AND x.fusionnee_dans IS NULL)`;

/** Date « AAAA-MM-JJ », null si absente. */
export const jour = (colonne: string) => `to_char(${colonne}, 'YYYY-MM-DD')`;

/**
 * Provenance principale d'une entité (G3) : sa correspondance VERIFIED (identifiant officiel
 * d'abord), l'URL de la correspondance sinon celle de canon.provenance, sauf une archive (.zip :
 * le fichier livré, pas la page de l'objet). null si aucune.
 */
export const provenanceSql = (colonne: string) => `(
  SELECT json_build_object('systeme', c.systeme, 'type', c.type_source, 'idNatif', c.id_source,
           'url', COALESCE(c.url, (SELECT p.url FROM canon.provenance p
                                   WHERE p.entite_id = c.entite_id AND p.url IS NOT NULL AND p.url !~* '\\.zip$'
                                   ORDER BY p.vu_le DESC LIMIT 1)))
  FROM canon.correspondance c
  WHERE c.entite_id = ${colonne} AND c.statut = 'VERIFIED'
  ORDER BY (c.methode = 'OFFICIAL_ID') DESC, c.cree_le, c.systeme LIMIT 1)`;

/** Référence de groupe (GroupeRef) depuis une ligne de canon.organisation. */
export const groupeSql = (alias: string) =>
  `json_build_object('id', ${alias}.entite_id, 'abrege', COALESCE(${alias}.abrege, ${alias}.nom_court, ${alias}.nom),
     'libelle', ${alias}.nom, ${couleurGroupeSql(alias)}, 'chambre', ${alias}.chambre)`;

/**
 * Couleur d'un groupe (projection `lecture.couleur_groupe` : officielle, de famille ou de secours),
 * en deux clés de json_build_object : 'couleur' et 'sourceCouleur'.
 */
export const couleurGroupeSql = (alias: string) =>
  `'couleur', COALESCE((SELECT cg.couleur FROM lecture.couleur_groupe cg WHERE cg.groupe_id = ${alias}.entite_id), ${alias}.couleur),
   'sourceCouleur', COALESCE((SELECT cg.source FROM lecture.couleur_groupe cg WHERE cg.groupe_id = ${alias}.entite_id),
                             CASE WHEN ${alias}.couleur IS NOT NULL THEN 'officielle' END)`;

/** Couleur de secours quand la projection ne connaît pas le groupe (jamais vide : règle de l'app). */
export const COULEUR_INCONNUE = '#8D949A';

/**
 * Position gauche-droite des groupes (0 = gauche, 1 = droite), d'après les sièges publiés
 * (`lecture.position_groupe`) : vide pour un groupe sans siège publié (Sénat) ou hors projection.
 */
export async function positionsDesGroupes(db: SqlDatabase, ids: string[]): Promise<Map<string, number>> {
  const uniques = [...new Set(ids)];
  if (!uniques.length) return new Map();
  const projetee = await db.first<{ ok: boolean }>(`SELECT to_regclass('lecture.position_groupe') IS NOT NULL AS ok`);
  if (!projetee?.ok) return new Map();
  const lignes = await db.all<{ id: string; position: number }>(
    `SELECT groupe_id::text AS id, position::float8 AS position FROM lecture.position_groupe
     WHERE groupe_id = ANY($ids::uuid[]) AND position IS NOT NULL`,
    { ids: uniques },
  );
  return new Map(lignes.map((l) => [l.id, l.position]));
}

/** Non-inscrits : pas une position politique, toujours en dernier. */
const NON_INSCRITS = /^(NI|NIPOL|AUCUN)$/;

/**
 * De la gauche vers la droite : les groupes dont la position est connue, par position ; les autres
 * ensuite, dans l'ordre reçu ; les non-inscrits en dernier. Tri stable.
 */
export function gaucheDroite<T>(elements: T[], groupeDe: (e: T) => GroupeRef, positions: Map<string, number>): T[] {
  const cle = (e: T) => {
    const g = groupeDe(e);
    return [Number(NON_INSCRITS.test(g.abrege)), positions.has(g.id) ? 0 : 1, positions.get(g.id) ?? 0];
  };
  return elements
    .map((e, i) => ({ e, i, k: cle(e) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.i - b.i)
    .map((x) => x.e);
}

/** Source de couleur lue, ou « arbitraire » (secours). */
export const sourceCouleur = (valeur: string | null | undefined): SourceCouleur =>
  valeur === 'officielle' || valeur === 'famille' || valeur === 'gauche_droite' ? valeur : 'arbitraire';

/**
 * Groupe politique d'une personne dans une chambre à une date (fonction membre_groupe en cours).
 * L'AMO publie aussi les groupes du Sénat : la fiche de la chambre elle-même est préférée.
 */
export const groupeALaDateSql = (personne: string, chambre: string, date: string) => `(
  SELECT ${groupeSql('og')}
  FROM canon.fonction fg JOIN canon.organisation og ON og.entite_id = fg.organisation_id
  WHERE fg.personne_id = ${personne} AND fg.type = 'membre_groupe' AND og.type = 'groupe_politique'
    AND og.chambre = ${chambre} AND fg.debut <= ${date} AND (fg.fin IS NULL OR fg.fin >= ${date})
    AND ${actif('fg.entite_id')} AND ${actif('og.entite_id')}
  ORDER BY EXISTS (SELECT 1 FROM canon.correspondance cg WHERE cg.entite_id = og.entite_id
                   AND cg.statut = 'VERIFIED' AND cg.systeme = og.chambre) DESC, fg.debut DESC
  LIMIT 1)`;

const SYSTEMES: readonly Systeme[] = ['AN', 'SENAT', 'LEGIFRANCE', 'CONSTIT', 'HATVP', 'RNE', 'INSEE', 'CIVICTRACE'];

export const systeme = (valeur: string | null | undefined): Systeme =>
  SYSTEMES.includes(valeur as Systeme) ? (valeur as Systeme) : 'CIVICTRACE';

/** Provenance lue (json de provenanceSql), ou l'identifiant CivicTrace si la source n'en donne pas. */
export function provenance(lue: Provenance | null | undefined, type: string, id: string): Provenance {
  if (!lue) return { systeme: 'CIVICTRACE', type, idNatif: id, url: null };
  return { systeme: systeme(lue.systeme), type: lue.type, idNatif: lue.idNatif, url: lue.url ?? null };
}

export const chambre = (valeur: string | null | undefined): Chambre => (valeur === 'SENAT' ? 'SENAT' : 'AN');

/** GroupeRef tel que le lit groupeSql (couleur et source pouvant manquer). */
export type GroupeLu = Omit<GroupeRef, 'chambre' | 'couleur' | 'sourceCouleur'> & {
  couleur: string | null;
  sourceCouleur?: string | null;
  chambre: string | null;
};

export function groupe(lu: GroupeLu | null | undefined): GroupeRef | null {
  if (!lu) return null;
  return {
    id: lu.id,
    abrege: lu.abrege,
    libelle: lu.libelle,
    couleur: lu.couleur ?? COULEUR_INCONNUE,
    sourceCouleur: lu.couleur ? sourceCouleur(lu.sourceCouleur) : 'arbitraire',
    chambre: chambre(lu.chambre),
  };
}

/** Titres des dossiers : `titre_court` est un identifiant technique (« fin_de_vie_17e »), d'où le titre. */
export async function dossiersRef(db: SqlDatabase, ids: (string | null)[]): Promise<Map<string, DossierRef>> {
  const uniques = [...new Set(ids.filter((id): id is string => !!id))];
  if (!uniques.length) return new Map();
  const lignes = await db.all<DossierRef>(
    `SELECT d.entite_id::text AS id, d.titre FROM canon.dossier d
     WHERE d.entite_id = ANY($ids::uuid[]) AND ${actif('d.entite_id')}`,
    { ids: uniques },
  );
  return new Map(lignes.map((d) => [d.id, d]));
}

/** Page à partir d'un total connu. */
export function page<T>(elements: T[], pagination: Pagination, total: number): Page<T> {
  const suivante = pagination.page * pagination.taille < total ? pagination.page + 1 : null;
  return { elements, page: pagination.page, taille: pagination.taille, total, suivante };
}

/** 2026-10-22 → 2025-10-23 : premier jour des 12 mois qui finissent à cette date. */
export function debutDouzeMois(fin: string): string {
  const d = new Date(`${fin}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Titre de fonction tel que publié par l'AMO (« qualité — organe »), sans répétition :
 * « Premier ministre — Premier ministre » → « Premier ministre » ; « Ministre — Ministère de… » →
 * « Ministre · Ministère de… ».
 */
export function titrePublie(titre: string): string {
  return titre
    .split(' — ')
    .filter((p, i, t) => t.indexOf(p) === i)
    .join(' · ');
}

const enFrancais = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

/** Accord au féminin des libellés de fonction, d'après la civilité publiée (Mme) ou le sexe RNE (F). */
export const feminin = (civilite: string | null | undefined) => civilite === 'Mme' || civilite === 'F';

/**
 * Ordre de l'hémicycle, de la gauche vers la droite : rang du groupe (sans groupe : à la fin), puis
 * siège décroissant (l'AN numérote de la droite vers la gauche ; sans siège : après), à défaut nom
 * (ordre alphabétique, nombres compris).
 */
export const ordreHemicycle =
  (rangs: Map<string, number>) =>
  (a: { personne: PersonneRef; siege: number | null }, b: { personne: PersonneRef; siege: number | null }) => {
    const rang = (x: { personne: PersonneRef }) => (x.personne.groupe ? (rangs.get(x.personne.groupe.id) ?? 1e6) : 1e6);
    return rang(a) - rang(b) || (b.siege ?? -1) - (a.siege ?? -1) || a.personne.nom.localeCompare(b.personne.nom, 'fr', { numeric: true });
  };

const libelleMandat = (type: string, civilite: string | null) => {
  const f = feminin(civilite);
  if (type === 'depute') return f ? 'Députée' : 'Député';
  if (type === 'senateur') return f ? 'Sénatrice' : 'Sénateur';
  return type;
};

const LIBELLES_RNE: Record<string, [string, string]> = {
  maire: ['Maire', 'Maire'],
  conseiller_communautaire: ['Conseiller communautaire', 'Conseillère communautaire'],
  depute: ['Député', 'Députée'],
  senateur: ['Sénateur', 'Sénatrice'],
  representant_parlement_europeen: ['Représentant au Parlement européen', 'Représentante au Parlement européen'],
};

/** « Maire · L'Abergement-Clémenciat », « 2eme Vice-président · CC de la Dombes » (libellés publiés). */
function libelleRne(m: { type_mandat: string; fonction: string | null; territoire: string | null; sexe: string | null }) {
  const [masculin, femininLibelle] = LIBELLES_RNE[m.type_mandat] ?? [m.type_mandat, m.type_mandat];
  const titre = m.fonction ?? (feminin(m.sexe) ? femininLibelle : masculin);
  return [titre, m.territoire].filter(Boolean).join(' · ');
}

/** Types de mandats RNE qui sont des mandats locaux (les fiches député et sénateur doublonnent l'AN et le Sénat). */
const MANDATS_LOCAUX = ['maire', 'conseiller_communautaire'];

const TYPE_FONCTION_RNE: Record<string, TypeFonction> = {
  maire: 'mandat_local',
  conseiller_communautaire: 'mandat_local',
  depute: 'depute',
  senateur: 'senateur',
};

const TYPES_FONCTION: readonly TypeFonction[] = [
  'depute',
  'senateur',
  'membre_gouvernement',
  'membre_commission',
  'membre_groupe',
  'membre_cmp',
  'bureau',
  'presidence',
  'mandat_local',
  'autre',
];

/** Gouvernement en fonction à une date (canon.organisation type gouvernement). */
export const gouvernementALaDateSql = (date: string) => `(
  SELECT o.entite_id FROM canon.organisation o
  WHERE o.type = 'gouvernement' AND o.debut <= ${date} AND (o.fin IS NULL OR o.fin >= ${date}) AND ${actif('o.entite_id')}
  ORDER BY o.debut DESC LIMIT 1)`;

/**
 * Fonctions de membre d'un gouvernement : sur le gouvernement lui-même, ou sur un de ses ministères
 * (organisation fille). Les parlementaires « en mission » auprès d'un ministère n'en sont pas membres.
 */
export const membreDuGouvernementSql = (fonction: string, organisation: string, gouvernement: string) =>
  `${fonction}.type = 'membre_gouvernement'
   AND (${organisation}.entite_id = ${gouvernement}
        OR (${organisation}.parent_id = ${gouvernement} AND ${fonction}.qualite IS DISTINCT FROM 'en mission'))`;

// ---------- Indicateurs ----------

/** Nombre minimal de votes ou de scrutins pour figurer dans un classement : en dessous, un taux ne dit rien. */
const SEUIL_CLASSEMENT = 20;

const NE_DIT_PAS_PARTICIPATION = [
  'Les déports, la présence en commission au même moment (l’heure des scrutins n’est pas publiée) et les votes à main levée ne sont pas dans la donnée.',
  'Les mises au point (« voulait voter pour… ») ne comptent pas : seul le vote enregistré compte.',
  'Un vote par délégation compte comme une participation.',
];

const NE_DIT_PAS_ECARTS = [
  'Seuls les scrutins publics comptent : les votes à main levée ne sont pas nominatifs.',
  'Un groupe sans majorité nette sur un scrutin n’a pas de ligne : aucun écart n’y est compté.',
  'Un écart n’est ni bien ni mal : c’est là que se lisent les choix personnels.',
];

const NE_DIT_PAS_POSITIONS = [
  'Voter pour ne dit pas le sens du texte : un amendement de suppression adopté retire une disposition.',
  'Seuls les scrutins publics comptent : les votes à main levée ne sont pas nominatifs.',
];

const NE_DIT_PAS_COMMISSION = [
  '« Excusé » n’est pas « absent » : les deux sont distingués par l’agenda de l’AN.',
  'Seules les réunions dont l’agenda de l’AN publie les présences comptent ; le Sénat ne les publie pas.',
  'Une réunion tenue en même temps qu’une séance publique n’est pas signalée.',
];

const LIBELLE_CHAMBRE: Record<Chambre, string> = { AN: 'Assemblée nationale', SENAT: 'Sénat' };
const MEMBRES_CHAMBRE: Record<Chambre, string> = { AN: 'des députés', SENAT: 'des sénateurs' };

interface Fenetre {
  chambre: Chambre;
  debut: string;
  fin: string;
}

interface LigneParticipation {
  scrutins: number;
  participations: number;
  delegations: number;
  taux: number | null;
  attendu: number | null;
  groupe: Parameters<typeof groupe>[0];
}

interface LigneEcarts {
  votes: number;
  ecarts: number;
  contre: number;
  abstention: number;
  pour: number;
  groupe_id: string | null;
  groupe: Parameters<typeof groupe>[0];
}

function indicateurParticipation(l: LigneParticipation, f: Fenetre, suffixe: string): Indicateur {
  const g = groupe(l.groupe);
  return {
    libelle: `Participation aux scrutins publics${suffixe}`,
    valeur: l.taux ?? 0,
    unite: 'pourcentage',
    denominateur: { valeur: l.scrutins, libelle: 'scrutins publics pendant son mandat' },
    reference: {
      libelle: `Attendu : participation de son groupe${g ? ` (${g.abrege})` : ''} sur les mêmes scrutins`,
      valeur: l.attendu,
    },
    ceQueLaDonneeNeDitPas: [
      ...NE_DIT_PAS_PARTICIPATION,
      ...(l.delegations ? [`Dont ${l.delegations} votes par délégation.`] : []),
    ],
    periode: { debut: f.debut, fin: f.fin },
    calcul: 'lecture.participation_scrutin (définitions de lecture.indicateur_participation)',
  };
}

function indicateurEcarts(l: LigneEcarts, f: Fenetre, reference: Indicateur['reference'], suffixe: string): Indicateur {
  const nature = [
    l.contre ? `${l.contre} contre` : null,
    l.abstention ? `${l.abstention} abstention${l.abstention > 1 ? 's' : ''}` : null,
    l.pour ? `${l.pour} pour` : null,
  ].filter(Boolean);
  return {
    libelle: `Écarts au groupe${suffixe}`,
    valeur: l.ecarts,
    unite: 'nombre',
    denominateur: { valeur: l.votes, libelle: 'votes en groupe' },
    reference,
    ceQueLaDonneeNeDitPas: [
      ...NE_DIT_PAS_ECARTS,
      ...(nature.length ? [`Nature des écarts : ${nature.join(', ')} (le groupe votait autrement).`] : []),
    ],
    periode: { debut: f.debut, fin: f.fin },
    calcul: 'lecture.vote_et_groupe (définitions de lecture.indicateur_ecarts)',
  };
}

// ---------- Adaptateur ----------

interface LignePersonne {
  id: string;
  civilite: string | null;
  nom: string;
}

interface LigneFonction {
  id: string;
  type: string;
  titre: string;
  qualite: string | null;
  territoire: string | null;
  debut: string | null;
  fin: string | null;
  organisation_id: string | null;
  organisation_nom: string | null;
  organisation_type: string | null;
  organisation_chambre: string | null;
  groupe: Parameters<typeof groupe>[0];
  provenance: Provenance | null;
}

interface LigneRne {
  id: string;
  personne_id: string | null;
  type_mandat: string;
  nom_affiche: string;
  sexe: string | null;
  fonction: string | null;
  territoire: string | null;
  organisation_id: string | null;
  organisation_nom: string | null;
  debut: string | null;
  provenance: Provenance | null;
  motif: string | null;
  cas: string | null;
}

/** Ligne de l'annuaire avant enrichissement : la fonction affichée est lue ensuite, pour la page seulement. */
interface Candidat {
  id: string;
  identite: 'personne' | 'fiche_rne';
  role: RolePersonne;
  fonction_id: string | null;
  nom: string;
}

export class PgPersonnes implements PersonnesRepository {
  constructor(private readonly db: SqlDatabase) {}

  // ----- Annuaire -----

  async annuaire(filtre: FiltreAnnuaire, pagination: Pagination): Promise<Pick<Annuaire, 'effectifs' | 'personnes'>> {
    const role = filtre.role ?? null;
    const q = filtre.q?.trim() ? normaliser(filtre.q.trim()) : null;
    const [effectifs, { total, candidats }] = await Promise.all([this.effectifs(), this.candidats(role, q, pagination)]);
    const elements = await this.elementsAnnuaire(candidats);
    return { effectifs, personnes: page(elements, pagination, total) };
  }

  /**
   * Parlementaires et membres du Gouvernement en fonction aujourd'hui, élus locaux du RNE.
   *
   * Les mandats RNE (97 000) ne passent pas par `actif()` ligne à ligne : ils sont écartés par une
   * anti-jointure sur les entités inactives (quelques milliers), lues par les index partiels de
   * canon.entite. Même règle (G2), mais un plan qui ne dépend pas des statistiques de canon.entite,
   * fausses pendant un chargement (1,4 million de lignes estimées à quelques milliers, ou l'inverse).
   * `fusionnee_dans >= uuid nul` vaut `IS NOT NULL` et donne à l'index partiel une condition d'index.
   */
  private static readonly EN_FONCTION = `
    gouv AS (SELECT ${gouvernementALaDateSql('current_date')} AS id),
    gouvernement AS (
      SELECT DISTINCT ON (f.personne_id) f.personne_id, f.entite_id AS fonction_id
      FROM canon.fonction f JOIN canon.organisation o ON o.entite_id = f.organisation_id, gouv
      WHERE ${membreDuGouvernementSql('f', 'o', 'gouv.id')}
        AND f.debut <= current_date AND (f.fin IS NULL OR f.fin >= current_date) AND ${actif('f.entite_id')}
      ORDER BY f.personne_id, (o.type = 'ministere') DESC, f.debut DESC),
    mandats AS (
      SELECT DISTINCT ON (f.personne_id, f.type) f.personne_id, f.type, f.entite_id AS fonction_id
      FROM canon.fonction f
      WHERE f.type IN ('depute', 'senateur') AND f.debut <= current_date
        AND (f.fin IS NULL OR f.fin >= current_date) AND ${actif('f.entite_id')}
      ORDER BY f.personne_id, f.type,
               EXISTS (SELECT 1 FROM canon.correspondance c WHERE c.entite_id = f.entite_id AND c.statut = 'VERIFIED'
                       AND c.systeme = CASE f.type WHEN 'depute' THEN 'AN' ELSE 'SENAT' END) DESC, f.debut DESC),
    inactives AS MATERIALIZED (
      SELECT x.entite_id FROM canon.entite x WHERE x.retiree_de_la_source_le IS NOT NULL
      UNION ALL
      SELECT x.entite_id FROM canon.entite x WHERE x.fusionnee_dans >= '00000000-0000-0000-0000-000000000000'::uuid),
    locaux AS MATERIALIZED (
      SELECT m.entite_id, m.personne_id, m.nom, m.prenom, m.nom_affiche FROM canon.mandat_rne m
      WHERE m.type_mandat IN ('${MANDATS_LOCAUX.join("', '")}')
        AND NOT EXISTS (SELECT 1 FROM inactives i WHERE i.entite_id = m.entite_id))`;

  private async effectifs(): Promise<Annuaire['effectifs']> {
    const l = await this.db.first<Record<RolePersonne, number>>(
      `WITH ${PgPersonnes.EN_FONCTION}
       SELECT (SELECT count(DISTINCT personne_id) FROM mandats m WHERE type = 'depute' AND ${actif('m.personne_id')})::int AS depute,
              (SELECT count(DISTINCT personne_id) FROM mandats m WHERE type = 'senateur' AND ${actif('m.personne_id')})::int AS senateur,
              (SELECT count(*) FROM gouvernement g WHERE ${actif('g.personne_id')})::int AS gouvernement,
              ((SELECT count(*) FROM locaux WHERE personne_id IS NULL)
               + (SELECT count(DISTINCT personne_id) FROM locaux l WHERE personne_id IS NOT NULL AND ${actif('l.personne_id')}))::int AS elu_local`,
    );
    const roles: RolePersonne[] = ['depute', 'senateur', 'gouvernement', 'elu_local'];
    return roles.map((role) => ({ role, nombre: l?.[role] ?? 0 }));
  }

  /**
   * Une ligne par personne (rôle prioritaire : Gouvernement, député, sénateur, élu local) ou par fiche
   * RNE seule, en deux blocs : d'abord les personnes qui ont une fonction nationale en cours
   * (Gouvernement, Assemblée, Sénat), puis les élus locaux (personnes reliées par la revue à un
   * mandat RNE, fiches RNE seules) ; ordre alphabétique (nom, prénom, sans accents) puis identifiant
   * dans chaque bloc. Un filtre de rôle ne garde qu'un bloc ; la recherche garde l'ordre des blocs
   * (un parlementaire homonyme passe avant les fiches RNE).
   *
   * Les blocs sont disjoints (une personne nationale n'est pas reprise dans les élus locaux) : total =
   * somme des deux, sans doublon d'une page à l'autre. La page est découpée en SQL : le bloc local
   * n'est trié que si la page l'atteint (LIMIT 0 sinon), son compte ne calcule pas la clé de tri.
   */
  private async candidats(role: RolePersonne | null, q: string | null, pagination: Pagination) {
    const norme = (col: string) => `translate(lower(${col}), 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy')`;
    const cherche = (col: string) => `($q::text IS NULL OR strpos(${norme(col)}, $q) > 0)`;
    const tranche = (bloc: string, limite: string, decalage: string) =>
      `(SELECT json_agg(json_build_object('id', t.id, 'identite', t.identite, 'role', t.role, 'fonction_id', t.fonction_id, 'nom', t.nom)
                         ORDER BY t.tri, t.id)
        FROM (SELECT b.*, ${norme("b.nom_tri || ' ' || COALESCE(b.prenom, '')")} AS tri FROM ${bloc} b
              ORDER BY tri, b.id LIMIT ${limite} OFFSET ${decalage}) t)`;
    const l = await this.db.first<{ total: number; nationaux: Candidat[] | null; locaux: Candidat[] | null }>(
      `WITH ${PgPersonnes.EN_FONCTION},
       roles AS (
         SELECT personne_id, 'gouvernement' AS role, fonction_id, 1 AS rang FROM gouvernement
         UNION ALL SELECT personne_id, type, fonction_id, CASE type WHEN 'depute' THEN 2 ELSE 3 END FROM mandats),
       nationaux AS MATERIALIZED (
         SELECT n.personne_id::text AS id, 'personne' AS identite, n.role, n.fonction_id::text AS fonction_id,
                p.nom_affiche AS nom, p.nom AS nom_tri, p.prenom
         FROM (SELECT DISTINCT ON (r.personne_id) r.* FROM roles r
               WHERE $role::text IS NULL OR r.role = $role ORDER BY r.personne_id, r.rang) n
         JOIN canon.personne p ON p.entite_id = n.personne_id
         WHERE ${actif('n.personne_id')} AND ${cherche('p.nom_affiche')}),
       elus_locaux AS MATERIALIZED (
         (SELECT DISTINCT ON (l.personne_id) l.personne_id::text AS id, 'personne' AS identite, 'elu_local' AS role,
                 l.entite_id::text AS fonction_id, p.nom_affiche AS nom, p.nom AS nom_tri, p.prenom
          FROM locaux l JOIN canon.personne p ON p.entite_id = l.personne_id
          WHERE ($role::text IS NULL OR $role = 'elu_local') AND ${actif('l.personne_id')} AND ${cherche('p.nom_affiche')}
            AND NOT EXISTS (SELECT 1 FROM nationaux n WHERE n.id = l.personne_id::text)
          ORDER BY l.personne_id, l.entite_id)
         UNION ALL
         SELECT l.entite_id::text, 'fiche_rne', 'elu_local', l.entite_id::text, l.nom_affiche, l.nom, l.prenom
         FROM locaux l
         WHERE l.personne_id IS NULL AND ($role::text IS NULL OR $role = 'elu_local') AND ${cherche('l.nom_affiche')}),
       n AS (SELECT count(*)::int AS n FROM nationaux)
       SELECT (SELECT n FROM n) + (SELECT count(*) FROM elus_locaux)::int AS total,
              ${tranche('nationaux', '$taille', '$decalage')} AS nationaux,
              ${tranche(
                'elus_locaux',
                'GREATEST(0, $decalage + $taille - GREATEST($decalage, (SELECT n FROM n)))',
                'GREATEST(0, $decalage - (SELECT n FROM n))',
              )} AS locaux`,
      { role, q, taille: pagination.taille, decalage: (pagination.page - 1) * pagination.taille },
    );
    return { total: l?.total ?? 0, candidats: [...(l?.nationaux ?? []), ...(l?.locaux ?? [])] };
  }

  private async elementsAnnuaire(candidats: Candidat[]): Promise<ElementAnnuaire[]> {
    const fonctions = candidats.filter((c) => c.role !== 'elu_local' && c.fonction_id).map((c) => c.fonction_id!);
    const rne = candidats.filter((c) => c.role === 'elu_local' && c.fonction_id).map((c) => c.fonction_id!);
    const [lf, lr] = await Promise.all([
      fonctions.length
        ? this.db.all<{ id: string; type: string; titre: string; territoire: string | null; civilite: string | null; systeme: string | null; groupe: LigneFonction['groupe'] }>(
            `SELECT f.entite_id::text AS id, f.type, f.titre, f.territoire, p.civilite,
                    (${provenanceSql('f.entite_id')})->>'systeme' AS systeme,
                    CASE WHEN f.type IN ('depute', 'senateur')
                         THEN ${groupeALaDateSql('f.personne_id', "CASE f.type WHEN 'depute' THEN 'AN' ELSE 'SENAT' END", 'current_date')} END AS groupe
             FROM canon.fonction f JOIN canon.personne p ON p.entite_id = f.personne_id
             WHERE f.entite_id = ANY($ids::uuid[])`,
            { ids: fonctions },
          )
        : [],
      rne.length
        ? this.db.all<{ id: string; type_mandat: string; fonction: string | null; territoire: string | null; sexe: string | null }>(
            `SELECT m.entite_id::text AS id, m.type_mandat, m.fonction, m.territoire, m.sexe
             FROM canon.mandat_rne m WHERE m.entite_id = ANY($ids::uuid[])`,
            { ids: rne },
          )
        : [],
    ]);
    const parFonction = new Map(lf.map((f) => [f.id, f]));
    const parMandat = new Map(lr.map((m) => [m.id, m]));
    return candidats.map((c): ElementAnnuaire => {
      if (c.role === 'elu_local') {
        const m = c.fonction_id ? parMandat.get(c.fonction_id) : undefined;
        return { id: c.id, identite: c.identite, nom: c.nom, role: c.role, fonction: m ? libelleRne(m) : null, groupe: null, source: 'RNE' };
      }
      const f = c.fonction_id ? parFonction.get(c.fonction_id) : undefined;
      const g = groupe(f?.groupe);
      let fonction: string | null = null;
      if (f && c.role === 'gouvernement') fonction = titrePublie(f.titre);
      else if (f) fonction = [libelleMandat(f.type, f.civilite), f.territoire, g?.abrege].filter(Boolean).join(' · ');
      const source = c.role === 'gouvernement' ? 'AN' : systeme(f?.systeme ?? (c.role === 'senateur' ? 'SENAT' : 'AN'));
      return { id: c.id, identite: 'personne', nom: c.nom, role: c.role, fonction, groupe: g, source };
    });
  }

  // ----- Fiche : en-tête et frise -----

  private personne(id: string): Promise<LignePersonne | null> {
    return this.db.first<LignePersonne>(
      `SELECT p.entite_id::text AS id, p.civilite, p.nom_affiche AS nom FROM canon.personne p
       WHERE p.entite_id = $id AND ${actif('p.entite_id')}`,
      { id },
    );
  }

  private mandatsRne(condition: 'personne' | 'fiche', id: string): Promise<LigneRne[]> {
    return this.db.all<LigneRne>(
      `SELECT m.entite_id::text AS id, m.personne_id::text, m.type_mandat, m.nom_affiche, m.sexe, m.fonction, m.territoire,
              m.organisation_id::text, o.nom AS organisation_nom, ${jour('COALESCE(m.debut_fonction, m.debut_mandat)')} AS debut,
              ${provenanceSql('m.entite_id')} AS provenance,
              cr.decision->>'motif' AS motif, cr.cle AS cas
       FROM canon.mandat_rne m
       LEFT JOIN canon.organisation o ON o.entite_id = m.organisation_id
       LEFT JOIN LATERAL (
         SELECT r.decision, r.cle FROM analytique.cas_revue r
         WHERE r.type = 'elu_local' AND r.statut = 'APPLIQUE' AND r.sujet_id = m.entite_id
         ORDER BY r.applique_le DESC NULLS LAST LIMIT 1) cr ON m.personne_id IS NOT NULL
       WHERE ${condition === 'personne' ? 'm.personne_id = $id' : 'm.entite_id = $id'} AND ${actif('m.entite_id')}
       ORDER BY m.debut_mandat NULLS FIRST, m.entite_id`,
      { id },
    );
  }

  /** Fiche RNE seule (mandat sans personne) ; un mandat rattaché renvoie à sa personne. */
  private async ficheRne(id: string): Promise<LigneRne | null> {
    return (await this.mandatsRne('fiche', id))[0] ?? null;
  }

  async entete(id: string): Promise<EntetePersonne | null> {
    if (!estUuid(id)) return null;
    const p = await this.personne(id);
    if (!p) {
      const m = await this.ficheRne(id);
      if (!m) return null;
      if (m.personne_id) return this.entete(m.personne_id);
      return {
        id: m.id,
        identite: 'fiche_rne',
        nom: m.nom_affiche,
        civilite: null,
        enCours: [{ libelle: libelleRne(m), groupe: null }],
        provenance: [provenance(m.provenance, 'mandat', m.id)],
      };
    }
    const [enCours, identites, rne] = await Promise.all([
      this.db.all<{ type: string; titre: string; qualite: string | null; territoire: string | null; organisation: string | null; groupe: LigneFonction['groupe'] }>(
        `WITH gouv AS (SELECT ${gouvernementALaDateSql('current_date')} AS id)
         SELECT f.type, f.titre, f.qualite, f.territoire, o.nom AS organisation,
                CASE WHEN f.type = 'membre_groupe' THEN ${groupeSql('o')} END AS groupe
         FROM canon.fonction f LEFT JOIN canon.organisation o ON o.entite_id = f.organisation_id, gouv
         WHERE f.personne_id = $id AND f.debut <= current_date AND (f.fin IS NULL OR f.fin >= current_date)
           AND ${actif('f.entite_id')}
           AND (f.type IN ('depute', 'senateur', 'membre_commission', 'bureau', 'presidence')
                OR (f.type = 'membre_groupe' AND o.type = 'groupe_politique'
                    AND o.entite_id::text = ${groupeALaDateSql('f.personne_id', 'o.chambre', 'current_date')}->>'id')
                OR (${membreDuGouvernementSql('f', 'o', 'gouv.id')} AND o.type = 'ministere'))
         ORDER BY CASE f.type WHEN 'membre_gouvernement' THEN 0 WHEN 'depute' THEN 1 WHEN 'senateur' THEN 1
                  WHEN 'membre_groupe' THEN 2 ELSE 3 END, f.debut`,
        { id },
      ),
      this.db.all<{ provenance: Provenance }>(
        `SELECT json_build_object('systeme', c.systeme, 'type', c.type_source, 'idNatif', c.id_source, 'url', c.url) AS provenance
         FROM canon.correspondance c WHERE c.entite_id = $id AND c.statut = 'VERIFIED'
         ORDER BY (c.methode = 'OFFICIAL_ID') DESC, c.systeme, c.id_source`,
        { id },
      ),
      this.mandatsRne('personne', id),
    ]);
    // Un mandat publié par l'AN et par le Sénat (fiche fusionnée) n'apparaît qu'une fois.
    const vus = new Set<string>();
    const lignes: EntetePersonne['enCours'] = [];
    for (const f of enCours) {
      let libelle: string;
      if (f.type === 'depute' || f.type === 'senateur') libelle = [libelleMandat(f.type, p.civilite), f.territoire].filter(Boolean).join(' · ');
      else if (f.type === 'membre_groupe') libelle = f.organisation ?? f.titre;
      else if (f.type === 'membre_gouvernement') libelle = titrePublie(f.titre);
      else libelle = f.qualite && f.qualite !== 'Membre' && f.organisation ? `${f.qualite} · ${f.organisation}` : (f.organisation ?? f.titre);
      const cle = f.type === 'membre_groupe' ? 'groupe' : `${f.type}:${libelle}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      lignes.push({ libelle, groupe: f.type === 'membre_groupe' ? groupe(f.groupe) : null });
    }
    for (const m of rne) lignes.push({ libelle: libelleRne(m), groupe: null });
    return {
      id: p.id,
      identite: 'personne',
      nom: p.nom,
      civilite: p.civilite,
      enCours: lignes,
      provenance: identites.map((i) => provenance(i.provenance, 'personne', p.id)),
    };
  }

  async fonctions(id: string): Promise<FonctionDatee[]> {
    if (!estUuid(id)) return [];
    const p = await this.personne(id);
    if (!p) {
      const m = await this.ficheRne(id);
      if (!m) return [];
      if (m.personne_id) return this.fonctions(m.personne_id);
      return [this.fonctionRne(m)];
    }
    const [lignes, rne] = await Promise.all([
      this.db.all<LigneFonction>(
        `SELECT f.entite_id::text AS id, f.type, f.titre, f.qualite, f.territoire, ${jour('f.debut')} AS debut, ${jour('f.fin')} AS fin,
                o.entite_id::text AS organisation_id, o.nom AS organisation_nom, o.type AS organisation_type,
                COALESCE(o.chambre, CASE f.type WHEN 'depute' THEN 'AN' WHEN 'senateur' THEN 'SENAT' END) AS organisation_chambre,
                CASE WHEN f.type = 'membre_groupe' AND o.type = 'groupe_politique' THEN ${groupeSql('o')} END AS groupe,
                ${provenanceSql('f.entite_id')} AS provenance
         FROM canon.fonction f LEFT JOIN canon.organisation o ON o.entite_id = f.organisation_id
         WHERE f.personne_id = $id AND ${actif('f.entite_id')}
         ORDER BY f.debut NULLS FIRST, f.fin NULLS LAST, f.type, f.entite_id`,
        { id },
      ),
      this.mandatsRne('personne', id),
    ]);
    const frise = sansDoublonsDeSource(lignes).map((f) => this.fonctionCanon(f, p.civilite));
    const locaux = rne.map((m) => this.fonctionRne(m));
    return [...frise, ...locaux].sort((a, b) => (a.debut ?? '').localeCompare(b.debut ?? ''));
  }

  private fonctionCanon(f: LigneFonction, civilite: string | null): FonctionDatee {
    const type = TYPES_FONCTION.includes(f.type as TypeFonction) ? (f.type as TypeFonction) : 'autre';
    // L'AMO compose le titre d'un mandat de député avec sa qualité (« membre, Rhône, 6e circonscription ») :
    // le libellé du mandat est recomposé, le territoire reste tel que publié.
    const titre =
      type === 'depute' || type === 'senateur'
        ? [libelleMandat(type, civilite), f.territoire].filter(Boolean).join(' · ')
        : titrePublie(f.titre);
    const prov = provenance(f.provenance, 'fonction', f.id);
    return {
      titre,
      type,
      organisation: f.organisation_id ? { id: f.organisation_id, nom: f.organisation_nom ?? '' } : null,
      groupe: groupe(f.groupe),
      debut: f.debut,
      fin: f.fin,
      source: prov.systeme,
      provenance: prov,
    };
  }

  private fonctionRne(m: LigneRne): FonctionDatee {
    const prov = provenance(m.provenance, 'mandat', m.id);
    const fonction: FonctionDatee = {
      titre: libelleRne(m),
      type: TYPE_FONCTION_RNE[m.type_mandat] ?? 'autre',
      organisation: m.organisation_id ? { id: m.organisation_id, nom: m.organisation_nom ?? m.territoire ?? '' } : null,
      groupe: null,
      debut: m.debut,
      // Le RNE ne publie que les mandats en cours (instantané) : la fin n'est jamais connue.
      fin: null,
      source: 'RNE',
      provenance: prov,
    };
    if (m.personne_id) {
      fonction.rattachement = {
        statut: 'verifie',
        methode: 'revue_humaine',
        motif: m.motif
          ? `Mandat relié à la personne par la revue humaine : ${m.motif}`
          : `Mandat relié à la personne par la revue humaine${m.cas ? ` (cas ${m.cas})` : ''}`,
        preuve: null,
      };
    }
    return fonction;
  }

  // ----- Ses choix -----

  async choix(id: string): Promise<{ indicateurs: Indicateur[]; note: string | null; themes: ChoixTheme[] }> {
    const vide = { indicateurs: [], note: null, themes: [] };
    if (!estUuid(id)) return vide;
    const p = await this.personne(id);
    if (!p) return vide;
    const [mandats, gouvernement] = await Promise.all([
      this.db.all<{ chambre: Chambre; debut: string | null; fin: string | null; derniere: string | null }>(
        `SELECT m.chambre, ${jour('min(m.debut)')} AS debut, ${jour("NULLIF(max(COALESCE(m.fin, DATE '9999-12-31')), DATE '9999-12-31')")} AS fin,
                (SELECT ${jour('max(s.date)')} FROM canon.scrutin s WHERE s.chambre = m.chambre) AS derniere
         FROM (SELECT CASE f.type WHEN 'depute' THEN 'AN' ELSE 'SENAT' END AS chambre, f.debut, f.fin
               FROM canon.fonction f WHERE f.personne_id = $id AND f.type IN ('depute', 'senateur')
                 AND f.debut IS NOT NULL AND ${actif('f.entite_id')}) m
         GROUP BY m.chambre ORDER BY max(COALESCE(m.fin, DATE '9999-12-31')) DESC`,
        { id },
      ),
      this.db.first<{ membre: boolean }>(
        `WITH gouv AS (SELECT ${gouvernementALaDateSql('current_date')} AS id)
         SELECT EXISTS (SELECT 1 FROM canon.fonction f JOIN canon.organisation o ON o.entite_id = f.organisation_id, gouv
                        WHERE f.personne_id = $id AND ${membreDuGouvernementSql('f', 'o', 'gouv.id')}
                          AND f.debut <= current_date AND (f.fin IS NULL OR f.fin >= current_date)
                          AND ${actif('f.entite_id')}) AS membre`,
        { id },
      ),
    ]);
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const ilYaUnAn = debutDouzeMois(aujourdhui);
    // Chambres où un mandat couvre une partie des 12 derniers mois, et dont des scrutins sont chargés.
    const fenetres: Fenetre[] = mandats
      .filter((m) => m.derniere && (m.fin === null || m.fin >= ilYaUnAn))
      .map((m) => {
        const fin = m.fin !== null && m.fin < m.derniere! ? m.fin : m.derniere!;
        return { chambre: m.chambre, debut: debutDouzeMois(fin), fin };
      });
    const notes: string[] = [];
    if (gouvernement?.membre) {
      notes.push('Comme membre du Gouvernement, cette personne ne vote pas au Parlement : elle porte des projets de loi et donne l’avis du Gouvernement.');
    }
    if (!fenetres.length && !gouvernement?.membre) {
      notes.push(
        mandats.length
          ? 'Mandats parlementaires terminés depuis plus de 12 mois : aucun bilan récent.'
          : 'Aucun mandat parlementaire publié : pas de vote au Parlement à mesurer.',
      );
    }
    for (const m of mandats) {
      if (m.fin !== null && m.fin >= ilYaUnAn && m.fin < aujourdhui) {
        notes.push(`Mandat (${LIBELLE_CHAMBRE[m.chambre]}) terminé le ${enFrancais(m.fin)} : bilan des 12 mois qui précèdent.`);
      }
    }
    const indicateurs: Indicateur[] = [];
    for (const f of fenetres) {
      const suffixe = fenetres.length > 1 ? ` (${LIBELLE_CHAMBRE[f.chambre]})` : '';
      const [participation, ecarts] = await Promise.all([this.participation(id, f), this.ecarts(id, f)]);
      if (participation && participation.scrutins > 0) indicateurs.push(indicateurParticipation(participation, f, suffixe));
      if (ecarts && ecarts.votes > 0) {
        const g = groupe(ecarts.groupe);
        const moyenne = ecarts.groupe_id ? await this.moyenneEcartsGroupe(ecarts.groupe_id, f) : null;
        indicateurs.push(
          indicateurEcarts(
            ecarts,
            f,
            {
              libelle: `Moyenne des membres de son groupe${g ? ` (${g.abrege})` : ''} : écarts pour 100 votes en groupe`,
              valeur: moyenne,
            },
            suffixe,
          ),
        );
      }
    }
    indicateurs.push(...(await this.presenceEnCommission(id)));
    return { indicateurs, note: notes.length ? notes.join(' ') : null, themes: [] };
  }

  private participation(id: string, f: Fenetre): Promise<LigneParticipation | null> {
    return this.db.first<LigneParticipation>(
      // DISTINCT : deux fonctions de sénateur (AMO et Sénat) couvrent la même date dans
      // lecture.mandat_parlementaire, d'où deux lignes par scrutin pour une fiche fusionnée.
      `WITH p AS (
         SELECT DISTINCT p.scrutin_id, p.date, p.groupe_id, p.a_participe, p.par_delegation, g.taux
         FROM lecture.participation_scrutin p
         JOIN lecture.participation_groupe_scrutin g USING (scrutin_id, groupe_id)
         WHERE p.personne_id = $id AND p.chambre = $chambre AND p.date BETWEEN $debut::date AND $fin::date)
       SELECT count(*)::int AS scrutins, count(*) FILTER (WHERE a_participe)::int AS participations,
              count(*) FILTER (WHERE par_delegation)::int AS delegations,
              round(100.0 * avg(a_participe::int), 1)::float8 AS taux, round(100.0 * avg(taux), 1)::float8 AS attendu,
              (SELECT ${groupeSql('o')} FROM canon.organisation o
               WHERE o.entite_id = (SELECT groupe_id FROM p ORDER BY date DESC LIMIT 1)) AS groupe
       FROM p`,
      { id, chambre: f.chambre, debut: f.debut, fin: f.fin },
    );
  }

  private ecarts(id: string, f: Fenetre): Promise<LigneEcarts | null> {
    return this.db.first<LigneEcarts>(
      `WITH v AS (
         SELECT * FROM lecture.vote_et_groupe
         WHERE personne_id = $id AND chambre = $chambre AND date BETWEEN $debut::date AND $fin::date)
       SELECT count(*) FILTER (WHERE exprime_en_groupe)::int AS votes, count(*) FILTER (WHERE ecart)::int AS ecarts,
              count(*) FILTER (WHERE ecart AND position = 'contre')::int AS contre,
              count(*) FILTER (WHERE ecart AND position = 'abstention')::int AS abstention,
              count(*) FILTER (WHERE ecart AND position = 'pour')::int AS pour,
              (SELECT groupe_id::text FROM v WHERE groupe_id IS NOT NULL ORDER BY date DESC LIMIT 1) AS groupe_id,
              (SELECT ${groupeSql('o')} FROM canon.organisation o
               WHERE o.entite_id = (SELECT groupe_id FROM v WHERE groupe_id IS NOT NULL ORDER BY date DESC LIMIT 1)) AS groupe
       FROM v`,
      { id, chambre: f.chambre, debut: f.debut, fin: f.fin },
    );
  }

  private async moyenneEcartsGroupe(groupeId: string, f: Fenetre): Promise<number | null> {
    const l = await this.db.first<{ m: number | null }>(
      `SELECT round(100.0 * count(*) FILTER (WHERE ecart) / NULLIF(count(*) FILTER (WHERE exprime_en_groupe), 0), 1)::float8 AS m
       FROM lecture.vote_et_groupe WHERE groupe_id = $groupe AND chambre = $chambre AND date BETWEEN $debut::date AND $fin::date`,
      { groupe: groupeId, chambre: f.chambre, debut: f.debut, fin: f.fin },
    );
    return l?.m ?? null;
  }

  /** Présence en commission (AN), dernière année publiée, comparée à la moyenne de la même commission. */
  private async presenceEnCommission(id: string): Promise<Indicateur[]> {
    const lignes = await this.db.all<{
      annee: number;
      reunions: number;
      presences: number;
      excuses: number;
      absences: number;
      taux: number | null;
      moyenne: number | null;
      commission: string;
    }>(
      `SELECT i.annee::int, i.reunions::int, i.presences::int, i.excuses::int, i.absences::int,
              i.taux::float8, i.taux_moyen_commission::float8 AS moyenne, COALESCE(o.nom_court, o.nom) AS commission
       FROM lecture.indicateur_commission i JOIN canon.organisation o ON o.entite_id = i.organe_id
       WHERE i.personne_id = $id AND i.reunions > 0
         AND i.annee = (SELECT max(annee) FROM lecture.indicateur_commission WHERE personne_id = $id)
       ORDER BY i.reunions DESC, o.nom`,
      { id },
    );
    const annee = new Date().getUTCFullYear();
    return lignes.map((l) => ({
      libelle: `Présence en commission · ${l.commission}`,
      valeur: l.taux ?? 0,
      unite: 'pourcentage',
      denominateur: { valeur: l.reunions, libelle: `réunions de la commission en ${l.annee} dont les présences sont publiées` },
      reference: { libelle: `Moyenne des membres de la même commission en ${l.annee}`, valeur: l.moyenne },
      ceQueLaDonneeNeDitPas: [
        ...NE_DIT_PAS_COMMISSION,
        `${l.presences} présence${l.presences > 1 ? 's' : ''}, ${l.excuses} excusé${l.excuses > 1 ? 's' : ''}, ${l.absences} absence${l.absences > 1 ? 's' : ''}.`,
      ],
      periode: { debut: `${l.annee}-01-01`, fin: l.annee >= annee ? null : `${l.annee}-12-31` },
      calcul: 'lecture.indicateur_commission',
    }));
  }

  // ----- Classements -----

  async classement(demande: DemandeClassement): Promise<Omit<Classement, 'demande'>> {
    const ch = chambre(demande.chambre);
    const limite = Math.min(Math.max(demande.limite ?? 20, 1), 100);
    const borne = await this.db.first<{ fin: string | null }>(
      `SELECT ${jour('max(date)')} AS fin FROM canon.scrutin WHERE chambre = $chambre`,
      { chambre: ch },
    );
    const fin = borne?.fin ?? new Date().toISOString().slice(0, 10);
    const f: Fenetre = { chambre: ch, debut: debutDouzeMois(fin), fin };
    const commun = {
      themesAppliques: [],
      themesDisponibles: [],
      periode: { debut: f.debut, fin: f.fin },
    };
    const seuil = `Seuls figurent les ${ch === 'AN' ? 'députés' : 'sénateurs'} qui comptent au moins ${SEUIL_CLASSEMENT}`;
    if (demande.critere === 'ecarts') {
      return { ...commun, explication: `Un écart est un vote différent de la majorité de son groupe, quand le groupe a une majorité nette. Ce n’est ni bien ni mal : c’est là que se lisent les choix personnels. Classement par écarts pour 100 votes en groupe, sur les 12 mois qui finissent au dernier scrutin publié. ${seuil} votes en groupe.`, lignes: await this.classementEcarts(f, demande.ordre, limite) };
    }
    if (demande.critere === 'absences') {
      return { ...commun, explication: `La participation est comparée à l’attendu : la participation de son groupe sur les mêmes scrutins (un vote de nuit à 40 votants n’est pas une absence anormale). Classement par écart à l’attendu, sur les 12 mois qui finissent au dernier scrutin publié. ${seuil} scrutins pendant leur mandat.`, lignes: await this.classementAbsences(f, demande.ordre, limite) };
    }
    return { ...commun, explication: `Part des votes « pour » parmi ses votes exprimés (pour, contre, abstention), comparée à celle de son groupe sur les mêmes scrutins. Voter pour n’est ni bien ni mal : le sens dépend de ce qui est mis aux voix. ${seuil} votes exprimés.`, lignes: await this.classementPositions(f, demande.ordre, limite) };
  }

  private async classementEcarts(f: Fenetre, ordre: 'asc' | 'desc', limite: number): Promise<LigneClassement[]> {
    const lignes = await this.db.all<LigneEcarts & { id: string; nom: string; moyenne: number | null }>(
      `WITH v AS (
         SELECT personne_id, count(*) FILTER (WHERE exprime_en_groupe)::int AS votes, count(*) FILTER (WHERE ecart)::int AS ecarts,
                count(*) FILTER (WHERE ecart AND position = 'contre')::int AS contre,
                count(*) FILTER (WHERE ecart AND position = 'abstention')::int AS abstention,
                count(*) FILTER (WHERE ecart AND position = 'pour')::int AS pour,
                (array_agg(groupe_id ORDER BY date DESC) FILTER (WHERE groupe_id IS NOT NULL))[1] AS groupe_id
         FROM lecture.vote_et_groupe
         WHERE chambre = $chambre AND date BETWEEN $debut::date AND $fin::date
         GROUP BY personne_id),
       moyenne AS (SELECT round(100.0 * sum(ecarts) / NULLIF(sum(votes), 0), 1)::float8 AS m FROM v)
       SELECT v.personne_id::text AS id, p.nom_affiche AS nom, v.votes, v.ecarts, v.contre, v.abstention, v.pour,
              v.groupe_id::text, moyenne.m AS moyenne,
              (SELECT ${groupeSql('o')} FROM canon.organisation o WHERE o.entite_id = v.groupe_id) AS groupe
       FROM v JOIN canon.personne p ON p.entite_id = v.personne_id, moyenne
       WHERE v.votes >= ${SEUIL_CLASSEMENT} AND ${actif('v.personne_id')}
       ORDER BY v.ecarts::float8 / v.votes ${ordre === 'asc' ? 'ASC' : 'DESC'}, v.votes DESC, p.nom, v.personne_id
       LIMIT $limite`,
      { chambre: f.chambre, debut: f.debut, fin: f.fin, limite },
    );
    return lignes.map((l, i) => ({
      rang: i + 1,
      personne: { id: l.id, nom: l.nom, groupe: groupe(l.groupe) },
      indicateur: indicateurEcarts(
        l,
        f,
        { libelle: `Moyenne ${MEMBRES_CHAMBRE[f.chambre]} : écarts pour 100 votes en groupe`, valeur: l.moyenne },
        '',
      ),
    }));
  }

  private async classementAbsences(f: Fenetre, ordre: 'asc' | 'desc', limite: number): Promise<LigneClassement[]> {
    // Une fiche fusionnée a deux fonctions de sénateur (AMO et Sénat) sur les mêmes dates : ses
    // lignes de lecture.participation_scrutin sont doublées, d'où le regroupement par scrutin
    // (Sénat seulement : aucun mandat de député ne se chevauche, et l'AN compte 3,5 M de lignes par an).
    const parScrutin =
      f.chambre === 'SENAT'
        ? `SELECT p.personne_id, p.scrutin_id, max(p.date) AS date, max(p.groupe_id::text) AS groupe_id,
                  bool_or(p.a_participe) AS a_participe, bool_or(p.par_delegation) AS par_delegation, max(g.taux) AS taux
           FROM brut p JOIN g USING (scrutin_id, groupe_id)
           GROUP BY p.personne_id, p.scrutin_id`
        : `SELECT p.personne_id, p.scrutin_id, p.date, p.groupe_id::text AS groupe_id, p.a_participe, p.par_delegation, g.taux
           FROM brut p JOIN g USING (scrutin_id, groupe_id)`;
    const lignes = await this.db.all<LigneParticipation & { id: string; nom: string }>(
      // MATERIALIZED : sinon le planificateur parcourt l'index (scrutin, groupe) des millions de fois.
      `WITH g AS MATERIALIZED (SELECT scrutin_id, groupe_id, taux FROM lecture.participation_groupe_scrutin),
       brut AS MATERIALIZED (
         SELECT personne_id, scrutin_id, groupe_id, date, a_participe, par_delegation FROM lecture.participation_scrutin
         WHERE chambre = $chambre AND date BETWEEN $debut::date AND $fin::date),
       s AS (${parScrutin}),
       p AS (
         SELECT personne_id, count(*)::int AS scrutins, count(*) FILTER (WHERE a_participe)::int AS participations,
                count(*) FILTER (WHERE par_delegation)::int AS delegations,
                round(100.0 * avg(a_participe::int), 1)::float8 AS taux, round(100.0 * avg(taux), 1)::float8 AS attendu,
                (avg(a_participe::int) - avg(taux))::float8 AS ecart,
                (array_agg(groupe_id ORDER BY date DESC))[1]::uuid AS groupe_id
         FROM s GROUP BY personne_id)
       SELECT p.personne_id::text AS id, pe.nom_affiche AS nom, p.scrutins, p.participations, p.delegations, p.taux, p.attendu,
              (SELECT ${groupeSql('o')} FROM canon.organisation o WHERE o.entite_id = p.groupe_id) AS groupe
       FROM p JOIN canon.personne pe ON pe.entite_id = p.personne_id
       WHERE p.scrutins >= ${SEUIL_CLASSEMENT} AND ${actif('p.personne_id')}
       ORDER BY p.ecart ${ordre === 'asc' ? 'DESC' : 'ASC'}, p.scrutins DESC, pe.nom, p.personne_id
       LIMIT $limite`,
      { chambre: f.chambre, debut: f.debut, fin: f.fin, limite },
    );
    return lignes.map((l, i) => ({
      rang: i + 1,
      personne: { id: l.id, nom: l.nom, groupe: groupe(l.groupe) },
      indicateur: indicateurParticipation(l, f, ''),
    }));
  }

  private async classementPositions(f: Fenetre, ordre: 'asc' | 'desc', limite: number): Promise<LigneClassement[]> {
    const lignes = await this.db.all<{
      id: string;
      nom: string;
      exprimes: number;
      taux: number;
      reference: number | null;
      groupe: LigneFonction['groupe'];
    }>(
      `WITH v AS (
         SELECT v.personne_id, count(*)::int AS exprimes, count(*) FILTER (WHERE v.position = 'pour')::int AS pour,
                sum(pg.pour)::float8 AS groupe_pour, sum(pg.pour + pg.contre + pg.abstentions)::float8 AS groupe_exprimes,
                (array_agg(v.groupe_id ORDER BY v.date DESC) FILTER (WHERE v.groupe_id IS NOT NULL))[1] AS groupe_id
         FROM lecture.vote_et_groupe v
         LEFT JOIN canon.position_groupe pg ON pg.scrutin_id = v.scrutin_id AND pg.groupe_id = v.groupe_id
         WHERE v.chambre = $chambre AND v.date BETWEEN $debut::date AND $fin::date
           AND v.position IN ('pour', 'contre', 'abstention')
         GROUP BY v.personne_id)
       SELECT v.personne_id::text AS id, p.nom_affiche AS nom, v.exprimes,
              round(100.0 * v.pour / v.exprimes, 1)::float8 AS taux,
              round((100.0 * v.groupe_pour / NULLIF(v.groupe_exprimes, 0))::numeric, 1)::float8 AS reference,
              (SELECT ${groupeSql('o')} FROM canon.organisation o WHERE o.entite_id = v.groupe_id) AS groupe
       FROM v JOIN canon.personne p ON p.entite_id = v.personne_id
       WHERE v.exprimes >= ${SEUIL_CLASSEMENT} AND ${actif('v.personne_id')}
       ORDER BY v.pour::float8 / v.exprimes ${ordre === 'asc' ? 'ASC' : 'DESC'}, v.exprimes DESC, p.nom, v.personne_id
       LIMIT $limite`,
      { chambre: f.chambre, debut: f.debut, fin: f.fin, limite },
    );
    return lignes.map((l, i) => ({
      rang: i + 1,
      personne: { id: l.id, nom: l.nom, groupe: groupe(l.groupe) },
      indicateur: {
        libelle: 'Votes « pour »',
        valeur: l.taux,
        unite: 'pourcentage',
        denominateur: { valeur: l.exprimes, libelle: 'votes exprimés (pour, contre, abstention)' },
        reference: { libelle: 'Part des « pour » parmi les votes exprimés de son groupe, sur les mêmes scrutins', valeur: l.reference },
        ceQueLaDonneeNeDitPas: NE_DIT_PAS_POSITIONS,
        periode: { debut: f.debut, fin: f.fin },
        calcul: 'lecture.vote_et_groupe, canon.position_groupe',
      },
    }));
  }

  // ----- Rôles dans les dossiers, questions -----

  async roles(id: string): Promise<RoleDansLesDossiers[]> {
    if (!estUuid(id)) return [];
    const p = await this.personne(id);
    if (!p) return [];
    const f = feminin(p.civilite);
    const principal = `SELECT dossier_id FROM a WHERE dossier_id IS NOT NULL GROUP BY dossier_id ORDER BY count(*) DESC, dossier_id LIMIT 1`;
    const [rapporteur, initiateur, amendements, cosignatures, interventions, questions, auditions] = await Promise.all([
      this.db.first<{ n: number; dossier_id: string | null }>(
        `SELECT count(DISTINCT e.dossier_id)::int AS n,
                (array_agg(e.dossier_id::text ORDER BY e.debut DESC NULLS LAST))[1] AS dossier_id
         FROM canon.lien l JOIN canon.etape e ON e.entite_id = l.de_id
         WHERE l.vers_id = $id AND l.nature = 'rapporteur' AND ${actif('e.entite_id')} AND ${actif('e.dossier_id')}`,
        { id },
      ),
      this.db.all<{ porte: boolean; n: number; dossier_id: string | null }>(
        `SELECT COALESCE(d.initiative = 'gouvernement', false) AS porte, count(*)::int AS n,
                (array_agg(d.entite_id::text ORDER BY d.date_depot DESC NULLS LAST))[1] AS dossier_id
         FROM canon.lien l JOIN canon.dossier d ON d.entite_id = l.de_id
         WHERE l.vers_id = $id AND l.nature = 'initiateur' AND ${actif('d.entite_id')}
         GROUP BY 1`,
        { id },
      ),
      this.db.first<{ n: number; adoptes: number; dossier_id: string | null; sur_dossier: number }>(
        `WITH a AS (
           SELECT am.dossier_id, am.sort FROM canon.lien l JOIN canon.amendement am ON am.entite_id = l.de_id
           WHERE l.vers_id = $id AND l.nature = 'auteur' AND ${actif('am.entite_id')}),
         d AS (${principal})
         SELECT (SELECT count(*) FROM a)::int AS n, (SELECT count(*) FROM a WHERE sort = 'adopte')::int AS adoptes,
                (SELECT dossier_id::text FROM d) AS dossier_id,
                (SELECT count(*) FROM a WHERE dossier_id = (SELECT dossier_id FROM d))::int AS sur_dossier`,
        { id },
      ),
      this.db.first<{ n: number }>(
        `SELECT count(*)::int AS n FROM canon.lien l
         WHERE l.vers_id = $id AND l.nature = 'cosignataire' AND ${actif('l.de_id')}
           AND EXISTS (SELECT 1 FROM canon.amendement am WHERE am.entite_id = l.de_id)`,
        { id },
      ),
      this.db.first<{ n: number; dossier_id: string | null; sur_dossier: number }>(
        `WITH a AS (SELECT i.dossier_id FROM canon.intervention i WHERE i.orateur_id = $id AND ${actif('i.entite_id')}),
         d AS (${principal})
         SELECT (SELECT count(*) FROM a)::int AS n, (SELECT dossier_id::text FROM d) AS dossier_id,
                (SELECT count(*) FROM a WHERE dossier_id = (SELECT dossier_id FROM d))::int AS sur_dossier`,
        { id },
      ),
      this.db.first<{ n: number; qg: number; qe: number; qosd: number }>(
        `SELECT count(*)::int AS n, count(*) FILTER (WHERE q.type = 'QG')::int AS qg,
                count(*) FILTER (WHERE q.type = 'QE')::int AS qe, count(*) FILTER (WHERE q.type = 'QOSD')::int AS qosd
         FROM canon.question q WHERE q.auteur_id = $id AND q.type IN ('QG', 'QE', 'QOSD') AND ${actif('q.entite_id')}`,
        { id },
      ),
      this.db.first<{ n: number }>(`SELECT count(*)::int AS n FROM canon.audition a WHERE a.personne_id = $id`, { id }),
    ]);
    const dossiers = await dossiersRef(this.db, [
      rapporteur?.dossier_id ?? null,
      ...initiateur.map((i) => i.dossier_id),
      amendements?.dossier_id ?? null,
      interventions?.dossier_id ?? null,
    ]);
    const ref = (d: string | null | undefined) => (d ? (dossiers.get(d) ?? null) : null);
    const roles: RoleDansLesDossiers[] = [];
    if (rapporteur?.n) {
      const d = ref(rapporteur.dossier_id);
      roles.push({
        type: 'rapporteur',
        nombre: rapporteur.n,
        libelle: f ? 'Rapporteure' : 'Rapporteur',
        detail: rapporteur.n > 1 ? `Sur ${rapporteur.n} dossiers, dont le plus récent : ${d?.titre ?? 'non publié'}` : (d?.titre ?? null),
        dossier: d,
      });
    }
    for (const i of initiateur) {
      const d = ref(i.dossier_id);
      roles.push({
        type: i.porte ? 'texte_porte' : 'auteur',
        nombre: i.n,
        libelle: i.porte ? 'Projets de loi portés' : 'Textes déposés',
        detail: d ? `Le plus récent : ${d.titre}` : null,
        dossier: i.n === 1 ? d : null,
      });
    }
    if (amendements?.n) {
      const d = ref(amendements.dossier_id);
      roles.push({
        type: 'amendements',
        nombre: amendements.n,
        libelle: 'Amendements déposés',
        detail: [d ? `${amendements.sur_dossier} sur « ${d.titre} »` : null, `${amendements.adoptes} adoptés au total`].filter(Boolean).join(' · '),
        dossier: d,
      });
    }
    if (cosignatures?.n) {
      roles.push({ type: 'cosignataire', nombre: cosignatures.n, libelle: 'Amendements cosignés', detail: null, dossier: null });
    }
    if (interventions?.n) {
      const d = ref(interventions.dossier_id);
      roles.push({
        type: 'interventions',
        nombre: interventions.n,
        libelle: 'Interventions en séance et en commission',
        detail: d ? `Dont ${interventions.sur_dossier} sur « ${d.titre} »` : null,
        dossier: d,
      });
    }
    if (questions?.n) {
      const detail = [
        questions.qg ? `${questions.qg} au Gouvernement en séance` : null,
        questions.qe ? `${questions.qe} écrite${questions.qe > 1 ? 's' : ''}` : null,
        questions.qosd ? `${questions.qosd} orale${questions.qosd > 1 ? 's' : ''} sans débat` : null,
      ].filter(Boolean);
      roles.push({ type: 'questions', nombre: questions.n, libelle: 'Questions au Gouvernement', detail: detail.join(' · ') || null, dossier: null });
    }
    if (auditions?.n) {
      roles.push({ type: 'audition', nombre: auditions.n, libelle: f ? 'Auditionnée en commission' : 'Auditionné en commission', detail: null, dossier: null });
    }
    return roles;
  }

  async questions(id: string, pagination: Pagination): Promise<Page<QuestionResume>> {
    if (!estUuid(id)) return page([], pagination, 0);
    const lignes = await this.db.all<Omit<QuestionResume, 'provenance'> & { provenance: Provenance | null; total: number }>(
      `SELECT q.entite_id::text AS id, q.type, q.numero, ${jour('q.date')} AS date, q.titre, q.rubrique,
              COALESCE(q.ministere_attributaire, q.ministere) AS ministere, ${jour('q.date_reponse')} AS "dateReponse",
              ${provenanceSql('q.entite_id')} AS provenance, count(*) OVER ()::int AS total
       FROM canon.question q
       WHERE q.auteur_id = $id AND q.type IN ('QG', 'QE', 'QOSD') AND ${actif('q.entite_id')}
       ORDER BY q.date DESC NULLS LAST, q.numero DESC
       LIMIT $taille OFFSET $decalage`,
      { id, taille: pagination.taille, decalage: (pagination.page - 1) * pagination.taille },
    );
    const total = lignes[0]?.total ?? 0;
    return page(
      lignes.map(({ total: _total, provenance: p, ...q }) => ({ ...q, provenance: provenance(p, 'question', q.id) })),
      pagination,
      total,
    );
  }

  // ----- Ses actes sur un dossier (« Pourquoi ce vote ») -----

  async actesSurLeDossier(personne: string, dossier: string): Promise<ActeSurLeDossier[]> {
    if (!estUuid(personne) || !estUuid(dossier)) return [];
    const p = await this.personne(personne);
    if (!p) return [];
    const f = feminin(p.civilite);
    const parcoursCharge = (await this.db.first<{ ok: boolean }>(`SELECT to_regclass('lecture.parcours_acte') IS NOT NULL AS ok`))?.ok ?? false;
    const cle = parcoursCharge
      ? `(SELECT pa.cle FROM lecture.parcours_acte pa WHERE pa.dossier_id = e.dossier_id
          AND pa.etape_id IN (e.entite_id, e.parent_id) AND pa.cle IS NOT NULL ORDER BY (pa.etape_id = e.entite_id) DESC LIMIT 1)`
      : 'NULL::text';
    const params = { personne, dossier };
    const [rapports, initiateur, amendements, cosignatures, interventions, votes] = await Promise.all([
      this.db.all<{ etape: string; code: string | null; cle: CleCase | null; provenance: Provenance | null }>(
        `SELECT e.entite_id::text AS etape, e.code_source AS code, ${cle} AS cle, ${provenanceSql('e.entite_id')} AS provenance
         FROM canon.lien l JOIN canon.etape e ON e.entite_id = l.de_id
         WHERE l.vers_id = $personne AND l.nature = 'rapporteur' AND e.dossier_id = $dossier AND ${actif('e.entite_id')}
         ORDER BY e.ordre`,
        params,
      ),
      this.db.first<{ provenance: Provenance | null }>(
        `SELECT ${provenanceSql('d.entite_id')} AS provenance FROM canon.lien l JOIN canon.dossier d ON d.entite_id = l.de_id
         WHERE l.vers_id = $personne AND l.nature = 'initiateur' AND d.entite_id = $dossier AND ${actif('d.entite_id')}`,
        params,
      ),
      this.db.first<{ n: number; adoptes: number; exemple: string | null; numero: string | null; provenance: Provenance | null }>(
        `WITH a AS (
           SELECT am.entite_id, am.numero, am.sort, am.date_depot FROM canon.lien l JOIN canon.amendement am ON am.entite_id = l.de_id
           WHERE l.vers_id = $personne AND l.nature = 'auteur' AND am.dossier_id = $dossier AND ${actif('am.entite_id')}),
         e AS (SELECT * FROM a ORDER BY (sort = 'adopte') DESC, date_depot, numero LIMIT 1)
         SELECT (SELECT count(*) FROM a)::int AS n, (SELECT count(*) FROM a WHERE sort = 'adopte')::int AS adoptes,
                e.entite_id::text AS exemple, e.numero, ${provenanceSql('e.entite_id')} AS provenance
         FROM (SELECT 1) un LEFT JOIN e ON true`,
        params,
      ),
      this.db.first<{ n: number; exemple: string | null; numero: string | null; provenance: Provenance | null }>(
        `WITH a AS (
           SELECT am.entite_id, am.numero, am.date_depot FROM canon.lien l JOIN canon.amendement am ON am.entite_id = l.de_id
           WHERE l.vers_id = $personne AND l.nature = 'cosignataire' AND am.dossier_id = $dossier AND ${actif('am.entite_id')}),
         e AS (SELECT * FROM a ORDER BY date_depot, numero LIMIT 1)
         SELECT (SELECT count(*) FROM a)::int AS n, e.entite_id::text AS exemple, e.numero, ${provenanceSql('e.entite_id')} AS provenance
         FROM (SELECT 1) un LEFT JOIN e ON true`,
        params,
      ),
      this.db.first<{ n: number; provenance: Provenance | null }>(
        `WITH a AS (SELECT i.entite_id, i.reunion_id, i.ordre FROM canon.intervention i
                    WHERE i.orateur_id = $personne AND i.dossier_id = $dossier AND ${actif('i.entite_id')})
         SELECT (SELECT count(*) FROM a)::int AS n,
                (SELECT ${provenanceSql('a.entite_id')} FROM a ORDER BY a.reunion_id, a.ordre LIMIT 1) AS provenance`,
        params,
      ),
      this.db.all<{ scrutin: string; numero: string; date: string; position: string; chambre: string; provenance: Provenance | null }>(
        `SELECT s.entite_id::text AS scrutin, s.numero, ${jour('s.date')} AS date, v.position, s.chambre,
                ${provenanceSql('s.entite_id')} AS provenance
         FROM canon.scrutin s JOIN canon.vote v ON v.scrutin_id = s.entite_id AND v.personne_id = $personne
         WHERE s.dossier_id = $dossier AND s.nature = 'ensemble' AND ${actif('s.entite_id')}
         ORDER BY s.date, s.numero`,
        params,
      ),
    ]);
    const actes: ActeSurLeDossier[] = [];
    for (const r of rapports) {
      actes.push({
        type: 'rapporteur',
        libelle: [f ? 'Rapporteure' : 'Rapporteur', ...rapport(r.code)].join(' '),
        vers: r.cle ? { type: 'etape', dossier, cle: r.cle } : { type: 'dossier', id: dossier },
        provenance: provenance(r.provenance, 'etape', r.etape),
      });
    }
    if (initiateur) {
      actes.push({
        type: 'auteur',
        libelle: f ? 'Autrice du texte' : 'Auteur du texte',
        vers: { type: 'dossier', id: dossier },
        provenance: provenance(initiateur.provenance, 'dossier', dossier),
      });
    }
    if (amendements?.n && amendements.exemple) {
      actes.push({
        type: 'amendements',
        libelle: `A déposé ${amendements.n} amendement${amendements.n > 1 ? 's' : ''} (${amendements.adoptes} adopté${amendements.adoptes > 1 ? 's' : ''}), dont le ${amendements.numero}`,
        vers: { type: 'amendement', id: amendements.exemple },
        provenance: provenance(amendements.provenance, 'amendement', amendements.exemple),
      });
    }
    if (cosignatures?.n && cosignatures.exemple) {
      actes.push({
        type: 'cosignataire',
        libelle: `A cosigné ${cosignatures.n} amendement${cosignatures.n > 1 ? 's' : ''}, dont le ${cosignatures.numero}`,
        vers: { type: 'amendement', id: cosignatures.exemple },
        provenance: provenance(cosignatures.provenance, 'amendement', cosignatures.exemple),
      });
    }
    if (interventions?.n) {
      actes.push({
        type: 'interventions',
        libelle: `${interventions.n} intervention${interventions.n > 1 ? 's' : ''} sur ce dossier`,
        vers: { type: 'dossier', id: dossier },
        provenance: provenance(interventions.provenance, 'dossier', dossier),
      });
    }
    const POSITION: Record<string, string> = { pour: 'pour', contre: 'contre', abstention: 'abstention', non_votant: 'non-votant' };
    for (const v of votes) {
      const position = v.position === 'abstention' ? 's’est abstenu' + (f ? 'e' : '') : v.position === 'non_votant' ? `non-votant${f ? 'e' : ''}` : `a voté ${POSITION[v.position] ?? v.position}`;
      actes.push({
        type: 'vote',
        libelle: `Sur l’ensemble (${v.chambre === 'SENAT' ? 'Sénat' : 'AN'}, scrutin n° ${v.numero} du ${enFrancais(v.date)}) : ${position}`,
        vers: { type: 'scrutin', id: v.scrutin },
        provenance: provenance(v.provenance, 'scrutin', v.scrutin),
      });
    }
    return actes;
  }
}

const LECTURES: Record<string, string> = {
  AN1: 'en 1re lecture à l’Assemblée',
  SN1: 'en 1re lecture au Sénat',
  AN2: 'en 2e lecture à l’Assemblée',
  SN2: 'en 2e lecture au Sénat',
  ANNLEC: 'en nouvelle lecture à l’Assemblée',
  SNNLEC: 'en nouvelle lecture au Sénat',
  ANLDEF: 'en lecture définitive',
  CMP: 'de la commission mixte paritaire',
};

/** « AN1-COM-FOND-NOMIN » → « au fond », « en 1re lecture à l'Assemblée » (code d'acte publié par l'AN). */
function rapport(code: string | null): string[] {
  if (!code) return [];
  const [lecture] = code.split('-');
  const saisine = /-COM-FOND/.test(code) ? 'au fond' : /-COM-AVIS/.test(code) ? 'pour avis' : null;
  return [saisine, LECTURES[lecture] ?? null].filter((x): x is string => !!x);
}

/**
 * Une fonction publiée deux fois (fiche fusionnée : l'AMO publie aussi le mandat de sénateur et les
 * groupes du Sénat) n'est gardée qu'une fois, dans la version de la chambre elle-même : même type,
 * même chambre, même début. Les autres fonctions restent telles que publiées, chacune avec sa source.
 */
function sansDoublonsDeSource(lignes: LigneFonction[]): LigneFonction[] {
  const natives = new Set(
    lignes
      .filter((f) => f.organisation_chambre && f.provenance?.systeme === f.organisation_chambre)
      .map((f) => `${f.type}|${f.organisation_chambre}|${f.debut}`),
  );
  return lignes.filter(
    (f) =>
      !f.organisation_chambre ||
      f.provenance?.systeme === f.organisation_chambre ||
      !natives.has(`${f.type}|${f.organisation_chambre}|${f.debut}`),
  );
}
