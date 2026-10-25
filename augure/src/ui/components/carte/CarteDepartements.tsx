// Carte des départements : contours officiels (Etalab, dérivés d'ADMIN EXPRESS de l'IGN),
// métropole en Lambert-93, outre-mer en encarts. Zoomable comme l'hémicycle (molette, pincement,
// double tap), chaque département touchable. Les valeurs viennent de l'écran : rien n'est calculé
// ici ; un département sans valeur reste neutre et le dit. Une liste donne la même information
// sans la carte (lecteurs d'écran, ou pour lire les petits départements).

import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { G, Path, Rect, Text as TexteSvg } from 'react-native-svg';

import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Action, Label, Pastille, T } from '../base';
import { ZoomPan } from '../zoom/ZoomPan';
import { CADRE_CARTE, ENCARTS, SOURCE_CONTOURS } from './departements';
import { classeDe, classes, melange, TERRITOIRES, territoireSous } from './geometrie';

/** Nombre de classes de l'échelle séquentielle. */
const NB_CLASSES = 5;

interface Props {
  /** Valeur par code de département (« 33 », « 2A », « 971 ») ; absent ou null : pas de donnée. */
  valeurs: Record<string, number | null | undefined>;
  /** Ce que mesure la valeur, pour la légende et les lecteurs d'écran (« Participation aux votes »). */
  titre: string;
  /** Valeur lisible (« 72 % »). */
  formater?: (v: number) => string;
  onDepartement?: (code: string) => void;
  largeurMax?: number;
}

export const CarteDepartements = memo(function CarteDepartements({ valeurs, titre, formater = String, onDepartement, largeurMax = 720 }: Props) {
  const p = usePalette();
  const [largeurDispo, setLargeurDispo] = useState(0);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [liste, setListe] = useState(false);
  const largeur = Math.min(largeurDispo, largeurMax);
  const k = largeur / CADRE_CARTE.largeur;
  const hauteur = CADRE_CARTE.hauteur * k;

  const echelle = useMemo(() => {
    const couleurs = Array.from({ length: NB_CLASSES }, (_, i) => melange(p.surfaceRaised, p.signal, (i + 1) / NB_CLASSES));
    const connues = Object.values(valeurs).filter((v): v is number => typeof v === 'number');
    return classes(connues, couleurs);
  }, [valeurs, p.surfaceRaised, p.signal]);

  const remplissage = (code: string) => {
    const v = valeurs[code];
    return typeof v === 'number' && echelle.length ? classeDe(v, echelle).couleur : p.line;
  };

  const valeurLue = (code: string) => {
    const v = valeurs[code];
    return typeof v === 'number' ? formater(v) : 'pas de donnée';
  };

  const toucher = (x: number, y: number, z: number) => {
    // x, y en unités du cadre affiché ; marge de 12 px à l'écran pour les petits territoires.
    const code = territoireSous(x / k, y / k, 12 / (z * k));
    setChoisi(code);
  };

  const territoire = choisi ? TERRITOIRES.find((t) => t.code === choisi) : null;
  const sansDonnee = TERRITOIRES.filter((t) => typeof valeurs[t.code] !== 'number').length;
  const libelle = `Carte des départements : ${titre}. ${TERRITOIRES.length - sansDonnee} départements avec une valeur${sansDonnee ? `, ${sansDonnee} sans donnée` : ''}.`;

  return (
    <View style={{ width: '100%', gap: space[2] }}>
      <View onLayout={(e) => setLargeurDispo(e.nativeEvent.layout.width)} style={styles.centre}>
        {largeur > 0 && (
          <ZoomPan largeur={largeur} hauteur={hauteur} max={12} libelle={libelle} onTap={toucher}>
            <Svg width={largeur} height={hauteur} viewBox={`0 0 ${CADRE_CARTE.largeur} ${CADRE_CARTE.hauteur}`}>
              {ENCARTS.map((c) => {
                const t = TERRITOIRES.find((x) => x.code === c.code);
                return (
                  <G key={c.code}>
                    <Rect x={c.x} y={c.y} width={c.largeur} height={c.hauteur} fill="none" stroke={p.line} strokeWidth={1} />
                    <TexteSvg x={c.x + c.largeur / 2} y={c.y + c.hauteur + 12} fill={p.inkMuted} fontSize={10} textAnchor="middle">
                      {t?.nom ?? c.code}
                    </TexteSvg>
                  </G>
                );
              })}
              {TERRITOIRES.map((t) => (
                <Path
                  key={t.code}
                  d={t.d}
                  fill={remplissage(t.code)}
                  stroke={t.code === choisi ? p.ink : p.surface}
                  strokeWidth={t.code === choisi ? 1.6 : 0.5}
                />
              ))}
            </Svg>
          </ZoomPan>
        )}
      </View>

      {territoire && (
        <View style={[styles.fiche, { borderColor: p.line, backgroundColor: p.surfaceRaised }]} accessibilityLiveRegion="polite">
          <View style={styles.ligne}>
            <Pastille couleur={remplissage(territoire.code)} />
            <T variant="heading" style={{ flex: 1 }}>{`${territoire.nom} (${territoire.code})`}</T>
            <Label ton="ink">{valeurLue(territoire.code)}</Label>
          </View>
          {onDepartement && <Action onPress={() => onDepartement(territoire.code)}>{`Voir ${territoire.nom} →`}</Action>}
        </View>
      )}

      <View style={styles.legende} accessibilityLabel={`Légende : ${titre}`}>
        <Label>{titre}</Label>
        {echelle.map((c) => (
          <View key={c.min} style={styles.ligne}>
            <Pastille couleur={c.couleur} />
            <T variant="caption" ton="inkMuted">{c.min === c.max ? formater(c.min) : `${formater(c.min)} à ${formater(c.max)}`}</T>
          </View>
        ))}
        {sansDonnee > 0 && (
          <View style={styles.ligne}>
            <Pastille couleur={p.line} />
            <T variant="caption" ton="inkMuted">Pas de donnée</T>
          </View>
        )}
      </View>

      <Pressable onPress={() => setListe((x) => !x)} accessibilityRole="button" accessibilityState={{ expanded: liste }}>
        <Label ton="signal">{liste ? 'Masquer la liste' : 'Voir la liste des départements'}</Label>
      </Pressable>
      {liste && (
        <View>
          {TERRITOIRES.map((t) => (
            <Pressable
              key={t.code}
              onPress={() => (onDepartement ? onDepartement(t.code) : setChoisi(t.code))}
              accessibilityRole="button"
              style={[styles.rangee, { borderBottomColor: p.line }]}
            >
              <Pastille couleur={remplissage(t.code)} />
              <T style={{ flex: 1 }}>{`${t.nom} (${t.code})`}</T>
              <T variant="data" ton="inkMuted">{valeurLue(t.code)}</T>
            </Pressable>
          ))}
        </View>
      )}

      <T variant="caption" ton="inkMuted">
        {`Contours : ${SOURCE_CONTOURS.licence}, ${SOURCE_CONTOURS.telechargeLe.slice(0, 4)}. Outre-mer en encarts, à une autre échelle.`}
      </T>
    </View>
  );
});

const styles = StyleSheet.create({
  centre: { width: '100%', alignItems: 'center' },
  fiche: { gap: space[1], padding: space[3], borderWidth: 1, borderRadius: radius.md },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  legende: { gap: space[1] },
  rangee: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
});
