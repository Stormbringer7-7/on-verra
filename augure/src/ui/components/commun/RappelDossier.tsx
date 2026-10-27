// Rappel du dossier en tête de ses sous-écrans (étape, article, amendement, scrutin, pourquoi ce
// vote) : titre, barre compacte, « Étape actuelle : … · vous êtes : … » (ou l'étape attendue, ou
// l'état final quand le parcours est fini). Remplace les deux rappels qui existaient
// (`commun/BarreParcours` et `dossiers/BarreDossier`) ; séparé de la barre, qui n'a pas besoin de
// la navigation.

import { Pressable, StyleSheet, View } from 'react-native';

import type { BarreDossier } from '@/core';
import { useAller } from '../../../navigation';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Label, T } from '../base';
import { BarreCompacte } from './BarreParcours';
import { legendeBarre } from './statuts';

export function BarreDossierVue({ barre }: { barre: BarreDossier }) {
  const p = usePalette();
  const aller = useAller();
  const legende = legendeBarre(barre.cases, barre.ici);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Dossier ${barre.dossier.titre}, voir le parcours`}
      onPress={() => aller.dossier(barre.dossier.id)}
      style={[styles.rappel, { borderColor: p.line, backgroundColor: p.surface }]}
    >
      <View style={styles.entete}>
        <Label>Dossier</Label>
        <Label ton="signal">Voir le parcours</Label>
      </View>
      <T variant="heading">{barre.dossier.titre}</T>
      <BarreCompacte cases={barre.cases} ici={barre.ici} />
      {legende && (
        <T variant="caption" ton="inkMuted">
          {legende}
        </T>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rappel: { gap: space[2], paddingHorizontal: 14, paddingVertical: space[3], borderWidth: 1, borderRadius: radius.md },
  entete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space[2] },
});
