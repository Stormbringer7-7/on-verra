import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type ScrollViewInstance,
} from 'react-native';
import Svg, { Circle, G, Rect, Text as SvgText } from 'react-native-svg';

import type { MembreAssemblee } from '@/core';
import { couleurVote, usePalette } from '../theme/ThemeProvider';
import { ESTOMPE, fonts, radius, space, type Palette } from '../theme/tokens';
import { Label } from './base';
import { disposerSieges, RAPPORT, type PointSiege } from './disposition';

export type ModeHemicycle = 'groupes' | 'vote';

export interface HemicycleZoomRef {
  /** Zoome (×2) sur le barycentre de ces sièges : ceux d'un groupe. */
  zoomerSur(indices: number[]): void;
  /** Zoome jusqu'aux noms sur un siège. */
  zoomerSurSiege(index: number): void;
}

const MARGE = 24;
/** Espacement entre deux sièges voisins, en unités de la géométrie (≈ π × 172 / 75 sièges par rang). */
const ESPACEMENT = 7.2;
/** Seuils en pixels réels : ils valent pour un téléphone comme pour un grand écran. */
const RAYON_INITIALES = 8;
const ESPACEMENT_NOMS = 58;
const ESPACEMENT_MAX = 96;
const RAYON_MAX = 14;

const nomCourt = (m: MembreAssemblee) => (m.nom.length > 12 ? `${m.nom.slice(0, 11)}.` : m.nom);
const initiales = (m: MembreAssemblee) => `${m.prenom.charAt(0)}${m.nom.replace(/^(de |d'|du |le |la )/i, '').charAt(0)}`;
const format = (z: number) => `×${(Math.round(z * 10) / 10).toString().replace('.', ',')}`;

/**
 * Hémicycle zoomable : pincement, Ctrl + molette (ancrée sous le curseur) ou −/+.
 * Points petits : toucher un député le sélectionne et zoome jusqu'aux noms.
 * Initiales visibles : toucher un député ouvre sa fiche.
 * Mode groupes : couleur officielle du groupe (une donnée). Mode vote : couleur du vote du dernier scrutin.
 */
export const HemicycleZoom = forwardRef<
  HemicycleZoomRef,
  {
    membres: MembreAssemblee[];
    couleurs: Map<string, string | null>;
    mode: ModeHemicycle;
    groupe: string | null;
    depute: string | null;
    hauteur?: number;
    onSelection(index: number): void;
    onOuvrir(index: number): void;
  }
