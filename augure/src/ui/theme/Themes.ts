// Thèmes de l'app et styles réutilisés par tous les écrans (cartes, titres, sous-titres, puces…).
// Un thème = une palette (mêmes clés que `Palette`, tokens.ts) et sa version à contraste renforcé.
// Seule source des couleurs : ne pas écrire de valeur en dur ailleurs.
//
// Oppression est la salle de contrôle d'origine (design system Panoptique, canevas v4). Vigilance,
// Propre et Techno viennent des pages « Thème · … » de la maquette v3
// (https://claude.ai/artifact/2zeVRjfihwHAcztEWmhEnL) : leur accent a été vérifié contre pour et
// contre en vision normale et daltonienne (OKLab, Machado ; ΔE ≥ 8).

import { StyleSheet } from 'react-native';

import { radius, space, type, type Palette } from './tokens';

export type IdTheme = 'oppression' | 'vigilance' | 'propre' | 'techno';

export interface Theme {
  id: IdTheme;
  nom: string;
  /** Une phrase pour le choix dans les réglages. */
  description: string;
  /** Fond sombre : barre d'état claire, navigation sombre. */
  sombre: boolean;
  palette: Palette;
  /** Contraste renforcé : textes plus francs, traits plus nets. */
  contraste: Palette;
}

