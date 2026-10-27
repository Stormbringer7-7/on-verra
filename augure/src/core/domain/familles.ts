// Recherche par familles (design v4, écran Recherche) : six familles, quatre d'objets (Lois,
// Personnes et groupes, Institutions, Territoires) et deux de faits (Action législative,
// Transparence), chacune avec ses déclinaisons et leur nombre de résultats ; sans requête, on
// parcourt ; un numéro officiel (« CE123 », « scrutin 1874 ») donne le résultat exact, ou les
// candidats s'il est ambigu (« 655 »), avec de quoi les distinguer (dossier, chambre).
//
// Les règles (familles, numéros, sections montrées, assemblage) sont écrites ici une fois et
// exécutées par l'API (sur ses dépôts) et par les fixtures (sur leur catalogue) : rejouées par
// l'adaptateur mémoire, elles redonnent exactement les fixtures. Chaque résultat dit où il mène :
// sa fiche (`fiche`, null s'il n'en a pas encore) et l'Explorer filtré sur lui (`filtres`).

import type { DemandePage, GroupeRef, Page } from './commun';
import type { FicheVisee, FiltresFaits } from './faits';
import { normaliser } from './texte';

export type FamilleRecherche = 'lois' | 'personnes' | 'institutions' | 'territoires' | 'action' | 'transparence';

export type DeclinaisonRecherche =
  | 'dossiers'
  | 'etapes'
  | 'articles'
  | 'groupes'
  | 'deputes'
  | 'senateurs'
  | 'ministres'
  | 'auditionnes'
  | 'chambres'
  | 'commissions'
  | 'enquetes'
  | 'departements'
  | 'circonscriptions'
  | 'votes'
  | 'amendements'
  | 'interventions'
  | 'rapports'
  | 'questions'
  | 'lobbying'
  | 'interets'
  | 'deports';

interface DeclinaisonDecrite {
  declinaison: DeclinaisonRecherche;
  libelle: string;
  /** null : cherchable ; sinon pourquoi pas encore (à afficher tel quel). */
  indisponible: string | null;
}

/** Les familles et leurs déclinaisons, dans l'ordre du design. */
export const FAMILLES_RECHERCHE: { famille: FamilleRecherche; libelle: string; nature: 'objet' | 'fait'; declinaisons: DeclinaisonDecrite[] }[] = [
  {
    famille: 'lois',
    libelle: 'Lois',
    nature: 'objet',
    declinaisons: [
      { declinaison: 'dossiers', libelle: 'Dossiers', indisponible: null },
      { declinaison: 'etapes', libelle: 'Étapes', indisponible: 'Une étape se trouve depuis son dossier.' },
      { declinaison: 'articles', libelle: 'Articles', indisponible: null },
    ],
  },
  {
    famille: 'personnes',
    libelle: 'Personnes et groupes',
    nature: 'objet',
    declinaisons: [
      { declinaison: 'groupes', libelle: 'Groupes', indisponible: null },
      { declinaison: 'deputes', libelle: 'Députés', indisponible: null },
      { declinaison: 'senateurs', libelle: 'Sénateurs', indisponible: null },
      { declinaison: 'ministres', libelle: 'Ministres', indisponible: null },
      { declinaison: 'auditionnes', libelle: 'Personnes auditionnées', indisponible: 'Seul leur nom est publié : elles ne sont pas encore des fiches.' },
    ],
  },
  {
    famille: 'institutions',
    libelle: 'Institutions',
    nature: 'objet',
    declinaisons: [
      { declinaison: 'chambres', libelle: 'Chambres', indisponible: null },
      { declinaison: 'commissions', libelle: 'Commissions permanentes', indisponible: null },
      { declinaison: 'enquetes', libelle: 'Commissions d’enquête', indisponible: null },
    ],
  },
  {
    famille: 'territoires',
    libelle: 'Territoires',
    nature: 'objet',
    declinaisons: [
      { declinaison: 'departements', libelle: 'Départements', indisponible: null },
      { declinaison: 'circonscriptions', libelle: 'Circonscriptions', indisponible: 'Les circonscriptions ne sont pas encore chargées.' },
    ],
  },
  {
    famille: 'action',
    libelle: 'Action législative',
    nature: 'fait',
    declinaisons: [
      { declinaison: 'votes', libelle: 'Votes', indisponible: null },
      { declinaison: 'amendements', libelle: 'Amendements', indisponible: null },
      { declinaison: 'interventions', libelle: 'Interventions', indisponible: null },
      { declinaison: 'rapports', libelle: 'Rapports', indisponible: 'Les rapports ne sont pas encore chargés.' },
      { declinaison: 'questions', libelle: 'Questions au Gouvernement', indisponible: null },
    ],
  },
  {
    famille: 'transparence',
    libelle: 'Transparence',
    nature: 'fait',
    declinaisons: [
      { declinaison: 'lobbying', libelle: 'Lobbying', indisponible: null },
      { declinaison: 'interets', libelle: 'Déclarations d’intérêts', indisponible: null },
      { declinaison: 'deports', libelle: 'Déports', indisponible: 'Les déports ne sont pas encore chargés.' },
    ],
  },
];

