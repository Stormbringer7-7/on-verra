// Gabarit d'écran du design v4 : 5 onglets (en bas en portrait, indicateur rouge au-dessus du libellé ;
// en en-tête en paysage, soulignés) ; sur chaque page, « ‹ » revient à l'écran précédent et le fil
// d'Ariane « / » remonte la hiérarchie de l'objet (sa place, pas le chemin suivi : ui/ariane.ts) ;
// contenu défilant centré (1 200 px au plus), pied de page sur chaque écran, colonnes principale /
// latérale, états de chargement et d'erreur.

import { CommonActions, StackActions, useNavigation, useNavigationState, useRoute } from '@react-navigation/native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAller, type Onglets } from '../../navigation';
import { estOnglet, monter, ongletActif, ONGLETS, type EtatPile, type Parent } from '../ariane';
import { useTitrePage } from '../hooks/ariane';
import { useCore } from '../hooks/core';
import { useLarge } from '../hooks/miseEnPage';
import { usePalette } from '../theme/ThemeProvider';
import { fonts, LARGEUR_MAX, radius, space } from '../theme/tokens';
import { BoutonSecondaire, Label, T } from './base';

/** Nom affiché de l'app (en-tête large), comme dans le canevas. */
export const NOM_APP = 'Nos politiques ont du talent';

/** Un onglet principal. */
export type Section = keyof Onglets;

/** Sources affichées dans le pied de page de chaque écran. */
export const SOURCES_PIED = 'Données publiques : Assemblée nationale, Sénat, Légifrance, Conseil constitutionnel, HATVP, RNE · Licence Ouverte';

/**
 * Navigation principale : barre du bas en portrait (filet signal au-dessus de l'onglet actif) ;
 * en mise en page large, en-tête avec le nom de l'app et les onglets soulignés.
 */
