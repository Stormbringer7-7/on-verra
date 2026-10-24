// Fil d'Ariane et onglet actif, lus dans l'état de la pile de navigation (fonctions pures).
//
//   Dossiers › Programmation énergétique › Commission AN › Amendement CE123
//
// Le premier maillon est l'onglet d'où l'on vient ; chaque fiche empilée ajoute le sien, avec le
// titre que son écran a donné (`<Ecran titre="…">`), sinon le nom générique de la page.

import type { Onglets, Pages } from '../navigation';

export type Onglet = keyof Onglets;
export type Page = Exclude<keyof Pages, 'Onglets'>;

export const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'Accueil', libelle: 'Accueil' },
  { cle: 'Dossiers', libelle: 'Dossiers' },
  { cle: 'Personnes', libelle: 'Personnes' },
  { cle: 'Institutions', libelle: 'Institutions' },
  { cle: 'Recherche', libelle: 'Recherche' },
];

export const estOnglet = (nom: string): nom is Onglet => ONGLETS.some((o) => o.cle === nom);

/** Nom générique d'une page, tant que son écran n'a pas donné de titre. */
export const LIBELLES_PAGES: Record<Page, string> = {
  Dossier: 'Dossier',
  Etape: 'Étape',
  Discussions: 'Discussions',
  Article: 'Article',
  Amendement: 'Amendement',
  Scrutin: 'Scrutin',
  PourquoiVote: 'Pourquoi ce vote',
  Personne: 'Personne',
  Institution: 'Institution',
  Representant: 'Représentant d’intérêts',
};

/** Onglet d'une page ouverte sans onglet en dessous (lien profond). */
const ONGLET_DES_PAGES: Record<Page, Onglet> = {
  Dossier: 'Dossiers',
  Etape: 'Dossiers',
  Discussions: 'Dossiers',
  Article: 'Dossiers',
  Amendement: 'Dossiers',
  Scrutin: 'Dossiers',
  PourquoiVote: 'Dossiers',
  Representant: 'Dossiers',
  Personne: 'Personnes',
  Institution: 'Institutions',
};

/** Ce qu'il faut de l'état de navigation (sous-ensemble de `NavigationState`). */
export interface EtatPile {
  index: number;
  routes: { key: string; name: string; state?: { index?: number; routes: { name: string }[] } }[];
}

/** Onglet actif : celui de la route « Onglets » de la pile, sinon celui de la première fiche. */
export function ongletActif(etat: EtatPile): Onglet {
  const racine = etat.routes.find((r) => r.name === 'Onglets');
  const sous = racine?.state;
  const nom = sous?.routes[sous.index ?? 0]?.name;
  if (nom && estOnglet(nom)) return nom;
  // Onglets jamais affichés (lien profond vers une fiche) : l'onglet de la première fiche.
  const premiere = etat.routes.find((r) => r.name !== 'Onglets')?.name;
  return premiere && premiere in ONGLET_DES_PAGES ? ONGLET_DES_PAGES[premiere as Page] : 'Accueil';
}

export interface Maillon {
  cle: string;
  libelle: string;
  /**
   * Comment y revenir : `onglet` (revenir à l'onglet, toute la pile retirée), `retirer` n fiches,
   * ou `ici` pour le dernier maillon (non cliquable).
   */
  aller: { type: 'onglet'; onglet: Onglet } | { type: 'retirer'; n: number } | { type: 'ici' };
}

/** Fil d'Ariane de la page en haut de la pile (`etat.index`). */
export function cheminAriane(etat: EtatPile, titres: Record<string, string | undefined>): Maillon[] {
  const onglet = ongletActif(etat);
  const libelleOnglet = ONGLETS.find((o) => o.cle === onglet)!.libelle;
  const maillons: Maillon[] = [{ cle: `onglet:${onglet}`, libelle: libelleOnglet, aller: { type: 'onglet', onglet } }];
  const routes = etat.routes.slice(0, etat.index + 1);
  routes.forEach((r, i) => {
    if (r.name === 'Onglets') return;
    const n = etat.index - i;
    maillons.push({
      cle: r.key,
      libelle: titres[r.key] ?? LIBELLES_PAGES[r.name as Page] ?? r.name,
      aller: n === 0 ? { type: 'ici' } : { type: 'retirer', n },
    });
  });
  return maillons;
}