>(function HemicycleZoom({ membres, couleurs, mode, groupe, depute, hauteur = 360, onSelection, onOuvrir }, ref) {
  const p = usePalette();
  const [largeur, setLargeur] = useState(0);
  const [zoom, setZoom] = useState(1);
  const cadre = useRef<ComponentRef<typeof View>>(null);
  const vertical = useRef<ScrollViewInstance>(null);
  const horizontal = useRef<ScrollViewInstance>(null);
  const defilement = useRef({ x: 0, y: 0 });
  /** Point du plan (fractions 0 à 1) à placer sous l'ancre (pixels du cadre) une fois le zoom appliqué. */
  const aPlacer = useRef<{ fx: number; fy: number; ax: number; ay: number } | null>(null);
  const pincement = useRef<{ distance: number; zoom: number } | null>(null);

  const base = Math.max(1, largeur - 2 * MARGE);
  const echelle = base / 358;
  const { sieges, rayonPoint } = useMemo(() => disposerSieges(membres.length, base), [membres.length, base]);
  const zoomPour = (espacement: number) => Math.max(1, espacement / (ESPACEMENT * echelle));
  const zoomMax = Math.max(4, zoomPour(ESPACEMENT_MAX));
  const zoomNoms = zoomPour(ESPACEMENT_NOMS);
  const r = Math.min(rayonPoint * zoom, RAYON_MAX);
  const initialesVisibles = r >= RAYON_INITIALES;
  const nomsVisibles = zoom >= zoomNoms;
  const plan = { l: base * zoom + 2 * MARGE, h: Math.max(hauteur, base * RAPPORT * zoom + 2 * MARGE + (nomsVisibles ? 24 : 0)) };

  useEffect(() => {
    const c = aPlacer.current;
    if (!c) return;
    aPlacer.current = null;
    horizontal.current?.scrollTo({ x: Math.max(0, c.fx * plan.l - c.ax), animated: false });
    vertical.current?.scrollTo({ y: Math.max(0, c.fy * plan.h - c.ay), animated: false });
  }, [zoom, plan.l, plan.h]);

  /** Zoome en gardant le point (fx, fy) du plan sous l'ancre (par défaut : le centre du cadre). */
  const zoomer = (z: number, fx?: number, fy?: number, ancre?: { x: number; y: number }) => {
    const cible = Math.max(1, Math.min(zoomMax, Math.round(z * 20) / 20));
    const a = ancre ?? { x: largeur / 2, y: hauteur / 2 };
    aPlacer.current = {
      fx: fx ?? (defilement.current.x + a.x) / plan.l,
      fy: fy ?? (defilement.current.y + a.y) / plan.h,
      ax: a.x,
      ay: a.y,
    };
    setZoom(cible);
  };
  /** Fraction du plan d'un point de la géométrie, au zoom donné. */
  const fraction = (s: PointSiege, z: number) => ({
    fx: (s.x * z + MARGE) / (base * z + 2 * MARGE),
    fy: (s.y * z + MARGE) / (base * RAPPORT * z + 2 * MARGE),
  });
  const versSiege = (i: number, z: number) => {
    const { fx, fy } = fraction(sieges[i], z);
    zoomer(z, fx, fy);
  };

  useImperativeHandle(ref, () => ({
    zoomerSur(indices) {
      const points = indices.map((i) => sieges[i]).filter(Boolean);
      if (!points.length) return;
      const centre = {
        x: points.reduce((s, q) => s + q.x, 0) / points.length,
        y: points.reduce((s, q) => s + q.y, 0) / points.length,
      };
      const { fx, fy } = fraction(centre, 2);
      zoomer(2, fx, fy);
    },
    zoomerSurSiege(i) {
      if (sieges[i]) versSiege(i, Math.max(zoom, zoomNoms));
    },
  }));

  // Web : Ctrl + molette (et le pincement des trackpads, qui l'émule) zoome sous le curseur.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const noeud = cadre.current as unknown as HTMLElement | null;
    if (!noeud?.addEventListener) return;
    const molette = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = noeud.getBoundingClientRect();
      zoomer(zoom * Math.exp(-e.deltaY * 0.01), undefined, undefined, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    noeud.addEventListener('wheel', molette, { passive: false });
    return () => noeud.removeEventListener('wheel', molette);
  });

  const toucher = (i: number) => {
    if (initialesVisibles) {
      onOuvrir(i);
      return;
    }
    onSelection(i);
    versSiege(i, zoomNoms);
  };

  const distance = (e: GestureResponderEvent) => {
    const [a, b] = e.nativeEvent.touches;
    return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
  };

  const police = Math.min(12, 9 + r / 6);
  const selection = membres.findIndex((m) => m.acteur === depute);

  return (
    <View
      ref={cadre}
      onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
      onTouchStart={(e) => {
        if (e.nativeEvent.touches.length === 2) pincement.current = { distance: distance(e), zoom };
      }}
      onTouchMove={(e) => {
        const pi = pincement.current;
        if (pi && e.nativeEvent.touches.length === 2) zoomer((pi.zoom * distance(e)) / pi.distance);
      }}
      onTouchEnd={() => (pincement.current = null)}
      style={[styles.cadre, { height: hauteur, backgroundColor: p.surfaceSunken, borderColor: p.line }]}
    >
      {largeur > 0 && (
        <ScrollView
          ref={vertical}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(e) => (defilement.current.y = e.nativeEvent.contentOffset.y)}
        >
          <ScrollView
            ref={horizontal}
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={(e) => (defilement.current.x = e.nativeEvent.contentOffset.x)}
          >
            <View accessibilityLabel={`Hémicycle, ${membres.length} députés en fonction`}>
              <Svg width={plan.l} height={plan.h}>
                {sieges.map((s, i) => (
                  <Siege
                    key={membres[i].acteur}
                    membre={membres[i]}
                    x={s.x * zoom + MARGE}
                    y={s.y * zoom + MARGE}
                    r={r}
                    police={police}
                    avecInitiales={initialesVisibles}
                    avecNom={nomsVisibles}
                    fond={mode === 'vote' ? couleurVote(p, membres[i].position) : ((membres[i].groupe && couleurs.get(membres[i].groupe!)) ?? p.inkMuted)}
                    estompe={groupe !== null && membres[i].groupe !== groupe}
                    absent={mode === 'vote' && (membres[i].position === 'absent' || membres[i].position === 'non_votant')}
                    p={p}
                    index={i}
                    onPress={toucher}
                  />
                ))}
                {selection >= 0 && sieges[selection] && (
                  <Selection
                    membre={membres[selection]}
                    x={sieges[selection].x * zoom + MARGE}
                    y={sieges[selection].y * zoom + MARGE}
                    r={r}
                    etiquette={!nomsVisibles}
                    p={p}
                  />
                )}
              </Svg>
            </View>
          </ScrollView>
        </ScrollView>
      )}

      <View style={[styles.note, { backgroundColor: p.surface }]} pointerEvents="none">
        <Label>
          {!initialesVisibles
            ? Platform.OS === 'web'
              ? 'CLIQUEZ UN SIÈGE · CTRL + MOLETTE POUR ZOOMER'
              : 'TOUCHEZ UN SIÈGE · PINCEZ POUR ZOOMER'
            : 'TOUCHEZ UN DÉPUTÉ POUR SA FICHE'}
        </Label>
      </View>
      <View style={styles.boutons}>
        <BoutonZoom libelle="−" aide="Dézoomer" onPress={() => zoomer(zoom / 1.6)} p={p} />
        <View style={[styles.niveau, { backgroundColor: p.surface }]}>
          <Label>{format(zoom)}</Label>
        </View>
        <BoutonZoom libelle="+" aide="Zoomer" onPress={() => zoomer(zoom * 1.6)} p={p} />
      </View>
    </View>
  );
});

