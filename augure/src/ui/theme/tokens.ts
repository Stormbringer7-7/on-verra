// Design system « Panoptique » (https://claude.ai/artifact/4Qygft6thDASUWogZkYcHD), tokens.json v2,
// vérifiés contre le canevas v4 « Nos politiques ont du talent — navigation par filtres »
// (https://claude.ai/artifact/R33Yw8dE34vLyY9rbaRhDC) : mêmes fonds, encres, filets et accent ; le
// canevas ajoute `lineFaint` (case sans objet), `inkQuote` (citations), `signalHover` et le fond des
// éléments de transparence (`cautionSoft`, `cautionLine`).
// Seule source des couleurs, typos, espacements et rayons de l'app : ne pas écrire de valeur en dur ailleurs.

import type { TextStyle } from 'react-native';

export const palettes = {
  /** Salle de contrôle : thème par défaut. */
  dark: {
    surface: '#0b0d0c',
    surfaceRaised: '#141816',
    surfaceSunken: '#060707',
    /** Élément sélectionné, bloc « Après », pastille d'étiquette. */
    surfaceSoft: '#1a201e',
    line: '#222826',
    lineFaint: '#2e3633',
    lineStrong: '#5d6a64',
    ink: '#e6ece8',
    /** Texte secondaire lisible : descriptions, légendes (entre ink et inkMuted). */
    inkSoft: '#a9b4ae',
    inkMuted: '#8c9a93',
    inkQuote: '#c9d1cc',
    signal: '#ff3b30',
    signalHover: '#ff6a61',
    signalInk: '#0b0d0c',
    signalSoft: '#2a0f0d',
    votePour: '#3cc8d8',
    voteContre: '#e8590c',
    voteAbstention: '#a3aaa6',
    /** Prudence, « à vérifier », retard. Jamais pour un vote. */
    caution: '#e8a33c',
    cautionSoft: '#15130e',
    cautionLine: '#3a2e17',
    /** Contenu rédigé avec une IA (✦). */
    ai: '#9ccfd8',
    diffRemoved: '#4a2410',
    diffAdded: '#12434b',
    /** Segment du fil de filtres de l'Explorer. */
    filtreSoft: '#12333a',
    filtreLine: '#2a6f7a',
  },
  /** Dossier papier. */
  light: {
    surface: '#f2f0ea',
    surfaceRaised: '#ffffff',
    surfaceSunken: '#e6e3da',
    surfaceSoft: '#ebe8e0',
    line: '#d6d2c6',
    lineFaint: '#c8c3b5',
    lineStrong: '#8a8578',
    ink: '#121413',
    inkSoft: '#3f4541',
    inkMuted: '#565c58',
    inkQuote: '#2c302e',
    signal: '#c4190f',
    signalHover: '#9e140c',
    signalInk: '#ffffff',
    signalSoft: '#fbe1dd',
    votePour: '#0a4f5a',
    voteContre: '#c2410c',
    voteAbstention: '#6b716d',
    caution: '#8a5a00',
    cautionSoft: '#f7efdc',
    cautionLine: '#d9c08a',
    ai: '#1f6b78',
    diffRemoved: '#f7d9c9',
    diffAdded: '#cdeef2',
    filtreSoft: '#dceff2',
    filtreLine: '#1f6b78',
  },
  /** Salle de contrôle, contraste renforcé : textes plus blancs, traits plus nets, couleurs plus franches. */
  contraste: {
    surface: '#000000',
    surfaceRaised: '#0e1110',
    surfaceSunken: '#000000',
    surfaceSoft: '#1f2725',
    line: '#4a5651',
    lineFaint: '#5d6a64',
    lineStrong: '#9aa8a1',
    ink: '#ffffff',
    inkSoft: '#dde5e0',
    inkMuted: '#c2cdc7',
    inkQuote: '#eef2ef',
    signal: '#ff5a50',
    signalHover: '#ff8178',
    signalInk: '#000000',
    signalSoft: '#3a1411',
    votePour: '#5fe0ee',
    voteContre: '#ff7a2e',
    voteAbstention: '#d0d6d2',
    caution: '#ffbf5c',
    cautionSoft: '#1d1a12',
    cautionLine: '#6b5328',
    ai: '#b8e6ee',
    diffRemoved: '#6b3416',
    diffAdded: '#175a64',
    filtreSoft: '#0f3a42',
    filtreLine: '#5fb3c1',
  },
  /** Dossier papier, contraste renforcé. */
  clairContraste: {
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    surfaceSunken: '#ece9e1',
    surfaceSoft: '#e4e0d6',
    line: '#8a8578',
    lineFaint: '#9b968a',
    lineStrong: '#4a463e',
    ink: '#000000',
    inkSoft: '#1e221f',
    inkMuted: '#2f3431',
    inkQuote: '#121413',
    signal: '#a3110a',
    signalHover: '#7d0c06',
    signalInk: '#ffffff',
    signalSoft: '#f7d2cc',
    votePour: '#063c45',
    voteContre: '#9c3007',
    voteAbstention: '#3f4441',
    caution: '#6b4500',
    cautionSoft: '#f4e8cc',
    cautionLine: '#a88a4a',
    ai: '#124f59',
    diffRemoved: '#f0c3ac',
    diffAdded: '#b6e3ea',
    filtreSoft: '#cdeaef',
    filtreLine: '#0c4f5a',
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)['dark']]: string };

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