export const famillesDe = new Map(FAMILLES_RECHERCHE.flatMap((f) => f.declinaisons.map((d) => [d.declinaison, f.famille] as const)));
export const DISPONIBLES: DeclinaisonRecherche[] = FAMILLES_RECHERCHE.flatMap((f) =>
  f.declinaisons.filter((d) => d.indisponible === null).map((d) => d.declinaison),
);

// ---------- Contrat ----------

export interface DemandeFamilles extends DemandePage {
  /** Absente ou vide : parcourir. */
  q?: string;
  famille?: FamilleRecherche;
  /** Déclinaisons cochées (de la famille choisie). Une seule : sa liste paginée. */
  declinaisons?: DeclinaisonRecherche[];
  /**
   * Expressions, chacune cherchée comme expression exacte (mots dans l'ordre) dans le texte publié
   * du résultat (texte d'une intervention, dispositif et exposé d'un amendement, question et
   * réponse, titre d'un scrutin, objet d'une action de lobbying ; nom ou titre d'un objet), toutes
   * cumulées. Au plus `TEXTES_MAX`, de `TEXTE_LONGUEUR_MAX` caractères chacune.
   */
  textes?: string[];
  /**
   * Une personne (`PersonneRef.id`) : seulement ce qui la concerne par un lien publié
   * (`LIEN_PERSONNE`) ; les déclinaisons sans tel lien sont écartées, et le disent.
   */
  personne?: string;
}

/** Un résultat, avec ce qu'il ouvre. */
export interface ResultatFamille {
  famille: FamilleRecherche;
  declinaison: DeclinaisonRecherche;
  id: string;
  titre: string;
  /** Ligne de contexte, construite depuis les faits (« Énergie · art. 3 · Commission AN · Adopté »). */
  contexte: string;
  /** Pastille : le groupe, ou le groupe actuel de la personne. */
  groupe: GroupeRef | null;
  /** Sa fiche ; null s'il n'en a pas encore (commission, département). */
  fiche: FicheVisee | { type: 'representant'; id: string } | null;
  /** L'Explorer filtré sur lui ; null s'il ne filtre aucun fait. */
  filtres: FiltresFaits | null;
}

/** Nombre de résultats ; au-delà du plafond, il n'est pas compté exactement. */
export interface CompteRecherche {
  nombre: number;
  plafonne: boolean;
}

export const PLAFOND_COMPTE = 1000;

export interface DeclinaisonComptee {
  declinaison: DeclinaisonRecherche;
  libelle: string;
  /** null quand elle n'est pas cherchable (`indisponible`) ou écartée par le filtre personne (`horsPersonne`). */
  compte: CompteRecherche | null;
  indisponible: string | null;
  /** Filtre personne posé et aucun lien publié entre une personne et cette déclinaison : pourquoi elle est écartée. */
  horsPersonne: string | null;
}

export interface FamilleComptee {
  famille: FamilleRecherche;
  libelle: string;
  nature: 'objet' | 'fait';
  compte: CompteRecherche;
  declinaisons: DeclinaisonComptee[];
}

export interface SectionRecherche {
  famille: FamilleRecherche;
  declinaison: DeclinaisonRecherche;
  resultats: Page<ResultatFamille>;
}

export interface ResultatFamilles {
  demande: DemandeFamilles;
  /** Requête nettoyée ; null : on parcourt. */
  q: string | null;
  /** Expressions nettoyées (espaces resserrés, sans doublon), dans l'ordre de la demande. */
  textes: string[];
  /** La personne filtrée, nommée pour sa puce ; null sans filtre personne. */
  personne: { id: string; nom: string; groupe: GroupeRef | null } | null;
  /**
   * Numéro officiel reconnu dans la requête : ses candidats (un seul : exact ; plusieurs : ambigu,
   * chacun avec son dossier et sa chambre dans `contexte`). Trouvé, il remplace les sections.
   */
  numero: { saisi: string; candidats: ResultatFamille[] } | null;
  /** Toutes les familles, comptées sans le filtre de famille ni de déclinaison. */
  familles: FamilleComptee[];
  /** Les déclinaisons demandées qui ont des résultats, dans l'ordre des familles. */
  sections: SectionRecherche[];
}

