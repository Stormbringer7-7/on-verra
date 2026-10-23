import { createContext, useContext, type ReactNode } from 'react';

import type { Position } from '@/core';
import { palettes, type Palette } from './tokens';

const ThemeContext = createContext<Palette>(palettes.dark);

/** Salle de contrôle (sombre) par défaut ; `light` donne le thème Dossier papier. */
export function ThemeProvider({ scheme = 'dark', children }: { scheme?: keyof typeof palettes; children: ReactNode }) {
  return <ThemeContext.Provider value={palettes[scheme]}>{children}</ThemeContext.Provider>;
}

export const usePalette = () => useContext(ThemeContext);

/** Couleur d'un vote : décrit une position, jamais un parti. */
export function couleurVote(p: Palette, position: Position | null): string {
  switch (position) {
    case 'pour':
      return p.votePour;
    case 'contre':
      return p.voteContre;
    case 'abstention':
      return p.voteAbstention;
    default:
      return p.lineStrong;
  }
}

/** Libellé toujours accompagné de son glyphe : lisible sans la couleur. */
export const LIBELLE_VOTE: Record<Position, string> = {
  pour: '+ POUR',
  contre: '− CONTRE',
  abstention: 'Ø ABST.',
  non_votant: '· NON-VOTANT',
  absent: '· ABSENT',
};
