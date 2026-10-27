// Le dossier législatif, objet central de l'app : Accueil, Dossiers, Dossier, Étape, Article,
// Amendement. Un projet, ses versions, le texte adopté et la loi promulguée sont liés mais
// distincts ; les étapes sont celles réellement publiées, la barre est une projection.

import type {
  ArticleRef,
  Chambre,
  Chiffre,
  DemandePage,
  DossierRef,
  GroupeRef,
  Lien,
  Lieu,
  Orateur,
  OrganisationRef,
  Page,
  Periode,
  PersonneRef,
  Provenance,
  Synthese,
} from './commun';
import type { InterventionExtrait, Intervenant } from './discussions';
import type { CaseCompacte, CaseParcours, CleCase, DeviationParcours, DossierLie, EtatCase, Echeance, Parcours, Procedure } from './parcours';
import type { ScrutinResume } from './scrutins';
import type { LienInteret } from './transparence';

// ---------- Vocabulaire ----------

/**
 * Où en est le dossier (filtre « Où en est le texte ») : issue de son parcours
 * (`lecture.parcours_dossier_synthese.issue`), jamais un échec supposé.
 */
export type EtatDossier =
  | 'en_cours'
  | 'adopte'
  | 'promulgue'
  | 'rejete'
  | 'retire'
  | 'caduc'
  | 'fusionne'
  | 'irrecevable'
  | 'rapport_publie';
/** Qui l'a proposé (`canon.dossier.initiative`). */
export type Origine = 'gouvernement' | 'parlementaire';
export type NatureTexte = 'projet' | 'proposition';
export type SortAmendement = 'adopte' | 'rejete' | 'retire' | 'tombe' | 'non_soutenu' | 'irrecevable' | 'en_attente';
export type TypeDocument =
  | 'projet'
  | 'proposition'
  | 'rapport'
  | 'avis'
  | 'texte_commission'
  | 'texte_adopte'
  | 'etude_impact'
  | 'avis_ce'
  | 'compte_rendu'
  | 'saisine'
  | 'decision'
  | 'loi'
  | 'accord'
  | 'motion'
  | 'autre';

/** Barre du dossier, rappelée sur tous ses sous-écrans : où en est la loi, où l'on est. */
export interface BarreDossier {
  dossier: DossierRef;
  cases: CaseCompacte[];
  /** Case de l'écran affiché (étape, version d'article, amendement, scrutin), null sinon. */
  ici: CleCase | null;
}

/** Morceau d'un texte comparé à une autre version. */
export interface SegmentDiff {
  type: 'egal' | 'ajoute' | 'supprime';
  texte: string;
}

// ---------- Listes (Accueil, Dossiers) ----------

export interface DossierResume {
  id: string;
  /** Titre court officiel, sinon le titre. */
  titre: string;
  titreOfficiel: string;
  titreEnClair: Synthese;
  /** Libellé de la procédure, tel que publié (« Projet de loi », « Proposition de loi ordinaire »). */
  type: string;
  nature: NatureTexte | null;
  origine: Origine | null;
  /**
   * Thème du vocabulaire contrôlé. Toujours null pour l'instant : aucun thème n'est attribué aux
   * dossiers dans `canon` (pas de classement par mots-clés).
   */
  theme: string | null;
  /** null : la donnée ne permet pas de conclure (`canon.dossier.statut` non renseigné, parcours inconnu). */
  etat: EtatDossier | null;
  procedure: Procedure | null;
  /** Barre compacte ; vide hors du périmètre de la projection (résolutions, lois constitutionnelles). */
  barre: CaseCompacte[];
  etapeCourante: { cle: CleCase; libelle: string; etat: EtatCase } | null;
  prochaineEcheance: Echeance | null;
  /** Dernier acte publié du parcours (« Conseil constitutionnel saisi le 17/10/2026 »). */
  dernierEvenement: { date: string; libelle: string } | null;
  /** Dossier dont celui-ci est un événement (« Événement de : … · étape »), sinon null. */
  parent: DossierLie | null;
}

export interface Accueil {
  /** Semaine affichée (« Semaine du 19 octobre 2026 »). */
  semaine: Periode;
  /** Dossiers à suivre : ceux qui ont une échéance à venir, puis l'étape courante la plus récente. */
  dossiers: DossierResume[];
  /** Scrutins publics de la semaine, dans les deux chambres, du plus récent au plus ancien. */
  votes: ScrutinResume[];
}

export interface FiltreDossiers extends DemandePage {
  etat?: EtatDossier;
  origine?: Origine;
  theme?: string;
  /** 17 par défaut (seule législature chargée). */
  legislature?: string;
}

export interface Facette<T extends string> {
  valeur: T;
  libelle: string;
  nombre: number;
}

