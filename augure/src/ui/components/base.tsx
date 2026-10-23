import type { ReactNode } from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';

import type { Decompte } from '@/core';
import { usePalette } from '../theme/ThemeProvider';
import { radius, space, type, type TypeVariant } from '../theme/tokens';

type Ton = 'ink' | 'inkMuted' | 'signal';

export function T({
  variant = 'body',
  ton = 'ink',
  couleur,
  style,
  ...props
}: TextProps & { variant?: TypeVariant; ton?: Ton; couleur?: string; style?: StyleProp<TextStyle> }) {
  const p = usePalette();
  return <Text {...props} style={[type[variant], { color: couleur ?? p[ton] }, style]} />;
}

/** Étiquette mono en majuscules : `577 SIÈGES`, `SCRUTIN N° 2214`. */
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
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.segmente, { borderColor: p.lineStrong }]}>
      {options.map((o) => {
        const actif = o.cle === valeur;
        return (
          <Pressable
            key={o.cle}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            onPress={() => onChange(o.cle)}
            style={[styles.segment, { backgroundColor: actif ? p.ink : 'transparent' }]}
          >
            <T variant="label" couleur={actif ? p.surface : p.inkMuted}>
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
export function BoutonSecondaire({ children, onPress }: { children: ReactNode; onPress(): void }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.secondaire, { borderColor: p.lineStrong }]}>
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

export function Separateur() {
  const p = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: p.line }} />;
}

const styles = StyleSheet.create({
  barre: { flexDirection: 'row', gap: 2, overflow: 'hidden' },
  segmente: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.sm, padding: 2, gap: 2 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  action: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  secondaire: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space[3] },
  panneau: { borderRadius: radius.md, padding: space[4], gap: space[3] },
  puce: { flexShrink: 0, minHeight: 44, justifyContent: 'center', paddingHorizontal: space[3], borderWidth: 1, borderRadius: radius.sm },
  ongletFiche: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2 },
});