// ---------- Règles ----------

/** Ce qu'un numéro officiel peut désigner. */
export type CibleNumero = 'amendements' | 'votes' | 'questions' | 'rapports';

export interface NumeroOfficiel {
  saisi: string;
  /** Forme comparable : majuscules, sans espaces ni « n° » (« CE123 », « COM-56 », « 655 »). */
  numero: string;
  cibles: CibleNumero[];
}

/** « CE123 », « COM-56 », « amendement n° 655 », « 655 », « scrutin 1874 », « question 4521 », « rapport 1234 ». */
export function analyserNumero(q: string): NumeroOfficiel | null {
  const saisi = q.trim();
  const nomme = saisi.match(/^(scrutin|vote|question|rapport)\s*(?:n\s*[°o.]?\s*)?(\d{1,6})$/i);
  if (nomme) {
    const mot = normaliser(nomme[1]);
    const cible: CibleNumero = mot === 'question' ? 'questions' : mot === 'rapport' ? 'rapports' : 'votes';
    return { saisi, numero: nomme[2], cibles: [cible] };
  }
  const lettres = saisi.match(/^(?:amdt|amendement)?\s*([A-Za-z]{1,5})\s*-?\s*(\d{1,6})$/i);
  if (lettres && !/^n[o°]?$/i.test(lettres[1])) {
    const prefixe = lettres[1].toUpperCase();
    return { saisi, numero: `${prefixe}${prefixe === 'COM' ? '-' : ''}${lettres[2]}`, cibles: ['amendements'] };
  }
  const chiffres = saisi.match(/^(amdt|amendement)?\s*(?:n\s*[°o.]?\s*)?(\d{1,6})$/i);
  if (chiffres) return { saisi, numero: chiffres[2], cibles: chiffres[1] ? ['amendements'] : ['amendements', 'votes', 'questions'] };
  return null;
}

/** Un numéro tel que publié, sous sa forme comparable. */
export const numeroComparable = (numero: string) => numero.toUpperCase().replace(/\s+/g, '').replace(/^N[°O]/, '');

/** Expressions au plus, et leur longueur maximale (caractères). */
export const TEXTES_MAX = 5;
export const TEXTE_LONGUEUR_MAX = 100;

/** Expressions nettoyées : espaces resserrés, sans vide ni doublon (casse et accents ignorés), dans l'ordre. */
export function expressions(liste: readonly string[]): string[] {
  const vues = new Set<string>();
  return liste
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t && !vues.has(normaliser(t)) && vues.add(normaliser(t)));
}

/** Pourquoi des expressions sont refusées ; null : acceptées. */
export function expressionsInvalides(liste: readonly string[]): string | null {
  if (liste.length > TEXTES_MAX) return `Au plus ${TEXTES_MAX} expressions`;
  const longue = liste.find((t) => t.length > TEXTE_LONGUEUR_MAX);
  return longue ? `Expression trop longue (au plus ${TEXTE_LONGUEUR_MAX} caractères) : ${longue.slice(0, 30)}…` : null;
}

/**
 * Le lien publié qui rattache un résultat d'une déclinaison à une personne, pour le filtre
 * personne ; null : aucun lien publié, la déclinaison est écartée sous ce filtre (jamais de lien
 * supposé : un député n'« est » pas dans une commission parce qu'il en parle).
 */
export const LIEN_PERSONNE: Record<DeclinaisonRecherche, string | null> = {
  dossiers: 'initiateur du dossier',
  etapes: null,
  articles: null,
  groupes: null,
  deputes: 'la personne elle-même',
  senateurs: 'la personne elle-même',
  ministres: 'la personne elle-même',
  auditionnes: null,
  chambres: null,
  commissions: null,
  enquetes: null,
  departements: null,
  circonscriptions: null,
  votes: 'son vote nominatif publié',
  amendements: 'auteur de l’amendement',
  interventions: 'orateur',
  rapports: null,
  questions: 'auteur de la question',
  lobbying: null,
  interets: 'déclarant',
  deports: null,
};

export const HORS_PERSONNE = 'Aucun lien publié avec une personne : pas de résultat sous ce filtre.';

/** Les filtres d'une recherche, tels que les dépôts les appliquent (expressions nettoyées). */
export interface FiltresRecherche {
  textes: string[];
  personne: string | null;
}

export const SANS_FILTRE: FiltresRecherche = { textes: [], personne: null };

