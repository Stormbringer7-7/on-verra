// Territoires (écrans Carte et Département) : où siègent les élus et ce qu'ils font, département par
// département. Le département d'un élu est celui que publie sa chambre (mandat → département du
// COG) ; les Français établis hors de France n'ont pas de département et ne sont pas sur la carte.
// Une carte de scrutin montre des votes publiés ; une carte de présence, une participation toujours
// comparée (Indicateur), jamais un chiffre seul.

import type { Chambre, Indicateur, PersonneRef } from './commun';
import type { Position, ScrutinResume } from './scrutins';

/** Département ou collectivité d'outre-mer, par son code du COG (« 33 », « 2A », « 971 »). */
export interface DepartementRef {
  code: string;
  nom: string;
}

/**
 * Maille de la carte d'un scrutin : département (défaut, les deux chambres) ou circonscription
 * (Assemblée seulement : un député par circonscription ; les sénateurs sont élus par département).
 */
export type NiveauCarte = 'departement' | 'circonscription';

export type DemandeCarte = { mesure: 'scrutin'; scrutin: string; niveau?: NiveauCarte } | { mesure: 'presence'; chambre: Chambre };

/**
 * Circonscription législative : département du COG et numéro publiés par l'AN (AMO, mandat →
 * `numDepartement`, `numCirco`). `code` : « 33-02 », « 971-01 » (département, tiret, numéro sur deux
 * chiffres), la clé des contours de la carte.
 */
export interface CirconscriptionRef {
  code: string;
  departement: DepartementRef;
  numero: number;
}

/** Une circonscription sur un scrutin : son député ce jour-là et sa position. */
export interface ValeurCirconscription {
  circonscription: CirconscriptionRef;
  /** null : aucun député en mandat ce jour-là (siège vacant). */
  depute: PersonneRef | null;
  /** null si vacant ; « absent » : en mandat, sans vote publié. */
  position: Position | null;
}

/** Votes des élus d'un département sur un scrutin (en mandat ce jour-là). */
export interface VotesDepartement {
  membres: number;
  pour: number;
  contre: number;
  abstention: number;
  nonVotants: number;
  /** En mandat, sans vote publié. */
  absents: number;
}

export interface ValeurDepartement {
  departement: DepartementRef;
  /**
   * Ce qui colore le département, de 0 à 100 : part des « pour » parmi les votes exprimés (pour,
   * contre, abstention) pour un scrutin ; taux de participation pour la présence. null : aucun vote
   * exprimé (le département est dessiné, sans couleur de valeur).
   */
  valeur: number | null;
  /** Scrutin : les votes ; présence : null. */
  votes: VotesDepartement | null;
  /** Présence : la participation comparée ; scrutin : null. */
  presence: Indicateur | null;
}

export interface Carte {
  demande: DemandeCarte;
  /** Maille rendue : « circonscription » seulement pour un scrutin de l'Assemblée qui la demande. */
  niveau: NiveauCarte;
  chambre: Chambre;
  /** Le scrutin montré (mesure « scrutin »), null sinon. */
  scrutin: ScrutinResume | null;
  /** Ce que mesure `valeur` (« Part des pour parmi les votes exprimés »). */
  libelleValeur: string;
  /** Départements qui ont au moins un élu de la chambre, par code. */
  departements: ValeurDepartement[];
  /**
   * Niveau « circonscription » : chaque circonscription d'un département du COG connue sous la
   * législature, par code croissant (vide sinon). Les départements restent remplis : la carte les
   * dessine par-dessus pour se repérer.
   */
  circonscriptions: ValeurCirconscription[];
  /** Élus de la chambre sans département (Français établis hors de France), comptés à part. */
  horsDepartement: number;
  /** Ce que la carte ne dit pas, à afficher tel quel. */
  limites: string[];
}

export interface DemandeDepartement {
  code: string;
  /** Un scrutin : les votes des élus du département. */
  scrutin?: string;
}

export interface EluDuDepartement {
  personne: PersonneRef;
  chambre: Chambre;
  /** Numéro de circonscription publié (députés), null sinon. */
  circonscription: string | null;
  /** Participation de l'année en cours, comparée à son groupe sur les mêmes scrutins ; null sans scrutin. */
  participation: Indicateur | null;
}

export interface FicheDepartement {
  departement: DepartementRef;
  /** Élus en fonction aujourd'hui, députés puis sénateurs. */
  elus: EluDuDepartement[];
  /** Participation des élus du département, par chambre, comparée à leurs groupes. */
  presence: { chambre: Chambre; indicateur: Indicateur }[];
  /** Le scrutin demandé : votes de chaque élu du département alors en mandat. */
  scrutin: {
    scrutin: ScrutinResume;
    votes: VotesDepartement;
    elus: { personne: PersonneRef; position: Position }[];
  } | null;
  limites: string[];
}
