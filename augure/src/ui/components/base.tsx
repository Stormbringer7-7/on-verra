// Composants de base du design system Panoptique : typographie (`T`, `Label`, titres), cartes,
// puces, onglets de fiche, barres de répartition, icônes. Aucune donnée métier ici.

import type { ReactNode } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';

import type { Decompte } from '@/core';
import { useLarge } from '../hooks/miseEnPage';
import { aLEchelle, useEchelle, usePalette } from '../theme/ThemeProvider';
import { radius, space, type, type TypeVariant } from '../theme/tokens';

type Ton = 'ink' | 'inkSoft' | 'inkMuted' | 'signal' | 'caution';

export function T({
  variant = 'body',
  ton = 'ink',
  couleur,
  style,
  ...props
}: TextProps & { variant?: TypeVariant; ton?: Ton; couleur?: string; style?: StyleProp<TextStyle> }) {
  const p = usePalette();
  const echelle = useEchelle();
  return <Text {...props} style={[aLEchelle(type[variant], echelle), { color: couleur ?? p[ton] }, style]} />;
}

/** Titre d'écran (h1) : 30 px en portrait, 44 px en large ; `surtitre` en étiquette au-dessus. */
export function TitreEcran({ children, surtitre }: { children: ReactNode; surtitre?: ReactNode }) {
  const large = useLarge();
  return (
    <View style={{ gap: space[1] }}>
      {surtitre !== undefined && <Label>{surtitre}</Label>}
      <T variant={large ? 'screenLarge' : 'screen'} accessibilityRole="header">
        {children}
      </T>
    </View>
  );
}

/** Titre de section (h2), avec une action à droite (« TOUS LES DOSSIERS → »). */
export function TitreSection({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const large = useLarge();
  const titre = (
    <T variant={large ? 'sectionLarge' : 'section'} accessibilityRole="header" style={{ flexShrink: 1 }}>
      {children}
    </T>
  );
  if (!action) return titre;
  return (
    <View style={styles.titreAction}>
      {titre}
      {action}
    </View>
  );
}

/** Carte du design system v2 : fond `surface-raised`, rayon 10, 20 px (28 en large) ; cliquable si `onPress`. */
export function Carte({
  children,
  onPress,
  contour = false,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  /** Bordée `line` sur le fond plutôt qu'en aplat (encadrés « Explorer »). */
  contour?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const large = useLarge();
  const fond: ViewStyle = contour
    ? { borderWidth: 1, borderColor: p.line, backgroundColor: 'transparent' }
    : { backgroundColor: p.surfaceRaised };
  const forme = [styles.carte, { padding: large ? space[7] : space[5] }, fond, style];
  if (!onPress) return <View style={forme}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [forme, pressed && { opacity: 0.8 }]}
    >
      {children}
    </Pressable>
  );
}

/** Ligne de liste (64 px au moins, filet `line` en bas), cliquable si `onPress`. */
export function Ligne({ children, onPress, accessibilityLabel }: { children: ReactNode; onPress?: () => void; accessibilityLabel?: string }) {
  const p = usePalette();
  const forme = [styles.ligne, { borderBottomColor: p.line }];
  if (!onPress) return <View style={forme}>{children}</View>;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [forme, pressed && { opacity: 0.8 }]}>
      {children}
    </Pressable>
  );
}

/** Pastille de chambre « AN » / « SÉNAT » (cadre `line-strong`). */
export function PastilleChambre({ libelle }: { libelle: string }) {
  const p = usePalette();
  return (
    <View style={[styles.chambre, { borderColor: p.lineStrong }]}>
      <Label ton="ink">{libelle}</Label>
    </View>
  );
}

/** Carré creux : marque d'un objet qui n'est pas une personne (dossier, amendement, scrutin). */
export function Carre({ couleur, taille = 10 }: { couleur: string; taille?: number }) {
  return <View style={{ width: taille, height: taille, borderWidth: 1.5, borderColor: couleur }} />;
}

/** Étiquette en casse normale, sans 500 (« 577 sièges », « Scrutin n° 2214 »). */
export function Label(props: TextProps & { ton?: Ton; couleur?: string; style?: StyleProp<TextStyle> }) {
  return <T variant="label" ton="inkMuted" {...props} />;
}

