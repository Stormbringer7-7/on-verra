// Briques de mise en page des écrans Dossier (canevas « Panoptique v2 ») : colonnes principale +
// latérale en large, cartes, titres de section, avertissements en pointillés, chiffres publiés,
// lignes touchables, onglets défilants, pagination, liens vers une page officielle.

import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { Chiffre } from '@/core';
import type { Resultat } from '../../hooks/core';
import { useLarge } from '../../hooks/miseEnPage';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space, type as typo } from '../../theme/tokens';
import { BoutonSecondaire, Label, T } from '../base';
import { Chargement, Erreur } from '../Ecran';

/**
 * État d'une query (`useCommand`) : chargement, erreur avec « Réessayer », ou le contenu. Pendant
 * un rechargement (filtre, page), les données précédentes restent affichées.
 */
export function Requete<O>({
  resultat,
  children,
}: {
  resultat: Resultat<O> & { recharger(): void };
  children: (donnees: O) => ReactNode;
}) {
  if (resultat.statut === 'erreur') return <Erreur message={resultat.message} onReessayer={resultat.recharger} />;
  if (resultat.donnees === undefined) return <Chargement />;
  return <>{children(resultat.donnees)}</>;
}

/** Colonne principale et colonne latérale côte à côte en large, empilées sinon. */
export function Colonnes({ principale, laterale }: { principale: ReactNode; laterale: ReactNode }) {
  const large = useLarge();
  return (
    <View style={large ? styles.colonnesLarges : styles.colonnes}>
      <View style={[styles.principale, large && { flex: 2 }]}>{principale}</View>
      <View style={[styles.laterale, large && { flex: 1 }]}>{laterale}</View>
    </View>
  );
}

/** Carte sur `surface-raised` (« En clair », « Le vote »), ou bordée (`contour`). */
export function Carte({ children, contour = false }: { children: ReactNode; contour?: boolean }) {
  const p = usePalette();
  return (
    <View style={[styles.carte, contour ? { borderWidth: 1, borderColor: p.line } : { backgroundColor: p.surfaceRaised }]}>
      {children}
    </View>
  );
}

/** Section titrée (h2 du canevas). */
export function Section({ titre, children, action }: { titre: string; children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.enteteSection}>
        <T variant="heading" accessibilityRole="header" style={{ flexShrink: 1 }}>
          {titre}
        </T>
        {action}
      </View>
      {children}
    </View>
  );
}

/** Titre d'écran (h1) : 30 px en portrait, 44 en large. */
export function TitreEcran({ children }: { children: ReactNode }) {
  const large = useLarge();
  return (
    <T
      accessibilityRole="header"
      style={[typo.display, large ? { fontSize: 44, lineHeight: 48 } : { fontSize: 30, lineHeight: 34 }]}
    >
      {children}
    </T>
  );
}

/** Encadré en pointillés : ce que la donnée ne dit pas, ce qu'un rapprochement n'établit pas. */
export function Avertissement({ children, glyphe = 'ⓘ' }: { children: ReactNode; glyphe?: string }) {
  const p = usePalette();
  return (
    <View style={[styles.avertissement, { borderColor: p.lineStrong }]}>
      <T variant="caption" ton="inkMuted" aria-hidden>
        {glyphe}
      </T>
      <T variant="caption" ton="inkMuted" style={{ flex: 1 }}>
        {children}
      </T>
    </View>
  );
}

/** Chiffres publiés (comptes, pas des indicateurs) : libellé à gauche, valeur à droite. */
export function ListeChiffres({ chiffres }: { chiffres: Chiffre[] }) {
  const p = usePalette();
  if (!chiffres.length) return <T ton="inkMuted">Aucun chiffre publié pour l’instant.</T>;
  return (
    <View>
      {chiffres.map((c) => (
        <View key={c.libelle} style={[styles.chiffre, { borderBottomColor: p.line }]}>
          <View style={{ flex: 1 }}>
            <T ton="inkMuted">{c.libelle}</T>
            {c.detail ? <T variant="caption" ton="inkMuted">{c.detail}</T> : null}
          </View>
          <T variant="data">{typeof c.valeur === 'number' ? c.valeur.toLocaleString('fr-FR') : c.valeur}</T>
        </View>
      ))}
    </View>
  );
}

/** Ligne touchable d'une liste (≥ 52 px), filet en bas. */
export function Ligne({
  children,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const p = usePalette();
  const style = [styles.ligne, { borderBottomColor: p.line }];
  if (!onPress) return <View style={style}>{children}</View>;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={accessibilityLabel} onPress={onPress} style={style}>
      {children}
    </Pressable>
  );
}

/** Lien vers une page officielle (compte rendu, document) ; rien d'affiché sans adresse. */
export function LienExterne({ url, children }: { url: string | null; children: string }) {
  const p = usePalette();
  if (!url) return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${children} (page officielle)`}
      onPress={() => Linking.openURL(url)}
      style={[styles.pastilleSource, { borderColor: p.lineStrong }]}
    >
      <Label style={{ fontSize: 10 }}>{`${children} ↗`}</Label>
    </Pressable>
  );
}

/** Onglets d'une fiche, défilants sur mobile (6 onglets du dossier), l'actif souligné en signal. */
export function OngletsDefilants<K extends string>({
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: p.line, flexGrow: 0 }}
      contentContainerStyle={{ gap: space[6] }}
    >
      {options.map((o) => {
        const actif = o.cle === valeur;
        return (
          <Pressable
            key={o.cle}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            onPress={() => onChange(o.cle)}
            style={[styles.onglet, { borderBottomColor: actif ? p.signal : 'transparent' }]}
          >
            <Label ton={actif ? 'ink' : 'inkMuted'}>{o.libelle}</Label>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Pagination d'une `Page<T>` : position, page précédente et suivante. */
export function Pagination({
  page,
  taille,
  total,
  suivante,
  onPage,
}: {
  page: number;
  taille: number;
  total: number | null;
  suivante: number | null;
  onPage(page: number): void;
}) {
  const debut = (page - 1) * taille + 1;
  return (
    <View style={styles.pagination}>
      <Label>{total !== null ? `Page ${page} · ${debut}–${Math.min(total, page * taille)} sur ${total}` : `Page ${page}`}</Label>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {page > 1 && <BoutonSecondaire onPress={() => onPage(page - 1)}>← PRÉCÉDENTE</BoutonSecondaire>}
        {suivante !== null && <BoutonSecondaire onPress={() => onPage(suivante)}>SUIVANTE →</BoutonSecondaire>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  colonnes: { gap: space[6] },
  colonnesLarges: { flexDirection: 'row', alignItems: 'flex-start', gap: space[6] },
  principale: { gap: space[6], minWidth: 0 },
  laterale: { gap: space[6], minWidth: 0 },
  carte: { borderRadius: radius.md, padding: space[4], gap: space[3] },
  section: { gap: space[2] },
  enteteSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  avertissement: { flexDirection: 'row', gap: space[2], borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: space[3] },
  chiffre: { flexDirection: 'row', alignItems: 'baseline', gap: space[3], paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
  ligne: { minHeight: 52, paddingVertical: 10, gap: space[1], borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center' },
  pastilleSource: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', paddingHorizontal: 6, borderWidth: 1, borderRadius: radius.sm },
  onglet: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2 },
  pagination: { gap: space[2], paddingTop: space[2] },
});
