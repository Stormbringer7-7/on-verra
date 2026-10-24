// Barre de parcours d'un dossier de loi : projection `lecture.parcours_dossier` (gabarit de la
// procédure, chaque case lue dans les étapes publiées). Rien n'est supposé : une case sans preuve
// est « inconnu », jamais « faite ». Définitions : opendata/docs/indicateurs.md, « Parcours ».

import type { Lieu, Provenance } from './commun';

export type Procedure = 'acceleree' | 'normale';

/** Cases des deux gabarits (`lecture.parcours_gabarit.cle`). `_o` : chambre de dépôt ; `_s` : l'autre. */
export type CleCase =
  | 'depot'
  | 'commission_1_o'
  | 'seance_1_o'
  | 'commission_1_s'
  | 'seance_1_s'
  | 'lecture_1_o'
  | 'lecture_1_s'
  | 'lecture_2_o'
  | 'lecture_2_s'
  | 'cmp'
  | 'conclusions_cmp'
  | 'nouvelle_lecture'
  | 'lecture_definitive'
  | 'cc'
  | 'promulgation'
  | 'jo'
  | 'promulgation_jo';

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
  facultative: boolean;
  etat: EtatCase;
  /** Étape courante du dossier (au plus une case). */
  courante: boolean;
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
  procedure: Procedure;
  /** Chambre de dépôt. */
  origine: 'AN' | 'SENAT';
  /** Toutes les cases du gabarit, dans l'ordre ; l'UI choisit comment montrer les `sans_objet`. */
  cases: CaseParcours[];
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
}
