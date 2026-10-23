import { Pressable, StyleSheet, View } from 'react-native';

import type { Decompte, ScrutinResume } from '@/core';
import { verdict } from '@/core/domain/votes';
import { useAller } from '@/navigation';
import { dateCourte } from '../format';
import { libelleScrutin } from '../natures';
import { usePalette } from '../theme/ThemeProvider';
import { space } from '../theme/tokens';
import { Label, Repartition, T } from './base';

/**
 * Ligne de scrutin : intitulé en `body`, résultat en `label`, barre de répartition.
 * `resultat` remplace le résultat global (ex. la position d'un groupe) ; `decompte` aussi.
 */
export function LigneScrutin({
  scrutin,
  resultat,
  couleurResultat,
  decompte,
  total,
  depute,
}: {
  scrutin: ScrutinResume;
  resultat?: string;
  couleurResultat?: string;
  decompte?: Decompte;
  total?: number;
  depute?: string;
}) {
  const p = usePalette();
  const aller = useAller();
  const v = verdict(scrutin.sort, scrutin.decompte);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => aller.scrutin(scrutin.uid, depute)}
      style={({ pressed }) => [styles.ligne, { borderBottomColor: p.line, backgroundColor: pressed ? p.surfaceRaised : 'transparent' }]}
    >
      <View style={styles.entete}>
        <T style={styles.titre} numberOfLines={3}>
          {libelleScrutin(scrutin)} <T ton="inkMuted">· {dateCourte(scrutin.date)}</T>
        </T>
        <Label couleur={couleurResultat ?? p.ink}>
          {resultat ?? `${v.toUpperCase()} ${scrutin.decompte.pour} – ${scrutin.decompte.contre}`}
        </Label>
      </View>
      <Repartition decompte={decompte ?? scrutin.decompte} total={total} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ligne: { gap: space[2], paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth },
  entete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[3] },
  titre: { flex: 1 },
});
