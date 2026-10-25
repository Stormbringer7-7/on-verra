// Faits filtrés (Explorer du design v4 « Filtrer ou voir ») : on regarde des faits, les objets
// servent de filtres. Une seule query : des filtres (lois, personnes, institutions, territoires,
// action législative) → compteurs par type de fait, faits de l'onglet demandé regroupés, filtres
// suivants suggérés avec leur nombre, élargissements possibles, comparaison de deux groupes.
//
// Rien n'est rédigé par l'API : la phrase de contexte se compose côté UI depuis `filtres` et
// `compteurs`. Chaque fait porte sa source ; un rapprochement de transparence porte son statut
// (`LienInteret.vers`), jamais présenté comme certain. Le rattachement d'un fait à un objet est
// toujours un lien explicite publié (colonne ou `canon.lien`), jamais une ressemblance de texte.

import type {
  AmendementRef,
  Ancre,
  ArticleRef,
  Chambre,
  DemandePage,
  DossierRef,
  GroupeRef,
  Orateur,
  Page,
  PersonneRef,
  Provenance,
} from './commun';
import type { ReunionRef } from './discussions';
import type { AmendementResume, SortAmendement } from './dossiers';
import type { TypeInstitution } from './institutions';
import type { CleCase } from './parcours';
import type { QuestionResume } from './personnes';
import type { Decompte, Position, PositionDeGroupe, PositionExprimee, ScrutinResume } from './scrutins';
import type { DeclarationResume, LienInteret } from './transparence';

// ---------- Filtres ----------

/** Familles du fil de filtres, dans l'ordre du design. */
export type FamilleFiltre = 'lois' | 'personnes' | 'institutions' | 'territoires' | 'action';

/**
 * Les filtres, tous facultatifs et cumulés (ET). Dans une famille, du plus large au plus précis :
 * dossier › étape › article ; groupe › personne ; chambre › organe. Identifiants opaques, sauf
 * `etape` (case du parcours, avec `dossier`), `chambre` et `departement` (code INSEE).
 */
export interface FiltresFaits {
  dossier?: string;
  /** Case du parcours : exige `dossier`. */
  etape?: CleCase;
  /** Article suivi (`ArticleRef.id`). */
  article?: string;
  groupe?: string;
  personne?: string;
  chambre?: Chambre;
  /** Commission ou autre organe (`OrganisationRef.id`). */
  organe?: string;
  /** Code INSEE du département. Pas encore chargé : rendu dans `indisponibles`, aucun fait. */
  departement?: string;
  scrutin?: string;
  amendement?: string;
}

export type CleFiltre = keyof FiltresFaits;

/** Onglets de faits, dans l'ordre du design. */
export type TypeFait = 'interventions' | 'amendements' | 'votes' | 'controle' | 'transparence' | 'personnes';

/** Regroupement de la liste (« Regrouper par »). */
export type Regroupement = 'dossier' | 'etape' | 'article' | 'groupe' | 'personne' | 'organe' | 'date' | 'sort' | 'nature';

export interface DemandeFaits extends DemandePage {
  filtres?: FiltresFaits;
  /** Ordre d'ajout des filtres : le dernier est l'objet focal. Sans : l'ordre des familles. */
  ordre?: CleFiltre[];
  /** Sans : le premier onglet non vide. */
  onglet?: TypeFait;
  /** Sans : le regroupement par défaut de l'onglet, selon les filtres posés. */
  regrouper?: Regroupement;
  /** Clé d'un groupe (`GroupeFaits.cle`) : tous ses faits, paginés, dans `deplie`. */
  deplier?: string;
  /** Second groupe politique, comparé au filtre `groupe` (appui long) : mêmes autres filtres. */
  comparer?: string;
}

// ---------- Faits ----------

/** Où se situe un fait, par lien explicite seulement. */
export interface ContexteFait {
  dossier: DossierRef | null;
  etape: { cle: CleCase; libelle: string } | null;
  article: ArticleRef | null;
  date: string | null;
}

/** Position d'un parlementaire filtré, ou d'un groupe filtré, sur un scrutin public. */
export type VoteDuFiltre =
  | { type: 'personne'; position: Position; parDelegation: boolean; contreSonGroupe: boolean }
  | { type: 'groupe'; ligne: PositionExprimee | null; decompte: Decompte; membres: number };

export type Fait =
  | {
      type: 'intervention';
      id: string;
      orateur: Orateur;
      /** Groupe de l'orateur ce jour-là. */
      groupe: GroupeRef | null;
      /** Début du texte publié, coupé sur un mot. */
      extrait: string;
      tronque: boolean;
      reunion: ReunionRef;
      contexte: ContexteFait;
      compteRendu: Ancre;
    }
  | { type: 'amendement'; id: string; amendement: AmendementResume; contexte: ContexteFait; provenance: Provenance }
  | { type: 'scrutin'; id: string; scrutin: ScrutinResume; duFiltre: VoteDuFiltre | null; provenance: Provenance }
  | {
      /** Amendement adopté ou rejeté sans scrutin public : aucun vote individuel n'existe. */
      type: 'main_levee';
      id: string;
      amendement: AmendementRef;
      sort: SortAmendement | null;
      contexte: ContexteFait;
      provenance: Provenance;
    }
  | { type: 'question'; id: string; question: QuestionResume; auteur: PersonneRef | null }
  | { type: 'interet'; id: string; lien: LienInteret }
  | { type: 'declaration'; id: string; personne: PersonneRef; declaration: DeclarationResume; provenance: Provenance }
  | {
      /** Une personne qui a agi dans le périmètre filtré, et combien. */
      type: 'personne';
      id: string;
      personne: PersonneRef;
      interventions: number;
      amendements: number;
      votes: number;
    };

