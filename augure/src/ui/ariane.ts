// Fil d'Ariane du design v4 : la place de l'objet, pas le chemin suivi pour y arriver (fonctions pures).
//
//   Lois / Programmation énergétique / Commission AN / Amendement CE123
//   Élus / Camille Exemple
//   Carte / Gironde
//
// Chaque écran donne ses `parents` (construits depuis ses données) et son titre, le dernier maillon,
// non cliquable. Toucher un parent y revient s'il est déjà dans la pile, sinon l'ouvre. En portrait,
// la barre de retour nomme le dernier parent. Les onglets n'ont pas de fil : « 5 points d'entrée,
// sans état ; on revient par le fil ».

import type { CleCase, DossierRef, TypeInstitution } from '../core/domain/model';
import type { Onglets, Pages } from '../navigation';

export type Onglet = keyof Onglets;
export type Page = Exclude<keyof Pages, 'Onglets'>;

/** Les 5 points d'entrée du design v4 (la route `Accueil` est l'onglet Actualité). */
export const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'Accueil', libelle: 'Actualité' },
  { cle: 'Chiffres', libelle: 'Chiffres' },
  { cle: 'Carte', libelle: 'Carte' },
  { cle: 'Recherche', libelle: 'Recherche' },
  { cle: 'Guide', libelle: 'Guide' },
];

export const estOnglet = (nom: string): nom is Onglet => ONGLETS.some((o) => o.cle === nom);

/** Nom générique d'une page (titre de la fenêtre web tant que l'écran n'a pas donné le sien). */
export const LIBELLES_PAGES: Record<Page, string> = {
  Dossiers: 'Dossiers législatifs',
  Personnes: 'Les élus',
  Institutions: 'Institutions',
  Textes: 'Où en sont les textes',
  Explorer: 'Parcourir',
  Suivis: 'Mes suivis',
  Reglages: 'Accessibilité et réglages',
  Methode: 'Méthode et sources',
  Bienvenue: 'Bienvenue',
  Dossier: 'Dossier',
  Etape: 'Étape',
  Discussions: 'Ce qui a été dit',
  Article: 'Article',
  Amendement: 'Amendement',
  Scrutin: 'Scrutin',
  PourquoiVote: 'Pourquoi ce vote',
  Personne: 'Personne',
  Institution: 'Institution',
  Representant: 'Représentant d’intérêts',
  Departement: 'Département',
};

// ---------- Maillons ----------

/** Où mène un maillon : un onglet, ou une page avec ses paramètres. */
export type Cible = { onglet: Onglet } | { [P in Page]: { page: P; params: Pages[P] } }[Page];

export interface Parent {
  libelle: string;
  cible: Cible;
}

const page = <P extends Page>(p: P, params: Pages[P]): Cible => ({ page: p, params }) as Cible;

/** Les racines du canevas : familles d'objets et onglets. */
export const RACINES = {
  actualite: { libelle: 'Actualité', cible: { onglet: 'Accueil' } },
  chiffres: { libelle: 'Chiffres', cible: { onglet: 'Chiffres' } },
  carte: { libelle: 'Carte', cible: { onglet: 'Carte' } },
  lois: { libelle: 'Lois', cible: page('Dossiers', undefined) },
  elus: { libelle: 'Élus', cible: page('Personnes', undefined) },
  institutions: { libelle: 'Institutions', cible: page('Institutions', undefined) },
} satisfies Record<string, Parent>;

export const parentDossier = (d: DossierRef): Parent => ({ libelle: d.titre, cible: page('Dossier', { id: d.id }) });

export const parentEtape = (dossier: string, etape: { cle: CleCase; libelle: string }): Parent => ({
  libelle: etape.libelle,
  cible: page('Etape', { dossier, cle: etape.cle }),
});

export const parentInstitution = (institution: TypeInstitution, libelle: string): Parent => ({
  libelle,
  cible: page('Institution', { institution }),
});

export const parentPersonne = (id: string, nom: string): Parent => ({ libelle: nom, cible: page('Personne', { id }) });

export const parentScrutin = (id: string, libelle: string): Parent => ({ libelle, cible: page('Scrutin', { id }) });

