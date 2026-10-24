// Scrutins publics (AN et Sénat), votes individuels, positions de groupe, et « Pourquoi ce vote ».
// Un vote est toujours rattaché au groupe de la personne *au moment du vote*. Les votes à main
// levée ne sont pas nominatifs : ils n'apparaissent pas ici.

import type {
  AmendementRef,
  Ancre,
  ArticleRef,
  Chambre,
  DossierRef,
  GroupeRef,
  Indicateur,
  PersonneRef,
  Provenance,
  Synthese,
} from './commun';
import type { InterventionExtrait } from './discussions';
import type { BarreDossier } from './dossiers';
import type { CleCase } from './parcours';
import type { FonctionDatee } from './personnes';
import type { DeclarationResume, LienInteret } from './transparence';

/** Vote individuel publié. `absent` : en mandat ce jour-là, sans vote publié (participation). */
export type Position = 'pour' | 'contre' | 'abstention' | 'non_votant' | 'absent';
export type PositionExprimee = 'pour' | 'contre' | 'abstention';

/** ensemble / article_unique : vote final sur un texte. */
export type NatureScrutin = 'ensemble' | 'article_unique' | 'article' | 'amendement' | 'motion' | 'motion_censure' | 'autre';
export const NATURES_FINALES: readonly NatureScrutin[] = ['ensemble', 'article_unique'];

export interface Decompte {
  pour: number;
  contre: number;
  abstention: number;
}

export interface ScrutinResume {
  id: string;
  chambre: Chambre;
  /** Numéro tel que publié. */
  numero: string;
  date: string;
  nature: NatureScrutin;
  /** Intitulé officiel, repris tel quel (« l'amendement n° 1876 de M. Hugo Fictif… »). */
  intitule: string;
  /** Ce qui est voté, en clair (« Lancer six réacteurs supplémentaires d'ici 2040 »). */
  enClair: Synthese;
  /** Sort publié : « adopté », « rejeté ». */
  sort: string | null;
  adopte: boolean | null;
  decompte: Decompte;
  dossier: DossierRef | null;
  /** Case du parcours où le vote a eu lieu, si le scrutin cite son étape. */
  etape: { cle: CleCase; libelle: string } | null;
}

export interface PositionDeGroupe {
  groupe: GroupeRef;
  /** Rang de la gauche vers la droite de l'hémicycle, pour dessiner (0 = le plus à gauche). */
  rang: number;
  /** Position majoritaire recalculée depuis le décompte ; null en cas d'égalité ou sans vote. */
  ligne: PositionExprimee | null;
  decompte: Decompte;
  nonVotants: number;
  /** Membres en mandat ce jour-là sans vote publié (`lecture.participation_groupe_scrutin`). */
  absents: number;
  /** Membres en mandat ce jour-là. */
  membres: number;
}

/** Ce que le scrutin met aux voix, par lien explicite (intitulé, `voteRefs`, `amescr`). */
export type ObjetScrutin =
  | { type: 'amendement'; amendement: AmendementRef; article: ArticleRef | null }
  | { type: 'article'; article: ArticleRef | null; division: string | null }
  | { type: 'texte' }
  | { type: 'motion' }
  | { type: 'autre' };

export interface VoteDifferent {
  personne: PersonneRef;
  position: PositionExprimee;
  ligneDuGroupe: PositionExprimee;
}

export interface FicheScrutin {
  /** Barre du dossier voté, null pour un scrutin sans dossier (motion de censure…). */
  barre: BarreDossier | null;
  scrutin: ScrutinResume;
  objet: ObjetScrutin;
  /** Ce que signifient « pour » et « contre » sur ce scrutin, en clair. */
  sens: { pour: Synthese; contre: Synthese };
  nonVotants: number;
  /** Parlementaires en mandat sans vote publié. */
  absents: number;
  /** De la gauche vers la droite (`rang`). */
  groupes: PositionDeGroupe[];
  /** Votes exprimés différents de la ligne de leur groupe (groupe à majorité nette seulement). */
  votesDifferents: { total: number; personnes: VoteDifferent[] };
  compteRendu: Ancre | null;
  provenance: Provenance;
}

export interface VoteIndividuel {
  position: Position;
  parDelegation: boolean;
  /** Mise au point publiée (« voulait voter pour »), affichée à côté : le vote n'est pas modifié. */
  miseAuPoint: string | null;
}

/** Ce que la personne a fait sur le dossier : rapporteure, amendements, votes (liens explicites). */
export interface ActeSurLeDossier {
  type: 'rapporteur' | 'auteur' | 'cosignataire' | 'amendements' | 'interventions' | 'vote';
  /** « A déposé 41 amendements, dont le CE88 ». Construite par l'API, sans interprétation. */
  libelle: string;
  /** Écran visé : étape, amendement, scrutin. */
  vers:
    | { type: 'etape'; dossier: string; cle: CleCase }
    | { type: 'amendement'; id: string }
    | { type: 'scrutin'; id: string }
    | { type: 'dossier'; id: string };
  provenance: Provenance;
}

/**
 * « Pourquoi ce vote » : ce qui est public et sourcé autour d'un vote. On ne déduit pas la raison du
 * vote ; aucune phrase ne relie deux faits par une causalité.
 */
export interface ExplicationVote {
  barre: BarreDossier | null;
  scrutin: ScrutinResume;
  personne: PersonneRef;
  vote: VoteIndividuel;
  /** Son groupe au moment du vote, et combien de ses membres ont voté comme elle. */
  groupe: {
    groupe: GroupeRef;
    ligne: PositionExprimee | null;
    /** Part de la ligne parmi les votes exprimés du groupe (0 à 100). */
    partLigne: number | null;
    /** Membres du groupe qui ont eu la même position qu'elle. */
    memePosition: number;
    exprimes: number;
  } | null;
  /** Ses interventions sur l'amendement ou le dossier, le jour du vote ou avant (`lecture.dit_et_vote`). */
  interventionsAvant: InterventionExtrait[];
  actes: ActeSurLeDossier[];
  /**
   * Ses votes sur le même thème. null tant que les dossiers n'ont pas de thème (vocabulaire
   * contrôlé à venir) : rien n'est classé par mots-clés.
   */
  surLeTheme: {
    theme: string;
    decompte: Decompte & { absences: number };
    ecarts: Indicateur;
    synthese: Synthese;
  } | null;
  /** Fonctions passées et en cours (AN, Sénat, Gouvernement, RNE). */
  parcours: FonctionDatee[];
  /** Déclarations HATVP publiées ; le lien au thème est une synthèse, pas un fait. */
  declarations: { declarations: DeclarationResume[]; auTheme: Synthese };
  /** Lobbying déclaré sur le sujet auprès de sa catégorie de responsables : toujours à vérifier. */
  lobbying: LienInteret[];
}
