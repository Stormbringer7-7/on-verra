// Où en sont les textes (carte « Où en sont les textes » de Chiffres) : l'engorgement du parcours,
// étape par étape, et les textes dont la suite ne dépend plus du Parlement (attente administrative :
// décision du Conseil constitutionnel, promulgation, publication au Journal officiel).
//
// Calculé sur la projection du parcours (`lecture.parcours_dossier`) : un texte est rangé à sa
// dernière case active ; il y est « en examen » si un acte de la case est publié sans celui qui la
// conclut, sinon il « attend la suite » depuis la fin de cette case. Rien n'est interprété :
// « bloqué » n'est jamais dit, seulement où, depuis quand, et le délai fixé par un texte s'il y en a.

import type { DemandePage, DossierRef, Lieu, Page } from './commun';
import type { Origine } from './dossiers';
import type { CleCase, Echeance } from './parcours';

/** en_examen : un acte de la case est publié, pas celui qui la conclut ; en_attente : la case est faite, la suite n'a pas commencé. */
export type SituationTexte = 'en_examen' | 'en_attente';

/** Ce que le texte attend d'un acteur hors du Parlement. */
export type AttenteHorsParlement = 'decision_cc' | 'promulgation' | 'publication_jo';

/** Un texte non abouti (ni promulgué et publié, ni rejeté, ni retiré), à sa dernière case active. */
export interface TexteEnAttente {
  dossier: DossierRef;
  origine: Origine | null;
  /** Dernière case active du parcours. */
  etape: { cle: CleCase; libelle: string; lieu: Lieu | null };
  situation: SituationTexte;
  /** Début du compte : début de la case en examen, sinon fin de la case faite ; null si la source ne la date pas. */
  depuis: string | null;
  /** Jours entre `depuis` et le jour de référence ; null sans `depuis`. */
  jours: number | null;
  /** Dernier acte publié du parcours (« Conseil constitutionnel saisi par 60 députés »). */
  dernierActe: { date: string; libelle: string } | null;
  /** Prochaine échéance datée (séance inscrite) : une échéance, pas une preuve. */
  prochaineEcheance: Echeance | null;
}

/**
 * Une file du parcours : les textes rangés à une même case (même libellé, chambre comprise :
 * « Commission Sénat », « 1re lecture AN », « Conseil constit. »).
 */
export interface FileEtape {
  /** Libellé de la case : identifie la file (filtre `DemandeAvancement.etape`). */
  etape: string;
  lieu: Lieu | null;
  enExamen: number;
  enAttente: number;
  parOrigine: { gouvernement: number; parlementaire: number; inconnue: number };
  /** Attente médiane en jours (textes datés seulement), null sans texte daté. */
  attenteMediane: number | null;
  /** Le texte qui attend depuis le plus longtemps. */
  plusAncien: TexteEnAttente | null;
}

/**
 * Attente hors du Parlement. Le délai est celui que fixe la Constitution ; un dépassement calculé
 * sur nos données reste toujours « à vérifier » : l'acte attendu peut manquer dans nos sources et
 * le point de départ légal (transmission du texte au Gouvernement) n'est pas publié.
 */
export interface AttenteAdministrative {
  texte: TexteEnAttente;
  attendu: AttenteHorsParlement;
  /** Qui doit agir : CC, PR (promulgation), GOUVERNEMENT (publication au Journal officiel). */
  qui: Lieu;
  /** Date limite et texte qui la fixe ; null quand aucun texte ne fixe de délai (publication au JO). */
  delai: { limite: string; base: string } | null;
  /** Jours après la date limite sans acte publié ; `motif` et `avertissement` à afficher tels quels. */
  depassement: { jours: number; statut: 'a_verifier'; motif: string; avertissement: string } | null;
}

export interface DemandeAvancement extends DemandePage {
  /** Libellé d'une file : seulement les textes de cette case. */
  etape?: string;
  /** Seulement les textes en attente hors du Parlement. */
  horsParlement?: boolean;
  origine?: Origine;
}

export interface AvancementDesTextes {
  legislature: string;
  /** Jour de référence de la projection du parcours. */
  dateReference: string;
  /** Textes non aboutis rangés dans une file. */
  total: number;
  /** Textes non aboutis dont le parcours ne permet pas de dire où ils en sont (aucune case active). */
  indetermines: number;
  /** Files non vides, dans l'ordre du parcours. Calculées sans les filtres de la demande. */
  files: FileEtape[];
  /** Attentes hors du Parlement, dépassements d'abord. Calculées sans les filtres de la demande. */
  horsParlement: AttenteAdministrative[];
  demande: DemandeAvancement;
  /** Textes de la demande, du plus ancien au plus récent. */
  textes: Page<TexteEnAttente>;
  /** Ce que ces comptes ne disent pas, à afficher tel quel (pas un `Indicateur` : des comptes). */
  limites: string[];
}
