// Une mesure comparée : jamais un chiffre sans « par rapport à quoi » (opendata/docs/indicateurs.md).
// Valeur et unité, dénominateur (« sur 21 votes en groupe »), référence de comparaison, période,
// projection qui la calcule, et « Ce que la donnée ne dit pas », dépliable.

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Indicateur } from '@/core';
import { date, texteDenominateur, texteReference, valeurIndicateur } from '../../format';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Label, T } from '../base';

export function IndicateurVue(props: { indicateur: Indicateur }) {
  const { indicateur: i } = props;
  const p = usePalette();
  const [deplie, setDeplie] = useState(false);
  const denominateur = texteDenominateur(i);
  const periode = i.periode ? `${date(i.periode.debut)} → ${i.periode.fin ? date(i.periode.fin) : 'en cours'}` : null;
  const limites = i.ceQueLaDonneeNeDitPas;

  return (
    <View style={[styles.bloc, { borderColor: p.line }]}>
      <Label>{i.libelle}</Label>
      <View style={styles.valeur}>
        <T variant="dataLarge">{valeurIndicateur(i.valeur, i.unite)}</T>
        {denominateur && (
          <T variant="small" ton="inkMuted" style={styles.denominateur}>
            {denominateur}
          </T>
        )}
      </View>
      <T variant="body">{texteReference(i)}</T>
      {periode && <T variant="meta" ton="inkMuted">Période : {periode}</T>}
      {limites.length > 0 && (
        <View style={styles.limites}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: deplie }}
            onPress={() => setDeplie((d) => !d)}
            style={styles.deplier}
            hitSlop={4}
          >
            <Label ton="signal">
              {deplie ? '− ' : '+ '}Ce que la donnée ne dit pas ({limites.length})
            </Label>
          </Pressable>
          {deplie &&
            limites.map((l) => (
              <View key={l} style={styles.limite}>
                <T variant="small" ton="inkMuted" aria-hidden>
                  ·
                </T>
                <T variant="small" ton="inkMuted" style={styles.limiteTexte}>
                  {l}
                </T>
              </View>
            ))}
        </View>
      )}
      <T variant="caption" ton="inkMuted">
        Calcul : {i.calcul}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: space[2], borderWidth: 1, borderRadius: radius.md, padding: space[3] },
  valeur: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: space[2] },
  denominateur: { flexShrink: 1 },
  limites: { gap: space[1] },
  deplier: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  limite: { flexDirection: 'row', gap: space[2] },
  limiteTexte: { flex: 1 },
});
