// Petits éléments des écrans Personnes et Institutions (canevas « Panoptique v2 ») : badge de
// source, puce de fonction en cours, encadré d'avertissement, ligne pressable, titre de section.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useLarge } from '../../hooks/miseEnPage';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Label, Pastille, T } from '../base';

/** Badge cerné « AN », « SÉNAT », « RNE », « HATVP ↗ » (canevas : `S.src`). */
export function Badge({ children }: { children: ReactNode }) {
  const p = usePalette();
  return (
    <View style={[styles.badge, { borderColor: p.lineStrong }]}>
      <Label style={styles.badgeTexte}>{children}</Label>
    </View>
  );
}

/** Fonction en cours dans l'en-tête, avec la pastille de son groupe si c'en est un. */
export function PuceFonction({ libelle, couleur }: { libelle: string; couleur: string | null }) {
  const p = usePalette();
  return (
    <View style={[styles.puce, { borderColor: p.lineStrong }]}>
      {couleur && <Pastille couleur={couleur} taille={8} />}
      <T variant="caption">{libelle}</T>
    </View>
  );
}

/** Encadré pointillé « ⓘ » : ce que la donnée dit et ne dit pas. */
export function Avertissement({ children, signe = 'ⓘ' }: { children: ReactNode; signe?: string }) {
  const p = usePalette();
  return (
    <View style={[styles.avertissement, { borderColor: p.lineStrong }]}>
      <T variant="caption" ton="inkMuted" aria-hidden>
        {signe}
      </T>
      <T variant="caption" ton="inkMuted" style={{ flex: 1 }}>
        {children}
      </T>
    </View>
  );
}

/** Ligne de liste séparée par un filet ; pressable si `onPress`. */
export function Ligne({ children, onPress, accessibilityLabel }: { children: ReactNode; onPress?: () => void; accessibilityLabel?: string }) {
  const p = usePalette();
  const style = [styles.ligne, { borderBottomColor: p.line }];
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={accessibilityLabel} onPress={onPress} style={style}>
      {children}
    </Pressable>
  );
}

export function TitreSection({ children }: { children: ReactNode }) {
  return (
    <T variant="heading" accessibilityRole="header" style={{ fontSize: 18, lineHeight: 26 }}>
      {children}
    </T>
  );
}

/** Carte sur `surface-raised` (canevas : `S.card`) ou cernée (`S.outline`). */
export function Carte({ children, cernee = false, style }: { children: ReactNode; cernee?: boolean; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  return (
    <View style={[styles.carte, cernee ? { borderWidth: 1, borderColor: p.line } : { backgroundColor: p.surfaceRaised }, style]}>
      {children}
    </View>
  );
}

/**
 * Deux colonnes en mise en page large (filtres ou encadrés à côté, contenu principal), empilées
 * sur mobile. `cote` passe à gauche (`coteDabord` : filtres, sur `surface-raised`) ou à droite (encadrés).
 */
export function Colonnes({ cote, principal, coteDabord = false }: { cote: ReactNode; principal: ReactNode; coteDabord?: boolean }) {
  const p = usePalette();
  const large = useLarge();
  if (!large) {
    return (
      <View style={{ gap: space[6] }}>
        {coteDabord ? cote : principal}
        {coteDabord ? principal : cote}
      </View>
    );
  }
  const colonneCote = (
    <View style={[styles.cote, coteDabord && { backgroundColor: p.surfaceRaised, borderRadius: radius.md, padding: 20 }]}>{cote}</View>
  );
  return (
    <View style={styles.colonnes}>
      {coteDabord && colonneCote}
      <View style={styles.principal}>{principal}</View>
      {!coteDabord && colonneCote}
    </View>
  );
}

const styles = StyleSheet.create({
  colonnes: { flexDirection: 'row', alignItems: 'flex-start', gap: space[6] },
  principal: { flex: 3, minWidth: 0, gap: space[6] },
  cote: { flex: 1, minWidth: 260, gap: 20 },
  badge: { minHeight: 22, paddingHorizontal: 6, borderWidth: 1, borderRadius: radius.sm, justifyContent: 'center', alignSelf: 'flex-start' },
  badgeTexte: { fontSize: 10, letterSpacing: 0.6 },
  puce: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28, paddingHorizontal: 10, borderWidth: 1, borderRadius: radius.sm },
  avertissement: { flexDirection: 'row', gap: space[2], paddingVertical: 10, paddingHorizontal: space[3], borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.sm },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  carte: { borderRadius: radius.md, padding: space[4], gap: 10 },
});