/** Pastille ronde : couleur d'un vote ou d'un groupe (donnée). */
export function Pastille({ couleur, taille = 10, creuse = false }: { couleur: string; taille?: number; creuse?: boolean }) {
  return (
    <View
      style={{
        width: taille,
        height: taille,
        borderRadius: radius.full,
        backgroundColor: creuse ? 'transparent' : couleur,
        borderWidth: creuse ? 1.5 : 0,
        borderColor: couleur,
      }}
    />
  );
}

/** Barre de répartition pour / contre / abstention sur fond `surface-sunken`. */
export function Repartition({
  decompte,
  total,
  hauteur = 6,
  label,
}: {
  decompte: Decompte;
  /** Base des pourcentages ; par défaut les votes exprimés. */
  total?: number;
  hauteur?: number;
  label?: string;
}) {
  const p = usePalette();
  const base = total ?? decompte.pour + decompte.contre + decompte.abstention;
  const largeur = (n: number) => `${base ? (n / base) * 100 : 0}%` as const;
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label ?? `${decompte.pour} pour, ${decompte.contre} contre, ${decompte.abstention} abstentions`}
      style={[styles.barre, { height: hauteur, backgroundColor: p.surfaceSunken }]}
    >
      <View style={{ width: largeur(decompte.pour), backgroundColor: p.votePour }} />
      <View style={{ width: largeur(decompte.contre), backgroundColor: p.voteContre }} />
      <View style={{ width: largeur(decompte.abstention), backgroundColor: p.voteAbstention }} />
    </View>
  );
}

/** Barre à deux segments (bilan d'un élu : comme son groupe / écarts). */
export function BarreBilan({ comme, ecarts, total, label }: { comme: number; ecarts: number; total: number; label: string }) {
  const p = usePalette();
  const largeur = (n: number) => `${total ? (n / total) * 100 : 0}%` as const;
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={[styles.barre, { height: 8, backgroundColor: p.surfaceSunken }]}>
      <View style={{ width: largeur(comme), backgroundColor: p.lineStrong }} />
      <View style={{ width: largeur(ecarts), backgroundColor: p.signal }} />
    </View>
  );
}

export function Segmente<K extends string>({
  options,
  valeur,
  onChange,
  label,
}: {
  options: { cle: K; libelle: string }[];
  valeur: K;
  onChange(cle: K): void;
  label: string;
}) {
  const p = usePalette();
  const large = useLarge();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.segmente, { backgroundColor: p.surfaceRaised }, large && styles.segmenteLarge]}>
      {options.map((o) => {
        const actif = o.cle === valeur;
        return (
          <Pressable
            key={o.cle}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            onPress={() => onChange(o.cle)}
            style={[styles.segment, { backgroundColor: actif ? p.ink : 'transparent', paddingHorizontal: large ? space[5] : space[3] }]}
          >
            <T variant="heading" style={styles.segmentTexte} couleur={actif ? p.surface : p.inkSoft}>
              {o.libelle}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Lien d'action en `label` signal, cible tactile ≥ 44 px. */
export function Action({ children, onPress, accessibilityLabel }: { children: ReactNode; onPress(): void; accessibilityLabel?: string }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={accessibilityLabel} onPress={onPress} style={styles.action} hitSlop={4}>
      <Label ton="signal">{children}</Label>
    </Pressable>
  );
}

/** Bouton secondaire bordé `line-strong`. */
export function BoutonSecondaire({ children, onPress, accessibilityLabel }: { children: ReactNode; onPress(): void; accessibilityLabel?: string }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={[styles.secondaire, { borderColor: p.lineStrong }]}>
      <Label ton="ink">{children}</Label>
    </Pressable>
  );
}

export function Panneau({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return <View style={[styles.panneau, { backgroundColor: p.surfaceRaised }, style]}>{children}</View>;
}

/**
 * Puce de filtre (min. 44 px). `plein` : l'active en aplat `ink` (filtres, tris) ;
 * `contour` : l'active cernée sur `surface-raised` (thèmes, ordres de classement).
 */
export function Puce({
  actif,
  onPress,
  children,
  variante = 'plein',
  accessibilityLabel,
}: {
  actif: boolean;
  onPress(): void;
  children: ReactNode;
  variante?: 'plein' | 'contour';
  accessibilityLabel?: string;
}) {
  const p = usePalette();
  const plein = variante === 'plein';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: actif }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[
        styles.puce,
        actif
          ? { backgroundColor: plein ? p.ink : p.surfaceRaised, borderColor: p.ink }
          : { backgroundColor: 'transparent', borderColor: plein ? p.lineStrong : p.line },
      ]}
    >
      <Label couleur={actif ? (plein ? p.surface : p.ink) : plein ? p.ink : p.inkMuted}>{children}</Label>
    </Pressable>
  );
}

