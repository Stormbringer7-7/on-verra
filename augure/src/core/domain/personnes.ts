// Personnes : annuaire, classements, fiche personne (fonctions dans le temps, choix, rôles dans
// les dossiers, déclarations). Les fonctions sont celles publiées par l'AN, le Sénat, le
// Gouvernement et le Répertoire national des élus (RNE). Un mandat RNE n'est rattaché à une personne
// que par une décision de revue humaine : sans elle, la fiche RNE reste seule (« fiche_rne »).

import type {
  Chambre,
  DemandePage,
  DossierRef,
  GroupeRef,
  Indicateur,
  Page,
  Periode,
  Provenance,
  RapprochementVerifie,
  Synthese,
  Systeme,
} from './commun';
import type { Decompte, ScrutinResume } from './scrutins';
import type { DeclarationHatvp } from './transparence';

/** Filtre de l'annuaire. */
export type RolePersonne = 'depute' | 'senateur' | 'gouvernement' | 'elu_local';

export interface ElementAnnuaire {
  /** Personne canon, ou fiche RNE seule (élu local que la revue n'a relié à aucune personne). */
  id: string;
  identite: 'personne' | 'fiche_rne';
  nom: string;
  role: RolePersonne;
  /** Fonction actuelle (« Députée · Essonne, 4e · Groupe A »), null si aucune en cours. */
  fonction: string | null;
  groupe: GroupeRef | null;
  /**
   * Source de la fonction affichée (badge AN, SÉNAT, RNE). Le Gouvernement est publié par l'AMO
   * (AN) : le badge « GOUV. » se déduit de `role`.
   */
  source: Systeme;
}

export interface FiltreAnnuaire extends DemandePage {
  role?: RolePersonne;
  /** Texte libre sur le nom, sans casse ni accents. */
  q?: string;
}

export interface Annuaire {
  filtre: FiltreAnnuaire;
  /** Effectifs en fonction aujourd'hui, par rôle (« 577 députés, 348 sénateurs… »). */
  effectifs: { role: RolePersonne; nombre: number }[];
  personnes: Page<ElementAnnuaire>;
}

// ---------- Classements ----------

export type CritereClassement = 'ecarts' | 'absences' | 'positions';

export interface DemandeClassement {
  chambre: Chambre;
  critere: CritereClassement;
  /** desc : plus d'écarts, plus absents, plus souvent pour ; asc : l'inverse. */
  ordre: 'asc' | 'desc';
  /** Thèmes favoris. Ignorés tant qu'aucun thème n'est attribué (la réponse le dit). */
  themes?: string[];
  limite?: number;
}

export interface LigneClassement {
  rang: number;
  personne: { id: string; nom: string; groupe: GroupeRef | null };
  /** La mesure, avec son dénominateur et sa référence (son groupe, sur les mêmes scrutins). */
  indicateur: Indicateur;
}

export interface Classement {
  demande: DemandeClassement;
  /** Thèmes réellement appliqués ; vide : tous les scrutins de la période. */
  themesAppliques: string[];
  themesDisponibles: { id: string; libelle: string }[];
  periode: Periode;
  /** « Un écart est un vote différent de la majorité de son groupe… ». */
  explication: string;
  lignes: LigneClassement[];
}

// ---------- Fiche personne ----------

export type TypeFonction =
  | 'depute'
  | 'senateur'
  | 'membre_gouvernement'
  | 'membre_commission'
  | 'membre_groupe'
  | 'membre_cmp'
  | 'bureau'
  | 'presidence'
  | 'mandat_local'
  | 'autre';

/** Une fonction datée de la frise. */
export interface FonctionDatee {
  titre: string;
  type: TypeFonction;
  organisation: { id: string; nom: string } | null;
  /** Groupe politique, pour une appartenance de groupe. */
  groupe: GroupeRef | null;
  debut: string | null;
  /** null : en cours. */
  fin: string | null;
  source: Systeme;
  provenance: Provenance;
  /**
   * Pour un mandat RNE : la décision de revue qui le rattache à la personne. Absent pour une
   * fonction lue sous l'identifiant de la personne (AN, Sénat).
   */
  rattachement?: RapprochementVerifie;
}

/** Ses choix sur un thème (onglet « Ses choix »). */
export interface ChoixTheme {
  theme: string;
  decompte: Decompte & { absences: number };
  total: number;
  ecarts: Indicateur;
  /** Phrase en clair sur le thème. */
  synthese: Synthese;
  /** Dernier vote à l'inverse de son groupe sur ce thème, pour « Pourquoi ce vote ». */
  dernierEcart: ScrutinResume | null;
}

/** Une ligne de « Son rôle dans les dossiers nationaux ». */
export interface RoleDansLesDossiers {
  type:
    | 'rapporteur'
    | 'auteur'
    | 'cosignataire'
    | 'amendements'
    | 'interventions'
    | 'questions'
    | 'avis_gouvernement'
    | 'audition'
    | 'texte_porte';
  nombre: number;
  libelle: string;
  /** « 41 sur le projet de loi énergie · 58 adoptés au total ». */
  detail: string | null;
  /** Dossier principal concerné, null pour un total. */
  dossier: DossierRef | null;
}

export interface QuestionResume {
  id: string;
  /** QG : au Gouvernement ; QE : écrite ; QOSD : orale sans débat. */
  type: 'QG' | 'QE' | 'QOSD';
  numero: string;
  date: string | null;
  /** Analyse publiée. */
  titre: string | null;
  rubrique: string | null;
  /** Ministère interrogé ou attributaire, tel que publié : jamais la personne du ministre. */
  ministere: string | null;
  dateReponse: string | null;
  provenance: Provenance;
}

export type OngletPersonne = 'parcours' | 'choix' | 'dossiers' | 'declarations';

export interface EntetePersonne {
  id: string;
  identite: 'personne' | 'fiche_rne';
  nom: string;
  civilite: string | null;
  /** Fonctions en cours (« Députée · Essonne, 4e circ. », « Groupe A »). */
  enCours: { libelle: string; groupe: GroupeRef | null }[];
  provenance: Provenance[];
}

export type ContenuOngletPersonne =
  | {
      onglet: 'parcours';
      /** Toutes les fonctions documentées, de la plus ancienne à la plus récente. */
      fonctions: FonctionDatee[];
      mandatsLocauxEnCours: FonctionDatee[];
    }
  | {
      onglet: 'choix';
      /** Bilan sur les 12 derniers mois de mandat : participation et écarts, comparés à son groupe. */
      indicateurs: Indicateur[];
      /** Note de contexte (« Comme ministre, elle ne vote pas au Parlement »), null sinon. */
      note: string | null;
      /** Vide tant qu'aucun thème n'est attribué. */
      themes: ChoixTheme[];
      /** Derniers votes à l'inverse de son groupe, pour « Pourquoi ce vote ». */
      derniersEcarts: ScrutinResume[];
    }
  | {
      onglet: 'dossiers';
      roles: RoleDansLesDossiers[];
      questions: Page<QuestionResume>;
    }
  | {
      onglet: 'declarations';
      declarations: DeclarationHatvp[];
    };

export interface FichePersonne {
  entete: EntetePersonne;
  contenu: ContenuOngletPersonne;
}
