import { createContext, useContext, type ReactNode } from 'react';
import type { TextStyle } from 'react-native';

import type { Position } from '@/core';
import { ECHELLES, useReglages } from '../hooks/reglages';
import { palettes, type Palette } from './tokens';

const ThemeContext = createContext<Palette>(palettes.dark);
const EchelleContext = createContext(1);

/** Palette des réglages : thème sombre (salle de contrôle) ou clair (dossier papier), contraste renforcé ou non. */
export function paletteDes({ theme, contraste }: { theme: 'sombre' | 'clair'; contraste: boolean }): keyof typeof palettes {
  if (theme === 'clair') return contraste ? 'clairContraste' : 'light';
  return contraste ? 'contraste' : 'dark';
}

/**
 * Thème de l'app : palette et taille du texte lues dans les réglages de l'appareil ; `scheme` force
 * une palette (tests, aperçus).
 */
export function ThemeProvider({ scheme, children }: { scheme?: keyof typeof palettes; children: ReactNode }) {
  const { reglages } = useReglages();
  return (
    <ThemeContext.Provider value={palettes[scheme ?? paletteDes(reglages)]}>
      <EchelleContext.Provider value={ECHELLES[reglages.taille]}>{children}</EchelleContext.Provider>
    </ThemeContext.Provider>
  );
}

export const usePalette = () => useContext(ThemeContext);

/** Facteur de taille du texte choisi dans les réglages (1 : normale). */
export const useEchelle = () => useContext(EchelleContext);

/** Style de texte mis à l'échelle des réglages (taille et interligne). */
export function aLEchelle<S extends TextStyle>(style: S, echelle: number): S {
  if (echelle === 1) return style;
  return {
    ...style,
    ...(style.fontSize ? { fontSize: Math.round(style.fontSize * echelle) } : {}),
    ...(style.lineHeight ? { lineHeight: Math.round(style.lineHeight * echelle) } : {}),
  };
}

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
