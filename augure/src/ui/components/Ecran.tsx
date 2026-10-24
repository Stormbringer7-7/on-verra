// Gabarit d'écran du canevas « Panoptique v2 » : navigation à 5 onglets (en bas en portrait, en
// en-tête en paysage et sur grand écran), fil d'Ariane sur chaque fiche empilée, contenu défilant
// centré (1 280 px au plus), colonnes principale / latérale, états de chargement et d'erreur.

import { StackActions, useNavigation, useNavigationState, useRoute } from '@react-navigation/native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAller, type Onglets } from '../../navigation';
import { cheminAriane, estOnglet, ongletActif, ONGLETS, type EtatPile, type Maillon } from '../ariane';
import { useTitrePage, useTitres } from '../hooks/ariane';
import { useCore } from '../hooks/core';
import { useFenetre, useLarge } from '../hooks/miseEnPage';
import { usePalette } from '../theme/ThemeProvider';
import { LARGEUR_MAX, radius, space } from '../theme/tokens';
import { BoutonSecondaire, IconeRecherche, Label, T } from './base';

/** Nom affiché de l'app (en-tête large), comme dans le canevas. */
export const NOM_APP = 'Nos politiques ont du talent';

/** Un onglet principal. */
export type Section = keyof Onglets;

/**
 * Navigation principale : barre du bas en portrait (filet signal au-dessus de l'onglet actif) ;
 * en mise en page large, en-tête avec le nom de l'app, les onglets soulignés et un accès à la recherche.
 */