export interface ListeDossiers {
  legislature: string;
  filtre: FiltreDossiers;
  facettes: {
    etats: Facette<EtatDossier>[];
    origines: Facette<Origine>[];
    /** Vide tant qu'aucun thème n'est attribué : l'UI masque alors le filtre. */
    themes: Facette<string>[];
  };
  dossiers: Page<DossierResume>;
}

// ---------- Dossier ----------

/** Auteur d'un texte ou d'un amendement. */
export type Auteur =
  | { type: 'personne'; personne: PersonneRef }
  | { type: 'gouvernement'; ministre: PersonneRef | null }
  | { type: 'commission'; organisation: OrganisationRef };

export interface EnteteDossier {
  id: string;
  titre: string;
  titreOfficiel: string;
  titreEnClair: Synthese;
  type: string;
  nature: NatureTexte | null;
  procedure: Procedure | null;
  origine: Origine | null;
  theme: string | null;
  legislature: string | null;
  dateDepot: string | null;
  etat: EtatDossier | null;
  /** Auteur principal (`canon.lien` nature auteur / initiateur), null si non publié. */
  auteur: Auteur | null;
  cosignataires: number;
  resumeEnClair: Synthese;
}

/** « Ce qui a changé depuis le dépôt » : un article modifié, et en clair ce qui a changé. */
export interface ChangementDepuisLeDepot {
  article: ArticleRef;
  resume: Synthese;
}

/** Une étape du parcours, telle qu'affichée dans la liste « Parcours du texte ». */
export interface EtapeResume {
  cle: CleCase;
  libelle: string;
  lieu: Lieu | null;
  /** Commission ou assemblée qui examine (« Affaires économiques »), null sinon. */
  organe: OrganisationRef | null;
  etat: EtatCase;
  courante: boolean;
  debut: string | null;
  fin: string | null;
  conclusion: string | null;
  resume: Synthese;
  /** Résumé chiffré : amendements déposés, adoptés, scrutins publics. */
  chiffres: Chiffre[];
}

export interface ArticleResume {
  article: ArticleRef;
  intitule: string | null;
  /** Nombre de versions où l'article change (hors version déposée). */
  modifications: number;
  /** ajoute : absent du texte déposé ; supprime : absent de la dernière version. */
  etat: 'inchange' | 'modifie' | 'ajoute' | 'supprime';
  /** Chambre qui l'a ajouté, si `ajoute`. */
  ajoutePar: Chambre | 'CMP' | null;
}

export interface AmendementResume {
  id: string;
  numero: string;
  chambre: Chambre;
  etape: { cle: CleCase; libelle: string } | null;
  article: ArticleRef | null;
  /** Division visée, telle que publiée (« Article 3 », « Après l'article 5 »). */
  division: string | null;
  sort: SortAmendement | null;
  /** Objet en clair (« Relever l'objectif de renouvelables à 45 % en 2035 »). */
  objet: Synthese;
  auteur: Auteur | null;
  cosignataires: number;
}

export interface StatAmendementsEtape {
  cle: CleCase;
  libelle: string;
  deposes: number;
  adoptes: number;
}

/** Rôles de la section « Acteurs » d'un dossier. */
export type RoleActeur =
  | 'auteur'
  | 'gouvernement'
  | 'rapporteur'
  | 'cmp'
  | 'auteurs_amendements'
  | 'saisissants_cc'
  | 'auditionnes';

export interface ActeurDossier {
  qui: Orateur;
  /** « Ministre de la Transition énergétique · porte le texte ». */
  role: string;
  /** Activité sur le dossier (« 54 interventions », « Audition 22/01 »). */
  activite: Chiffre | null;
}

export interface GroupeActeurs {
  role: RoleActeur;
  libelle: string;
  acteurs: ActeurDossier[];
  /** Total quand la liste est tronquée (CMP : 14 membres). */
  total: number;
}

export interface FicheDossier {
  entete: EnteteDossier;
  /** null hors du périmètre de la projection (résolution, loi constitutionnelle, sans 1re lecture). */
  parcours: Parcours | null;
  ceQuiAChange: ChangementDepuisLeDepot[];
  etapes: EtapeResume[];
  /** Nombre de versions du texte chargées (`canon.version_texte`). */
  versionsDuTexte: number;
  articles: ArticleResume[];
  amendements: {
    parEtape: StatAmendementsEtape[];
    filtre: { sort?: SortAmendement };
    liste: Page<AmendementResume>;
  };
  /** Scrutins publics du dossier, dans les deux chambres. */
  scrutins: ScrutinResume[];
  acteurs: GroupeActeurs[];
  /** Rapprochements lobbying, chacun avec son statut. */
  interets: LienInteret[];
  chiffres: Chiffre[];
  sources: Provenance[];
}

// ---------- Étape ----------

