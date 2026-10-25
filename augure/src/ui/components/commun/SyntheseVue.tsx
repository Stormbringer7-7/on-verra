// Texte « en clair » produit par le port `Synthetiseur` : le texte, marqué comme synthèse (jamais
// un fait), ou « Pas de synthèse disponible » (aucun LLM branché : `SansSynthese` rend null).

import { StyleSheet, View } from 'react-native';

import type { Synthese } from '@/core';
import { useLarge } from '../../hooks/miseEnPage';
import { usePalette } from '../../theme/ThemeProvider';
import { radius, space } from '../../theme/tokens';
import { Label, T } from '../base';
import { texteSynthese } from './statuts';

export function SyntheseVue(props: { synthese: Synthese; titre?: string }) {
  const { synthese, titre = 'En clair' } = props;
  const p = usePalette();
  const large = useLarge();
  const { texte, absente } = texteSynthese(synthese);
  return (
    <View style={styles.bloc}>
      <View style={styles.entete}>
        <Label>{titre}</Label>
        {!absente && (
          <View style={[styles.marque, { borderColor: p.lineStrong }]}>
            <Label style={styles.marqueTexte}>Synthèse, pas un fait</Label>
          </View>
        )}
      </View>
      {absente ? (
        <T variant="body" ton="inkMuted">
          {texte}
        </T>
      ) : (
        <T variant="lead" style={large && styles.lead}>
          {texte}
        </T>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { gap: space[2] },
  entete: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: space[2] },
  marque: { minHeight: 22, justifyContent: 'center', paddingHorizontal: 6, borderWidth: 1, borderRadius: radius.sm },
  marqueTexte: { fontSize: 10, lineHeight: 14, letterSpacing: 0.6 },
  lead: { fontSize: 20, lineHeight: 28, maxWidth: 760 },
});
