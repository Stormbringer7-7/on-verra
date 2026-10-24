// Discussions : prises de parole en séance et en commission, telles que publiées.
// Fonction critique (plan §1) : « Qui intervient » sur chaque étape, « ce qui a été dit en
// commission » sous un amendement, « ce qu'elle a dit » avant un vote. Le texte est intégral ;
// la synthèse passe par le port `Synthetiseur` (null : « Pas de synthèse disponible »).

import type { AmendementRef, Ancre, DossierRef, GroupeRef, Orateur, OrganisationRef, Page, Synthese } from './commun';
import type { CleCase } from './parcours';

export interface ReunionRef {
  id: string;
  type: 'seance' | 'commission' | 'autre';
  chambre: 'AN' | 'SENAT';
  /** Commission ou assemblée (`canon.reunion.organe_id`). */
  organe: OrganisationRef | null;
  /** Ouverture de la réunion (ISO 8601), null si non publiée. */
  debut: string | null;
}

/** Ce qui était en discussion, par lien explicite seulement (jamais par ressemblance de titres). */
export interface SujetIntervention {
  dossier: DossierRef | null;
  /** Article en discussion, tel que publié (« Article 3 »). */
  article: string | null;
  /** Amendement discuté, relié par l'ancre ou le numéro dans la séance. */
  amendement: AmendementRef | null;
  /** Titre du point du compte rendu, tel que publié. */
  point: string | null;
}

export interface Intervention {
  id: string;
  reunion: ReunionRef;
  /** Rang dans la réunion (`canon.intervention.ordre`). */
  ordre: number;
  /** Secondes depuis l'ouverture (Syceron « stime »), null si non publié. */
  horodatage: number | null;
  orateur: Orateur;
  /** Groupe de l'orateur au moment de l'intervention, null si non publié. */
  groupe: GroupeRef | null;
  /** Texte intégral, identique à la source. */
  texte: string;
  sujet: SujetIntervention;
  /** Passage précis du compte rendu officiel. */
  compteRendu: Ancre;
  synthese: Synthese;
}

/** Extrait court d'une intervention, pour les écrans qui ne montrent pas le texte entier. */
export interface InterventionExtrait {
  id: string;
  orateur: Orateur;
  groupe: GroupeRef | null;
  /** Date de la réunion. */
  date: string | null;
  /** Début du texte publié, coupé sur un mot (« … » ajouté par l'UI si `tronque`). */
  extrait: string;
  tronque: boolean;
  compteRendu: Ancre;
}

/** Une ligne de « Qui intervient » : un orateur et ce qu'il a dit pendant l'étape. */
export interface Intervenant {
  orateur: Orateur;
  groupe: GroupeRef | null;
  /** Nombre de prises de parole dans l'étape. */
  interventions: number;
  /** Sa première prise de parole significative (hors présidence de séance), null si aucune. */
  extrait: InterventionExtrait | null;
}

/** Ce dont on liste les interventions (`ListerInterventions`). Exactement une cible. */
export type CibleInterventions =
  | { type: 'etape'; dossier: string; cle: CleCase }
  | { type: 'reunion'; id: string }
  | { type: 'amendement'; id: string }
  | { type: 'personne'; id: string; dossier?: string };

export interface ListeInterventions {
  cible: CibleInterventions;
  /** Libellé de la cible (« Commission AN · Programmation énergétique »). */
  libelle: string;
  interventions: Page<Intervention>;
}