export function Navigation({ active, onNavigate }: { active: Section; onNavigate(s: Section): void }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const large = useLarge();
  const aller = useAller();

  if (large) {
    return (
      <View style={[styles.entete, { borderBottomColor: p.line, backgroundColor: p.surface, paddingTop: insets.top }]}>
        <View style={styles.enteteContenu}>
          <Pressable accessibilityRole="link" accessibilityLabel={`${NOM_APP}, Actualité`} onPress={() => onNavigate('Accueil')} style={styles.marque}>
            <T variant="heading" style={styles.marqueTexte}>
              {NOM_APP}
            </T>
          </Pressable>
          <View accessibilityRole="tablist" accessibilityLabel="Navigation principale" style={styles.ongletsLarges}>
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
                  <T variant={actif ? 'heading' : 'body'} couleur={actif ? p.ink : p.inkSoft}>
                    {o.libelle}
                  </T>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.enteteDroite}>
            <Pressable accessibilityRole="link" onPress={aller.suivis} style={styles.enteteLien}>
              <T variant="small" ton="inkSoft">
                Suivis
              </T>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={aller.reglages} style={styles.enteteLien}>
              <T variant="small" ton="inkSoft">
                Réglages
              </T>
            </Pressable>
          </View>
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
          <Pressable key={o.cle} accessibilityRole="tab" accessibilityState={{ selected: actif }} onPress={() => onNavigate(o.cle)} style={styles.onglet}>
            <View style={[styles.indicateur, { backgroundColor: actif ? p.signal : 'transparent' }]} />
            <T variant="caption" couleur={actif ? p.ink : p.inkMuted} style={actif ? styles.ongletActif : undefined} numberOfLines={1}>
              {o.libelle}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Fil d'Ariane : parents soulignés et cliquables (on y remonte), « / », l'objet affiché en `ink`. */
export function FilAriane({ parents, ici, onMonter }: { parents: Parent[]; ici: string | undefined; onMonter(i: number): void }) {
  const p = usePalette();
  return (
    <View accessibilityRole="header" accessibilityLabel="Fil d’Ariane" style={styles.ariane}>
      {parents.map((m, i) => (
        <View key={`${i}:${m.libelle}`} style={styles.maillon}>
          {i > 0 && (
            <T variant="small" couleur={p.lineStrong} aria-hidden>
              /
            </T>
          )}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Remonter à ${m.libelle}`}
            onPress={() => onMonter(i)}
            hitSlop={8}
            style={[styles.maillonLien, { borderBottomColor: p.lineFaint }]}
          >
            <T variant="small" couleur={p.inkSoft} numberOfLines={1}>
              {m.libelle}
            </T>
          </Pressable>
        </View>
      ))}
      {ici ? (
        <View style={styles.maillon}>
          <T variant="small" couleur={p.lineStrong} aria-hidden>
            /
          </T>
          <T variant="small" numberOfLines={1} style={styles.maillonIci} accessibilityState={{ selected: true }}>
            {ici}
          </T>
        </View>
      ) : null}
    </View>
  );
}

/** « ‹ » : retour à l'écran précédent (l'historique, pas la hiérarchie). */
function BoutonRetour({ onRetour }: { onRetour(): void }) {
  const p = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Retour à l’écran précédent" onPress={onRetour} hitSlop={8} style={styles.retourLien}>
      <Svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke={p.ink} strokeWidth={1.8} aria-hidden>
        <Path d="M12.5 4.5 7 10l5.5 5.5" />
      </Svg>
    </Pressable>
  );
}

/**
 * Barre du haut d'une page : « ‹ » revient à l'écran précédent ; le fil, à côté, remonte la
 * hiérarchie (Lois / dossier / étape). Portrait : sur une ligne, défilant ; paysage : en tête du contenu.
 */
export function BarreRetour({ parents, ici, onRetour, onMonter, large }: { parents: Parent[]; ici: string | undefined; onRetour(): void; onMonter(i: number): void; large: boolean }) {
  const p = usePalette();
  if (large) {
    return (
      <View style={styles.barreLarge}>
        <BoutonRetour onRetour={onRetour} />
        {parents.length > 0 && <FilAriane parents={parents} ici={ici} onMonter={onMonter} />}
      </View>
    );
  }
  return (
    <View style={[styles.barreRetour, { borderBottomColor: p.line }]}>
      <BoutonRetour onRetour={onRetour} />
      {parents.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filPortrait}>
          <FilAriane parents={parents} ici={undefined} onMonter={onMonter} />
        </ScrollView>
      )}
    </View>
  );
}

/** Pied de page de chaque écran : Méthode et sources, Accessibilité et réglages, sources des données. */
export function PiedDePage() {
  const p = usePalette();
  const aller = useAller();
  const large = useLarge();
  return (
    <View style={[styles.pied, { borderTopColor: p.line }, large && styles.piedLarge]}>
      <View style={styles.piedLiens}>
        <Pressable accessibilityRole="link" onPress={aller.methode} style={[styles.piedLien, { borderBottomColor: p.lineStrong }]}>
          <T variant="caption" ton="ink">
            Méthode et sources
          </T>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={aller.reglages} style={[styles.piedLien, { borderBottomColor: p.lineStrong }]}>
          <T variant="caption" ton="ink">
            Accessibilité et réglages
          </T>
        </Pressable>
      </View>
      <T variant="caption" ton="inkMuted">
        {SOURCES_PIED}
      </T>
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
 * Écran : contenu défilant ; portrait : marges 20, sections espacées de 32 ; paysage : marges 32,
 * sections 40, largeur 1 200 px au plus.
 *
 * - Onglet (Actualité, Chiffres…) : la navigation est celle du navigateur d'onglets.
 * - Page empilée (Dossier, Étape…) : l'écran affiche lui-même la navigation principale (l'onglet
 *   d'origine actif), « ‹ » (retour à l'écran précédent) et le fil d'Ariane. Le fil, c'est la
 *   place de l'objet : `parents` (Lois / dossier / étape…, construits par l'écran depuis ses
 *   données) puis `titre`, l'objet lui-même (et le titre de la fenêtre web) ; toucher un maillon
 *   y remonte (`monter`, ui/ariane.ts), sans empiler.
 * - `largeur` en paysage : « pleine » jusqu'à 1 200 px, « lecture » 880 px.
 */
export function Ecran({
  children,
  titre,
  parents = [],
  largeur = 'pleine',
}: {
  children: ReactNode;
  titre?: string;
  /** Parents de l'objet affiché, du plus large au plus proche ; vide : ni fil ni retour. */
  parents?: Parent[];
  largeur?: 'lecture' | 'pleine';
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const large = useLarge();
  const route = useRoute();
  const navigation = useNavigation();
  const { source } = useCore();
  const etat = useNavigationState((s) => s as unknown as EtatPile);
  useTitrePage(route.key, titre);

  const fiche = !estOnglet(route.name);
  const active = fiche ? ongletActif(etat) : null;
  const versOnglet = (onglet: Section) => navigation.navigate('Onglets', { screen: onglet });
  const fil = fiche ? parents : [];
  const monterA = (i: number) => {
    const m = monter(etat, fil, i);
    if (m.type === 'onglet') return versOnglet(m.onglet);
    if (!m.ajouter.length) return navigation.dispatch(StackActions.pop(etat.index - m.garder + 1));
    const gardees = m.garder > 0 ? etat.routes.slice(0, m.garder) : [{ name: 'Onglets' }];
    const routes = [...gardees, ...m.ajouter.map((c) => ({ name: c.page, params: c.params ?? undefined }))];
    navigation.dispatch(CommonActions.reset({ index: routes.length - 1, routes } as Parameters<typeof CommonActions.reset>[0]));
  };
  // Retour : l'écran précédent ; ouvert sans historique (lien profond), le parent le plus proche.
  const retour = () => (navigation.canGoBack() ? navigation.goBack() : fil.length ? monterA(fil.length - 1) : versOnglet('Accueil'));
  const barre = fiche;

  return (
    <View style={[styles.racine, { backgroundColor: p.surface }]}>
      {active && large && <Navigation active={active} onNavigate={versOnglet} />}
      {!large && barre && (
        <View style={{ paddingTop: insets.top }}>
          <BarreRetour parents={fil} ici={titre} onRetour={retour} onMonter={monterA} large={false} />
        </View>
      )}
      <ScrollView
        contentContainerStyle={[
          styles.contenu,
          large && styles.contenuLarge,
          large && { maxWidth: largeur === 'pleine' ? LARGEUR_MAX : 880 },
          // Navigation en en-tête en large, barre de retour en portrait : elles prennent la marge du haut.
          { paddingTop: (large || barre ? 0 : insets.top) + space[large ? 8 : 5] },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {source === 'fixtures' && <BandeauMaquette />}
        {large && barre && <BarreRetour parents={fil} ici={titre} onRetour={retour} onMonter={monterA} large />}
        {children}
        <PiedDePage />
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
      <View style={{ gap: space[8] }}>
        <View style={{ gap: space[6] }}>{principale}</View>
        {laterale && <View style={{ gap: space[6] }}>{laterale}</View>}
      </View>
    );
  }
  return (
    <View style={styles.colonnes}>
      <View style={[styles.principale, { gap: space[8] }]}>{principale}</View>
      {laterale && <View style={styles.laterale}>{laterale}</View>}
    </View>
  );
}

/** Bloc vertical espacé (section d’écran). */
export function Bloc({ children, gap = 3, style }: { children: ReactNode; gap?: keyof typeof space; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap: space[gap] }, style]}>{children}</View>;
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

export function Erreur({ message, detail, onReessayer }: { message: string; detail?: string | null; onReessayer?: () => void }) {
  return (
    <View style={[styles.etat, { alignItems: 'stretch' }]} accessibilityRole="alert">
      <T ton="signal">{message}</T>
      {detail ? (
        <T variant="small" ton="inkMuted">
          {detail}
        </T>
      ) : null}
      {onReessayer && <BoutonSecondaire onPress={onReessayer}>Réessayer</BoutonSecondaire>}
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1 },
  contenu: { width: '100%', paddingHorizontal: space[5], paddingBottom: space[8], gap: space[8] },
  contenuLarge: { alignSelf: 'center', paddingHorizontal: space[8], paddingBottom: space[14], gap: space[10] },
  entete: { borderBottomWidth: StyleSheet.hairlineWidth },
  enteteContenu: {
    width: '100%',
    maxWidth: LARGEUR_MAX,
    alignSelf: 'center',
    minHeight: 64,
    paddingHorizontal: space[8],
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: space[8],
    rowGap: space[2],
  },
  marque: { minHeight: 44, justifyContent: 'center' },
  marqueTexte: { letterSpacing: -0.17 },
  enteteDroite: { flexDirection: 'row', alignItems: 'center', columnGap: space[5] },
  enteteLien: { minHeight: 44, justifyContent: 'center' },
  piedLiens: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[5], rowGap: space[2] },
  ongletsLarges: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[8] },
  ongletLarge: { minHeight: 64, justifyContent: 'center', borderBottomWidth: 3 },
  nav: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  onglet: { flex: 1, minHeight: 60, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  indicateur: { width: 18, height: 3, borderRadius: 2, marginBottom: space[1] },
  ongletActif: { fontFamily: fonts.sansSemiBold },
  ariane: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2, marginBottom: -space[2] },
  maillon: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%' },
  maillonLien: { minHeight: 32, justifyContent: 'center', borderBottomWidth: 1 },
  maillonIci: { fontFamily: fonts.sansMedium, flexShrink: 1 },
  barreRetour: { minHeight: 52, paddingHorizontal: space[2], paddingTop: space[1], flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  barreLarge: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: -space[2], marginLeft: -space[2] },
  filPortrait: { alignItems: 'center', paddingRight: space[3] },
  retourLien: { alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44 },
  pied: { gap: 6, paddingTop: space[6], marginTop: space[2], borderTopWidth: StyleSheet.hairlineWidth },
  piedLarge: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[6], rowGap: space[2] },
  piedLien: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', borderBottomWidth: 1 },
  bandeau: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.sm, paddingHorizontal: space[3], paddingVertical: space[2] },
  colonnes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: space[10] },
  principale: { flexGrow: 999, flexShrink: 1, flexBasis: 560, minWidth: 0 },
  laterale: { flexGrow: 1, flexShrink: 1, flexBasis: 300, minWidth: 0, gap: space[6] },
  etat: { gap: space[3], paddingVertical: space[6], alignItems: 'flex-start' },
});