export interface PlanRecherche {
  q: string | null;
  /** Expressions nettoyées. */
  textes: string[];
  personne: string | null;
  numero: NumeroOfficiel | null;
  /** Déclinaisons dont on montre les résultats. */
  declinaisons: DeclinaisonRecherche[];
  page: number;
  taille: number;
  /** Une seule déclinaison : sa liste paginée ; sinon un aperçu par déclinaison. */
  detail: boolean;
}

/** Aperçu par déclinaison : deux en parcourant, trois en cherchant (canevas). */
export const APERCU_PARCOURIR = 2;
export const APERCU_RECHERCHE = 3;

/** Déclinaisons cherchables sous ces filtres : sous le filtre personne, celles qui ont un lien publié. */
export const cherchables = (personne: string | null): DeclinaisonRecherche[] =>
  DISPONIBLES.filter((d) => !personne || LIEN_PERSONNE[d] !== null);

/**
 * Les déclinaisons demandées (cochées, sinon celles de la famille, sinon toutes), cherchables
 * seulement. Un numéro officiel n'est reconnu que sans expression ni personne (il désigne un objet
 * exact, que ces filtres ne restreignent pas).
 */
export function planRecherche(demande: DemandeFamilles, pagination: { page: number; taille: number }): PlanRecherche {
  const q = demande.q?.trim() ? demande.q.trim() : null;
  const textes = expressions(demande.textes ?? []);
  const personne = demande.personne?.trim() || null;
  const cochees = demande.declinaisons?.length ? demande.declinaisons : null;
  const declinaisons = cherchables(personne).filter(
    (d) => (cochees ? cochees.includes(d) : true) && (!demande.famille || famillesDe.get(d) === demande.famille),
  );
  const detail = declinaisons.length === 1;
  const cherche = q !== null || textes.length > 0 || personne !== null;
  return {
    q,
    textes,
    personne,
    numero: q && !textes.length && !personne ? analyserNumero(q) : null,
    declinaisons,
    page: detail ? pagination.page : 1,
    taille: detail ? pagination.taille : cherche ? APERCU_RECHERCHE : APERCU_PARCOURIR,
    detail,
  };
}

/** Le résultat, depuis les comptes, les sections et les candidats du numéro lus par le plan. */
export function assemblerRecherche(
  demande: DemandeFamilles,
  plan: PlanRecherche,
  lu: {
    comptes: Partial<Record<DeclinaisonRecherche, CompteRecherche>>;
    sections: Partial<Record<DeclinaisonRecherche, Page<ResultatFamille>>>;
    candidats: ResultatFamille[] | null;
    /** La personne filtrée, nommée (le dépôt la lit) ; null sans filtre personne. */
    personne?: ResultatFamilles['personne'];
  },
): ResultatFamilles {
  const exact = plan.numero && lu.candidats?.length ? lu.candidats : null;
  const compte = (d: DeclinaisonRecherche): CompteRecherche =>
    exact ? { nombre: exact.filter((c) => c.declinaison === d).length, plafonne: false } : (lu.comptes[d] ?? { nombre: 0, plafonne: false });
  const familles: FamilleComptee[] = FAMILLES_RECHERCHE.map((f) => {
    const declinaisons = f.declinaisons.map((d) => {
      const horsPersonne = plan.personne && d.indisponible === null && LIEN_PERSONNE[d.declinaison] === null ? HORS_PERSONNE : null;
      return {
        declinaison: d.declinaison,
        libelle: d.libelle,
        compte: d.indisponible === null && !horsPersonne ? compte(d.declinaison) : null,
        indisponible: d.indisponible,
        horsPersonne,
      };
    });
    const comptees = declinaisons.flatMap((d) => (d.compte ? [d.compte] : []));
    return {
      famille: f.famille,
      libelle: f.libelle,
      nature: f.nature,
      compte: { nombre: comptees.reduce((n, c) => n + c.nombre, 0), plafonne: comptees.some((c) => c.plafonne) },
      declinaisons,
    };
  });
  const sections: SectionRecherche[] = exact
    ? []
    : plan.declinaisons.flatMap((d) => {
        const resultats = lu.sections[d];
        return resultats && resultats.elements.length ? [{ famille: famillesDe.get(d)!, declinaison: d, resultats }] : [];
      });
  return {
    demande,
    q: plan.q,
    textes: plan.textes,
    personne: plan.personne ? (lu.personne ?? null) : null,
    numero: plan.numero ? { saisi: plan.numero.saisi, candidats: lu.candidats ?? [] } : null,
    familles,
    sections,
  };
}