/** Onglets d'une fiche : libellés `label`, l'actif souligné en signal. */
export function OngletsFiche<K extends string>({
  options,
  valeur,
  onChange,
  label,
}: {
  options: { cle: K; libelle: string }[];
  valeur: K;
  onChange(cle: K): void;
  label: string;
}) {
  const p = usePalette();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row' }}>
      {options.map((o) => {
        const actif = o.cle === valeur;
        return (
          <Pressable
            key={o.cle}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            onPress={() => onChange(o.cle)}
            style={[styles.ongletFiche, { borderBottomColor: actif ? p.signal : 'transparent' }]}
          >
            <Label ton={actif ? 'ink' : 'inkMuted'}>{o.libelle}</Label>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Loupe linéaire 1,5 px (iconographie du design system). */
export function IconeRecherche({ couleur, taille = 18 }: { couleur: string; taille?: number }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 16 16" fill="none" stroke={couleur} strokeWidth={1.5} aria-hidden>
      <Circle cx={7} cy={7} r={4.5} />
      <Path d="m10.5 10.5 3.5 3.5" />
    </Svg>
  );
}

/**
 * Déviation du parcours : un trait vertical (le droit commun) dont se détache une boucle latérale
 * (le détour). Linéaire 1,5 px, même iconographie que la loupe ; jamais un caractère emoji.
 */
export function IconeDeviation({ couleur, taille = 16 }: { couleur: string; taille?: number }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 16 16" fill="none" stroke={couleur} strokeWidth={1.5} aria-hidden>
      <Path d="M4 1.5v13" />
      <Path d="M4 4c5 0 8 1.5 8 4s-3 4-8 4" />
      <Circle cx={12} cy={8} r={1.25} fill={couleur} />
    </Svg>
  );
}

/** Retirer : une croix linéaire 1,5 px, même iconographie que la loupe. */
export function IconeRetirer({ couleur, taille = 12 }: { couleur: string; taille?: number }) {
  return (
    <Svg width={taille} height={taille} viewBox="0 0 16 16" fill="none" stroke={couleur} strokeWidth={1.5} aria-hidden>
      <Path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />
    </Svg>
  );
}

/**
 * Filtre posé, retirable : son libellé et une croix ; toucher la puce le retire. Pastille de
 * couleur facultative (le groupe d'une personne).
 */
export function PuceRetirable({ libelle, onRetirer, couleur }: { libelle: string; onRetirer(): void; couleur?: string | null }) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Retirer le filtre ${libelle}`}
      onPress={onRetirer}
      style={[styles.puce, styles.retirable, { backgroundColor: p.surfaceRaised, borderColor: p.ink }]}
    >
      {couleur ? <Pastille couleur={couleur} /> : null}
      <Label couleur={p.ink}>{libelle}</Label>
      <IconeRetirer couleur={p.inkMuted} />
    </Pressable>
  );
}

export function Separateur() {
  const p = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.line }} />;
}

const styles = StyleSheet.create({
  titreAction: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  carte: { borderRadius: radius.lg, gap: 14, minWidth: 0 },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  chambre: { minWidth: 52, minHeight: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: space[2] },
  barre: { flexDirection: 'row', gap: 2, overflow: 'hidden', borderRadius: radius.full },
  segmente: { flexDirection: 'row', borderRadius: radius.md, padding: space[1], gap: space[1] },
  segmenteLarge: { alignSelf: 'flex-start', maxWidth: '100%' },
  segment: { flexGrow: 1, flexBasis: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentTexte: { fontSize: 15 },
  action: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  secondaire: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: space[4] },
  panneau: { borderRadius: radius.lg, padding: space[5], gap: space[3] },
  puce: { flexShrink: 0, minHeight: 44, justifyContent: 'center', paddingHorizontal: space[4], borderWidth: 1, borderRadius: radius.full },
  retirable: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexShrink: 1, maxWidth: '100%' },
  ongletFiche: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2 },
});
