// Barre de contexte du dossier, rappelée sur tous ses sous-écrans (étape, article, amendement,
// scrutin, pourquoi ce vote) : titre, points du parcours, « Étape actuelle : … · vous êtes : … »
// (ou l'état final, « Promulgué », quand le parcours est fini).
// Le contrat y donne une barre compacte (`BarreDossier`, cases `CaseCompacte`), pas un `Parcours`
// complet : d'où ce composant, distinct de `commun/BarreParcours`.

import { Pressable, StyleSheet, View } from 'react-native';

import type { BarreDossier, CaseCompacte, CleCase } from '@/core';
import { useAller } from '../../../navigation';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Label, T } from '../base';
import { casesVisibles, ETAT_CASE, legendeReperes, reperesBarre } from './presentation';

/** Points du parcours : faite en `ink`, courante en signal, à venir éteinte ; `ici` cerclée. */
export function PointsParcours({ cases, ici = null }: { cases: CaseCompacte[]; ici?: CleCase | null }) {
  const p = usePalette();
  const visibles = casesVisibles(cases);
  const resume = visibles.map((c) => `${c.libelle} : ${ETAT_CASE[c.etat].toLowerCase()}${c.courante ? ' (étape actuelle)' : ''}`).join(', ');
  return (
    <View accessibilityRole="image" accessibilityLabel={`Parcours : ${resume}`} style={styles.points}>
      {visibles.map((c) => (
        <View
          key={c.cle}
          style={[
            styles.point,
            {
              backgroundColor: c.courante ? p.signal : c.etat === 'faite' ? p.ink : c.etat === 'inconnu' ? 'transparent' : p.line,
              borderColor: c.etat === 'inconnu' ? p.lineStrong : 'transparent',
              borderWidth: c.etat === 'inconnu' ? 1 : 0,
            },
            c.cle === ici && { outlineColor: p.ink, outlineWidth: 1, outlineOffset: 2, outlineStyle: 'solid' },
          ]}
        />
      ))}
    </View>
  );
}

export function BarreDossierVue({ barre }: { barre: BarreDossier }) {
  const p = usePalette();
  const aller = useAller();
  const reperes = reperesBarre(barre.cases, barre.ici);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Dossier ${barre.dossier.titre} : voir le parcours`}
      onPress={() => aller.dossier(barre.dossier.id)}
      style={[styles.barre, { borderColor: p.line, backgroundColor: p.surface }]}
    >
      <View style={styles.entete}>
        <Label>Dossier</Label>
        <Label ton="signal">Voir le parcours →</Label>
      </View>
      <T variant="heading">{barre.dossier.titre}</T>
      <PointsParcours cases={barre.cases} ici={barre.ici} />
      <T variant="caption" ton="inkMuted">
        {legendeReperes(reperes)}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  points: { flexDirection: 'row', gap: 3 },
  point: { flex: 1, height: 6, borderRadius: 1 },
  barre: { gap: space[2], paddingVertical: space[3], paddingHorizontal: 14, borderWidth: 1, borderRadius: radius.md },
  entete: { flexDirection: 'row', justifyContent: 'space-between', gap: space[2] },
});
