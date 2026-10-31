// Mouvement de la maquette v3 (planche « Icônes ») : une seule courbe, cubic-bezier(.2, .8, .2, 1) ;
// 120 ms à l'appui (échelle 0,97), 220 ms pour un changement d'état, 280 ms pour l'apparition en
// cascade (+40 ms par élément), 320 ms pour une feuille, 400 ms pour une barre qui pousse ; halo de
// 1,6 s sur l'étape en cours. Animations réduites (réglage ou système) : tout est immédiat.
// Animated et LayoutAnimation de React Native seulement, sans dépendance.

import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, LayoutAnimation, Platform, Pressable, UIManager, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useAnimationsReduites } from '../hooks/reglages';

export const COURBE = Easing.bezier(0.2, 0.8, 0.2, 1);
export const DUREES = { appui: 120, etat: 220, cascade: 280, pas: 40, feuille: 320, barre: 400, halo: 1600 } as const;

const natif = Platform.OS !== 'web';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);

/** À appeler juste avant un changement de mise en page (pli, filtre) : le changement est animé. */
export function animerMiseEnPage(reduites: boolean) {
  if (reduites) return;
  LayoutAnimation.configureNext(LayoutAnimation.create(DUREES.etat, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
}

/** Apparition en cascade : fondu et montée de 8 px, décalée de 40 ms par rang. */
export function Apparition({ rang = 0, children, style }: { rang?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduites = useAnimationsReduites();
  const [v] = useState(() => new Animated.Value(reduites ? 1 : 0));
  useEffect(() => {
    if (reduites) return v.setValue(1);
    const a = Animated.timing(v, { toValue: 1, duration: DUREES.cascade, delay: rang * DUREES.pas, easing: COURBE, useNativeDriver: natif });
    a.start();
    return () => a.stop();
  }, [reduites, rang, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** Feuille qui monte du bas (320 ms). */
export function Montee({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduites = useAnimationsReduites();
  const [v] = useState(() => new Animated.Value(reduites ? 1 : 0));
  useEffect(() => {
    if (reduites) return v.setValue(1);
    Animated.timing(v, { toValue: 1, duration: DUREES.feuille, easing: COURBE, useNativeDriver: natif }).start();
  }, [reduites, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });
  return <Animated.View style={[style, { transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** Halo qui pulse autour de l'étape en cours (1,6 s) ; immobile en animations réduites. */
export function Halo({ couleur, taille, style }: { couleur: string; taille: number; style?: StyleProp<ViewStyle> }) {
  const reduites = useAnimationsReduites();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduites) return;
    const boucle = Animated.loop(Animated.timing(v, { toValue: 1, duration: DUREES.halo, easing: Easing.out(Easing.quad), useNativeDriver: natif }));
    boucle.start();
    return () => boucle.stop();
  }, [reduites, v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const opacity = reduites ? 0.35 : v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      aria-hidden
      style={[{ position: 'absolute', width: taille, height: taille, borderRadius: taille / 2, backgroundColor: couleur, opacity, transform: [{ scale }] }, style]}
    />
  );
}

/** Barre qui pousse de 0 à sa largeur (400 ms) ; `fraction` entre 0 et 1. */
export function BarreQuiPousse({ fraction, couleur, style }: { fraction: number; couleur: string; style?: StyleProp<ViewStyle> }) {
  const reduites = useAnimationsReduites();
  const [v] = useState(() => new Animated.Value(reduites ? fraction : 0));
  useEffect(() => {
    if (reduites) return v.setValue(fraction);
    Animated.timing(v, { toValue: fraction, duration: DUREES.barre, easing: COURBE, useNativeDriver: false }).start();
  }, [fraction, reduites, v]);
  const width = v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return <Animated.View style={[{ height: '100%', backgroundColor: couleur, width }, style]} />;
}

/** Pressable qui s'enfonce à l'appui (échelle 0,97, 120 ms par le style pressé). */
export function Appui({ style, ...props }: PressableProps & { style?: StyleProp<ViewStyle> }) {
  const reduites = useAnimationsReduites();
  return <Pressable {...props} style={({ pressed }) => [style, pressed && !reduites && { transform: [{ scale: 0.97 }], opacity: 0.9 }]} />;
}
