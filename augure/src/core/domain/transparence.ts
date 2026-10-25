// Transparence : déclarations HATVP publiées et représentation d'intérêts (répertoire AGORA).
// Seul ce que la HATVP publie, tel quel. Un intérêt déclaré n'est pas un conflit d'intérêts ; une
// action déclarée ne prouve ni une rencontre, ni une influence. Les rapprochements avec un dossier,
// un amendement ou un article portent toujours leur statut (`Lien`).

import type { AmendementRef, ArticleRef, DossierRef, Lien, Page, Periode, Provenance } from './commun';

// ---------- Déclarations ----------

export interface DeclarationResume {
  id: string;
  /** Code publié : DI, DIA, DIAM, DSP… */
  type: string;
  /** « Déclaration d'intérêts et d'activités ». */
  libelle: string;
  modificative: boolean;
  dateDepot: string | null;
  datePublication: string | null;
  url: string | null;
}

export interface RubriqueDeclaree {
  /** Code publié (`activProfCinqDerniereDto`, `participationFinanciereDto`…). */
  rubrique: string;
  /** « Participations dans des sociétés ». */
  libelle: string;
  /** Déclarée « néant ». */
  neant: boolean;
  /** Éléments déclarés, champs tels que publiés (sans données privées). */
  elements: Record<string, string | null>[];
}

export interface DeclarationHatvp extends DeclarationResume {
  /** Qualité du déclarant au moment de la déclaration (« député », « membre du Gouvernement »). */
  qualite: string | null;
  mandat: string | null;
  rubriques: RubriqueDeclaree[];
  provenance: Provenance;
}

// ---------- Représentants d'intérêts ----------

export interface RepresentantResume {
  id: string;
  denomination: string;
  /** Catégorie publiée (« Association », « Organisation syndicale et professionnelle »). */
  categorie: string | null;
}

export interface ActionRepresentation {
  id: string;
  /** Exercice déclaré (semestre ou année). */
  periode: Periode;
  objet: string;
  domaines: string[];
  /** Types d'actions menées (« Envoi de notes », « Entretiens »). */
  actions: string[];
  /** Catégories de responsables publics visés, jamais des personnes. */
  responsables: string[];
  /** Décisions publiques concernées, telles que déclarées. */
  decisions: string[];
  publieeLe: string | null;
}

/** Objet rapproché d'une action déclarée. */
export type CibleInteret =
  | { type: 'dossier'; dossier: DossierRef }
  | { type: 'amendement'; amendement: AmendementRef; dossier: DossierRef | null }
  | { type: 'article'; article: ArticleRef; dossier: DossierRef };

/**
 * Rapprochement entre une action déclarée et un objet du parcours législatif. Vérifié seulement si
 * l'action cite explicitement le texte ; sinon « à vérifier » (même sujet, même période).
 */
export interface LienInteret {
  representant: RepresentantResume;
  /** Action qui fonde le rapprochement. */
  action: Pick<ActionRepresentation, 'id' | 'periode' | 'objet' | 'responsables'>;
  /** Nombre d'actions déclarées par ce représentant sur l'année de l'action. */
  actionsDeclarees: number | null;
  vers: Lien<CibleInteret>;
}

export interface FicheRepresentant {
  id: string;
  denomination: string;
  nomUsage: string | null;
  categorie: string | null;
  /** Identifiant publié (SIREN, RNA ou identifiant HATVP). */
  identifiant: { valeur: string; type: string } | null;
  /** Première publication au répertoire (« inscrit depuis »). */
  inscritDepuis: string | null;
  secteurs: string[];
  /** Dernier exercice publié. */
  exercice: {
    periode: Periode;
    actions: number | null;
    /** Tranche de dépenses, telle que publiée. */
    depenses: string | null;
    salaries: number | null;
    /** Personnes déclarées (dirigeants, collaborateurs) : non chargées dans `canon`, toujours null. */
    personnesDeclarees: number | null;
  } | null;
  actions: Page<ActionRepresentation>;
  rapprochements: LienInteret[];
  provenance: Provenance;
}