export interface DocumentOfficiel {
  id: string;
  type: TypeDocument;
  /** « Rapport n° 1342 », « Texte adopté n° 287 ». */
  titre: string;
  numero: string | null;
  date: string | null;
  url: string | null;
  provenance: Provenance;
}

/** Ce qui a fait passer un article d'une version à la suivante (`canon.modification_article`). */
export type OrigineModification =
  | {
      type: 'amendement';
      /** Vérifié si l'attribution est VERIFIED ; à vérifier si elle est encore en revue. */
      amendement: Lien<AmendementResume>;
    }
  | { type: 'compromis_cmp' }
  /** « Origine non établie » : aucune attribution certaine. */
  | { type: 'non_etablie' };

export interface ChangementEtape {
  article: ArticleRef;
  origine: OrigineModification;
  /** En clair : « Objectif de renouvelables relevé de 40 % à 45 % en 2035 ». */
  resume: Synthese;
}

export interface FicheEtape {
  barre: BarreDossier;
  case: CaseParcours;
  /** Rang de l'étape parmi les cases affichées (« Étape 3 »). */
  numero: number;
  organe: OrganisationRef | null;
  resume: Synthese;
  chiffres: Chiffre[];
  changements: ChangementEtape[];
  votes: ScrutinResume[];
  quiIntervient: { intervenants: Intervenant[]; total: number };
  documents: DocumentOfficiel[];
  /** Déviations qui ont lieu à cette étape. */
  deviations: DeviationParcours[];
  /** Dossiers rattachés à cette étape (un 49.3 rattaché à la séance). */
  enfants: DossierLie[];
  /** Étapes voisines affichées (les étapes sans objet sont sautées). */
  precedente: { cle: CleCase; libelle: string } | null;
  suivante: { cle: CleCase; libelle: string } | null;
}

// ---------- Article ----------

export type StatutVersionArticle = 'present' | 'ajoute' | 'supprime' | 'conforme' | 'non_modifie';

export interface VersionArticle {
  id: string;
  /** 0 = texte déposé. */
  rang: number;
  /** « Texte déposé », « Commission AN », « Texte de la CMP ». */
  libelle: string;
  etape: { cle: CleCase; libelle: string } | null;
  lieu: Lieu | null;
  date: string | null;
  /** Numéro dans cette version (renumérotations). */
  numero: string;
  statut: StatutVersionArticle;
  /** Mention publiée avec le numéro (« Supprimé », « Conforme », « nouveau »). */
  mention: string | null;
}

export interface FicheArticle {
  barre: BarreDossier;
  article: ArticleRef;
  intitule: string | null;
  modifications: number;
  versions: VersionArticle[];
  /** Version affichée et sa comparaison (`ConsulterArticle {version, comparaison}`). */
  affichee: {
    version: string;
    comparaison: 'precedente' | 'depose';
    /** Version comparée, null pour le texte déposé. */
    compareeA: string | null;
    texte: string;
    diff: SegmentDiff[];
    /** null pour le texte déposé. */
    origine: OrigineModification | null;
    pourquoi: {
      /** Exposé des motifs de l'amendement à l'origine, extrait officiel, null sinon. */
      expose: string | null;
      synthese: Synthese;
    };
  };
}

// ---------- Amendement ----------

export interface AvisAmendement {
  emetteur: 'rapporteur' | 'commission' | 'gouvernement';
  /** favorable, defavorable, sagesse, retrait, avis_du_gouvernement, autre. */
  avis: string;
  /** Libellé publié. */
  libelle: string | null;
  provenance: Provenance;
}

/** Mode de vote : main levée = pas de liste nominative publiée. */
export type ModeDeVote =
  | { type: 'scrutin_public'; scrutin: ScrutinResume }
  | { type: 'main_levee' }
  /** pas mis aux voix (retiré, tombé, irrecevable) ou en attente */
  | { type: 'sans_vote' };

export interface FicheAmendement {
  barre: BarreDossier;
  amendement: AmendementResume;
  dateDepot: string | null;
  dateSort: string | null;
  dispositif: {
    /** HTML tel que publié. */
    texte: string | null;
    /** Effet sur l'article visé, null si son texte n'est pas chargé. */
    diff: SegmentDiff[] | null;
  };
  /** Exposé des motifs, extrait officiel tel que publié. */
  expose: string | null;
  exposeEnClair: Synthese;
  cosignataires: { total: number; personnes: PersonneRef[]; groupes: GroupeRef[] };
  avis: {
    /** false à l'AN : avis non publiés en données structurées. */
    publies: boolean;
    liste: AvisAmendement[];
  };
  vote: ModeDeVote;
  /** Interventions reliées à l'amendement (« ce qui a été dit en commission »). */
  discussions: { extraits: InterventionExtrait[]; total: number };
  interets: LienInteret[];
  provenance: Provenance;
}
