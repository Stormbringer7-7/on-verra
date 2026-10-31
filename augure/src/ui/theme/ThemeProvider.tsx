import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { TextStyle } from 'react-native';

import type { Position } from '@/core';
import { ECHELLES, useReglages } from '../hooks/reglages';
import { creerStyles, ORDRE_THEMES, paletteDu, THEME_PAR_DEFAUT, THEMES, type IdTheme, type Styles, type Theme } from './Themes';
import type { Palette } from './tokens';

interface ContexteTheme {
  theme: Theme;
  palette: Palette;
  styles: Styles;
  echelle: number;
}

const parDefaut = THEMES[THEME_PAR_DEFAUT];
const ThemeContext = createContext<ContexteTheme>({ theme: parDefaut, palette: parDefaut.palette, styles: creerStyles(parDefaut.palette), echelle: 1 });

/**
 * Thème de l'app : thème, contraste et taille du texte lus dans les réglages de l'appareil ;
 * `theme` et `contraste` forcent une palette (tests, aperçus).
 */
export function ThemeProvider({ theme, contraste, children }: { theme?: IdTheme; contraste?: boolean; children: ReactNode }) {
  const { reglages } = useReglages();
  const id = theme ?? reglages.theme;
  const renforce = contraste ?? reglages.contraste;
  const echelle = ECHELLES[reglages.taille];
  const valeur = useMemo<ContexteTheme>(() => {
    const palette = paletteDu(id, renforce);
    return { theme: THEMES[id], palette, styles: creerStyles(palette, echelle), echelle };
  }, [id, renforce, echelle]);
  return <ThemeContext.Provider value={valeur}>{children}</ThemeContext.Provider>;
}

/**
 * Thème actif, ses couleurs et ses styles réutilisables ; `choisir` change le thème (gardé dans les
 * réglages de l'appareil).
 */
export function useTheme() {
  const contexte = useContext(ThemeContext);
  const { modifier } = useReglages();
  return useMemo(
    () => ({
      ...contexte,
      themes: ORDRE_THEMES.map((id) => THEMES[id]),
      choisir: (id: IdTheme) => modifier({ theme: id }),
    }),
    [contexte, modifier],
  );
}

export const usePalette = () => useContext(ThemeContext).palette;

/** Styles réutilisables du thème actif (`creerStyles`, Themes.ts). */
export const useStyles = () => useContext(ThemeContext).styles;

/** Facteur de taille du texte choisi dans les réglages (1 : normale). */
export const useEchelle = () => useContext(ThemeContext).echelle;

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
