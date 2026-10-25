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

export type DemandeCarte = { mesure: 'scrutin'; scrutin: string } | { mesure: 'presence'; chambre: Chambre };

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
  chambre: Chambre;
  /** Le scrutin montré (mesure « scrutin »), null sinon. */
  scrutin: ScrutinResume | null;
  /** Ce que mesure `valeur` (« Part des pour parmi les votes exprimés »). */
  libelleValeur: string;
  /** Départements qui ont au moins un élu de la chambre, par code. */
  departements: ValeurDepartement[];
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
