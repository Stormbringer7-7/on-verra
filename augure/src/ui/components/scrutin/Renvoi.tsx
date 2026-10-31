// Ligne de renvoi en bas d'une fiche (planches « Scrutin », « Amendement ») : un libellé, une
// valeur à droite (nombre, « › » pour une fiche, « ↗ » pour une page officielle), filet en haut,
// 48 px au moins. Un renvoi qui déplie (`ouvert`) annonce son état aux lecteurs d'écran.

import { StyleSheet, View } from 'react-native';

import { usePalette } from '../../theme/ThemeProvider';
import { T } from '../base';
import { Appui } from '../mouvement';

export function Renvoi({
  libelle,
  valeur,
  onPress,
  externe = false,
  ouvert,
}: {
  libelle: string;
  /** Nombre ou précision affichée avant la flèche. */
  valeur?: string;
  onPress(): void;
  externe?: boolean;
  /** Défini pour un renvoi qui déplie son contenu sur place. */
  ouvert?: boolean;
}) {
  const p = usePalette();
  const fleche = externe ? '↗' : ouvert === undefined ? '›' : ouvert ? '▴' : '▾';
  return (
    <Appui
      accessibilityRole={ouvert === undefined ? 'link' : 'button'}
      accessibilityState={ouvert === undefined ? undefined : { expanded: ouvert }}
      accessibilityLabel={`${libelle}${valeur ? ` : ${valeur}` : ''}`}
      onPress={onPress}
      style={[styles.ligne, { borderTopColor: p.line }]}
    >
      <T variant="card" style={{ flex: 1 }}>
        {libelle}
      </T>
      <View style={styles.droite}>
        {valeur ? <T variant="data" ton="inkMuted">{valeur}</T> : null}
        <T variant="data" ton="inkMuted">
          {fleche}
        </T>
      </View>
    </Appui>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  droite: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