/** Mélange de deux couleurs #rrggbb (t = 0 : a ; t = 1 : b). */
function melange(a: string, b: string, t: number): string {
  const c = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Contraste renforcé dérivé : encres et traits tirés vers le blanc (sombre) ou le noir (clair), fonds vers l'opposé. */
function renforcer(p: Palette, sombre: boolean): Palette {
  const encre = sombre ? '#ffffff' : '#000000';
  const fond = sombre ? '#000000' : '#ffffff';
  return {
    ...p,
    surface: melange(p.surface, fond, 0.6),
    surfaceSunken: fond,
    ink: encre,
    inkSoft: melange(p.inkSoft, encre, 0.5),
    inkMuted: melange(p.inkMuted, encre, 0.45),
    inkQuote: melange(p.inkQuote, encre, 0.6),
    line: melange(p.line, p.ink, 0.25),
    lineFaint: melange(p.lineFaint, p.ink, 0.25),
    lineStrong: melange(p.lineStrong, p.ink, 0.4),
  };
}

const oppression: Palette = {
  surface: '#0b0d0c',
  surfaceRaised: '#141816',
  surfaceSunken: '#060707',
  surfaceSoft: '#1a201e',
  line: '#222826',
  lineFaint: '#2e3633',
  lineStrong: '#5d6a64',
  ink: '#e6ece8',
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
  caution: '#e8a33c',
  cautionSoft: '#15130e',
  cautionLine: '#3a2e17',
  ai: '#9ccfd8',
  diffRemoved: '#4a2410',
  diffAdded: '#12434b',
  filtreSoft: '#12333a',
  filtreLine: '#2a6f7a',
};

/** Contraste renforcé d'Oppression, réglé à la main (design system v2). */
const oppressionContraste: Palette = {
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
};

/** Ardoise bleutée, accent jaune : Oppression ravivée, rouge et orange « contre » ne se confondent plus. */
const vigilance: Palette = {
  surface: '#0c1114',
  surfaceRaised: '#151d22',
  surfaceSunken: '#070b0d',
  surfaceSoft: '#1f2a31',
  line: '#24313a',
  lineFaint: '#32424c',
  lineStrong: '#61767e',
  ink: '#f1f5f4',
  inkSoft: '#b8c7ca',
  inkMuted: '#93a7ad',
  inkQuote: '#d6e0e1',
  signal: '#f2c230',
  signalHover: '#ffd75e',
  signalInk: '#0c1114',
  signalSoft: '#3a2f0c',
  votePour: '#3987e5',
  voteContre: '#e8590c',
  voteAbstention: '#a3aaa6',
  // Le jaune est pris par l'accent : la prudence passe au lilas (toujours avec son libellé).
  caution: '#c58cff',
  cautionSoft: '#1a1424',
  cautionLine: '#3d2c57',
  ai: '#9ccfd8',
  diffRemoved: '#4a2410',
  diffAdded: '#0f2d4a',
  filtreSoft: '#10263a',
  filtreLine: '#2f6aa8',
};

/** Papier chaud, encre noire, accent vert sapin. */
const propre: Palette = {
  surface: '#f6f4ee',
  surfaceRaised: '#ffffff',
  surfaceSunken: '#ebe7dd',
  surfaceSoft: '#ece8de',
  line: '#e2ded3',
  lineFaint: '#d3cec1',
  lineStrong: '#9a958a',
  ink: '#1b1a17',
  inkSoft: '#4d4b45',
  inkMuted: '#6b6860',
  inkQuote: '#34322d',
  // #0f8a6a de la maquette, foncé pour lire le texte d'action (4,8:1 sur le fond).
  signal: '#0b7a5e',
  signalHover: '#08604a',
  signalInk: '#ffffff',
  signalSoft: '#ddf1ea',
  votePour: '#2a78d6',
  voteContre: '#d95926',
  voteAbstention: '#8f8b82',
  caution: '#8a5a00',
  cautionSoft: '#f7efdc',
  cautionLine: '#d9c08a',
  ai: '#1f6b78',
  diffRemoved: '#fbe0d2',
  diffAdded: '#dbe7f9',
  filtreSoft: '#dbe7f9',
  filtreLine: '#2a78d6',
};

/** Nuit indigo, accent menthe. */
const techno: Palette = {
  surface: '#0d0e1c',
  surfaceRaised: '#161830',
  surfaceSunken: '#08091a',
  surfaceSoft: '#21244a',
  line: '#252846',
  lineFaint: '#33375e',
  lineStrong: '#5f6396',
  ink: '#eef0ff',
  inkSoft: '#b5b9e0',
  inkMuted: '#9094c4',
  inkQuote: '#d5d8f5',
  signal: '#2fd6a6',
  signalHover: '#6ce6c2',
  signalInk: '#0d0e1c',
  signalSoft: '#0f3a33',
  votePour: '#4c8dff',
  voteContre: '#f07a2c',
  voteAbstention: '#a3a7c4',
  caution: '#ffc857',
  cautionSoft: '#1c1a1a',
  cautionLine: '#4a3e22',
  // Le cyan d'origine se confondait avec la menthe : lavande.
  ai: '#b5a8ff',
  diffRemoved: '#4a2410',
  diffAdded: '#132a5c',
  filtreSoft: '#132a5c',
  filtreLine: '#4c8dff',
};

export const THEMES: Record<IdTheme, Theme> = {
  oppression: {
    id: 'oppression',
    nom: 'Oppression',
    description: 'Salle de contrôle : noir, encre verte, signal rouge.',
    sombre: true,
    palette: oppression,
    contraste: oppressionContraste,
  },
  vigilance: {
    id: 'vigilance',
    nom: 'Vigilance',
    description: 'Ardoise bleutée, signal jaune ; plus lisible pour les daltoniens.',
    sombre: true,
    palette: vigilance,
    contraste: renforcer(vigilance, true),
  },
  propre: {
    id: 'propre',
    nom: 'Propre',
    description: 'Clair : papier, encre noire, signal vert sapin.',
    sombre: false,
    palette: propre,
    contraste: renforcer(propre, false),
  },
  techno: {
    id: 'techno',
    nom: 'Techno',
    description: 'Nuit indigo, signal menthe.',
    sombre: true,
    palette: techno,
    contraste: renforcer(techno, true),
  },
};

/** Ordre du choix dans les réglages. */
export const ORDRE_THEMES: IdTheme[] = ['oppression', 'vigilance', 'propre', 'techno'];

export const THEME_PAR_DEFAUT: IdTheme = 'oppression';

export const estTheme = (v: unknown): v is IdTheme => typeof v === 'string' && v in THEMES;

/** Palette d'un thème, contraste renforcé ou non. */
export const paletteDu = (id: IdTheme, contraste: boolean): Palette => (contraste ? THEMES[id].contraste : THEMES[id].palette);

/**
 * Styles réutilisés, pour une palette et une taille de texte : fond d'écran, cartes, panneaux,
 * titres, sous-titres, textes, lignes, puces, boutons, liens, badges. Les composants de base.tsx
 * les portent ; un écran les prend avec `useTheme().styles` plutôt que de refaire un style.
 */
export function creerStyles(p: Palette, echelle = 1) {
  const t = <S extends (typeof type)[keyof typeof type]>(s: S): S =>
    echelle === 1 ? s : { ...s, fontSize: Math.round(s.fontSize * echelle), lineHeight: Math.round(s.lineHeight * echelle) };
  return StyleSheet.create({
    // Fonds
    ecran: { flex: 1, backgroundColor: p.surface },
    carte: { backgroundColor: p.surfaceRaised, borderRadius: radius.lg, padding: space[5], gap: 14, minWidth: 0 },
    carteContour: { borderWidth: 1, borderColor: p.line, borderRadius: radius.lg, padding: space[5], gap: 14, minWidth: 0 },
    carteSelection: { backgroundColor: p.surfaceSoft, borderWidth: 1, borderColor: p.signal, borderRadius: radius.lg, padding: space[5], gap: 14 },
    panneau: { backgroundColor: p.surfaceRaised, borderRadius: radius.lg, padding: space[5], gap: space[3] },
    creux: { backgroundColor: p.surfaceSunken, borderRadius: radius.md },
    feuille: { backgroundColor: p.surfaceRaised, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, borderColor: p.lineFaint, padding: space[4], gap: space[4] },
    poignee: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: p.lineFaint },
    voile: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
    // Textes
    titreEcran: { ...t(type.screen), color: p.ink },
    titreSection: { ...t(type.section), color: p.ink },
    titreCarte: { ...t(type.card), color: p.ink },
    sousTitre: { ...t(type.lead), color: p.inkSoft },
    surtitre: { ...t(type.label), color: p.inkMuted },
    texte: { ...t(type.text), color: p.ink },
    texteDoux: { ...t(type.text), color: p.inkSoft },
    citation: { ...t(type.text), color: p.inkQuote },
    legende: { ...t(type.caption), color: p.inkMuted },
    label: { ...t(type.label), color: p.inkMuted },
    meta: { ...t(type.meta), color: p.inkMuted },
    donnee: { ...t(type.data), color: p.ink },
    grandChiffre: { ...t(type.dataLarge), color: p.ink },
    lien: { ...t(type.label), color: p.signal },
    // Lignes et filets
    ligne: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.line },
    separateur: { height: StyleSheet.hairlineWidth, backgroundColor: p.line },
    // Contrôles
    puce: { flexShrink: 0, minHeight: 44, justifyContent: 'center', paddingHorizontal: space[4], borderWidth: 1, borderRadius: radius.full, borderColor: p.lineStrong },
    puceActive: { backgroundColor: p.ink, borderColor: p.ink },
    bouton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, paddingHorizontal: space[5], backgroundColor: p.ink },
    boutonTexte: { ...t(type.heading), color: p.surface },
    boutonSecondaire: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: space[4], borderColor: p.lineStrong },
    boutonIcone: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: p.lineFaint },
    // Marques
    badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 24, paddingHorizontal: space[2], borderRadius: radius.full, backgroundColor: p.signalSoft },
    badgeTexte: { ...t(type.caption), fontFamily: type.label.fontFamily, color: p.signal },
    chambre: { minWidth: 52, minHeight: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: space[2], borderColor: p.lineStrong },
    // Mises en page
    pile: { gap: space[4] },
    section: { gap: space[4] },
    rangee: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
    entre: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  });
}

export type Styles = ReturnType<typeof creerStyles>;
