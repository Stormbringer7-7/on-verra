// Design system « Panoptique » (https://claude.ai/artifact/4Qygft6thDASUWogZkYcHD), tokens.json v1.
// Seule source des couleurs, typos, espacements et rayons de l'app : ne pas écrire de valeur en dur ailleurs.

import type { TextStyle } from 'react-native';

export const palettes = {
  /** Salle de contrôle : thème par défaut. */
  dark: {
    surface: '#0b0d0c',
    surfaceRaised: '#141816',
    surfaceSunken: '#060707',
    line: '#222826',
    lineStrong: '#5d6a64',
    ink: '#e6ece8',
    inkMuted: '#8c9a93',
    signal: '#ff3b30',
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
    lineStrong: '#8a8578',
    ink: '#121413',
    inkMuted: '#565c58',
    signal: '#c4190f',
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
  title: { fontFamily: fonts.sansSemiBold, fontSize: 24, lineHeight: 28 },
  heading: { fontFamily: fonts.sansSemiBold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  lead: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 16 },
  data: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  dataLarge: { fontFamily: fonts.mono, fontSize: 24, lineHeight: 32, fontVariant: ['tabular-nums'] },
  /** Toujours en MAJUSCULES. */
  label: { fontFamily: fonts.monoMedium, fontSize: 11, lineHeight: 16, letterSpacing: 0.88, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 } as const;

export const radius = { none: 0, sm: 2, md: 4, full: 9999 } as const;

/** Opacité des groupes non sélectionnés dans l'hémicycle. */
export const ESTOMPE = 0.22;
