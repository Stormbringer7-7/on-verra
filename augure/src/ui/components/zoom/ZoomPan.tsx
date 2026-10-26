// Zoom et déplacement d'un contenu dessiné (SVG) dans un cadre fixe : molette (web), pincement et
// glissé (tactile, souris), double tap ou double clic pour zoomer ×2,5 (au maximum : retour à la
// vue entière). Aucun bouton n'est nécessaire. Sans dépendance : le système de responder et
// Animated de React Native, la molette par l'élément DOM sur le web.
//
// Une couche transparente au-dessus du contenu reçoit les gestes : les positions sont donc celles
// du cadre, et un toucher simple est rendu en coordonnées du contenu (`onTap`), à charge pour
// l'écran de trouver ce qui est dessous (geometrie.plusProche) : pas un composant par point.
// Lecteurs d'écran : la couche est « ajustable » (augmenter / diminuer = zoomer), le contenu garde
// son libellé (le dessin doit avoir une alternative textuelle : liste des groupes, des départements).

import { type ComponentRef, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { type Bornes, type Vue, VUE_INITIALE, borner, doubleTap, facteurMolette, versContenu, zoomerEn } from './geometrie';
import { useAnimationsReduites } from '../../hooks/reglages';

const NATIF = Platform.OS !== 'web';
/** Déplacement en deçà duquel un geste est un toucher (px). */
const TOLERANCE_TAP = 8;
const DELAI_DOUBLE_TAP = 300;
/** Inertie : la vue continue ce temps (ms) à la vitesse du glissé, puis s'arrête dans ses bornes. */
const INERTIE = 160;

interface Props {
  largeur: number;
  hauteur: number;
  /** Zoom maximal (×8 par défaut). */
  max?: number;
  /** Toucher simple : point du contenu (unités du cadre à l'échelle 1) et échelle courante. */
  onTap?: (x: number, y: number, echelle: number) => void;
  /** Échelle courante, à la fin de chaque geste (pour adapter le dessin). */
  onEchelle?: (echelle: number) => void;
  /** Ce que montre le contenu, lu par les lecteurs d'écran. */
  libelle: string;
  children: ReactNode;
}

type Geste =
  | { type: 'aucun' }
  | { type: 'glisse'; vue: Vue; x0: number; y0: number }
  | { type: 'pince'; vue: Vue; distance: number; cx: number; cy: number };

interface Suivi {
  t: number;
  x: number;
  y: number;
  bouge: boolean;
  doigts: number;
  /** Dernière position et son instant, pour la vitesse du glissé. */
  dernier: { t: number; x: number; y: number; vx: number; vy: number };
}

const points = (e: GestureResponderEvent) => {
  const t = e.nativeEvent.touches;
  return t && t.length ? Array.from(t).map((p) => ({ x: p.locationX, y: p.locationY })) : [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
};

export function ZoomPan({ largeur, hauteur, max = 8, onTap, onEchelle, libelle, children }: Props) {
  const bornes: Bornes = useMemo(() => ({ largeur, hauteur, min: 1, max }), [largeur, hauteur, max]);
  const [echelle] = useState(() => new Animated.Value(1));
  const [tx] = useState(() => new Animated.Value(0));
  const [ty] = useState(() => new Animated.Value(0));
  const vue = useRef<Vue>(VUE_INITIALE);
  const geste = useRef<Geste>({ type: 'aucun' });
  const suivi = useRef<Suivi | null>(null);
  const dernierTap = useRef({ t: 0, x: 0, y: 0 });
  const couche = useRef<ComponentRef<typeof View>>(null);
  // Animations réduites : le zoom au double tap saute à sa vue d'arrivée.
  const reduit = useAnimationsReduites();

  const appliquer = useCallback(
    (v: Vue, anime = false) => {
      vue.current = v;
      if (!anime || reduit) {
        echelle.setValue(v.echelle);
        tx.setValue(v.x);
        ty.setValue(v.y);
        return;
      }
      const animation = (valeur: Animated.Value, vers: number) =>
        Animated.timing(valeur, { toValue: vers, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: NATIF });
      Animated.parallel([animation(echelle, v.echelle), animation(tx, v.x), animation(ty, v.y)]).start();
    },
    [echelle, tx, ty, reduit],
  );

  const finir = useCallback(
    (v: Vue, anime = false) => {
      appliquer(borner(v, bornes), anime);
      onEchelle?.(vue.current.echelle);
    },
    [appliquer, bornes, onEchelle],
  );

  // Cadre redimensionné : la vue reste dans ses bornes.
  useEffect(() => finir(vue.current), [finir]);

  const debut = (e: GestureResponderEvent) => {
    const [p] = points(e);
    const t = e.nativeEvent.timestamp || 0;
    suivi.current = { t, x: p.x, y: p.y, bouge: false, doigts: 1, dernier: { t, x: p.x, y: p.y, vx: 0, vy: 0 } };
    geste.current = { type: 'glisse', vue: vue.current, x0: p.x, y0: p.y };
  };

  const bouger = (e: GestureResponderEvent) => {
    const s = suivi.current;
    if (!s) return;
    const ps = points(e);
    s.doigts = Math.max(s.doigts, ps.length);
    if (ps.length >= 2) {
      s.bouge = true;
      const [a, b] = ps;
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      if (geste.current.type !== 'pince') geste.current = { type: 'pince', vue: vue.current, distance, cx, cy };
      const g = geste.current;
      const zoome = zoomerEn(g.vue, distance / g.distance, g.cx, g.cy, bornes);
      appliquer(borner({ ...zoome, x: zoome.x + cx - g.cx, y: zoome.y + cy - g.cy }, bornes));
      return;
    }
    const [p] = ps;
    if (Math.hypot(p.x - s.x, p.y - s.y) > TOLERANCE_TAP) s.bouge = true;
    const t = e.nativeEvent.timestamp || s.dernier.t;
    const dt = Math.max(1, t - s.dernier.t);
    s.dernier = { t, x: p.x, y: p.y, vx: (p.x - s.dernier.x) / dt, vy: (p.y - s.dernier.y) / dt };
    if (geste.current.type !== 'glisse') geste.current = { type: 'glisse', vue: vue.current, x0: p.x, y0: p.y };
    const g = geste.current;
    if (g.vue.echelle > 1) appliquer(borner({ ...g.vue, x: g.vue.x + p.x - g.x0, y: g.vue.y + p.y - g.y0 }, bornes));
  };

  const lacher = (e: GestureResponderEvent) => {
    const s = suivi.current;
    suivi.current = null;
    geste.current = { type: 'aucun' };
    if (!s) return;
    const maintenant = e.nativeEvent.timestamp || s.t;
    if (!s.bouge && s.doigts === 1) {
      const d = dernierTap.current;
      if (maintenant - d.t < DELAI_DOUBLE_TAP && Math.hypot(d.x - s.x, d.y - s.y) < 30) {
        dernierTap.current = { t: 0, x: 0, y: 0 };
        finir(doubleTap(vue.current, s.x, s.y, bornes), true);
        return;
      }
      dernierTap.current = { t: maintenant, x: s.x, y: s.y };
      const c = versContenu(vue.current, s.x, s.y);
      onTap?.(c.x, c.y, vue.current.echelle);
      return;
    }
    const v = vue.current;
    if (v.echelle > 1 && s.doigts === 1) finir({ ...v, x: v.x + s.dernier.vx * INERTIE, y: v.y + s.dernier.vy * INERTIE }, true);
    else finir(v);
  };

  const interrompre = () => {
    suivi.current = null;
    geste.current = { type: 'aucun' };
    finir(vue.current);
  };

  // Molette (web) : zoom autour du curseur. L'élément DOM de la couche reçoit l'événement.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const noeud = couche.current as unknown as HTMLElement | null;
    if (!noeud?.addEventListener) return;
    const molette = (e: WheelEvent) => {
      e.preventDefault();
      const r = noeud.getBoundingClientRect();
      finir(zoomerEn(vue.current, facteurMolette(e.deltaY), e.clientX - r.left, e.clientY - r.top, bornes));
    };
    noeud.addEventListener('wheel', molette, { passive: false });
    return () => noeud.removeEventListener('wheel', molette);
  }, [bornes, finir]);

  const action = (nom: string) => {
    const facteur = nom === 'increment' ? 1.5 : 1 / 1.5;
    finir(zoomerEn(vue.current, facteur, largeur / 2, hauteur / 2, bornes), true);
  };

  return (
    <View style={[styles.cadre, { width: largeur, height: hauteur }]}>
      <Animated.View
        style={[styles.contenu, { width: largeur, height: hauteur, transform: [{ translateX: tx }, { translateY: ty }, { scale: echelle }] }]}
        accessibilityLabel={libelle}
        aria-label={libelle}
        role="img"
      >
        {children}
      </Animated.View>
      <View
        ref={couche}
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        // À l'échelle 1 et à un doigt, la page peut reprendre le geste (défilement vertical).
        onResponderTerminationRequest={() => vue.current.echelle <= 1 && geste.current.type !== 'pince'}
        onResponderGrant={debut}
        onResponderMove={bouger}
        onResponderRelease={lacher}
        onResponderTerminate={interrompre}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${libelle}. Zoom : molette, pincement ou double tap.`}
        accessibilityActions={[
          { name: 'increment', label: 'Zoomer' },
          { name: 'decrement', label: 'Dézoomer' },
        ]}
        onAccessibilityAction={(e) => action(e.nativeEvent.actionName)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cadre: { overflow: 'hidden', position: 'relative' },
  contenu: { transformOrigin: '0 0' },
});
