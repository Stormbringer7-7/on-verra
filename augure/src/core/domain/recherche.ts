// Recherche transversale (plein texte Postgres) et signalement d'une erreur ou d'une source manquante.

import type { DemandePage, GroupeRef, Page, TypeCible } from './commun';

export type TypeRecherche = 'dossiers' | 'personnes' | 'amendements' | 'scrutins' | 'organisations';

export interface DemandeRecherche extends DemandePage {
  q: string;
  /** Absent : tous les types (une section par type, premières réponses seulement). */
  type?: TypeRecherche;
}

/** Une réponse, avec de quoi ouvrir l'écran correspondant. */
export interface Trouve {
  type: TypeRecherche;
  id: string;
  titre: string;
  /** Ligne de contexte, construite depuis les faits (« CE123 · Art. 3 · Adopté »). */
  contexte: string;
  /** Pour une personne : son groupe actuel (pastille de couleur). */
  groupe: GroupeRef | null;
  /** Pour une personne : fiche RNE seule ou personne canon. */
  identite?: 'personne' | 'fiche_rne';
}

export interface ResultatRecherche {
  q: string;
  type: TypeRecherche | null;
  sections: { type: TypeRecherche; resultats: Page<Trouve> }[];
}

// ---------- Signalement ----------

export interface Signalement {
  cible: { type: TypeCible; id: string | null };
  message: string;
  /** Adresse pour une réponse, facultative. */
  contact?: string;
  /** Écran d'où vient le signalement, pour la relecture. */
  ecran?: string;
}

export interface AccuseSignalement {
  id: string;
  recuLe: string;
}
