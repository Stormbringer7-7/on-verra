// Design system « Panoptique » (https://claude.ai/artifact/4Qygft6thDASUWogZkYcHD), tokens.json v1,
// vérifiés contre le canevas « Panoptique v2 — Parcours législatifs »
// (https://claude.ai/artifact/R33Yw8dE34vLyY9rbaRhDC) : mêmes fonds, encres, filets et accent ; le
// canevas ajoute `lineFaint` (case sans objet), `inkQuote` (citations) et `signalHover`.
// Seule source des couleurs, typos, espacements et rayons de l'app : ne pas écrire de valeur en dur ailleurs.

import type { TextStyle } from 'react-native';

export const palettes = {
  /** Salle de contrôle : thème par défaut. */
  dark: {
    surface: '#0b0d0c',
    surfaceRaised: '#141816',
    surfaceSunken: '#060707',
    line: '#222826',
    lineFaint: '#2e3633',
    lineStrong: '#5d6a64',
    ink: '#e6ece8',
    inkMuted: '#8c9a93',
    inkQuote: '#c9d1cc',
    signal: '#ff3b30',
    signalHover: '#ff6a61',
    signalInk: '#0b0d0c',
    signalSoft: '#2a0f0d',
    votePour: '#3cc8d8',
    voteContre: '#e8590c',
    voteAbstention: '#a3aaa6',
  },
  /** Dossier papier. */
  light: {
    surface: '#f2f0ea',
    surfaceRaised: '#ffffff',
    surfaceSunken: '#e6e3da',
    line: '#d6d2c6',
    lineFaint: '#c8c3b5',
    lineStrong: '#8a8578',
    ink: '#121413',
    inkMuted: '#565c58',
    inkQuote: '#2c302e',
    signal: '#c4190f',
    signalHover: '#9e140c',
    signalInk: '#ffffff',
    signalSoft: '#fbe1dd',
    votePour: '#0a4f5a',
    voteContre: '#c2410c',
    voteAbstention: '#6b716d',
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)['dark']]: string };

/** Familles chargées par expo-font (une famille par graisse : c'est ainsi que React Native les sélectionne). */
export const fonts = {
  sans: 'IBMPlexSansCondensed_400Regular',
  sansSemiBold: 'IBMPlexSansCondensed_600SemiBold',
  sansBold: 'IBMPlexSansCondensed_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

export const type = {
  display: { fontFamily: fonts.sansBold, fontSize: 40, lineHeight: 40, letterSpacing: -0.4 },
  /** Titre d'écran (canevas : 30/34 en portrait, 44/48 en paysage : `screenLarge`). */
  screen: { fontFamily: fonts.sansBold, fontSize: 30, lineHeight: 34, letterSpacing: -0.3 },
  screenLarge: { fontFamily: fonts.sansBold, fontSize: 44, lineHeight: 48, letterSpacing: -0.44 },
  title: { fontFamily: fonts.sansSemiBold, fontSize: 24, lineHeight: 28 },
  /** Titre de section (canevas : 18 px en portrait, 20 px en paysage). */
  section: { fontFamily: fonts.sansSemiBold, fontSize: 18, lineHeight: 26 },
  sectionLarge: { fontFamily: fonts.sansSemiBold, fontSize: 20, lineHeight: 26 },
  /** Titre d'une carte de dossier. */
  card: { fontFamily: fonts.sansSemiBold, fontSize: 18, lineHeight: 24 },
  heading: { fontFamily: fonts.sansSemiBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  /** Texte courant des fiches et des lignes de liste. */
  text: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22 },
  lead: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
  small: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  data: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  dataLarge: { fontFamily: fonts.mono, fontSize: 24, lineHeight: 32, fontVariant: ['tabular-nums'] },
  /** Ligne de contexte mono sous un titre (« AN · 15/10/2026 · ADOPTÉ 330 – 190 »). */
  meta: { fontFamily: fonts.mono, fontSize: 11, lineHeight: 16, letterSpacing: 0.44 },
  /** Toujours en MAJUSCULES. */
  label: { fontFamily: fonts.monoMedium, fontSize: 11, lineHeight: 16, letterSpacing: 0.88, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 12: 48 } as const;

/** Largeur maximale du contenu en mise en page large (canevas : 1 280 px). */
export const LARGEUR_MAX = 1280;

export const radius = { none: 0, sm: 2, md: 4, full: 9999 } as const;

/** Opacité des groupes non sélectionnés dans l'hémicycle. */
export const ESTOMPE = 0.22;
