// Bande des jours de l'Actualité (planche « Main ») : sept semaines défilables à l'horizontale
// autour du jour choisi, un point sous chaque jour qui a au moins un élément publié, aujourd'hui
// souligné, le jour choisi sur un fond qui glisse (220 ms, immédiat en animations réduites). Au-dessus :
// la semaine du jour choisi et l'icône qui déploie le calendrier.

import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewInstance,
} from "react-native";

import { useAnimationsReduites } from "../../hooks/reglages";
import { usePalette, useStyles } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { T } from "../base";
import { Icone } from "../Icone";
import { Appui, COURBE, DUREES } from "../mouvement";
import {
  type JoursConnus,
  joursDeLaBande,
  jourCourt,
  jourLong,
  libelleSemaine,
  pointDuJour,
} from "./jours";

const LARGEUR = 51;

export function BandeJours({
  choisi,
  aujourdhui,
  connus,
  onChoisir,
  onCalendrier,
}: {
  choisi: string;
  aujourdhui: string;
  connus: JoursConnus;
  onChoisir(jour: string): void;
  onCalendrier(): void;
}) {
  const p = usePalette();
  const s = useStyles();
  const reduites = useAnimationsReduites();
  const jours = joursDeLaBande(choisi);
  const index = Math.max(0, jours.indexOf(choisi));
  const defile = useRef<ScrollViewInstance>(null);
  const [largeur, setLargeur] = useState(0);
  const [position] = useState(() => new Animated.Value(index * LARGEUR));

  // Le jour choisi glisse sous son fond et reste au milieu de la bande.
  useEffect(() => {
    if (reduites) position.setValue(index * LARGEUR);
    else
      Animated.timing(position, {
        toValue: index * LARGEUR,
        duration: DUREES.etat,
        easing: COURBE,
        useNativeDriver: false,
      }).start();
    if (largeur)
      defile.current?.scrollTo({
        x: Math.max(0, index * LARGEUR - (largeur - LARGEUR) / 2),
        animated: !reduites,
      });
  }, [index, largeur, position, reduites, choisi]);

  return (
    <View style={[styles.bande, { borderColor: p.line }]}>
      <View style={s.entre}>
        <T variant="label" ton="inkSoft">
          {libelleSemaine(choisi)}
        </T>
        <Appui
          accessibilityRole="button"
          accessibilityLabel="Déployer le calendrier"
          onPress={onCalendrier}
          style={s.boutonIcone}
        >
          <Icone nom="odj" couleur={p.ink} taille={18} />
        </Appui>
      </View>
      <ScrollView
        ref={defile}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => setLargeur(e.nativeEvent.layout.width)}
        accessibilityLabel="Jours, défiler pour changer de semaine"
      >
        <View style={styles.jours}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.fond,
              {
                backgroundColor: p.surfaceSoft,
                transform: [{ translateX: position }],
              },
            ]}
          />
          {jours.map((j) => {
            const { jour, numero } = jourCourt(j);
            const sel = j === choisi;
            const auj = j === aujourdhui;
            const point = pointDuJour(connus, j);
            return (
              <Pressable
                key={j}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
                aria-selected={sel}
                accessibilityLabel={`${jourLong(j)}${point === "oui" ? ", au moins un élément" : ""}${auj ? ", aujourd’hui" : ""}`}
                onPress={() => onChoisir(j)}
                style={({ pressed }) => [
                  styles.jour,
                  pressed && !reduites && { transform: [{ scale: 0.94 }] },
                ]}
              >
                <T variant="caption" couleur={sel ? p.ink : p.inkMuted}>
                  {jour}
                </T>
                <T
                  variant="data"
                  style={auj && styles.souligne}
                  couleur={sel ? p.signal : auj ? p.ink : p.inkSoft}
                >
                  {numero}
                </T>
                <View
                  style={[
                    styles.point,
                    point === "oui" && {
                      backgroundColor: sel ? p.signal : p.lineStrong,
                    },
                  ]}
                />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bande: {
    gap: 6,
    paddingVertical: space[2],
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  jours: { flexDirection: "row", position: "relative" },
  fond: {
    position: "absolute",
    left: 0,
    top: 0,
    width: LARGEUR,
    height: 64,
    borderRadius: radius.md,
  },
  jour: {
    width: LARGEUR,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 6,
  },
  souligne: { textDecorationLine: "underline" },
  point: { width: 6, height: 6, borderRadius: 3 },
});