export function Navigation({ active, onNavigate }: { active: Section; onNavigate(s: Section): void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const large = useLarge();
  const fenetre = useFenetre();

  if (large) {
    return (
      <View style={[styles.entete, { borderBottomColor: p.line, backgroundColor: p.surface, paddingTop: insets.top }]}>
        <View accessibilityRole="tablist" accessibilityLabel="Navigation principale" style={styles.enteteContenu}>
          <Pressable accessibilityRole="link" onPress={() => onNavigate('Accueil')} style={styles.marque}>
            <Label ton="ink" style={styles.marqueTexte}>
              {NOM_APP.toUpperCase()}
            </Label>
          </Pressable>
          <View style={styles.ongletsLarges}>
            {ONGLETS.map((o) => {
              const actif = o.cle === active;
              return (
                <Pressable
                  key={o.cle}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: actif }}
                  onPress={() => onNavigate(o.cle)}
                  style={[styles.ongletLarge, { borderBottomColor: actif ? p.signal : 'transparent' }]}
                >
                  <Label couleur={actif ? p.signal : p.inkMuted}>{o.libelle}</Label>
                </Pressable>
              );
            })}
          </View>
          {fenetre.recherche && (
            <Pressable
              accessibilityRole="search"
              accessibilityLabel="Rechercher"
              onPress={() => onNavigate('Recherche')}
              style={[styles.champRecherche, { backgroundColor: p.surfaceSunken, borderColor: p.lineStrong }]}
            >
              <IconeRecherche couleur={p.inkMuted} taille={16} />
              <T ton="inkMuted">Dossier, personne, amendement…</T>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Navigation principale"
      style={[styles.nav, { borderTopColor: p.line, backgroundColor: p.surfaceRaised, paddingBottom: insets.bottom }]}
    >
      {ONGLETS.map((o) => {
        const actif = o.cle === active;
        return (
          <Pressable
            key={o.cle}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            onPress={() => onNavigate(o.cle)}
            style={[styles.onglet, { borderTopColor: actif ? p.signal : 'transparent' }]}
          >
            <T variant={actif ? 'heading' : 'body'} couleur={actif ? p.signal : p.inkMuted} style={styles.ongletTexte} numberOfLines={1}>
              {o.libelle}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Fil d'Ariane : « DOSSIERS › PROGRAMMATION ÉNERGÉTIQUE › COMMISSION AN ». */
export function FilAriane({ maillons, onAller }: { maillons: Maillon[]; onAller(m: Maillon): void }) {
  const p = usePalette();
  return (
    <View accessibilityRole="header" accessibilityLabel="Fil d’Ariane" style={styles.ariane}>
      {maillons.map((m, i) => (
        <View key={m.cle} style={styles.maillon}>
          {i > 0 && (
            <Label couleur={p.lineStrong} aria-hidden>
              ›
            </Label>
          )}
          {m.aller.type === 'ici' ? (
            <Label ton="ink" numberOfLines={1} style={styles.maillonTexte}>
              {m.libelle}
            </Label>
          ) : (
            <Pressable accessibilityRole="link" onPress={() => onAller(m)} hitSlop={8} style={styles.maillonLien}>
              <Label numberOfLines={1} style={styles.maillonTexte}>
                {m.libelle}
              </Label>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

/** Bandeau des données de maquette (EXPO_PUBLIC_SOURCE=fixtures) : jamais pris pour des faits. */
function BandeauMaquette() {
  const p = usePalette();
  return (
    <View style={[styles.bandeau, { borderColor: p.signal }]}>
      <Label ton="signal">Données fictives de maquette · aucune n’est réelle</Label>
    </View>
  );
}

/**
 * Écran : contenu défilant, marges de 16 px (24 en large), sections espacées de 20 px (24 en large).
 *
 * - Onglet (Accueil, Recherche…) : la navigation est celle du navigateur d'onglets.
 * - Fiche empilée (Dossier, Étape…) : l'écran affiche lui-même la navigation principale (l'onglet
 *   d'origine actif) et le fil d'Ariane ; `titre` est le dernier maillon de ce fil (et le titre
 *   de la fenêtre web), sinon le nom générique de la page.
 * - `largeur` en mise en page large : « pleine » jusqu'à 1 280 px (canevas), « lecture » 880 px.
 */
export function Ecran({
  children,
  titre,
  largeur = 'pleine',
  ariane = true,
}: {
  children: ReactNode;
  titre?: string;
  largeur?: 'lecture' | 'pleine';
  /** false : pas de fil d'Ariane (fiche sans parent utile). */
  ariane?: boolean;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const large = useLarge();
  const route = useRoute();
  const navigation = useNavigation();
  const { source } = useCore();
  const titres = useTitres();
  const etat = useNavigationState((s) => s as unknown as EtatPile);
  useTitrePage(route.key, titre);

  const fiche = !estOnglet(route.name);
  const active = fiche ? ongletActif(etat) : null;
  const versOnglet = (onglet: Section) => navigation.navigate('Onglets', { screen: onglet });
  const maillons = fiche && ariane ? cheminAriane(etat, { ...titres, [route.key]: titre }) : [];
  const allerAuMaillon = (m: Maillon) => {
    if (m.aller.type === 'onglet') versOnglet(m.aller.onglet);
    else if (m.aller.type === 'retirer') navigation.dispatch(StackActions.pop(m.aller.n));
  };

  return (
    <View style={[styles.racine, { backgroundColor: p.surface }]}>
      {active && large && <Navigation active={active} onNavigate={versOnglet} />}
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          large && styles.contenuLarge,
          large && { maxWidth: largeur === 'pleine' ? LARGEUR_MAX : 880 },
          // Navigation en en-tête en large : elle prend la marge de sécurité du haut.
          { paddingTop: (large ? 0 : insets.top) + space[large ? 6 : 3] },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {source === 'fixtures' && <BandeauMaquette />}
        {maillons.length > 1 && <FilAriane maillons={maillons} onAller={allerAuMaillon} />}
        {children}
      </ScrollView>
      {active && !large && <Navigation active={active} onNavigate={versOnglet} />}
    </View>
  );
}

/**
 * Colonnes du canevas : principale (≥ 560 px) et latérale (≥ 300 px) côte à côte quand la place le
 * permet, l'une sous l'autre sinon.
 */
export function Colonnes({ principale, laterale }: { principale: ReactNode; laterale?: ReactNode }) {
  const large = useLarge();
  // Portrait : une seule colonne (une base de 560 px déborderait d'un téléphone).
  if (!large) {
    return (
      <View style={{ gap: space[6] }}>
        <View style={{ gap: space[5] }}>{principale}</View>
        {laterale && <View style={{ gap: space[5] }}>{laterale}</View>}
      </View>
    );
  }
  return (
    <View style={styles.colonnes}>
      <View style={[styles.principale, { gap: space[6] }]}>{principale}</View>
      {laterale && <View style={styles.laterale}>{laterale}</View>}
    </View>
  );
}

/** Bloc vertical espacé (section d’écran). */
export function Bloc({ children, gap = 3, style }: { children: ReactNode; gap?: keyof typeof space; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap: space[gap] }, style]}>{children}</View>;
}

/** Lien retour : chevron + étiquette (« RETOUR »). */
export function Retour({ libelle = 'Retour' }: { libelle?: string }) {
  const p = usePalette();
  const aller = useAller();
  return (
    <Pressable accessibilityRole="link" onPress={aller.retour} style={styles.retour}>
      <Svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke={p.inkMuted} strokeWidth={1.5} aria-hidden>
        <Path d="M10 3 5 8l5 5" />
      </Svg>
      <Label>{libelle}</Label>
    </Pressable>
  );
}

export function Chargement({ libelle = 'Chargement' }: { libelle?: string }) {
  const p = usePalette();
  return (
    <View style={styles.etat} accessibilityRole="progressbar" accessibilityLabel={libelle}>
      <ActivityIndicator color={p.inkMuted} />
      <Label>{libelle}</Label>
    </View>
  );
}

export function Erreur({ message, onReessayer }: { message: string; onReessayer?: () => void }) {
  return (
    <View style={[styles.etat, { alignItems: 'stretch' }]} accessibilityRole="alert">
      <T ton="signal">{message}</T>
      {onReessayer && <BoutonSecondaire onPress={onReessayer}>Réessayer</BoutonSecondaire>}
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1 },
  contenu: { width: '100%', paddingHorizontal: space[4], paddingBottom: space[6], gap: space[5] },
  contenuLarge: { alignSelf: 'center', paddingHorizontal: space[6], paddingBottom: space[12], gap: space[6] },
  entete: { borderBottomWidth: StyleSheet.hairlineWidth },
  enteteContenu: {
    width: '100%',
    maxWidth: LARGEUR_MAX,
    alignSelf: 'center',
    minHeight: 60,
    paddingHorizontal: space[6],
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: space[6],
    rowGap: space[2],
  },
  marque: { minHeight: 44, justifyContent: 'center' },
  marqueTexte: { letterSpacing: 1.2, fontSize: 12 },
  ongletsLarges: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 28 },
  ongletLarge: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2 },
  champRecherche: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: 40,
    minWidth: 240,
    paddingHorizontal: space[3],
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  nav: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  onglet: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderTopWidth: 2, paddingHorizontal: 2 },
  // Cinq onglets : sans-serif 12 px (canevas).
  ongletTexte: { fontSize: 12, lineHeight: 16 },
  ariane: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[2], rowGap: space[1] },
  maillon: { flexDirection: 'row', alignItems: 'center', gap: space[2], maxWidth: '100%' },
  maillonLien: { minHeight: 28, justifyContent: 'center' },
  maillonTexte: { letterSpacing: 0.66, flexShrink: 1 },
  bandeau: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.sm, paddingHorizontal: space[3], paddingVertical: space[2] },
  colonnes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: space[6] },
  principale: { flexGrow: 999, flexShrink: 1, flexBasis: 560, minWidth: 0 },
  laterale: { flexGrow: 1, flexShrink: 1, flexBasis: 300, minWidth: 0, gap: space[5] },
  retour: { flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 44, alignSelf: 'flex-start' },
  etat: { gap: space[3], paddingVertical: space[6], alignItems: 'flex-start' },
});