// ---------- Réponse ----------

/** Un filtre posé, nommé pour le fil d'Ariane. */
export interface FiltreActif {
  cle: CleFiltre;
  famille: FamilleFiltre;
  id: string;
  libelle: string;
  /** Pastille : le groupe filtré, ou le groupe de la personne filtrée. */
  groupe: GroupeRef | null;
}

/** Écran de la fiche complète d'un objet (« Fiche »), null s'il n'en a pas encore. */
export type FicheVisee =
  | { type: 'dossier'; id: string }
  | { type: 'etape'; dossier: string; cle: CleCase }
  | { type: 'article'; id: string }
  | { type: 'personne'; id: string }
  | { type: 'scrutin'; id: string }
  | { type: 'amendement'; id: string }
  | { type: 'institution'; institution: TypeInstitution };

/** L'objet du dernier filtre ajouté, vu pour lui-même. */
export interface ObjetFocal {
  cle: CleFiltre;
  id: string;
  libelle: string;
  /** Ligne publiée sous le nom (fonction, dossier de l'étape, nature de l'organe). */
  detail: string | null;
  groupe: GroupeRef | null;
  fiche: FicheVisee | null;
}

export interface GroupeFaits {
  /** Clé opaque, pour `DemandeFaits.deplier`. */
  cle: string;
  /** Nom du groupe (« Séance AN », « Groupe A », « Adopté »), « Sans … précis » pour le reste. */
  libelle: string;
  detail: string | null;
  /** Pastille : regroupement par groupe ou par personne. */
  groupe: GroupeRef | null;
  total: number;
  /** Aperçu : les premiers faits du groupe (au plus trois). */
  faits: Fait[];
  /** Filtre que la tête ajoute quand on la touche ; null si elle ne filtre pas (sort, date…). */
  filtre: { cle: CleFiltre; id: string } | null;
}

/** Vote d'un membre du groupe filtré, sur le scrutin filtré. */
export interface VoteMembre {
  personne: PersonneRef;
  position: Position;
  parDelegation: boolean;
  /** Exprimé à l'opposé de la ligne de son groupe (groupe à majorité nette seulement). */
  contreSonGroupe: boolean;
}

/** Scrutin filtré : la répartition par groupe, et les membres du groupe filtré. */
export interface ScrutinFiltre {
  scrutin: ScrutinResume;
  /** De la gauche vers la droite (`rang`). */
  groupes: PositionDeGroupe[];
  /** Avec le filtre `groupe` seulement. */
  membres: VoteMembre[] | null;
}

export interface SuggestionFiltre {
  cle: CleFiltre;
  id: string;
  libelle: string;
  /** Interventions, amendements et votes si on l'ajoute. */
  nombre: number;
  groupe: GroupeRef | null;
}

/** Retirer un ou plusieurs filtres (« Élargir », « Rien ici »), et ce qu'on verrait alors. */
export interface Elargissement {
  retirer: CleFiltre[];
  /** Nom de ce qui reste (« Toutes les étapes », « Tout le Groupe A »). */
  libelle: string;
  nombre: number;
}

export interface ExplorationFaits {
  demande: DemandeFaits;
  /** Filtres posés et reconnus, dans l'ordre du fil (familles, puis profondeur). */
  filtres: FiltreActif[];
  focal: ObjetFocal | null;
  compteurs: Record<TypeFait, number>;
  onglet: TypeFait;
  regroupement: Regroupement;
  /** Regroupements proposés pour cet onglet. */
  regroupements: Regroupement[];
  /** Groupes de l'onglet, paginés (aperçu de chaque groupe). */
  groupes: Page<GroupeFaits>;
  /** Faits du groupe déplié, paginés ; null sans `deplier`. */
  deplie: Page<Fait> | null;
  /** Avec le filtre `scrutin`. */
  scrutin: ScrutinFiltre | null;
  /** Filtres suivants, par famille, avec leur nombre (familles sans suggestion omises). */
  suggestions: { famille: FamilleFiltre; filtres: SuggestionFiltre[] }[];
  elargir: Elargissement[];
  /** Avec `comparer` et le filtre `groupe` : le second groupe, mêmes autres filtres. */
  comparaison: { groupe: GroupeRef; compteurs: Record<TypeFait, number>; groupes: Page<GroupeFaits> } | null;
  /** Filtres reçus que les données ne permettent pas encore (département) : ils ne retiennent aucun fait. */
  indisponibles: CleFiltre[];
  /** Ce que ces faits ne disent pas, à afficher tel quel. */
  limites: string[];
}
