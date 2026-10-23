import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAller, type Onglets } from '../../navigation';
import { date } from '../format';
import { useCore } from '../hooks/core';
import { useFenetre, useLarge } from '../hooks/miseEnPage';
import { usePalette } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { BoutonSecondaire, IconeRecherche, Label, T } from './base';

/** Nom affiché de l'app (en-tête large). */
export const NOM_APP = 'Nos administrés ont du talent';

export type Section = 'assemblee' | 'scrutins' | 'champions' | 'recherche';

const SECTIONS: { cle: Section; libelle: string; onglet: keyof Onglets }[] = [
  { cle: 'assemblee', libelle: 'ASSEMBLÉE', onglet: 'Assemblee' },
  { cle: 'scrutins', libelle: 'SCRUTINS', onglet: 'Scrutins' },
  { cle: 'champions', libelle: 'CHAMPIONS', onglet: 'Champions' },
  { cle: 'recherche', libelle: 'RECHERCHE', onglet: 'Recherche' },
];

/**
 * Navigation : barre du bas sur mobile (filet signal au-dessus de l'onglet actif) ;
 * en mise en page large, en-tête avec le nom de l'app, les onglets soulignés et un accès à la recherche.
 */
export function Navigation({ active, onNavigate }: { active: Section; onNavigate?: (s: Section) => void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const aller = useAller();
  const large = useLarge();
  const fenetre = useFenetre();
  const naviguer = (s: (typeof SECTIONS)[number]) => (onNavigate ? onNavigate(s.cle) : aller.onglet(s.onglet));

  if (large) {
    return (
      <View style={[styles.entete, { borderBottomColor: p.line, backgroundColor: p.surface, paddingTop: insets.top }]}>
        <View style={styles.enteteContenu}>
          <Label ton="ink" style={{ letterSpacing: 1.2, fontSize: 12 }}>
            {NOM_APP.toUpperCase()}
          </Label>
          <View style={styles.ongletsLarges}>
            {SECTIONS.map((s) => {
              const actif = s.cle === active;
              return (
                <Pressable
                  key={s.cle}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: actif }}
                  onPress={() => naviguer(s)}
                  style={[styles.ongletLarge, { borderBottomColor: actif ? p.signal : 'transparent' }]}
                >
                  <Label couleur={actif ? p.signal : p.inkMuted}>{s.libelle}</Label>
                </Pressable>
              );
            })}
          </View>
          {fenetre.recherche && (
          <Pressable
            accessibilityRole="search"
            onPress={() => naviguer(SECTIONS[3])}
            style={[styles.champRecherche, { backgroundColor: p.surfaceSunken, borderColor: p.lineStrong }]}
          >
            <IconeRecherche couleur={p.inkMuted} taille={16} />
            <T ton="inkMuted">Député, texte, thème…</T>
          </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.nav, { borderTopColor: p.line, backgroundColor: p.surfaceRaised, paddingBottom: insets.bottom }]}>
      {SECTIONS.map((s) => {
        const actif = s.cle === active;
        return (
          <Pressable
            key={s.cle}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
            onPress={() => naviguer(s)}
            style={[styles.onglet, { borderTopColor: actif ? p.signal : 'transparent' }]}
          >
            <Label couleur={actif ? p.signal : p.inkMuted} style={styles.ongletTexte}>
              {s.libelle}
            </Label>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Écran : contenu défilant, marges de 16 px (24 en large), sections espacées de 24 px.
 * `section` : affiche la navigation (écrans de détail, hors onglets), en bas sur mobile, en haut en large.
 * `largeur` en mise en page large : « lecture » centre une colonne lisible, « pleine » va jusqu'à 1 280 px.
 */
export function Ecran({
  children,
  section,
  largeur = 'lecture',
}: {
  children: ReactNode;
  section?: Section;
  largeur?: 'lecture' | 'pleine';
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const large = useLarge();
  return (
    <View style={[styles.racine, { backgroundColor: p.surface }]}>
      {section && large && <Navigation active={section} />}
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          large && styles.contenuLarge,
          large && { maxWidth: largeur === 'pleine' ? 1280 : 880 },
          { paddingTop: (large && section ? 0 : insets.top) + space[large ? 6 : 4] },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {section && !large && <Navigation active={section} />}
    </View>
  );
}

/** Lien retour : chevron + étiquette (« HÉMICYCLE », « RETOUR »). */
export function Retour({ libelle = 'RETOUR' }: { libelle?: string }) {
  const p = usePalette();
  const aller = useAller();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={aller.retour}
      style={styles.retour}
    >
      <Svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke={p.inkMuted} strokeWidth={1.5} aria-hidden>
        <Path d="M10 3 5 8l5 5" />
      </Svg>
      <Label>{libelle}</Label>
    </Pressable>
  );
}

/** Ligne de source, sous chaque décompte. */
export function Source({ precision }: { precision?: string }) {
  const { demarrage } = useCore();
  const base = demarrage.statut === 'pret' ? demarrage.base : null;
  return (
    <View style={{ gap: space[1] }}>
      <T variant="caption" ton="inkMuted">
        Source : open data de l’Assemblée nationale via on-verra
        {base?.date ? ` · mis à jour le ${date(base.date)}` : ''}
        {precision ? ` · ${precision}` : ''}
      </T>
      {base?.avertissement && (
        <T variant="caption" ton="signal">
          {base.avertissement}
        </T>
      )}
    </View>
  );
}

export function Chargement({ libelle = 'CHARGEMENT' }: { libelle?: string }) {
  const p = usePalette();
  return (
    <View style={styles.etat}>
      <ActivityIndicator color={p.inkMuted} />
      <Label>{libelle}</Label>
    </View>
  );
}

export function Erreur({ message, onReessayer }: { message: string; onReessayer?: () => void }) {
  return (
    <View style={[styles.etat, { alignItems: 'stretch' }]}>
      <T ton="signal">{message}</T>
      {onReessayer && <BoutonSecondaire onPress={onReessayer}>RÉESSAYER</BoutonSecondaire>}
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1 },
  contenu: { paddingHorizontal: space[4], paddingBottom: space[6], gap: space[6] },
  contenuLarge: { width: '100%', alignSelf: 'center', paddingHorizontal: space[6], paddingBottom: space[8] },
  entete: { borderBottomWidth: StyleSheet.hairlineWidth },
  enteteContenu: {
    width: '100%',
    maxWidth: 1280,
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
  ongletsLarges: { flexDirection: 'row', columnGap: 28 },
  ongletLarge: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2 },
  champRecherche: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: 40,
    minWidth: 220,
    paddingHorizontal: space[3],
    borderWidth: 1,
    borderRadius: radius.sm,
  },
  nav: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  onglet: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', borderTopWidth: 2 },
  // Quatre onglets : étiquettes plus serrées (maquette : 10 px, 0,06 em).
  ongletTexte: { fontSize: 10, letterSpacing: 0.6 },
  retour: { flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 44, alignSelf: 'flex-start' },
  etat: { gap: space[3], paddingVertical: space[6], alignItems: 'flex-start' },
});
