// Parcours d'un dossier : projection `lecture.parcours_dossier` (les étapes du modèle de son type,
// le droit commun, chaque étape lue dans les actes publiés), ses déviations, ses branches prises et
// les dossiers rattachés. Rien n'est supposé : une étape sans preuve est « inconnu », jamais
// « faite » ; une donnée absente n'est jamais un échec. Modèles : opendata/parcours/ ;
// définitions : opendata/docs/indicateurs.md, « Parcours ».

import type { DossierRef, Lieu, Provenance } from './commun';

export type Procedure = 'acceleree' | 'normale';

/**
 * Clé d'une étape du modèle (`canon.parcours_etape.cle`) : `depot`, `commission_1_o`, `cmp`, `jo`
 * pour une loi (`_o` : chambre de dépôt ; `_s` : l'autre), `creation`, `rapport`, `vote`… selon le type.
 */
export type CleCase = string;

/** Famille du modèle de parcours. */
export type FamilleParcours = 'legislatif' | 'resolution' | 'controle' | 'gouvernement' | 'autre';
/** Nature d'une étape dans le droit commun. */
export type NatureEtape = 'obligatoire' | 'conditionnelle' | 'facultative';
/** Effet d'une déviation : le parcours reprend, s'arrête, l'étape est remplacée, ou suspendu. */
export type EffetDeviation = 'rejoint' | 'termine' | 'remplace' | 'suspend';

/** Le modèle de parcours du dossier (type, version en vigueur à sa date). */
export interface ModeleParcours {
  cle: string;
  version: number;
  libelle: string;
  famille: FamilleParcours;
  /** « Constitution, art. 39 à 45… ». */
  fondement: string;
}

/** Un événement qui modifie le parcours de droit commun, rattaché à l'étape où il a lieu. */
export interface DeviationParcours {
  /** `procedure_acceleree`, `engagement_responsabilite`, `retrait`, `caducite`… */
  cle: string;
  libelle: string;
  fondement: string;
  etape: CleCase;
  effet: EffetDeviation;
  debut: string | null;
  /** Conclusions publiées de ses actes (« Motion rejetée »), telles quelles. */
  conclusion: string | null;
  provenance: Provenance[];
}

/** Branche du droit commun prise par le dossier (« Adopté sans modification : fin de la navette »). */
export interface BrancheParcours {
  de: CleCase;
  /** Étape d'arrivée, « fin » : plus rien après. */
  vers: CleCase;
  libelle: string;
}

/** Dossier rattaché à l'étape d'un autre (un 49.3 rattaché à la séance du texte). */
export interface DossierLie {
  dossier: DossierRef;
  /** Étape du dossier parent où le lien a lieu, et son libellé (« Nouvelle lecture »). */
  etape: CleCase | null;
  etapeLibelle: string | null;
}

/**
 * faite : l'acte qui la conclut est publié et daté ; en_cours : un acte publié, pas celui qui la
 * conclut ; a_venir : rien encore ; sans_objet : n'aura pas lieu, d'après un fait publié ;
 * inconnu : la donnée ne permet pas de conclure.
 */
export type EtatCase = 'faite' | 'en_cours' | 'a_venir' | 'sans_objet' | 'inconnu';

export interface CaseParcours {
  rang: number;
  cle: CleCase;
  /** « Commission AN », « 1re lecture Sénat », « Conseil constit. ». */
  libelle: string;
  /** AN, SENAT, CMP, CC, PR, JO ; null pour une case des deux chambres (« AN+SENAT »). */
  lieu: Lieu | null;
  /** Non obligatoire dans le droit commun (`nature` ≠ obligatoire). */
  facultative: boolean;
  nature: NatureEtape;
  etat: EtatCase;
  /** Étape courante du dossier (au plus une case). */
  courante: boolean;
  /** Première étape à venir après la dernière active, si le parcours n'est pas terminé. */
  attendue: boolean;
  /** Une déviation a lieu à cette étape (`Parcours.deviations[].etape`). */
  deviation: boolean;
  debut: string | null;
  fin: string | null;
  /** Acte daté après le jour de référence (séance inscrite) : une échéance, pas une preuve. */
  programmeeLe: string | null;
  /** Conclusion publiée (« Accord », « adopté », « Non conformité partielle »), telle quelle. */
  conclusion: string | null;
  /** Étapes canon, décision du Conseil, loi publiée qui établissent la case. */
  provenance: Provenance[];
}

/** Prochaine échéance datée (`lecture.parcours_dossier_synthese.prochaine_echeance*`). */
export interface Echeance {
  date: string;
  /** Heure de la réunion (ISO 8601), null si non publiée. */
  heure: string | null;
  /** « Lecture définitive AN · Séance publique ». */
  libelle: string;
  /** État du point d'ordre du jour, tel que publié (« Confirmé », « Eventuel »), null sinon. */
  etat: string | null;
  cle: CleCase | null;
}

export interface Parcours {
  modele: ModeleParcours;
  procedure: Procedure;
  /** Chambre de dépôt ; null sans dépôt publié (commission d'enquête, 49.3…). */
  origine: 'AN' | 'SENAT' | null;
  /** Toutes les étapes du modèle, dans l'ordre ; l'UI choisit comment montrer les `sans_objet`. */
  cases: CaseParcours[];
  deviations: DeviationParcours[];
  branches: BrancheParcours[];
  /** Dossier dont celui-ci est un événement (rattaché à une de ses étapes), sinon null. */
  parent: DossierLie | null;
  /** Dossiers rattachés à une étape de celui-ci. */
  enfants: DossierLie[];
  /** Jour de référence de la projection. */
  dateReference: string;
  prochaineEcheance: Echeance | null;
}

/** Version compacte, pour les listes (Accueil, Dossiers) : une case = un point de la barre. */
export interface CaseCompacte {
  cle: CleCase;
  libelle: string;
  etat: EtatCase;
  courante: boolean;
  /** Première étape à venir après la dernière active (rien en cours). */
  attendue: boolean;
  /** Une déviation a lieu à cette étape (`deviations[].etape`). */
  deviation: boolean;
}