function BoutonZoom({ libelle, aide, onPress, p }: { libelle: string; aide: string; onPress(): void; p: Palette }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={aide}
      onPress={onPress}
      style={[styles.bouton, { borderColor: p.lineStrong, backgroundColor: p.surfaceRaised }]}
    >
      <Label ton="ink" style={{ fontSize: 18 }}>
        {libelle}
      </Label>
    </Pressable>
  );
}

/** Un député : son siège, sa cible de toucher (plus large que le point), ses initiales puis son nom. */
const Siege = memo(function Siege({
  membre,
  x,
  y,
  r,
  police,
  avecInitiales,
  avecNom,
  fond,
  estompe,
  absent,
  p,
  index,
  onPress,
}: {
  membre: MembreAssemblee;
  x: number;
  y: number;
  r: number;
  police: number;
  avecInitiales: boolean;
  avecNom: boolean;
  fond: string;
  estompe: boolean;
  absent: boolean;
  p: Palette;
  index: number;
  onPress(index: number): void;
}) {
  return (
    <G opacity={estompe ? ESTOMPE : 1} onPress={() => onPress(index)}>
      {/* Cible : au moins ~12 px de rayon ; quasi transparente pour recevoir le toucher. */}
      <Circle cx={x} cy={y} r={Math.max(r * 1.4, 12)} fill={p.surfaceSunken} fillOpacity={0.01} />
      <Circle cx={x} cy={y} r={r} fill={fond} />
      {avecInitiales && (
        <SvgText x={x} y={y + police * 0.35} fontSize={police} fontFamily={fonts.monoMedium} textAnchor="middle" fill={absent ? p.inkMuted : p.surface}>
          {initiales(membre)}
        </SvgText>
      )}
      {avecNom && (
        <SvgText x={x} y={y + r + police + 2} fontSize={police} fontFamily={fonts.sans} textAnchor="middle" fill={p.ink}>
          {nomCourt(membre)}
        </SvgText>
      )}
    </G>
  );
});

/** Député sélectionné : anneau signal, et son nom au-dessus tant que les noms ne sont pas affichés. */
function Selection({ membre, x, y, r, etiquette, p }: { membre: MembreAssemblee; x: number; y: number; r: number; etiquette: boolean; p: Palette }) {
  const texte = `${membre.prenom} ${membre.nom}`;
  const largeur = texte.length * 6.4 + 12;
  return (
    <G pointerEvents="none">
      <Circle cx={x} cy={y} r={r + 3} fill="none" stroke={p.signal} strokeWidth={2} />
      {etiquette && (
        <>
          <Rect x={x - largeur / 2} y={y - r - 30} width={largeur} height={22} rx={radius.sm} fill={p.surfaceRaised} stroke={p.lineStrong} />
          <SvgText x={x} y={y - r - 15} fontSize={12} fontFamily={fonts.sansSemiBold} textAnchor="middle" fill={p.ink}>
            {texte}
          </SvgText>
        </>
      )}
    </G>
  );
}

const styles = StyleSheet.create({
  cadre: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  note: {
    position: 'absolute',
    left: space[3],
    bottom: space[3],
    paddingVertical: space[1],
    paddingHorizontal: space[2],
    borderRadius: radius.sm,
    opacity: 0.85,
  },
  boutons: { position: 'absolute', right: space[3], bottom: space[3], flexDirection: 'row', alignItems: 'center', gap: space[1] },
  bouton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: radius.sm },
  niveau: { minWidth: 48, minHeight: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
});
