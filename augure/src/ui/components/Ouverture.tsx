import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, StyleSheet, View } from 'react-native';

import sieges from '../../../assets/sieges.png';
import { useReglages } from '../hooks/reglages';
import { usePalette } from '../theme/ThemeProvider';

/** Même largeur que le logo du splash natif (`imageWidth` d'expo-splash-screen dans app.json). */
const TAILLE = 200;
/** Unités de assets/logo.svg (côté 1024) vers points d'écran. */
const k = TAILLE / 1024;
/** Haut de la barre au repos, dans le SVG : tout ce qui passe dessous est caché. */
const HAUT_BARRE = 726;
const DESCENTE_BARRE = 24;
const MONTEE_PUPILLE = 84;
const RAYON_PUPILLE = 72;

/**
 * Prend le relais du splash natif (logo au repos, même place, même taille) : la barre descend,
 * la pupille remonte jusqu'à être entièrement ronde, puis l'écran s'efface sur l'app.
 * `onPret` sert à masquer le splash natif une fois cette vue affichée, sans écran vide entre les deux.
 */
export function Ouverture({ onPret, onTerminee }: { onPret: () => void; onTerminee: () => void }) {
  const p = usePalette();
  const [ouverture] = useState(() => new Animated.Value(0));
  const [opacite] = useState(() => new Animated.Value(1));
  // Réglage de l'app (« Réduire les animations ») ; celui du système est lu ci-dessous.
  const reduitApp = useReglages().reglages.animationsReduites;

  useEffect(() => {
    const natif = Platform.OS !== 'web';
    let animation: Animated.CompositeAnimation | undefined;
    // Animations réduites (réglage de l'app ou du système) : l'écran s'efface sans que l'œil s'ouvre.
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((systeme) => {
        const reduit = systeme || reduitApp;
        const effacement = Animated.timing(opacite, { toValue: 0, duration: 300, useNativeDriver: natif });
        animation = reduit
          ? effacement
          : Animated.sequence([
              Animated.delay(250),
              Animated.timing(ouverture, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: natif }),
              Animated.delay(450),
              effacement,
            ]);
        animation.start(({ finished }) => finished && onTerminee());
      });
    return () => animation?.stop();
  }, [ouverture, opacite, onTerminee, reduitApp]);

  // La zone de coupe suit la barre ; la pupille y remonte de sa montée plus la descente de la barre.
  const barre = { transform: [{ translateY: ouverture.interpolate({ inputRange: [0, 1], outputRange: [0, DESCENTE_BARRE * k] }) }] };
  const pupille = {
    transform: [{ translateY: ouverture.interpolate({ inputRange: [0, 1], outputRange: [0, -(MONTEE_PUPILLE + DESCENTE_BARRE) * k] }) }],
  };

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={onPret}
      style={[StyleSheet.absoluteFill, styles.centre, { backgroundColor: p.surface, opacity: opacite }]}
    >
      <View style={styles.logo}>
        <Image source={sieges} resizeMode="contain" style={styles.sieges} />
        <Animated.View style={[styles.coupe, barre]}>
          <Animated.View style={[styles.pupille, { backgroundColor: p.signal }, pupille]} />
        </Animated.View>
        <Animated.View style={[styles.barre, { backgroundColor: p.lineStrong }, barre]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  logo: { width: TAILLE, height: TAILLE },
  // Taille explicite : sans elle, iOS garde la taille du fichier (600 px, lus comme 600 points).
  sieges: { position: 'absolute', left: 0, top: 0, width: TAILLE, height: TAILLE },
  coupe: { position: 'absolute', left: 0, top: 0, width: TAILLE, height: HAUT_BARRE * k, overflow: 'hidden' },
  pupille: {
    position: 'absolute',
    left: (512 - RAYON_PUPILLE) * k,
    top: (HAUT_BARRE - RAYON_PUPILLE) * k,
    width: 2 * RAYON_PUPILLE * k,
    height: 2 * RAYON_PUPILLE * k,
    borderRadius: RAYON_PUPILLE * k,
  },
  barre: { position: 'absolute', left: 105 * k, top: HAUT_BARRE * k, width: 814 * k, height: 12 * k },
});
