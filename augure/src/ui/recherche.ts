// Recherche : la demande envoyée au bus depuis la saisie (fonction pure, testée sous Node).

import type { DemandeRecherche, TypeRecherche } from '@/core';

/** « Tout » ou un type. */
export type Filtre = TypeRecherche | 'tout';

/** En dessous, pas de recherche plein texte. */
export const LONGUEUR_MIN = 2;

/** La demande envoyée au bus, sans clé inutile (même entrée que les fixtures et le cache). */
export function demandeRecherche(q: string, type: Filtre, page: number): DemandeRecherche | null {
  const mot = q.trim();
  if (mot.length < LONGUEUR_MIN) return null;
  return { q: mot, ...(type !== 'tout' ? { type } : {}), ...(page > 1 ? { page } : {}) };
}