/** Lois / dossier / étape, ce qui est connu (l'étape seulement si le dossier l'est). */
export function sousLeDossier(dossier: DossierRef | null | undefined, etape?: { cle: CleCase; libelle: string } | null): Parent[] {
  if (!dossier) return [RACINES.lois];
  return [RACINES.lois, parentDossier(dossier), ...(etape ? [parentEtape(dossier.id, etape)] : [])];
}

// ---------- Pile de navigation ----------

/** Ce qu'il faut de l'état de navigation (sous-ensemble de `NavigationState`). */
export interface EtatPile {
  index: number;
  routes: { key: string; name: string; params?: object; state?: { index?: number; routes: { name: string }[] } }[];
}

/** Onglet d'une fiche ouverte sans onglet en dessous (lien profond) : celui de sa famille. */
const ONGLET_DES_PAGES: Record<Page, Onglet> = {
  Dossiers: 'Accueil',
  Dossier: 'Accueil',
  Etape: 'Accueil',
  Discussions: 'Accueil',
  Article: 'Accueil',
  Amendement: 'Accueil',
  Scrutin: 'Accueil',
  PourquoiVote: 'Accueil',
  Representant: 'Accueil',
  Textes: 'Chiffres',
  Explorer: 'Accueil',
  Suivis: 'Accueil',
  Reglages: 'Accueil',
  Methode: 'Accueil',
  Bienvenue: 'Accueil',
  Departement: 'Carte',
  Personnes: 'Recherche',
  Personne: 'Recherche',
  Institutions: 'Recherche',
  Institution: 'Recherche',
};

/** Onglet actif : celui de la route « Onglets » de la pile, sinon celui de la première fiche. */
export function ongletActif(etat: EtatPile): Onglet {
  const racine = etat.routes.find((r) => r.name === 'Onglets');
  const sous = racine?.state;
  const nom = sous?.routes[sous.index ?? 0]?.name;
  if (nom && estOnglet(nom)) return nom;
  const premiere = etat.routes.find((r) => r.name !== 'Onglets')?.name;
  return premiere && premiere in ONGLET_DES_PAGES ? ONGLET_DES_PAGES[premiere as Page] : 'Accueil';
}

/** Mêmes paramètres, à l'ordre des clés près (undefined ≡ {}). */
function memes(a: object | undefined, b: object | undefined): boolean {
  const x = Object.entries(a ?? {}).filter(([, v]) => v !== undefined);
  const y = Object.entries(b ?? {}).filter(([, v]) => v !== undefined);
  return x.length === y.length && x.every(([k, v]) => JSON.stringify((b as Record<string, unknown> | undefined)?.[k]) === JSON.stringify(v));
}

type CiblePage = Exclude<Cible, { onglet: Onglet }>;

/** Position de la page `cible` dans la pile, sous l'écran affiché ; -1 si elle n'y est pas. */
function dansLaPile(etat: EtatPile, cible: CiblePage): number {
  for (let i = etat.index - 1; i >= 0; i--) {
    const r = etat.routes[i];
    if (r.name === cible.page && memes(r.params, cible.params ?? undefined)) return i;
  }
  return -1;
}

/**
 * Remonter au maillon `i` du fil (on monte, on n'empile pas) : un onglet, on y revient ; sinon la
 * pile devient « ce qui est déjà ouvert jusqu'au plus proche ancêtre présent » puis les maillons
 * manquants jusqu'au maillon touché. Déjà ouvert : simple retour (`ajouter` vide). Aucun ancêtre
 * dans la pile : on repart de la route « Onglets ».
 */
export function monter(
  etat: EtatPile,
  parents: Parent[],
  i: number,
): { type: 'onglet'; onglet: Onglet } | { type: 'pile'; garder: number; ajouter: CiblePage[] } {
  const cible = parents[i].cible;
  if ('onglet' in cible) return { type: 'onglet', onglet: cible.onglet };
  const pages = (de: number) => parents.slice(de, i + 1).map((m) => m.cible).filter((c): c is CiblePage => !('onglet' in c));
  for (let k = i; k >= 0; k--) {
    const c = parents[k].cible;
    if ('onglet' in c) continue;
    const j = dansLaPile(etat, c);
    if (j >= 0) return { type: 'pile', garder: j + 1, ajouter: pages(k + 1) };
  }
  const onglets = etat.routes.findIndex((r) => r.name === 'Onglets');
  return { type: 'pile', garder: onglets + 1, ajouter: pages(0) };
}
