// Design system « Panoptique » (https://claude.ai/artifact/4Qygft6thDASUWogZkYcHD), tokens.json v2,
// vérifiés contre le canevas v4 « Nos politiques ont du talent — navigation par filtres »
// (https://claude.ai/artifact/R33Yw8dE34vLyY9rbaRhDC) : mêmes fonds, encres, filets et accent ; le
// canevas ajoute `lineFaint` (case sans objet), `inkQuote` (citations), `signalHover` et le fond des
// éléments de transparence (`cautionSoft`, `cautionLine`).
// Seule source des typos, espacements et rayons de l'app ; les couleurs sont dans Themes.ts. Ne pas
// écrire de valeur en dur ailleurs.

import type { TextStyle } from 'react-native';

/** Couleurs d'un thème (valeurs dans Themes.ts). */
export interface Palette {
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  surfaceSoft: string;
  line: string;
  lineFaint: string;
  lineStrong: string;
  ink: string;
  inkSoft: string;
  inkMuted: string;
  inkQuote: string;
  signal: string;
  signalHover: string;
  signalInk: string;
  signalSoft: string;
  votePour: string;
  voteContre: string;
  voteAbstention: string;
  caution: string;
  cautionSoft: string;
  cautionLine: string;
  ai: string;
  diffRemoved: string;
  diffAdded: string;
  filtreSoft: string;
  filtreLine: string;
}

/** Familles chargées par expo-font (une famille par graisse : c'est ainsi que React Native les sélectionne). */
export const fonts = {
  sans: 'IBMPlexSansCondensed_400Regular',
  sansMedium: 'IBMPlexSansCondensed_500Medium',
  sansSemiBold: 'IBMPlexSansCondensed_600SemiBold',
  sansBold: 'IBMPlexSansCondensed_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

/**
 * Échelle v2 (paysage / portrait) : display 40/28 · title 24/20 · lead 21/18 · heading 17 · body 16 ·
 * label 14 · caption 13. Jamais de texte à lire sous 15 px ; plus de MAJUSCULES mono : étiquettes en
 * casse normale, police sans 500.
 */
export const type = {
  display: { fontFamily: fonts.sansBold, fontSize: 40, lineHeight: 48, letterSpacing: -0.4 },
  /** Titre d'écran (h1) : 28/34 en portrait, 40/48 en paysage (`screenLarge`). */
  screen: { fontFamily: fonts.sansBold, fontSize: 28, lineHeight: 34, letterSpacing: -0.28 },
  screenLarge: { fontFamily: fonts.sansBold, fontSize: 40, lineHeight: 48, letterSpacing: -0.4 },
  title: { fontFamily: fonts.sansSemiBold, fontSize: 24, lineHeight: 30 },
  /** Titre de section (h2) : 20/26 en portrait, 24/30 en paysage. */
  section: { fontFamily: fonts.sansSemiBold, fontSize: 20, lineHeight: 26 },
  sectionLarge: { fontFamily: fonts.sansSemiBold, fontSize: 24, lineHeight: 30 },
  /** Titre d'une carte (h3). */
  card: { fontFamily: fonts.sansSemiBold, fontSize: 17, lineHeight: 24 },
  heading: { fontFamily: fonts.sansSemiBold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 25 },
  /** Texte courant des fiches et des lignes de liste. */
  text: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 25 },
  /** « En clair » et phrases d'introduction : 18/27 en portrait, 21/31 en paysage (`leadLarge`). */
  lead: { fontFamily: fonts.sans, fontSize: 18, lineHeight: 27 },
  leadLarge: { fontFamily: fonts.sans, fontSize: 21, lineHeight: 31 },
  caption: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  small: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  data: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  /** Grand chiffre d'indicateur : 30 en portrait, 34 en paysage (`dataXL`). */
  dataLarge: { fontFamily: fonts.mono, fontSize: 30, lineHeight: 34, fontVariant: ['tabular-nums'] },
  dataXL: { fontFamily: fonts.mono, fontSize: 34, lineHeight: 38, fontVariant: ['tabular-nums'] },
  /** Ligne de contexte sous un titre (« AN · 15/10/2026 · Adopté 330 – 190 »). */
  meta: { fontFamily: fonts.sansMedium, fontSize: 13, lineHeight: 19 },
  /** Étiquette au-dessus d'un titre ou d'un champ, en casse normale. */
  label: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20 },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

/** Grille de 4 px. Portrait : marges 20, sections 32 ; paysage : marges 32, sections 40. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 7: 28, 8: 32, 10: 40, 12: 48, 14: 56 } as const;

/** Largeur maximale du contenu en paysage (design system v2 : 1 200 px). */
export const LARGEUR_MAX = 1200;

/** sm : segments, surlignages ; md : boutons, champs ; lg : cartes, panneaux, avertissements. */
export const radius = { none: 0, sm: 6, md: 8, lg: 10, full: 9999 } as const;

/** Opacité des groupes non sélectionnés dans l'hémicycle. */
export const ESTOMPE = 0.22;
